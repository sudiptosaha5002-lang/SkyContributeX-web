import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, 'server-data')
const storePath = path.join(dataDir, 'counterx-store.json')
const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const MEMBER_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 30

const defaultStore = () => ({
  profile: null,
  products: [],
  members: [],
  accessTokens: [],
  authUsers: [],
  authSessions: [],
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function sanitizeAuthUser(user) {
  if (!user) return null
  return {
    user_id: user.user_id,
    role: user.role,
    email: user.email,
    profile_name: user.profile_name,
    phone: user.phone ?? '',
    linked_member_id: user.linked_member_id ?? null,
    linked_product_id: user.linked_product_id ?? null,
    created_at: user.created_at,
  }
}

function createAuthSessionPayload(store, user) {
  const safeUser = sanitizeAuthUser(user)
  if (!safeUser) {
    return null
  }

  if (safeUser.role === 'MASTER') {
    return {
      user: safeUser,
      profile: store.profile ?? null,
    }
  }

  const member = store.members.find((entry) => entry.member_id === safeUser.linked_member_id) ?? null
  const product = member ? (store.products.find((entry) => entry.product_id === member.product_id) ?? null) : null
  return {
    user: safeUser,
    profile: store.profile ?? null,
    member,
    product,
  }
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.access(storePath)
  } catch {
    await fs.writeFile(storePath, JSON.stringify(defaultStore(), null, 2), 'utf8')
  }
}

export async function readStore() {
  await ensureStore()
  const content = await fs.readFile(storePath, 'utf8')
  const parsed = JSON.parse(content || '{}')
  return {
    profile: parsed.profile ?? null,
    products: parsed.products ?? [],
    members: parsed.members ?? [],
    accessTokens: parsed.accessTokens ?? [],
    authUsers: parsed.authUsers ?? [],
    authSessions: parsed.authSessions ?? [],
  }
}

export async function writeStore(store) {
  await ensureStore()
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function replaceSnapshot(snapshot) {
  const currentStore = await readStore()
  const nextStore = {
    profile: snapshot.profile ?? null,
    products: snapshot.products ?? [],
    members: snapshot.members ?? [],
    accessTokens: currentStore.accessTokens ?? [],
    authUsers: currentStore.authUsers ?? [],
    authSessions: currentStore.authSessions ?? [],
  }
  await writeStore(nextStore)
  return nextStore
}

export async function upsertMember(updatedMember) {
  const store = await readStore()
  const index = store.members.findIndex((member) => member.member_id === updatedMember.member_id)
  if (index >= 0) {
    store.members[index] = { ...store.members[index], ...updatedMember }
  } else {
    store.members.push(updatedMember)
  }
  await writeStore(store)
  return updatedMember
}

export async function createMagicLink(memberId, email, expiryMs = MEMBER_LINK_TTL_MS) {
  const store = await readStore()
  const member = store.members.find((entry) => entry.member_id === memberId)
  if (!member) {
    throw new Error('Member was not found in the shared server snapshot. Sync master data first.')
  }

  const normalizedEmail = normalizeEmail(email)
  const now = new Date().toISOString()
  member.email = normalizedEmail
  member.access_link_sent_at = now

  const rawToken = randomBytes(24).toString('hex')
  store.accessTokens = store.accessTokens.filter((entry) => entry.member_id !== memberId)
  store.accessTokens.push({
    token_hash: sha256(rawToken),
    member_id: memberId,
    email: normalizedEmail,
    created_at: now,
    expires_at: new Date(Date.now() + expiryMs).toISOString(),
    last_used_at: null,
  })

  await writeStore(store)
  return rawToken
}

export async function resolveMagicLink(rawToken) {
  const store = await readStore()
  const tokenHash = sha256(rawToken)
  const tokenEntry = store.accessTokens.find((entry) => entry.token_hash === tokenHash)
  if (!tokenEntry) {
    return null
  }
  if (new Date(tokenEntry.expires_at).getTime() < Date.now()) {
    return null
  }

  tokenEntry.last_used_at = new Date().toISOString()
  await writeStore(store)

  const member = store.members.find((entry) => entry.member_id === tokenEntry.member_id)
  if (!member) {
    return null
  }
  const product = store.products.find((entry) => entry.product_id === member.product_id) ?? null
  return {
    profile: store.profile ?? null,
    product,
    member,
  }
}

export async function updateMemberFromMagicLink(rawToken, updates) {
  const store = await readStore()
  const tokenHash = sha256(rawToken)
  const tokenEntry = store.accessTokens.find((entry) => entry.token_hash === tokenHash)
  if (!tokenEntry) {
    throw new Error('This access link is invalid.')
  }
  if (new Date(tokenEntry.expires_at).getTime() < Date.now()) {
    throw new Error('This access link has expired.')
  }

  const memberIndex = store.members.findIndex((entry) => entry.member_id === tokenEntry.member_id)
  if (memberIndex < 0) {
    throw new Error('Member was not found.')
  }

  store.members[memberIndex] = {
    ...store.members[memberIndex],
    ...updates,
    email: tokenEntry.email,
    submitted_at: new Date().toISOString(),
  }

  await writeStore(store)
  const member = store.members[memberIndex]
  const product = store.products.find((entry) => entry.product_id === member.product_id) ?? null
  return {
    profile: store.profile ?? null,
    product,
    member,
  }
}

export async function searchPublicProducts(query) {
  const store = await readStore()
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) {
    return []
  }

  return store.products
    .filter((product) => product.title.toLowerCase().includes(normalized) || product.product_id.toLowerCase().includes(normalized))
    .slice(0, 24)
    .map((product) => ({
      product_id: product.product_id,
      title: product.title,
      description: product.description,
      members_count: product.members_count,
      created_at: product.created_at,
    }))
}

export async function createPublicMemberSession(productId, email, expiryMs = MEMBER_LINK_TTL_MS) {
  const store = await readStore()
  const normalizedProductId = String(productId || '').trim()
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedProductId || !normalizedEmail) {
    throw new Error('Product ID and member email are required.')
  }

  const product = store.products.find((entry) => entry.product_id === normalizedProductId)
  if (!product) {
    throw new Error('Product card was not found.')
  }

  const matchingMembers = store.members.filter((entry) => entry.product_id === normalizedProductId && normalizeEmail(entry.email) === normalizedEmail)

  if (matchingMembers.length === 0) {
    throw new Error('No member matched that email for this card.')
  }

  if (matchingMembers.length > 1) {
    throw new Error('Multiple members matched this email. Please use a unique member email.')
  }

  const rawToken = await createMagicLink(matchingMembers[0].member_id, normalizedEmail, expiryMs)
  const session = await resolveMagicLink(rawToken)
  if (!session) {
    throw new Error('Unable to open the member session right now.')
  }

  return { token: rawToken, session }
}

async function createMasterSessionForUser(store, user, expiryMs = AUTH_SESSION_TTL_MS) {
  const rawToken = randomBytes(24).toString('hex')
  const now = new Date().toISOString()
  store.authSessions = store.authSessions.filter((entry) => entry.user_id !== user.user_id)
  store.authSessions.push({
    token_hash: sha256(rawToken),
    user_id: user.user_id,
    created_at: now,
    expires_at: new Date(Date.now() + expiryMs).toISOString(),
    last_used_at: null,
  })
  await writeStore(store)
  return {
    token: rawToken,
    session: createAuthSessionPayload(store, user),
  }
}

export async function registerMasterAccount({ name, email, phone, password }) {
  const store = await readStore()
  const normalizedEmail = normalizeEmail(email)
  const trimmedName = String(name || '').trim()
  const trimmedPhone = String(phone || '').trim()
  const passwordValue = String(password || '')

  if (!trimmedName || !normalizedEmail || passwordValue.length < 6) {
    throw new Error('Name, email, and a password of at least 6 characters are required.')
  }

  if (store.authUsers.some((user) => user.role === 'MASTER')) {
    throw new Error('A master account already exists. Please log in instead.')
  }

  const now = new Date().toISOString()
  const user = {
    user_id: `auth_${randomBytes(8).toString('hex')}`,
    role: 'MASTER',
    email: normalizedEmail,
    password_hash: sha256(passwordValue),
    profile_name: trimmedName,
    phone: trimmedPhone,
    linked_member_id: null,
    linked_product_id: null,
    created_at: now,
  }

  store.authUsers.push(user)
  store.profile = {
    name: trimmedName,
    email: normalizedEmail,
    phone: trimmedPhone,
  }

  return createMasterSessionForUser(store, user)
}

export async function loginMasterAccount({ email, password }) {
  const store = await readStore()
  const normalizedEmail = normalizeEmail(email)
  const passwordHash = sha256(String(password || ''))
  const user = store.authUsers.find((entry) => entry.role === 'MASTER' && entry.email === normalizedEmail && entry.password_hash === passwordHash)

  if (!user) {
    throw new Error('Invalid master email or password.')
  }

  return createMasterSessionForUser(store, user)
}

export async function resolveMasterSession(rawToken) {
  const store = await readStore()
  const tokenHash = sha256(String(rawToken || ''))
  const tokenEntry = store.authSessions.find((entry) => entry.token_hash === tokenHash)
  if (!tokenEntry) {
    return null
  }
  if (new Date(tokenEntry.expires_at).getTime() < Date.now()) {
    return null
  }

  const user = store.authUsers.find((entry) => entry.user_id === tokenEntry.user_id && entry.role === 'MASTER')
  if (!user) {
    return null
  }

  tokenEntry.last_used_at = new Date().toISOString()
  await writeStore(store)
  return createAuthSessionPayload(store, user)
}

export async function logoutMasterSession(rawToken) {
  const store = await readStore()
  const tokenHash = sha256(String(rawToken || ''))
  const nextSessions = store.authSessions.filter((entry) => entry.token_hash !== tokenHash)
  if (nextSessions.length !== store.authSessions.length) {
    store.authSessions = nextSessions
    await writeStore(store)
  }
}

function findUniqueMemberByProductAndEmail(store, productId, email) {
  const normalizedProductId = String(productId || '').trim()
  const normalizedEmail = normalizeEmail(email)
  const matchingMembers = store.members.filter((entry) => entry.product_id === normalizedProductId && normalizeEmail(entry.email) === normalizedEmail)

  if (matchingMembers.length === 0) {
    throw new Error('No member matched that email for this card.')
  }

  if (matchingMembers.length > 1) {
    throw new Error('Multiple members matched this email on that card. Please use a unique member email.')
  }

  return matchingMembers[0]
}

export async function registerMemberAccount({ productId, email, password }) {
  const store = await readStore()
  const normalizedEmail = normalizeEmail(email)
  const passwordValue = String(password || '')

  if (!productId || !normalizedEmail || passwordValue.length < 6) {
    throw new Error('Product card, member email, and a password of at least 6 characters are required.')
  }

  const member = findUniqueMemberByProductAndEmail(store, productId, normalizedEmail)
  const existing = store.authUsers.find((entry) => entry.role === 'MEMBER' && entry.linked_member_id === member.member_id)
  if (existing) {
    throw new Error('This member already has an account. Please log in instead.')
  }

  store.authUsers.push({
    user_id: `auth_${randomBytes(8).toString('hex')}`,
    role: 'MEMBER',
    email: normalizedEmail,
    password_hash: sha256(passwordValue),
    profile_name: member.name,
    phone: '',
    linked_member_id: member.member_id,
    linked_product_id: member.product_id,
    created_at: new Date().toISOString(),
  })

  await writeStore(store)
  return createPublicMemberSession(member.product_id, normalizedEmail, MEMBER_LINK_TTL_MS)
}

export async function loginMemberAccount({ productId, email, password }) {
  const store = await readStore()
  const normalizedEmail = normalizeEmail(email)
  const passwordHash = sha256(String(password || ''))
  const user = store.authUsers.find((entry) => entry.role === 'MEMBER' && entry.linked_product_id === String(productId || '').trim() && entry.email === normalizedEmail && entry.password_hash === passwordHash)

  if (!user) {
    throw new Error('Invalid member login details.')
  }

  const member = store.members.find((entry) => entry.member_id === user.linked_member_id)
  if (!member) {
    throw new Error('This member account is no longer linked to a card entry.')
  }

  return createPublicMemberSession(member.product_id, normalizedEmail, MEMBER_LINK_TTL_MS)
}
