import RNFS from 'react-native-fs';
import { getPrivateDir } from '../storage/fileStore';
import { getProducts, getMembersByProduct } from '../db/repository';
import { runQuery } from '../db/database';

export const createBackup = async () => {
  const products = await getProducts();
  const membersByProduct = await Promise.all(
    products.map(async p => ({ product_id: p.product_id, members: await getMembersByProduct(p.product_id) }))
  );
  const data = {
    products,
    membersByProduct,
  };
  const { exports } = await getPrivateDir();
  const filePath = `${exports}/backup.json`;
  await RNFS.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
};

export const restoreBackup = async (jsonPath: string, mode: 'replace' | 'merge' = 'replace') => {
  const raw = await RNFS.readFile(jsonPath, 'utf8');
  const payload = JSON.parse(raw);

  if (mode === 'replace') {
    await runQuery('DELETE FROM members;');
    await runQuery('DELETE FROM products;');
  }

  for (const product of payload.products || []) {
    await runQuery(
      `INSERT OR REPLACE INTO products (product_id, title, description, total_amount, members_count, split_amount, deadline, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        product.product_id,
        product.title,
        product.description ?? null,
        product.total_amount,
        product.members_count,
        product.split_amount,
        product.deadline ?? null,
        product.created_at,
      ]
    );
  }

  for (const group of payload.membersByProduct || []) {
    for (const member of group.members || []) {
      await runQuery(
        `INSERT OR REPLACE INTO members (member_id, product_id, name, amount_due, amount_paid, status, proof_path, signature_path, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          member.member_id,
          member.product_id,
          member.name,
          member.amount_due,
          member.amount_paid,
          member.status,
          member.proof_path ?? null,
          member.signature_path ?? null,
          member.submitted_at ?? null,
        ]
      );
    }
  }
};
