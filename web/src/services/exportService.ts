import XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { getPrivateDir } from '../storage/fileStore';
import { Member, Product } from '../types/models';
import { formatDate } from '../utils/format';

export const exportCardToExcel = async (product: Product, members: Member[]) => {
  const rows = members.map(m => ({
    Name: m.name,
    AmountDue: m.amount_due,
    AmountPaid: m.amount_paid,
    Status: m.status,
    SubmittedAt: formatDate(m.submitted_at),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');

  const wbout = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
  const { exports } = await getPrivateDir();
  const filePath = `${exports}/card_${product.product_id}.xlsx`;
  const buffer = new ArrayBuffer(wbout.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < wbout.length; i += 1) view[i] = wbout.charCodeAt(i) & 0xff;
  await RNFS.writeFile(filePath, Buffer.from(view).toString('base64'), 'base64');
  return filePath;
};
