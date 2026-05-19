// server/api/services/emailService.js
// Sends transactional emails after payment success
// Replace the sendEmail stub with your email provider (Resend, Nodemailer, etc.)

import { logger } from '../utils/logger.js';

/**
 * Send payment confirmation email.
 * Replace this stub with your actual email provider SDK call.
 */
export async function sendPaymentConfirmationEmail({ customerName, customerEmail, orderId, items, amountPaise }) {
  const amountRupees = (amountPaise / 100).toFixed(2);

  logger.info('email.payment_confirmation.sending', { customerEmail, orderId });

  try {
    // -------------------------------------------------------
    // STUB: Replace with Resend, Nodemailer, SendGrid, etc.
    // Example with Resend:
    //
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'noreply@yourdomain.com',
    //   to: customerEmail,
    //   subject: `Payment Confirmed — Order ${orderId}`,
    //   html: buildEmailHtml({ customerName, orderId, items, amountRupees }),
    // });
    // -------------------------------------------------------

    logger.info('email.payment_confirmation.sent', { customerEmail, orderId });
  } catch (err) {
    // Email failures should NOT block payment flow
    logger.error('email.payment_confirmation.failed', {
      customerEmail,
      orderId,
      error: err.message,
    });
  }
}

function buildEmailHtml({ customerName, orderId, items, amountRupees }) {
  const itemList = items.map((i) => `<li>${i.name} × ${i.quantity}</li>`).join('');
  return `
    <h2>Payment Confirmed</h2>
    <p>Hi ${customerName},</p>
    <p>Your payment of ₹${amountRupees} has been confirmed.</p>
    <p>Order ID: <strong>${orderId}</strong></p>
    <ul>${itemList}</ul>
    <p>Your download links are available in your account.</p>
  `;
}
