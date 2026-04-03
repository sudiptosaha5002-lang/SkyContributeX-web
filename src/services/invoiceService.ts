import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNFS from 'react-native-fs';
import { Member, Product, MasterProfile } from '../types/models';
import { formatDate, nowIso } from '../utils/format';
import { getPrivateDir } from '../storage/fileStore';

export const generateInvoicePdf = async (
  product: Product,
  member: Member,
  master: MasterProfile,
  signaturePath?: string | null
) => {
  const invoiceId = `INV-${member.member_id.slice(0, 8).toUpperCase()}`;
  const date = formatDate(nowIso());
  const signatureImg = signaturePath ? `<img src="file://${signaturePath}" style="width:200px;" />` : '<em>Not provided</em>';

  const html = `
  <html>
    <head>
      <style>
        body { font-family: Arial; padding: 24px; color: #2c1f14; }
        .card { border: 1px solid #d8c8b8; padding: 16px; border-radius: 8px; }
        .title { font-size: 20px; font-weight: bold; }
        .row { margin: 8px 0; }
        .muted { color: #6a5c4b; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="title">Contribution Invoice</div>
        <div class="row muted">Invoice ID: ${invoiceId}</div>
        <div class="row">Product: ${product.title}</div>
        <div class="row">Member: ${member.name}</div>
        <div class="row">Amount Paid: ${member.amount_paid}</div>
        <div class="row">Date: ${date}</div>
        <div class="row">Master: ${master.name} (${master.email})</div>
        <div class="row">Signature: ${signatureImg}</div>
      </div>
    </body>
  </html>
  `;

  const { exports } = await getPrivateDir();
  const file = await RNHTMLtoPDF.convert({ html, fileName: `invoice_${member.member_id}`, directory: 'Documents' });
  if (!file.filePath) return null;
  const target = `${exports}/invoice_${member.member_id}.pdf`;
  try {
    await RNFS.copyFile(file.filePath, target);
    return target;
  } catch {
    return file.filePath;
  }
};
