/**
 * Electronic Raffle — Email Utility
 *
 * Supports two Google Workspace sending modes:
 *
 * Mode 1: App Password (simpler setup)
 *   EMAIL_MODE=smtp
 *   EMAIL_HOST=smtp.gmail.com
 *   EMAIL_PORT=587
 *   EMAIL_USER=raffle@yourdomain.org
 *   EMAIL_PASS=your-app-password
 *
 * Mode 2: OAuth2 (more secure, recommended for production)
 *   EMAIL_MODE=oauth2
 *   EMAIL_USER=raffle@yourdomain.org
 *   EMAIL_CLIENT_ID=...
 *   EMAIL_CLIENT_SECRET=...
 *   EMAIL_REFRESH_TOKEN=...
 *
 * EMAIL_FROM_NAME=SFGGC Raffle (display name)
 */

import nodemailer from 'nodemailer';

function createTransport() {
  const mode = process.env.EMAIL_MODE || 'smtp';

  if (mode === 'oauth2') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.EMAIL_CLIENT_ID,
        clientSecret: process.env.EMAIL_CLIENT_SECRET,
        refreshToken: process.env.EMAIL_REFRESH_TOKEN,
      },
    });
  }

  // Default: SMTP with App Password
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const fromAddress = () =>
  `"${process.env.EMAIL_FROM_NAME || 'Electronic Raffle'}" <${process.env.EMAIL_USER}>`;

/**
 * Send a ticket tracker card to a buyer.
 *
 * @param {string} toEmail
 * @param {string} buyerName
 * @param {Buffer} pdfBuffer - generated tracker card PDF
 * @param {string} serial - pack serial number for subject line
 */
export async function sendTrackerCard(toEmail, buyerName, pdfBuffer, serial) {
  if (!process.env.EMAIL_USER) {
    console.warn('Email not configured — skipping send');
    return { ok: false, reason: 'Email not configured' };
  }

  const transport = createTransport();

  await transport.sendMail({
    from: fromAddress(),
    to: toEmail,
    subject: `Your Raffle Ticket Tracker — Serial ${serial}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px;">
        <h2>🎟 Your Raffle Ticket Tracker</h2>
        <p>Hi ${buyerName},</p>
        <p>Attached is your Ticket Tracker card for raffle serial <strong>${serial}</strong>.</p>
        <p>Keep this safe — it shows all your ticket numbers across all 6 colors.
           When a number is called during the raffle, check your card to see if you're a winner!</p>
        <p>Good luck! 🌈🎳</p>
        <hr/>
        <p style="font-size:12px;color:#666;">
          San Francisco Golden Gate Classic<br/>
          This email was sent because you purchased raffle tickets.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `Ticket-Tracker-${serial}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  return { ok: true };
}

/**
 * Test email configuration.
 */
export async function testEmailConfig() {
  if (!process.env.EMAIL_USER) return { ok: false, reason: 'EMAIL_USER not set' };
  try {
    const transport = createTransport();
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
