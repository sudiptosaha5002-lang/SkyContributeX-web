import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, 'server-data')
const storePath = path.join(dataDir, 'counterx-store.json')

const defaultStore = () => ({
  profile: null,
  products: [],
  members: [],
  accessTokens: [],
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
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
  }
}

export async function writeStore(store) {
  await ensureStore()
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

export async function replaceSnapshot(snapshot) {
  const nextStore = {
    profile: snapshot.profile ?? null,
    products: snapshot.products ?? [],
    members: snapshot.members ?? [],
    accessTokens: (await readStore()).accessTokens ?? [],
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

export async function createMagicLink(memberId, email, expiryMs = 1000 * 60 * 60 * 24 * 3) {
  const store = await readStore()
  const member = store.members.find((entry) => entry.member_id === memberId)
  if (!member) {
    throw new Error('Member was not found in the shared server snapshot. Sync master data first.')
  }

  const now = new Date().toISOString()
  member.email = email
  member.access_link_sent_at = now

  const rawToken = randomBytes(24).toString('hex')
  store.accessTokens = store.accessTokens.filter((entry) => entry.member_id !== memberId)
  store.accessTokens.push({
    token_hash: sha256(rawToken),
    member_id: memberId,
    email,
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
