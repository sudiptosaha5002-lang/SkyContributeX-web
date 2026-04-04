import dayjs from 'dayjs'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import type { BackupPayload, MasterProfile, Member, Product, StoredAsset } from '../types'
import { db } from './db'

const COMPANY_NAME = 'friendsgamingproject & ASPD Coding'
const ISSUER_EMAIL = 'friendsgamingproject438@gmail.com'

export const MAX_FILE_SIZE = 5 * 1024 * 1024
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
export const amountText = (value: number) => `INR ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
export const nowIso = () => new Date().toISOString()
export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
export const computeStatus = (amountPaid: number, amountDue: number) => (amountPaid >= amountDue ? 'PAID' : 'PENDING')
export const canGenerateInvoice = (member: Member) => member.amount_paid > 0
export const getInvoiceNumber = (member: Member) => `INV-${member.member_id.slice(-8).toUpperCase()}`

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
}

export async function normalizeProof(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds the 5MB limit.')
  if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
    throw new Error('Only JPG, PNG, and PDF files are allowed.')
  }

  if (file.type === 'application/pdf') {
    return {
      name: `proof_${crypto.randomUUID()}.pdf`,
      type: file.type,
      size: file.size,
      data: await fileToDataUrl(file),
    } satisfies StoredAsset
  }

  const source = await fileToDataUrl(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Unable to load image'))
    img.src = source
  })
  const maxSide = 1440
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to compress image.')
  context.drawImage(image, 0, 0, width, height)
  const data = canvas.toDataURL('image/jpeg', 0.82)

  return {
    name: `proof_${crypto.randomUUID()}.jpg`,
    type: 'image/jpeg',
    size: Math.round((data.length * 3) / 4),
    data,
  } satisfies StoredAsset
}

function addInvoiceBand(doc: jsPDF, y: number, height: number, fill: [number, number, number]) {
  doc.setFillColor(...fill)
  doc.roundedRect(16, y, 178, height, 8, 8, 'F')
}

export async function generateInvoice(product: Product, member: Member, profile: MasterProfile) {
  if (!canGenerateInvoice(member)) {
    throw new Error('Invoice can only be generated after a payment amount is recorded.')
  }

  const doc = new jsPDF()
  doc.setFillColor(250, 243, 234)
  doc.rect(0, 0, 210, 297, 'F')

  doc.setFillColor(255, 255, 255)
  doc.roundedRect(10, 10, 190, 277, 12, 12, 'F')

  doc.setFillColor(250, 122, 86)
  doc.roundedRect(10, 10, 190, 48, 12, 12, 'F')
  doc.setFillColor(245, 183, 78)
  doc.circle(182, 34, 18, 'F')
  doc.setFillColor(90, 166, 255)
  doc.circle(166, 22, 9, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('INVOICE', 18, 28)
  doc.setFontSize(12)
  doc.text(COMPANY_NAME, 18, 38)
  doc.setFont('helvetica', 'normal')
  doc.text(`Issued by: ${ISSUER_EMAIL}`, 18, 46)

  doc.setTextColor(67, 39, 22)
  addInvoiceBand(doc, 66, 54, [255, 242, 214])
  addInvoiceBand(doc, 126, 72, [236, 247, 255])
  addInvoiceBand(doc, 204, 66, [241, 236, 255])

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Invoice Summary', 22, 78)
  doc.text('Member Payment Details', 22, 138)
  doc.text('Issuer And Signature', 22, 216)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  const summaryLines = [
    ['Invoice ID', `INV-${member.member_id.slice(-8).toUpperCase()}`],
    ['Product', product.title],
    ['Invoice date', dayjs(member.submitted_at).format('DD MMM YYYY hh:mm A')],
    ['Deadline', product.deadline || 'Open'],
  ]
  let y = 88
  for (const [label, value] of summaryLines) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, 24, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value), 70, y)
    y += 10
  }

  const paymentLines = [
    ['Client', member.name],
    ['Client email', member.email || 'Not provided'],
    ['Amount due', amountText(member.amount_due)],
    ['Amount paid', amountText(member.amount_paid)],
    ['Payment method', member.payment_method],
    ['Status', member.status],
    ['Proof file', member.proof?.name || 'Not attached'],
    ['Recorded by', profile.name || COMPANY_NAME],
    ['Contact', profile.phone || ISSUER_EMAIL],
  ]
  y = 148
  for (const [label, value] of paymentLines) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, 24, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value), 70, y)
    y += 9
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Company', 24, 228)
  doc.setFont('helvetica', 'normal')
  doc.text(COMPANY_NAME, 70, 228)
  doc.setFont('helvetica', 'bold')
  doc.text('Email', 24, 238)
  doc.setFont('helvetica', 'normal')
  doc.text(ISSUER_EMAIL, 70, 238)

  if (member.proof?.type?.startsWith('image/')) {
    doc.setFont('helvetica', 'bold')
    doc.text('Proof image', 24, 260)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(120, 214, 60, 52, 6, 6, 'F')
    try {
      doc.addImage(member.proof.data, 'JPEG', 123, 218, 54, 44)
    } catch {
      doc.setFont('helvetica', 'normal')
      doc.text('Preview unavailable', 126, 242)
    }
  }

  if (member.signature) {
    doc.setFont('helvetica', 'bold')
    doc.text('Client signature', 24, 250)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(70, 244, 42, 28, 6, 6, 'F')
    doc.addImage(member.signature, 'PNG', 73, 247, 36, 20)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.text('Client signature', 24, 250)
    doc.setFont('helvetica', 'normal')
    doc.text('Not attached', 70, 250)
  }

  doc.setTextColor(109, 82, 64)
  doc.setFontSize(9)
  doc.text('Offline invoice styled for a colorful, modern presentation.', 18, 282)

  return doc.output('blob')
}

export function exportExcel(product: Product, members: Member[]) {
  const rows = members.map((member) => ({
    MemberId: member.member_id,
    Name: member.name,
    AmountDue: member.amount_due,
    AmountPaid: member.amount_paid,
    PaymentMethod: member.payment_method,
    Status: member.status,
    SubmittedAt: dayjs(member.submitted_at).format('DD MMM YYYY hh:mm A'),
    ProofAvailable: member.proof ? 'Yes' : 'No',
    ProofFileName: member.proof?.name ?? '',
    ProofType: member.proof?.type ?? '',
    SignatureStatus: member.signature ? 'Attached' : 'Missing',
  }))

  const evidenceRows = members.map((member) => ({
    MemberId: member.member_id,
    Name: member.name,
    PaymentMethod: member.payment_method,
    ProofAvailable: member.proof ? 'Yes' : 'No',
    ProofFileName: member.proof?.name ?? '',
    ProofType: member.proof?.type ?? '',
    ProofSizeBytes: member.proof?.size ?? '',
    ProofData: member.proof?.data ?? '',
    SignatureStatus: member.signature ? 'Attached' : 'Missing',
    SignatureData: member.signature ?? '',
  }))

  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const evidenceSheet = XLSX.utils.json_to_sheet(evidenceRows)

  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 22 },
    { wch: 14 },
    { wch: 28 },
    { wch: 20 },
    { wch: 18 },
  ]

  evidenceSheet['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 70 },
    { wch: 18 },
    { wch: 70 },
  ]

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Members')
  XLSX.utils.book_append_sheet(workbook, evidenceSheet, 'Evidence')
  const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  saveAs(new Blob([output], { type: 'application/octet-stream' }), product.title.replace(/\s+/g, '_') + '.xlsx')
}

export function exportCsv(product: Product, members: Member[]) {
  const rows = members.map((member) => ({
    MemberId: member.member_id,
    Name: member.name,
    AmountDue: member.amount_due,
    AmountPaid: member.amount_paid,
    PaymentMethod: member.payment_method,
    Status: member.status,
    SubmittedAt: dayjs(member.submitted_at).format('DD MMM YYYY hh:mm A'),
    ProofAvailable: member.proof ? 'Yes' : 'No',
    ProofFileName: member.proof?.name ?? '',
    ProofType: member.proof?.type ?? '',
    SignatureStatus: member.signature ? 'Attached' : 'Missing',
  }))
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(worksheet)
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), product.title.replace(/\s+/g, '_') + '.csv')
}


export async function exportBackup() {
  const [products, members, settings] = await Promise.all([db.products.toArray(), db.members.toArray(), db.settings.toArray()])
  const payload: BackupPayload = { exportedAt: nowIso(), products, members, settings }
  saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'backup.json')
}

export async function importBackup(file: File, mode: 'merge' | 'replace') {
  const payload = JSON.parse(await file.text()) as BackupPayload
  const normalizedMembers = (payload.members ?? []).map((member) => ({
    ...member,
    payment_method: member.payment_method ?? 'Unspecified',
  }))

  if (mode === 'replace') {
    await db.transaction('rw', db.products, db.members, db.settings, async () => {
      await db.products.clear()
      await db.members.clear()
      await db.settings.clear()
      await db.products.bulkPut(payload.products ?? [])
      await db.members.bulkPut(normalizedMembers)
      await db.settings.bulkPut(payload.settings ?? [])
    })
    return
  }
  await db.products.bulkPut(payload.products ?? [])
  await db.members.bulkPut(normalizedMembers)
  await db.settings.bulkPut(payload.settings ?? [])
}


