import { runQuery } from './database';

export const setSetting = async (key: string, value: string | null) => {
  await runQuery(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
};

export const getSetting = async (key: string): Promise<string | null> => {
  const result = await runQuery('SELECT value FROM settings WHERE key = ? LIMIT 1;', [key]);
  if (result.rows.length === 0) return null;
  return result.rows.item(0).value as string;
};
