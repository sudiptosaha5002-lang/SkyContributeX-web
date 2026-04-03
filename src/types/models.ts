export type Product = {
  product_id: string;
  title: string;
  description?: string | null;
  total_amount: number;
  members_count: number;
  split_amount: number;
  deadline?: string | null;
  created_at: string;
};

export type Member = {
  member_id: string;
  product_id: string;
  name: string;
  amount_due: number;
  amount_paid: number;
  status: 'PAID' | 'PENDING';
  proof_path?: string | null;
  signature_path?: string | null;
  submitted_at?: string | null;
};

export type MasterProfile = {
  name: string;
  email: string;
  phone?: string | null;
};
