import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { saveAs } from 'file-saver'
import { sha256 } from 'js-sha256'
import clsx from 'clsx'
import './index.css'
import { db, getSetting, setSetting } from './lib/db'
import { computeStatus, exportBackup, exportCsv, generateInvoice, importBackup, makeId, money, normalizeProof, nowIso } from './lib/utils'
import type { MasterProfile, Member, PaymentMethod, Product, StoredAsset } from './types'

type View = 'dashboard' | 'settings' | 'invoices'

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type SignaturePadInstance = {
  clear: () => void
  isEmpty: () => boolean
  toDataURL: (type?: string) => string
  fromDataURL: (dataUrl: string, options?: Record<string, unknown>) => void
  off: () => void
  on: () => void
}

type SignaturePadConstructor = new (canvas: HTMLCanvasElement, options?: Record<string, unknown>) => SignaturePadInstance

declare global {
  interface Window {
    SignaturePad?: SignaturePadConstructor
  }
}

type CreateCardDraft = {
  title: string
  totalAmount: string
  membersCount: number
  autoSplit: boolean
  manualSplit: string
  deadline: string
  notes: string
}

type MemberDraft = {
  name: string
  amount_due: string
  amount_paid: string
  payment_method: PaymentMethod
  proof?: StoredAsset | null
  signature?: string | null
}

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'PayPal', 'Unspecified']

const defaultCreateDraft = (): CreateCardDraft => ({
  title: '',
  totalAmount: '',
  membersCount: 5,
  autoSplit: true,
  manualSplit: '',
  deadline: '',
  notes: '',
})

const defaultMemberDraft = (member?: Member | null): MemberDraft => ({
  name: member?.name ?? '',
  amount_due: String(member?.amount_due ?? ''),
  amount_paid: String(member?.amount_paid ?? ''),
  payment_method: member?.payment_method ?? 'Unspecified',
  proof: member?.proof ?? null,
  signature: member?.signature ?? null,
})

const EMAIL_SERVER_URL = (import.meta.env.VITE_EMAIL_SERVER_URL as string | undefined) ?? 'http://localhost:8787'

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function sendInvoiceEmailRequest(params: {
  to: string
  subject: string
  text: string
  filename: string
  blob: Blob
}) {
  const response = await fetch(`${EMAIL_SERVER_URL}/api/send-invoice-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: params.to,
      subject: params.subject,
      text: params.text,
      filename: params.filename,
      pdfBase64: await blobToBase64(params.blob),
    }),
  })

  const result = await response.json().catch(() => ({ ok: false, error: 'Unable to reach mail server.' }))
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Unable to send invoice email.')
  }
}

function shouldProceedOnEnter(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'SELECT'
}

function handleProceedOnEnter(event: React.KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !shouldProceedOnEnter(event.target)) {
    return
  }

  event.preventDefault()
  action()
}

function Field(props: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  multiline?: boolean
}) {
  const { label, value, onChange, type = 'text', inputMode, multiline = false } = props
  return (
    <label className="field-shell">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
      ) : (
        <input type={type} value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  )
}

function PinDots(props: { value: string; length?: number }) {
  const length = props.length ?? 6
  return (
    <div className="pin-dots">
      {Array.from({ length }).map((_, index) => (
        <span key={index} className={clsx('pin-dot', index < props.value.length && 'pin-dot-filled')} />
      ))}
    </div>
  )
}

function AuthShell(props: {
  title: string
  subtitle: string
  pinValue: string
  onPinChange: (value: string) => void
  onSubmit: () => void
  buttonLabel: string
  message: string
  children?: React.ReactNode
}) {
  return (
    <div className="shell auth-shell">
      <section className="auth-lock-wrap">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <span className="auth-shield">&#128737;</span>
          </div>
          <h1>{props.title}</h1>
          <p>{props.subtitle}</p>
        </div>

        <div className="auth-pin-card paper-card">
          <PinDots value={props.pinValue} />
          <label className="auth-pin-input-shell">
            <input
              className="auth-pin-input"
              value={props.pinValue}
              onChange={(event) => props.onPinChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => handleProceedOnEnter(event, props.onSubmit)}
              type="password"
              inputMode="numeric"
              placeholder="Enter PIN"
            />
          </label>
          {props.children}
        </div>

        <button className="auth-unlock-button" type="button" onClick={props.onSubmit}>{props.buttonLabel}</button>
        {props.message ? <p className="auth-message">{props.message}</p> : null}
      </section>
    </div>
  )
}

function EmailSendDialog(props: {
  open: boolean
  title: string
  recipientEmail: string
  onRecipientEmailChange: (value: string) => void
  onClose: () => void
  onSend: () => void
  isSending: boolean
  statusMessage: string
  statusTone?: 'success' | 'error' | 'idle'
}) {
  if (!props.open) return null

  return (
    <dialog open className="modal-shell">
      <div className="modal-card paper-card email-modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Send Invoice</p>
            <h3>{props.title}</h3>
          </div>
          <button className="ghost-button" type="button" onClick={props.onClose}>Close</button>
        </div>
        <div className="stack-gap" onKeyDown={(event) => handleProceedOnEnter(event, props.onSend)}>
          <Field label="Recipient email" value={props.recipientEmail} onChange={props.onRecipientEmailChange} type="email" />
          <button className="primary-button" type="button" onClick={props.onSend} disabled={props.isSending}>{props.isSending ? 'Sending...' : 'Send Mail'}</button>
          {props.statusMessage ? <p className={clsx('email-status', props.statusTone === 'success' ? 'email-status-success' : props.statusTone === 'error' ? 'email-status-error' : '')}>{props.statusMessage}</p> : null}
        </div>
      </div>
    </dialog>
  )
}

function ProductDetails(props: {
  product: Product
  members: Member[]
  onEditMember: (member: Member) => void
  onExportExcel: () => void
  onOpenInvoices: () => void
  onBack: () => void
}) {
  const paidMembers = props.members.filter((member) => member.status === 'PAID').length
  const pendingMembers = props.members.length - paidMembers
  const collected = props.members.reduce((total, member) => total + member.amount_paid, 0)
  const progress = props.product.total_amount > 0 ? Math.min(100, (collected / props.product.total_amount) * 100) : 0

  return (
    <div className="product-page-shell">
      <div className="product-page-head">
        <button className='ghost-button product-back-button' type='button' onClick={props.onBack}>&larr;</button>
        <div>
          <p className="eyebrow">Product Card</p>
          <h3>{props.product.title}</h3>
        </div>
      </div>

      <section className="product-summary-card paper-card">
        <div className="product-summary-top">
          <div>
            <strong>{money(collected)}</strong>
            <span>of {money(props.product.total_amount)} target</span>
          </div>
          <div className="product-progress-badge">{progress.toFixed(0)}%</div>
        </div>
        <div className="progress-track large-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="product-summary-grid">
          <div className="product-summary-pill"><strong>{props.members.length}</strong><span>Total</span></div>
          <div className="product-summary-pill product-summary-pill-paid"><strong>{paidMembers}</strong><span>Paid</span></div>
          <div className="product-summary-pill product-summary-pill-pending"><strong>{pendingMembers}</strong><span>Pending</span></div>
        </div>
      </section>

      <div className="product-action-row">
        <button className="secondary-button product-action-button" type="button" onClick={props.onExportExcel}>Export CSV</button>
        <button className="secondary-button product-action-button" type="button" onClick={props.onOpenInvoices}>Invoices</button>
      </div>

      <div className="members-block">
        <p className="eyebrow">Members ({props.members.length})</p>
        <div className="product-member-list">
          {props.members.map((member) => {
            const memberProgress = member.amount_due > 0 ? Math.min(100, (member.amount_paid / member.amount_due) * 100) : 0
            return (
              <article key={member.member_id} className={clsx('product-member-card', member.status === 'PAID' ? 'product-member-card-paid' : 'product-member-card-pending')} onClick={() => props.onEditMember(member)}>
                <div className="product-member-avatar">{(member.name.trim()[0] || 'M').toUpperCase()}</div>
                <div className="product-member-copy">
                  <h4>{member.name}</h4>
                  <p>{money(member.amount_paid)} / {money(member.amount_due)}</p>
                  <div className="product-member-progress"><div style={{ width: `${memberProgress}%` }} /></div>
                </div>
                <div className="product-member-status">
                  <span className={clsx('status-dot', member.status === 'PAID' ? 'status-dot-paid' : 'status-dot-pending')} />
                  <span className="product-member-chevron">&rsaquo;</span>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InvoiceDashboard(props: {
  product: Product
  members: Member[]
  onBack: () => void
  onInvoiceAction: (member: Member, action: 'preview' | 'download' | 'send') => Promise<void>
}) {
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'preview' | 'download' | 'send' | null>(null)

  async function handleAction(member: Member, action: 'preview' | 'download' | 'send') {
    setBusyMemberId(member.member_id)
    setBusyAction(action)
    try {
      await props.onInvoiceAction(member, action)
    } finally {
      setBusyMemberId(null)
      setBusyAction(null)
    }
  }

  return (
    <div className="invoice-page-shell">
      <div className="product-page-head">
        <button className="ghost-button product-back-button" type="button" onClick={props.onBack}>&larr;</button>
        <div>
          <p className="eyebrow">Invoices</p>
          <h3>{props.product.title}</h3>
        </div>
      </div>

      <section className="invoice-member-list invoice-member-list-page">
        {props.members.map((member) => {
          const busy = busyMemberId === member.member_id
          return (
            <article key={`invoice_${member.member_id}`} className={clsx('invoice-member-card', member.status === 'PAID' ? 'invoice-member-card-paid' : 'invoice-member-card-pending')}>
              <div className="invoice-member-avatar">{(member.name.trim()[0] || 'M').toUpperCase()}</div>
              <div className="invoice-member-copy">
                <h4>{member.name}</h4>
                <p>{money(member.amount_paid)} / {money(member.amount_due)}</p>
                <span>{member.payment_method} | {member.status}</span>
              </div>
              <div className="invoice-member-actions">
                <button className="invoice-pill" type="button" disabled={busy} onClick={() => void handleAction(member, 'download')}>{busy && busyAction === 'download' ? '...' : 'PDF'}</button>
                <button className="invoice-send" type="button" disabled={busy} onClick={() => void handleAction(member, 'send')}>{busy && busyAction === 'send' ? '...' : 'Send'}</button>
                <button className="invoice-pill" type="button" disabled={busy} onClick={() => void handleAction(member, 'preview')}>{busy && busyAction === 'preview' ? '...' : 'Preview'}</button>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

function SettingsView(props: {
  profile: MasterProfile | null
  onProfileChange: (profile: MasterProfile) => Promise<void>
  onImport: (file: File, mode: 'merge' | 'replace') => Promise<void>
}) {
  const [name, setName] = useState(props.profile?.name ?? '')
  const [email, setEmail] = useState(props.profile?.email ?? '')
  const [phone, setPhone] = useState(props.profile?.phone ?? '')

  useEffect(() => {
    setName(props.profile?.name ?? '')
    setEmail(props.profile?.email ?? '')
    setPhone(props.profile?.phone ?? '')
  }, [props.profile])

  return (
    <section className="settings-grid">
      <article className="paper-card stack-gap" onKeyDown={(event) => handleProceedOnEnter(event, () => void props.onProfileChange({ name, email, phone }))}>
        <div>
          <p className="eyebrow">Master profile</p>
          <h3>Identity and receipt details</h3>
        </div>
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <button className="primary-button" onClick={() => void props.onProfileChange({ name, email, phone })}>Save profile</button>
      </article>

      <article className="paper-card stack-gap">
        <div>
          <p className="eyebrow">Backup and restore</p>
          <h3>Export data or restore from JSON</h3>
        </div>
        <button className="secondary-button" onClick={() => void exportBackup()}>Export backup</button>
        <label className="upload-box">
          <span>Restore and replace</span>
          <input type="file" accept="application/json" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void props.onImport(file, 'replace')
          }} />
        </label>
        <label className="upload-box">
          <span>Import and merge</span>
          <input type="file" accept="application/json" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void props.onImport(file, 'merge')
          }} />
        </label>
      </article>
    </section>
  )
}

function MemberEditor(props: {
  member: Member
  product: Product | null
  profile: MasterProfile | null
  onClose: () => void
  onSave: (member: Member, draft: MemberDraft, options?: { closeEditor?: boolean }) => Promise<Member>
}) {
  const [draft, setDraft] = useState<MemberDraft>(defaultMemberDraft(props.member))
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<'save' | 'preview' | 'savePdf' | 'share' | null>(null)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState('')
  const [emailStatusTone, setEmailStatusTone] = useState<'success' | 'error' | 'idle'>('idle')
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const signaturePadRef = useRef<SignaturePadInstance | null>(null)

  function resizeAndRestoreSignature(savedSignature?: string | null) {
    const canvas = signatureCanvasRef.current
    const SignaturePad = window.SignaturePad
    if (!canvas || !SignaturePad) return

    const existingPad = signaturePadRef.current
    const previousData = savedSignature ?? (existingPad && !existingPad.isEmpty() ? existingPad.toDataURL('image/png') : null)
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    const displayWidth = Math.max(rect.width || 520, 1)
    const displayHeight = Math.max(rect.height || 220, 1)
    canvas.width = Math.round(displayWidth * ratio)
    canvas.height = Math.round(displayHeight * ratio)
    const context = canvas.getContext('2d')
    if (context) {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.scale(ratio, ratio)
    }

    signaturePadRef.current?.off()
    const pad = new SignaturePad(canvas, {
      penColor: '#4b2c18',
      minWidth: 0.8,
      maxWidth: 2.4,
      throttle: 0,
      velocityFilterWeight: 0.25,
      backgroundColor: 'rgba(255,250,244,1)',
    })
    signaturePadRef.current = pad

    if (previousData) {
      try {
        pad.fromDataURL(previousData, { ratio, width: displayWidth, height: displayHeight })
      } catch {
        // If restore fails, keep the saved preview image instead of blocking the editor.
      }
    }
  }

  useEffect(() => {
    const nextDraft = defaultMemberDraft(props.member)
    setDraft(nextDraft)
    setError('')
    setRecipientEmail('')
    setEmailStatus('')
    setEmailStatusTone('idle')

    const timer = window.setTimeout(() => {
      resizeAndRestoreSignature(nextDraft.signature ?? null)
    }, 0)

    const handleResize = () => {
      const fallback = signaturePadRef.current && !signaturePadRef.current.isEmpty()
        ? signaturePadRef.current.toDataURL('image/png')
        : nextDraft.signature ?? null
      resizeAndRestoreSignature(fallback)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [props.member])

  function captureSignature(required = false) {
    const pad = signaturePadRef.current
    if (!pad) {
      if (required) throw new Error('Signature pad is not ready yet.')
      return draft.signature ?? props.member.signature ?? null
    }

    try {
      if (pad.isEmpty()) {
        if (required && !draft.signature && !props.member.signature) {
          throw new Error('Please draw a signature first.')
        }
        return draft.signature ?? props.member.signature ?? null
      }

      const dataUrl = pad.toDataURL('image/png')
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        throw new Error('Unable to capture signature.')
      }
      return dataUrl
    } catch (error) {
      if (required) {
        throw error instanceof Error ? error : new Error('Unable to capture signature.')
      }
      return draft.signature ?? props.member.signature ?? null
    }
  }

  async function handleProofUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const proof = await normalizeProof(file)
      setDraft((current) => ({ ...current, proof }))
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to store proof.')
    }
  }

  async function handleInvoice(action: 'save' | 'preview' | 'share') {
    if (!props.product || !props.profile) return
    const actionState = action === 'save' ? 'savePdf' : action
    setBusyAction(actionState)
    setError('')
    try {
      const normalizedDraft: MemberDraft = {
        ...draft,
        name: draft.name.trim(),
        signature: captureSignature(false),
      }
      setDraft(normalizedDraft)
      const memberForInvoice = await props.onSave(props.member, normalizedDraft, { closeEditor: false })
      const blob = await generateInvoice(props.product, memberForInvoice, props.profile)
      const fileName = `${props.product.title.replace(/\s+/g, '_')}_${memberForInvoice.name.replace(/\s+/g, '_')}.pdf`

      if (action === 'save') {
        saveAs(blob, fileName)
        return
      }

      if (action === 'preview') {
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        return
      }

      setEmailDialogOpen(true)
      setEmailStatus('Invoice is ready to send.')
      setEmailStatusTone('idle')
    } catch (invoiceError) {
      setError(invoiceError instanceof Error ? invoiceError.message : 'Unable to create invoice.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSendEmail() {
    if (!props.product || !props.profile) return
    const email = recipientEmail.trim()
    if (!email) {
      setEmailStatus('Please enter a recipient email.')
      setEmailStatusTone('error')
      return
    }

    setBusyAction('share')
    setEmailStatus('Sending invoice email...')
    setEmailStatusTone('idle')

    try {
      const normalizedDraft: MemberDraft = {
        ...draft,
        name: draft.name.trim(),
        signature: captureSignature(false),
      }
      setDraft(normalizedDraft)
      const memberForInvoice = await props.onSave(props.member, normalizedDraft, { closeEditor: false })
      const blob = await generateInvoice(props.product, memberForInvoice, props.profile)
      const fileName = `${props.product.title.replace(/\s+/g, '_')}_${memberForInvoice.name.replace(/\s+/g, '_')}.pdf`
      await sendInvoiceEmailRequest({
        to: email,
        subject: `Invoice for ${memberForInvoice.name} - ${props.product.title}`,
        text: `Hello ${memberForInvoice.name},\n\nPlease find your invoice for ${props.product.title} attached.\n\nAmount paid: ${money(memberForInvoice.amount_paid)}\nAmount due: ${money(memberForInvoice.amount_due)}\nPayment method: ${memberForInvoice.payment_method}\n\nRegards,\nfriendsgamingproject & ASPD Coding`,
        filename: fileName,
        blob,
      })
      setEmailStatus(`Email sent successfully to ${email}`)
      setEmailStatusTone('success')
      setError('')
    } catch (sendError) {
      setEmailStatus(sendError instanceof Error ? sendError.message : 'Unable to send invoice email.')
      setEmailStatusTone('error')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSaveMember() {
    setBusyAction('save')
    setError('')
    try {
      const signature = captureSignature(true)
      const normalizedDraft: MemberDraft = {
        ...draft,
        name: draft.name.trim(),
        signature,
      }
      setDraft(normalizedDraft)
      await props.onSave(props.member, normalizedDraft, { closeEditor: true })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save member payment details.')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <dialog open className="modal-shell">
      <div className="modal-card paper-card large-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Member editor</p>
            <h3>{props.member.name}</h3>
          </div>
          <button className="ghost-button" type="button" onClick={props.onClose}>Close</button>
        </div>

        <div className="member-editor-grid">
          <div className="stack-gap" onKeyDown={(event) => handleProceedOnEnter(event, () => void handleSaveMember())}>
            <Field label="Member name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
            <Field label="Amount due" value={draft.amount_due} onChange={(value) => setDraft((current) => ({ ...current, amount_due: value }))} inputMode="decimal" />
            <Field label="Amount paid" value={draft.amount_paid} onChange={(value) => setDraft((current) => ({ ...current, amount_paid: value }))} inputMode="decimal" />
            <label className="field-shell">
              <span>Payment method</span>
              <select value={draft.payment_method} onChange={(event) => setDraft((current) => ({ ...current, payment_method: event.target.value as PaymentMethod }))}>
                {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="upload-box">
              <span>{draft.proof ? `Proof ready: ${draft.proof.name}` : 'Upload proof (JPG, PNG, PDF)'}</span>
              <input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" onChange={(event) => void handleProofUpload(event)} />
            </label>
            <div className="invoice-actions">
              <button className="secondary-button" type="button" disabled={busyAction !== null} onClick={() => void handleInvoice('preview')}>{busyAction === 'preview' ? 'Preparing...' : 'Preview invoice'}</button>
              <button className="secondary-button" type="button" disabled={busyAction !== null} onClick={() => void handleInvoice('save')}>{busyAction === 'savePdf' ? 'Saving...' : 'Save PDF'}</button>
              <button className="secondary-button" type="button" disabled={busyAction !== null} onClick={() => void handleInvoice('share')}>{busyAction === 'share' ? 'Sharing...' : 'Share'}</button>
            </div>
            {draft.proof ? null : <p className="warning-text">Proof is missing. You can still save the member entry.</p>}
            {error ? <p className="warning-text">{error}</p> : null}
            <button className="primary-button" type="button" disabled={busyAction !== null} onClick={() => void handleSaveMember()}>{busyAction === 'save' ? 'Saving...' : 'Save member payment details'}</button>
          </div>

          <div className="stack-gap">
            <div className="signature-shell">
              <div className="signature-header">
                <h4>Client signature</h4>
                <button className="ghost-button" type="button" onClick={() => {
                  signaturePadRef.current?.clear()
                  setDraft((current) => ({ ...current, signature: null }))
                }}>Clear pad</button>
              </div>
              <canvas
                ref={signatureCanvasRef}
                className="signature-canvas"
                onPointerUp={() => {
                  try {
                    const value = captureSignature(false)
                    if (value) setDraft((current) => ({ ...current, signature: value }))
                  } catch {}
                }}
              />
              <button className="secondary-button" type="button" onClick={() => {
                try {
                  const value = captureSignature(true)
                  setDraft((current) => ({ ...current, signature: value }))
                  setError('')
                } catch (captureError) {
                  setError(captureError instanceof Error ? captureError.message : 'Unable to capture signature.')
                }
              }}>Capture signature</button>
            </div>
            {draft.signature ? <img className="signature-preview" src={draft.signature} alt="Signature preview" /> : <div className="signature-placeholder">Signature will be stored automatically when you save member payment details.</div>}
          </div>
        </div>
      </div>
      <EmailSendDialog open={emailDialogOpen} title={`Send invoice to ${props.member.name}`} recipientEmail={recipientEmail} onRecipientEmailChange={setRecipientEmail} onClose={() => { setEmailDialogOpen(false); setEmailStatus(''); setEmailStatusTone('idle') }} onSend={() => void handleSendEmail()} isSending={busyAction === 'share'} statusMessage={emailStatus} statusTone={emailStatusTone} />
    </dialog>
  )
}

function App() {
  const [hasPin, setHasPin] = useState(false)
  const [isUnlocked, setUnlocked] = useState(false)
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [isStandaloneMode, setIsStandaloneMode] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [query, setQuery] = useState('')
  const [pin, setPin] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [setupName, setSetupName] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupPhone, setSetupPhone] = useState('')
  const [createDraft, setCreateDraft] = useState<CreateCardDraft>(defaultCreateDraft)
  const [message, setMessage] = useState('')
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [emailRecipient, setEmailRecipient] = useState('')
  const [emailStatus, setEmailStatus] = useState('')
  const [emailStatusTone, setEmailStatusTone] = useState<'success' | 'error' | 'idle'>('idle')
  const [emailTargetMember, setEmailTargetMember] = useState<Member | null>(null)

  const products = useLiveQuery(async () => db.products.orderBy('created_at').reverse().toArray(), [], [])
  const overallMembers = useLiveQuery(async () => db.members.toArray(), [], [])
  const selectedProduct = useLiveQuery(async () => (selectedProductId ? db.products.get(selectedProductId) : null), [selectedProductId], null)
  const selectedMembers = useLiveQuery(async () => {
    if (!selectedProductId) return []
    return db.members.where('product_id').equals(selectedProductId).sortBy('name')
  }, [selectedProductId], [])

  useEffect(() => {
    void (async () => {
      const [pinRecord, profileRecord] = await Promise.all([
        getSetting('pin_hash'),
        getSetting('master_profile'),
      ])
      setHasPin(Boolean(pinRecord?.value))
      setProfile(profileRecord?.value ? JSON.parse(profileRecord.value) : null)
    })()
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2800)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const updateStandalone = () => setIsStandaloneMode(mediaQuery.matches || ((window.navigator as Navigator & { standalone?: boolean }).standalone === true))
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredInstallPrompt(event as DeferredInstallPrompt)
    }

    updateStandalone()
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    mediaQuery.addEventListener?.('change', updateStandalone)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      mediaQuery.removeEventListener?.('change', updateStandalone)
    }
  }, [])
  const filteredProducts = useMemo(() => {
    return products.filter((product) => product.title.toLowerCase().includes(query.toLowerCase()))
  }, [products, query])

  const stats = useMemo(() => {
    const completed = products.filter((product) => {
      const productMembers = overallMembers.filter((member) => member.product_id === product.product_id)
      return productMembers.length > 0 && productMembers.every((member) => member.status === 'PAID')
    }).length
    return { totalCards: products.length, activeCards: products.length - completed, completedCards: completed }
  }, [overallMembers, products])

  const splitAmountPreview = useMemo(() => {
    const total = Number(createDraft.totalAmount) || 0
    return createDraft.membersCount ? total / createDraft.membersCount : 0
  }, [createDraft.membersCount, createDraft.totalAmount])

  async function handleSetup() {
    if (!/^\d{4,6}$/.test(setupPin)) return setMessage('PIN must be 4 to 6 digits.')
    if (setupPin !== confirmPin) return setMessage('PIN confirmation does not match.')
    if (!setupName.trim() || !setupEmail.trim()) return setMessage('Name and email are required.')
    await setSetting('pin_hash', sha256(setupPin))
    await setSetting('master_profile', JSON.stringify({ name: setupName.trim(), email: setupEmail.trim(), phone: setupPhone.trim() }))
    setHasPin(true)
    setProfile({ name: setupName.trim(), email: setupEmail.trim(), phone: setupPhone.trim() })
    setUnlocked(true)
    setPin('')
    setMessage('Setup complete.')
  }

  async function handleUnlock() {
    const record = await getSetting('pin_hash')
    if (!record) {
      setHasPin(false)
      return
    }

    if (sha256(pin) === record.value) {
      setUnlocked(true)
      setPin('')
      setMessage('Unlocked.')
      return
    }

    setMessage('Incorrect PIN.')
  }

  async function createCard() {
    const totalAmount = Number(createDraft.totalAmount)
    if (!createDraft.title.trim() || !Number.isFinite(totalAmount) || totalAmount <= 0) return setMessage('Enter a valid product name and total amount.')
    const split = createDraft.autoSplit ? splitAmountPreview : Number(createDraft.manualSplit)
    if (!Number.isFinite(split) || split <= 0) return setMessage('Split amount must be valid.')
    const product: Product = {
      product_id: makeId('product'),
      title: createDraft.title.trim(),
      description: createDraft.notes.trim(),
      total_amount: totalAmount,
      members_count: createDraft.membersCount,
      split_amount: Number(split.toFixed(2)),
      deadline: createDraft.deadline,
      created_at: nowIso(),
    }
    const createdMembers: Member[] = Array.from({ length: createDraft.membersCount }).map((_, index) => ({
      member_id: makeId('member'),
      product_id: product.product_id,
      name: `Member ${index + 1}`,
      amount_due: product.split_amount,
      amount_paid: 0,
      payment_method: 'Unspecified',
      status: 'PENDING',
      proof: null,
      signature: null,
      submitted_at: nowIso(),
    }))
    await db.transaction('rw', db.products, db.members, async () => {
      await db.products.add(product)
      await db.members.bulkAdd(createdMembers)
    })
    setCreateDraft(defaultCreateDraft())
    setSelectedProductId(product.product_id)
    setShowCreateCard(false)
    setMessage('Contribution card created.')
  }

  async function handleDashboardInvoice(member: Member, action: 'preview' | 'download' | 'send') {
    if (!selectedProduct || !profile) {
      setMessage('Open a product card first.')
      return
    }

    const blob = await generateInvoice(selectedProduct, member, profile)
    const fileName = `${selectedProduct.title.replace(/\s+/g, '_')}_${member.name.replace(/\s+/g, '_')}.pdf`

    if (action === 'download') {
      saveAs(blob, fileName)
      return
    }

    if (action === 'preview') {
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return
    }

    setEmailTargetMember(member)
    setEmailRecipient('')
    setEmailStatus('Invoice is ready to send.')
    setEmailStatusTone('idle')
    setEmailDialogOpen(true)
  }

  async function handleSendDashboardEmail() {
    if (!selectedProduct || !profile || !emailTargetMember) return
    const email = emailRecipient.trim()
    if (!email) {
      setEmailStatus('Please enter a recipient email.')
      setEmailStatusTone('error')
      return
    }

    setEmailStatus('Sending invoice email...')
    setEmailStatusTone('idle')
    try {
      const blob = await generateInvoice(selectedProduct, emailTargetMember, profile)
      const fileName = `${selectedProduct.title.replace(/\s+/g, '_')}_${emailTargetMember.name.replace(/\s+/g, '_')}.pdf`
      await sendInvoiceEmailRequest({
        to: email,
        subject: `Invoice for ${emailTargetMember.name} - ${selectedProduct.title}`,
        text: `Hello ${emailTargetMember.name},\n\nPlease find your invoice for ${selectedProduct.title} attached.\n\nAmount paid: ${money(emailTargetMember.amount_paid)}\nAmount due: ${money(emailTargetMember.amount_due)}\nPayment method: ${emailTargetMember.payment_method}\n\nRegards,\nfriendsgamingproject & ASPD Coding`,
        filename: fileName,
        blob,
      })
      setEmailStatus(`Email sent successfully to ${email}`)
      setEmailStatusTone('success')
      setMessage('Invoice email sent successfully.')
    } catch (sendError) {
      setEmailStatus(sendError instanceof Error ? sendError.message : 'Unable to send invoice email.')
      setEmailStatusTone('error')
    }
  }

  async function handleInstallApp() {
    const ua = window.navigator.userAgent.toLowerCase()
    const isIos = /iphone|ipad|ipod/.test(ua)

    if (isStandaloneMode) {
      setMessage('App is already installed on this device.')
      return
    }

    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt()
      const choice = await deferredInstallPrompt.userChoice
      setDeferredInstallPrompt(null)
      setMessage(choice.outcome === 'accepted' ? 'App installation started.' : 'Install prompt dismissed.')
      return
    }

    if (isIos) {
      setMessage('On iPhone: tap Share, then Add to Home Screen.')
      return
    }

    setMessage('Use your browser menu and choose Install app or Add to Home screen.')
  }

  async function saveMember(member: Member, draft: MemberDraft, options?: { closeEditor?: boolean }) {

    const amountDue = Number(draft.amount_due)
    const amountPaid = Number(draft.amount_paid)

    if (!draft.name.trim()) {
      throw new Error('Member name is required.')
    }
    if (!Number.isFinite(amountDue) || amountDue < 0) {
      throw new Error('Enter a valid amount due.')
    }
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      throw new Error('Enter a valid amount paid.')
    }

    const updated: Member = {
      ...member,
      name: draft.name.trim(),
      amount_due: amountDue,
      amount_paid: amountPaid,
      payment_method: draft.payment_method,
      proof: draft.proof ?? null,
      signature: draft.signature ?? null,
      submitted_at: nowIso(),
      status: computeStatus(amountPaid, amountDue),
    }
    await db.members.put(updated)
    if (options?.closeEditor ?? true) {
      setEditingMember(null)
      setMessage('Member payment details saved.')
    }
    return updated
  }

  const mobileTitle = view === 'dashboard' ? (selectedProduct ? selectedProduct.title : 'Contribution ledger') : view === 'invoices' ? (selectedProduct ? selectedProduct.title + ' invoices' : 'Invoices') : 'Settings'
  const mobileSubtitle = view === 'dashboard' ? (selectedProduct ? 'Manage product card' : 'Master workspace') : view === 'invoices' ? 'Invoice dashboard' : 'Profile and backup'

  if (!hasPin) {
    return <AuthShell title="ContriTrack" subtitle="Set your PIN to secure the workspace" pinValue={setupPin} onPinChange={setSetupPin} onSubmit={() => void handleSetup()} buttonLabel="Finish Setup" message={message}><div className="auth-setup-grid"><Field label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} type="password" inputMode="numeric" /><Field label="Master name" value={setupName} onChange={setSetupName} /><Field label="Email" value={setupEmail} onChange={setSetupEmail} type="email" /><Field label="Phone (optional)" value={setupPhone} onChange={setSetupPhone} /></div></AuthShell>
  }

  if (!isUnlocked) {
    return <AuthShell title="ContriTrack" subtitle="Enter PIN to unlock" pinValue={pin} onPinChange={setPin} onSubmit={() => void handleUnlock()} buttonLabel="Unlock" message={message} />
  }

  return (
    <div className={clsx('shell', selectedProduct && view === 'dashboard' && 'shell-product-open')}>
      <aside className="sidebar paper-card"><div><p className="eyebrow">CounterX</p><h1>Contribution ledger</h1><p className="subtle">Offline-ready for desktop and mobile browsers.</p></div><div className="profile-chip"><strong>{profile?.name ?? 'Master User'}</strong><span>{profile?.email ?? ''}</span></div><nav className="nav-stack"><button className={clsx('nav-button', view === 'dashboard' && 'nav-button-active')} onClick={() => setView('dashboard')}>Dashboard</button><button className={clsx('nav-button', view === 'settings' && 'nav-button-active')} onClick={() => setView('settings')}>Settings</button><button className="nav-button" onClick={() => void handleInstallApp()}>{isStandaloneMode ? 'Installed' : 'Install'}</button><button className="nav-button" onClick={() => setUnlocked(false)}>Lock</button></nav></aside>
      <header className="mobile-app-bar paper-card"><div className="mobile-app-bar-copy"><p className="eyebrow">{mobileSubtitle}</p><h2>{mobileTitle}</h2></div><div className="mobile-header-actions"><button className="ghost-button" onClick={() => void handleInstallApp()}>{isStandaloneMode ? 'Installed' : 'Install'}</button><button className="ghost-button mobile-lock-button" onClick={() => setUnlocked(false)}>Lock</button></div></header>
      <main className="content">
        <header className="hero-card paper-card"><div><p className="eyebrow">Master workspace</p><h2>{view === 'dashboard' ? 'Track products, payments, proofs, signatures, and exports' : 'Control backup, restore, and master details'}</h2></div><div className="stat-row"><Stat label="Cards" value={String(stats.totalCards)} /><Stat label="Active" value={String(stats.activeCards)} /><Stat label="Completed" value={String(stats.completedCards)} /></div></header>
        {view === 'dashboard' ? (<><section className="toolbar paper-card"><div className="toolbar-main"><label className="search-field"><span>Search cards</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="search the card" /></label><button className="primary-button" onClick={() => setShowCreateCard(true)}>Create new card</button></div></section><section className="grid-layout"><div className="stack-gap">{filteredProducts.map((product) => { const productMembers = overallMembers.filter((member) => member.product_id === product.product_id); const paidMembers = productMembers.filter((member) => member.status === 'PAID').length; const collected = productMembers.reduce((total, member) => total + member.amount_paid, 0); const progress = productMembers.length ? (paidMembers / productMembers.length) * 100 : 0; return <article key={product.product_id} className={clsx('ledger-card', 'paper-card', selectedProductId === product.product_id && 'ledger-card-active')}><div className="ledger-header"><div><h3>{product.title}</h3><p>{product.description || 'No notes yet.'}</p></div><button className="secondary-button" onClick={() => { setSelectedProductId(product.product_id); setView('dashboard') }}>Open</button></div><div className="mini-stats"><span>Total: {money(product.total_amount)}</span><span>Members: {product.members_count}</span><span>Collected: {money(collected)}</span></div><div className="progress-track"><div className="progress-bar" style={{ width: `${progress}%` }} /></div></article>})}{filteredProducts.length === 0 ? <article className="paper-card empty-state">No contribution cards yet. Create one to get started.</article> : null}</div><section className="details-panel paper-card">{selectedProduct ? <ProductDetails product={selectedProduct ?? null} members={selectedMembers} onEditMember={setEditingMember} onExportExcel={() => exportCsv(selectedProduct, selectedMembers)} onOpenInvoices={() => setView('invoices')} onBack={() => setSelectedProductId(null)} /> : <div className="empty-panel"><h3>Select a card</h3><p>Open any contribution card to manage members, proofs, invoices, and exports.</p></div>}</section></section></>) : view === 'invoices' ? (selectedProduct ? <section className="details-panel paper-card invoice-page-panel"><InvoiceDashboard product={selectedProduct} members={selectedMembers} onBack={() => setView('dashboard')} onInvoiceAction={handleDashboardInvoice} /></section> : <div className="empty-panel paper-card"><h3>Select a card</h3><p>Choose a product card first, then open its invoice dashboard.</p></div>) : <SettingsView profile={profile} onProfileChange={async (nextProfile) => { await setSetting('master_profile', JSON.stringify(nextProfile)); setProfile(nextProfile); setMessage('Profile saved.') }} onImport={async (file, mode) => { await importBackup(file, mode); const profileRecord = await getSetting('master_profile'); setProfile(profileRecord?.value ? JSON.parse(profileRecord.value) : null); setMessage(`Backup ${mode === 'replace' ? 'restored' : 'merged'} successfully.`) }} />}
      </main>
      <nav className="mobile-bottom-nav paper-card"><button className={clsx('mobile-nav-button', view === 'dashboard' && 'mobile-nav-button-active')} onClick={() => setView('dashboard')}>Home</button><button className={clsx('mobile-nav-button', view === 'invoices' && 'mobile-nav-button-active')} onClick={() => { if (selectedProduct) setView('invoices') }} disabled={!selectedProduct}>Invoices</button><button className={clsx('mobile-nav-button', view === 'settings' && 'mobile-nav-button-active')} onClick={() => setView('settings')}>Settings</button></nav>
      {showCreateCard ? <dialog open className="modal-shell"><div className="modal-card paper-card create-card-modal"><div className="modal-header"><div><p className="eyebrow">New card</p><h3>Create a contribution card</h3></div><button className="ghost-button" onClick={() => setShowCreateCard(false)}>Close</button></div><div className="form-grid create-card-form" onKeyDown={(event) => handleProceedOnEnter(event, () => void createCard())}><Field label="Product name" value={createDraft.title} onChange={(value) => setCreateDraft((draft) => ({ ...draft, title: value }))} /><Field label="Total amount" value={createDraft.totalAmount} onChange={(value) => setCreateDraft((draft) => ({ ...draft, totalAmount: value }))} inputMode="decimal" /><label className="range-field"><span>Members count: {createDraft.membersCount}</span><input type="range" min="1" max="150" value={createDraft.membersCount} onChange={(event) => setCreateDraft((draft) => ({ ...draft, membersCount: Number(event.target.value) }))} /></label><label className="toggle-row"><span>Auto split</span><input type="checkbox" checked={createDraft.autoSplit} onChange={(event) => setCreateDraft((draft) => ({ ...draft, autoSplit: event.target.checked }))} /></label>{createDraft.autoSplit ? <div className="field-shell read-only-field"><span>Split amount</span><strong>{money(splitAmountPreview)}</strong></div> : <Field label="Split amount" value={createDraft.manualSplit} onChange={(value) => setCreateDraft((draft) => ({ ...draft, manualSplit: value }))} inputMode="decimal" />}<Field label="Deadline" value={createDraft.deadline} onChange={(value) => setCreateDraft((draft) => ({ ...draft, deadline: value }))} type="date" /><Field label="Notes" value={createDraft.notes} onChange={(value) => setCreateDraft((draft) => ({ ...draft, notes: value }))} multiline /></div><div className="modal-footer create-card-footer"><button className="primary-button create-card-submit" onClick={() => void createCard()}>Create card</button></div></div></dialog> : null}
      {editingMember ? <MemberEditor member={editingMember} product={selectedProduct ?? null} profile={profile} onClose={() => setEditingMember(null)} onSave={saveMember} /> : null}
      <EmailSendDialog open={emailDialogOpen} title={emailTargetMember ? `Send invoice to ${emailTargetMember.name}` : 'Send invoice'} recipientEmail={emailRecipient} onRecipientEmailChange={setEmailRecipient} onClose={() => { setEmailDialogOpen(false); setEmailTargetMember(null); setEmailStatus(''); setEmailStatusTone('idle') }} onSend={() => void handleSendDashboardEmail()} isSending={emailStatus === 'Sending invoice email...'} statusMessage={emailStatus} statusTone={emailStatusTone} />
      {message ? <div className="toast">{message}</div> : null}
    </div>
  )
}

export default App





