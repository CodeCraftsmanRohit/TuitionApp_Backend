// config/modemailer.js
/**
 * Brevo-first mailer with optional SMTP fallback.
 *
 * Set BREVO_API_KEY on Render to use Brevo HTTP API (recommended).
 * If BREVO_API_KEY is absent, this will fallback to SMTP using the existing SMTP_ env vars.
 */

import nodemailer from 'nodemailer';

class Mailer {
  constructor() {
    this.brevoKey = process.env.BREVO_API_KEY || null;
    this.smtpInitialized = false;
    this.transporter = null;
  }

  // Initialize SMTP transporter lazily (fallback only)
  initSmtp() {
    if (this.smtpInitialized) return this.transporter;

    const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
    const SMTP_SECURE = (process.env.SMTP_SECURE === 'true');
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;

    if (!SMTP_USER || !SMTP_PASS) {
      console.warn('SMTP credentials not fully set — SMTP fallback will be unavailable');
      this.smtpInitialized = true; // mark as attempted
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      pool: true,
      maxConnections: 3,
      keepAlive: true,
      connectionTimeout: 20000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      logger: true,
      debug: true,
    });

    this.smtpInitialized = true;
    console.log('✅ SMTP transporter prepared (fallback)');
    return this.transporter;
  }

  // Send using Brevo API (preferred)
  async sendViaBrevo(mailOptions) {
    // dynamic import so this package is optional
    try {
      const Brevo = await import('@getbrevo/brevo').then(m => m.default || m);
      const client = new Brevo.TransactionalEmailsApi();
      const defaultClient = Brevo.ApiClient.instance;
      defaultClient.authentications['api-key'].apiKey = this.brevoKey;

      // build recipients
      const to = Array.isArray(mailOptions.to)
        ? mailOptions.to.map(t => ({ email: typeof t === 'string' ? t : t.address || t.email }))
        : [{ email: typeof mailOptions.to === 'string' ? mailOptions.to : (mailOptions.to?.address || mailOptions.to?.email) }];

      const sendSmtpEmail = new Brevo.SendSmtpEmail({
        sender: { email: process.env.SENDER_EMAIL || mailOptions.from || (mailOptions.sender && mailOptions.sender.email) },
        to,
        subject: mailOptions.subject,
        htmlContent: mailOptions.html,
        textContent: mailOptions.text,
      });

      const resp = await client.sendTransacEmail(sendSmtpEmail);
      console.log('✅ Brevo API send successful', resp);
      return resp;
    } catch (err) {
      console.error('❌ Brevo API send failed:', err && (err.stack || err.message) ? (err.stack || err.message) : err);
      throw err;
    }
  }

  // Send using SMTP fallback
  async sendViaSmtp(mailOptions) {
    const transporter = this.initSmtp();
    if (!transporter) throw new Error('SMTP transporter not available');

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ sendMail via SMTP success:', {
        messageId: info?.messageId,
        accepted: info?.accepted,
        rejected: info?.rejected,
      });
      return info;
    } catch (err) {
      console.error('❌ sendMail via SMTP failed:', err && (err.stack || err.message) ? (err.stack || err.message) : err);
      throw err;
    }
  }

  // Primary public method
  async sendMail(mailOptions) {
    // prefer Brevo HTTP API
    if (this.brevoKey) {
      try {
        return await this.sendViaBrevo(mailOptions);
      } catch (brevoErr) {
        console.warn('⚠️ Brevo API present but failed — attempting SMTP fallback (if configured)');
        // fallthrough to SMTP fallback
      }
    }

    // fallback to SMTP
    return await this.sendViaSmtp(mailOptions);
  }
}

const mailer = new Mailer();
export default mailer;
