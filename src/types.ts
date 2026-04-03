export type PaymentMethod = 'Cash' | 'UPI' | 'PayPal' | 'Unspecified'

export type Product = {
  product_id: string
  title: string
  description: string
  total_amount: number
  members_count: number
  split_amount: number
  deadline: string
  created_at: string
}

export type StoredAsset = {
  name: string
  type: string
  size: number
  data: string
}

export type Member = {
  member_id: string
  product_id: string
  name: string
  amount_due: number
  amount_paid: number
  status: 'PAID' | 'PENDING'
  payment_method: PaymentMethod
  proof?: StoredAsset | null
  signature?: string | null
  submitted_at: string
}

export type MasterProfile = {
  name: string
  email: string
  phone: string
}

export type SettingsRecord = {
  key: string
  value: string
}

export type BackupPayload = {
  exportedAt: string
  products: Product[]
  members: Member[]
  settings: SettingsRecord[]
}
