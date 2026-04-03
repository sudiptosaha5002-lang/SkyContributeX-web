import { v4 as uuidv4 } from 'uuid';
import { runQuery } from './database';
import { Member, Product } from '../types/models';
import { nowIso } from '../utils/format';

export type ProductSummary = Product & {
  total_members: number;
  paid_members: number;
  total_collected: number;
};

export const createProduct = async (input: Omit<Product, 'product_id' | 'created_at'>) => {
  const product_id = uuidv4();
  const created_at = nowIso();
  await runQuery(
    `INSERT INTO products (product_id, title, description, total_amount, members_count, split_amount, deadline, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      product_id,
      input.title,
      input.description ?? null,
      input.total_amount,
      input.members_count,
      input.split_amount,
      input.deadline ?? null,
      created_at,
    ]
  );
  return { product_id, created_at } as const;
};

export const getProducts = async (): Promise<Product[]> => {
  const result = await runQuery('SELECT * FROM products ORDER BY created_at DESC;');
  const items: Product[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    items.push(result.rows.item(i));
  }
  return items;
};

export const getProductSummaries = async (): Promise<ProductSummary[]> => {
  const result = await runQuery(
    `SELECT p.*,
      (SELECT COUNT(*) FROM members m WHERE m.product_id = p.product_id) as total_members,
      (SELECT COUNT(*) FROM members m WHERE m.product_id = p.product_id AND m.status = 'PAID') as paid_members,
      (SELECT IFNULL(SUM(amount_paid), 0) FROM members m WHERE m.product_id = p.product_id) as total_collected
     FROM products p
     ORDER BY created_at DESC;`
  );
  const items: ProductSummary[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    items.push(result.rows.item(i));
  }
  return items;
};

export const getProductById = async (productId: string): Promise<Product | null> => {
  const result = await runQuery('SELECT * FROM products WHERE product_id = ? LIMIT 1;', [productId]);
  if (result.rows.length === 0) return null;
  return result.rows.item(0) as Product;
};

export const deleteProduct = async (productId: string) => {
  await runQuery('DELETE FROM members WHERE product_id = ?;', [productId]);
  await runQuery('DELETE FROM products WHERE product_id = ?;', [productId]);
};

export const createMembersForProduct = async (productId: string, membersCount: number, splitAmount: number) => {
  const now = nowIso();
  const inserts: Promise<any>[] = [];
  for (let i = 1; i <= membersCount; i += 1) {
    inserts.push(
      runQuery(
        `INSERT INTO members (member_id, product_id, name, amount_due, amount_paid, status, proof_path, signature_path, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          uuidv4(),
          productId,
          `Member ${i}`,
          splitAmount,
          0,
          'PENDING',
          null,
          null,
          now,
        ]
      )
    );
  }
  await Promise.all(inserts);
};

export const getMembersByProduct = async (productId: string): Promise<Member[]> => {
  const result = await runQuery('SELECT * FROM members WHERE product_id = ? ORDER BY name ASC;', [productId]);
  const items: Member[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    items.push(result.rows.item(i));
  }
  return items;
};

export const getMemberById = async (memberId: string): Promise<Member | null> => {
  const result = await runQuery('SELECT * FROM members WHERE member_id = ? LIMIT 1;', [memberId]);
  if (result.rows.length === 0) return null;
  return result.rows.item(0) as Member;
};

export const updateMember = async (member: Member) => {
  await runQuery(
    `UPDATE members
     SET name = ?, amount_due = ?, amount_paid = ?, status = ?, proof_path = ?, signature_path = ?, submitted_at = ?
     WHERE member_id = ?;`,
    [
      member.name,
      member.amount_due,
      member.amount_paid,
      member.status,
      member.proof_path ?? null,
      member.signature_path ?? null,
      member.submitted_at ?? null,
      member.member_id,
    ]
  );
};

export const updateMemberProof = async (memberId: string, proofPath: string | null) => {
  await runQuery('UPDATE members SET proof_path = ? WHERE member_id = ?;', [proofPath, memberId]);
};

export const updateMemberSignature = async (memberId: string, signaturePath: string | null) => {
  await runQuery('UPDATE members SET signature_path = ? WHERE member_id = ?;', [signaturePath, memberId]);
};

export const updateMemberPayment = async (memberId: string, amountPaid: number, amountDue: number) => {
  const status = amountPaid >= amountDue ? 'PAID' : 'PENDING';
  await runQuery(
    'UPDATE members SET amount_paid = ?, status = ?, submitted_at = ? WHERE member_id = ?;',
    [amountPaid, status, nowIso(), memberId]
  );
};

export const updateProduct = async (product: Product) => {
  await runQuery(
    `UPDATE products SET title = ?, description = ?, total_amount = ?, members_count = ?, split_amount = ?, deadline = ?
     WHERE product_id = ?;`,
    [
      product.title,
      product.description ?? null,
      product.total_amount,
      product.members_count,
      product.split_amount,
      product.deadline ?? null,
      product.product_id,
    ]
  );
};
