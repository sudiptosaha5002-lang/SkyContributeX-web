import express from 'express'
import cors from 'cors'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import {
  createMagicLink,
  createPublicMemberSession,
  loginMasterAccount,
  loginMemberAccount,
  logoutMasterSession,
  readStore,
  registerMasterAccount,
  registerMemberAccount,
  replaceSnapshot,
  resolveMagicLink,
  resolveMasterSession,
  searchPublicProducts,
  updateMemberFromMagicLink,
} from './server-store.mjs'

dotenv.config()

const app = express()
const port = Number(process.env.EMAIL_SERVER_PORT || 8787)
const MEMBER_LINK_TTL_HOURS = Number(process.env.MEMBER_LINK_TTL_HOURS || 72)

app.use(cors())
app.use(express.json({ limit: '25mb' }))

function getTransporter() {
  const host = process.env.SMTP_HOST
  const smtpPort = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.')
  }

  return nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user, pass },
  })
}

function computeStatus(amountPaid, amountDue) {
  return Number(amountPaid) >= Number(amountDue) ? 'PAID' : 'PENDING'
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/register-master', async (req, res) => {
  try {
    const result = await registerMasterAccount(req.body ?? {})
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to create master account.' })
  }
})

app.post('/api/auth/login-master', async (req, res) => {
  try {
    const result = await loginMasterAccount(req.body ?? {})
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to log in.' })
  }
})

app.get('/api/auth/master-session', async (req, res) => {
  try {
    const token = String(req.query.token || '')
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required.' })
    }

    const session = await resolveMasterSession(token)
    if (!session) {
      return res.status(404).json({ ok: false, error: 'This master session is invalid or expired.' })
    }

    res.json({ ok: true, session })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to restore master session.' })
  }
})

app.post('/api/auth/logout-master', async (req, res) => {
  try {
    const token = String(req.body?.token || '')
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required.' })
    }
    await logoutMasterSession(token)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to log out.' })
  }
})

app.post('/api/auth/register-member', async (req, res) => {
  try {
    const result = await registerMemberAccount(req.body ?? {})
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to create member account.' })
  }
})

app.post('/api/auth/login-member', async (req, res) => {
  try {
    const result = await loginMemberAccount(req.body ?? {})
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to log in.' })
  }
})

app.post('/api/master/sync-snapshot', async (req, res) => {
  try {
    const { profile, products, members } = req.body ?? {}
    if (!Array.isArray(products) || !Array.isArray(members)) {
      return res.status(400).json({ ok: false, error: 'Products and members are required.' })
    }

    await replaceSnapshot({ profile: profile ?? null, products, members })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to sync snapshot.' })
  }
})

app.get('/api/master/snapshot', async (_req, res) => {
  try {
    const snapshot = await readStore()
    res.json({ ok: true, snapshot })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load shared snapshot.' })
  }
})

app.get('/api/member-access/public-search', async (req, res) => {
  try {
    const q = String(req.query.q || '')
    const products = await searchPublicProducts(q)
    res.json({ ok: true, products })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to search cards.' })
  }
})

app.post('/api/member-access/public-verify', async (req, res) => {
  try {
    const { productId, email } = req.body ?? {}
    const result = await createPublicMemberSession(productId, email, MEMBER_LINK_TTL_HOURS * 60 * 60 * 1000)
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to verify member access.' })
  }
})

app.post('/api/member-access/send-link', async (req, res) => {
  try {
    const { memberId, email, appBaseUrl } = req.body ?? {}
    if (!memberId || !email || !appBaseUrl) {
      return res.status(400).json({ ok: false, error: 'Member ID, email, and app base URL are required.' })
    }

    const rawToken = await createMagicLink(memberId, email, MEMBER_LINK_TTL_HOURS * 60 * 60 * 1000)
    const transporter = getTransporter()
    const from = process.env.MAIL_FROM || process.env.SMTP_USER
    const accessUrl = `${String(appBaseUrl).replace(/\/$/, '')}/?member_access_token=${encodeURIComponent(rawToken)}`

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Your CounterX member access link',
      text: `Hello,

Use this secure link to open your contribution entry and update your payment details:

${accessUrl}

This link expires in ${MEMBER_LINK_TTL_HOURS} hours.

Regards,
friendsgamingproject & ASPD Coding`,
    })

    res.json({ ok: true, accessUrl })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to send member access link.' })
  }
})

app.get('/api/member-access/session', async (req, res) => {
  try {
    const token = String(req.query.token || '')
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required.' })
    }

    const session = await resolveMagicLink(token)
    if (!session || !session.member || !session.product) {
      return res.status(404).json({ ok: false, error: 'This member access link is invalid or expired.' })
    }

    res.json({ ok: true, session })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to open member session.' })
  }
})

app.post('/api/member-access/update', async (req, res) => {
  try {
    const { token, amount_paid, payment_method, proof, signature } = req.body ?? {}
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token is required.' })
    }

    const currentSession = await resolveMagicLink(token)
    if (!currentSession || !currentSession.member) {
      return res.status(404).json({ ok: false, error: 'This member access link is invalid or expired.' })
    }

    const amountPaid = Number(amount_paid)
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      return res.status(400).json({ ok: false, error: 'A valid paid amount is required.' })
    }

    const updatedSession = await updateMemberFromMagicLink(token, {
      amount_paid: amountPaid,
      payment_method: payment_method || currentSession.member.payment_method,
      proof: proof ?? currentSession.member.proof ?? null,
      signature: signature ?? currentSession.member.signature ?? null,
      status: computeStatus(amountPaid, currentSession.member.amount_due),
    })

    res.json({ ok: true, session: updatedSession })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to update member entry.' })
  }
})

app.post('/api/send-invoice-email', async (req, res) => {
  try {
    const { to, subject, text, filename, pdfBase64 } = req.body ?? {}

    if (!to || !subject || !text || !filename || !pdfBase64) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' })
    }

    const transporter = getTransporter()
    const from = process.env.MAIL_FROM || process.env.SMTP_USER

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    })

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to send email.' })
  }
})

app.listen(port, () => {
  console.log(`CounterX server running on http://localhost:${port}`)
})
