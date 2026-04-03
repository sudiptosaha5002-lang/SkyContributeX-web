import SQLite from 'react-native-sqlite-storage';

type SQLiteDatabase = any;
type ResultSet = any;

SQLite.enablePromise(true);

const DB_NAME = 'counterx.db';
const DB_LOCATION = 'default';

let dbInstance: SQLiteDatabase | null = null;

export const getDb = async (): Promise<SQLiteDatabase> => {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabase({ name: DB_NAME, location: DB_LOCATION });
  return dbInstance;
};

export const initDb = async (): Promise<void> => {
  const db = await getDb();
  await db.executeSql(
    `CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      total_amount REAL NOT NULL,
      members_count INTEGER NOT NULL,
      split_amount REAL NOT NULL,
      deadline TEXT,
      created_at TEXT NOT NULL
    );`
  );
  await db.executeSql(
    `CREATE TABLE IF NOT EXISTS members (
      member_id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount_due REAL NOT NULL,
      amount_paid REAL NOT NULL,
      status TEXT NOT NULL,
      proof_path TEXT,
      signature_path TEXT,
      submitted_at TEXT,
      FOREIGN KEY(product_id) REFERENCES products(product_id) ON DELETE CASCADE
    );`
  );
  await db.executeSql(
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );`
  );
  await db.executeSql('CREATE INDEX IF NOT EXISTS idx_members_product ON members(product_id);');
  await db.executeSql('CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);');
};

export const runQuery = async (sql: string, params: any[] = []): Promise<ResultSet> => {
  const db = await getDb();
  const [result] = await db.executeSql(sql, params);
  return result;
};
