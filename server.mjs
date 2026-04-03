import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.EMAIL_SERVER_PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "25mb" }));

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP configuration is missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.");
  }

  return nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user, pass },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/send-invoice-email', async (req, res) => {
  try {
    const { to, subject, text, filename, pdfBase64 } = req.body ?? {};

    if (!to || !subject || !text || !filename || !pdfBase64) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }

    const transporter = getTransporter();
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to send email.' });
  }
});

app.listen(port, () => {
  console.log(`CounterX mail server running on http://localhost:${port}`);
});
