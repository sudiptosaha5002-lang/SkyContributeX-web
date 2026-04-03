import Dexie, { type Table } from 'dexie'
import type { Member, Product, SettingsRecord } from '../types'

class CounterXDb extends Dexie {
  products!: Table<Product, string>
  members!: Table<Member, string>
  settings!: Table<SettingsRecord, string>

  constructor() {
    super('counterx-web')
    this.version(1).stores({
      products: 'product_id, created_at, title',
      members: 'member_id, product_id, status, submitted_at',
      settings: 'key',
    })
  }
}

export const db = new CounterXDb()

export async function getSetting(key: string) {
  return db.settings.get(key)
}

export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value })
}

export async function removeSetting(key: string) {
  await db.settings.delete(key)
}
