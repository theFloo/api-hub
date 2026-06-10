// server/api/services/emailService.js
// Premium transactional email service for digital products marketplace

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendPaymentConfirmationEmail({ customerName, customerEmail, orderId, items, amountPaise }) {
  const amountRupees = (amountPaise / 100).toFixed(2);

  logger.info('email.payment_confirmation.sending', { customerEmail, orderId });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: customerEmail,
      subject: `Payment Confirmed — Order #${orderId.slice(0, 8).toUpperCase()}`,
      html: buildEmailHtml({ customerName, orderId, items, amountRupees }),
    });

    logger.info('email.payment_confirmation.sent', { customerEmail, orderId });
  } catch (err) {
    logger.error('email.payment_confirmation.failed', {
      customerEmail,
      orderId,
      error: err.message,
    });
  }
}

function buildEmailHtml({ customerName, orderId, items, amountRupees }) {
  const itemList = (items || [])
    .map(
      (i) => `
    <tr>
      <td style="padding: 16px 0; border-bottom: 1px solid #f0f0f0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
          <tr>
            <td style="vertical-align: middle;">
              <p style="margin: 0; font-size: 15px; font-weight: 500; color: #1a1a1a; line-height: 1.4;">
                ${escapeHtml(i.name)}
              </p>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #999; line-height: 1.4;">
                Quantity: ${escapeHtml(String(i.quantity))}
              </p>
            </td>
            <td style="width: 60px; text-align: right; vertical-align: middle;">
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1a1a1a;">
                ✓
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `
    )
    .join('');

  const currentYear = new Date().getFullYear();
  const formattedDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment Confirmed Email</title>
</head>
<body style="margin:0;padding:20px 0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center">

<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">

<tr>
<td align="center" style="padding:48px 40px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
<div style="width:64px;height:64px;line-height:64px;border-radius:50%;background:#ecfdf5;color:#10b981;font-size:32px;font-weight:bold;">
✓
</div>
<h1 style="margin:20px 0 8px;font-size:32px;color:#111827;">Payment Confirmed</h1>
<p style="margin:0;color:#6b7280;font-size:16px;">Your order has been successfully processed</p>
</td>
</tr>

<tr>
<td style="padding:40px;">

<p style="margin:0 0 16px;font-size:16px;color:#111827;">
Hi <strong>${escapeHtml(customerName)}</strong>,
</p>

<p style="margin:0 0 24px;color:#6b7280;line-height:1.6;">
Thank you for your purchase. Your payment has been received and your digital products are ready for download.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px;">
<tr>
<td align="center" style="padding:16px;font-weight:bold;color:#15803d;">
✓ PAYMENT SUCCESSFUL
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:32px;">
<tr>
<td style="padding:24px;">

<table width="100%">
<tr>
<td style="padding-bottom:16px;">
<div style="font-size:12px;color:#9ca3af;font-weight:bold;text-transform:uppercase;">Order ID</div>
<div style="margin-top:6px;">${escapeHtml(orderId)}</div>
</td>
</tr>

<tr>
<td width="50%">
<div style="font-size:12px;color:#9ca3af;font-weight:bold;text-transform:uppercase;">Date</div>
<div style="margin-top:6px;">${escapeHtml(formattedDate)}</div>
</td>

<td width="50%">
<div style="font-size:12px;color:#9ca3af;font-weight:bold;text-transform:uppercase;">Status</div>
<div style="margin-top:6px;color:#10b981;font-weight:bold;">Delivered ✓</div>
</td>
</tr>

</table>

</td>
</tr>
</table>

<h3 style="margin:0 0 16px;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
📦 Your Items
</h3>

<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
${itemList} 
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
<tr>
<td style="padding:8px 0;color:#6b7280;">Subtotal</td>
<td align="right">₹${escapeHtml(amountRupees)}</td>
</tr>

<tr>
<td style="padding-top:16px;border-top:2px solid #e5e7eb;font-weight:bold;">
Total Paid
</td>
<td align="right" style="padding-top:16px;border-top:2px solid #e5e7eb;">
<span style="font-size:42px;font-weight:800;color:#4f46e5;">
₹${escapeHtml(amountRupees)}
</span>
</td>
</tr>
</table>

<table align="center" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
<tr>
<td bgcolor="#4f46e5" style="border-radius:8px;">
<a href="${escapeHtml((process.env.FRONTEND_URL || 'https://thefloo.online') + '/orders')}" style="display:inline-block;padding:16px 36px;color:#ffffff;text-decoration:none;font-weight:bold;">
📥 Download Your Files
</a>
</td>
</tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:20px;">
<div style="font-weight:bold;color:#92400e;margin-bottom:8px;">
📋 What's Next?
</div>
<div style="color:#b45309;line-height:1.6;">
Your downloads are available instantly from your account dashboard. You can access them anytime using your secure account.
</div>
</td>
</tr>
</table>

<p style="margin:0 0 24px;color:#6b7280;line-height:1.6;">
Need help? Contact our support team anytime and we'll be happy to assist.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;">
<tr>
<td align="center" style="padding:18px;font-size:12px;color:#6b7280;">
🔒 Secure Payment &nbsp;&nbsp; • &nbsp;&nbsp; ⚡ Instant Delivery &nbsp;&nbsp; • &nbsp;&nbsp; ♾️ Lifetime Access &nbsp;&nbsp; • &nbsp;&nbsp; 💬 Support Included
</td>
</tr>
</table>

</td>
</tr>

<tr>
<td align="center" style="padding:32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
<p style="margin:0 0 12px;color:#6b7280;">
© ${escapeHtml(currentYear)} TheFloo Digital Products
</p>

<p style="margin:0 0 12px;">
<a href="${escapeHtml(process.env.FRONTEND_URL || 'https://thefloo.online')}" style="color:#4f46e5;text-decoration:none;">Visit Store</a>
&nbsp; • &nbsp;
<a href="${escapeHtml((process.env.FRONTEND_URL || 'https://thefloo.online') + '/support')}" style="color:#4f46e5;text-decoration:none;">Help Center</a>
</p>

<p style="margin:0;font-size:11px;color:#9ca3af;">
This is a transactional email. Please do not share sensitive information by email.
</p>
</td>
</tr>

</table>

</td>
</tr>
</table>
</body>
</html>
`;
}
