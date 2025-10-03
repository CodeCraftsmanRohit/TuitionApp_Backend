// config/modemailer.js
/**
 * Brevo-first mailer with correct ESM usage of @getbrevo/brevo and SMTP fallback.
 * - Requires BREVO_API_KEY env var to use Brevo HTTP API.
 * - If BREVO_API_KEY absent or Brevo call fails, falls back to SMTP (nodemailer).
 */

import nodemailer from 'nodemailer';

class Mailer {
  constructor() {
    this.brevoKey = process.env.BREVO_API_KEY || null;
    this.smtpInitialized = false;
    this.transporter = null;
  }

  initSmtp() {
    if (this.smtpInitialized) return this.transporter;

    const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
    const SMTP_SECURE = (process.env.SMTP_SECURE === 'true');
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;

    if (!SMTP_USER || !SMTP_PASS) {
      console.warn('SMTP credentials not fully set — SMTP fallback will be unavailable');
      this.smtpInitialized = true;
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

  // Primary: send via Brevo API using named exports properly
  async sendViaBrevo(mailOptions) {
    if (!this.brevoKey) throw new Error('BREVO_API_KEY not set');

    try {
      // import module namespace
      const BrevoModule = await import('@getbrevo/brevo');
      // extract named exports (works for both default and named shapes)
      const Brevo = BrevoModule.default || BrevoModule;
      const { TransactionalEmailsApi, ApiClient, SendSmtpEmail } = Brevo;

      if (!TransactionalEmailsApi || !ApiClient || !SendSmtpEmail) {
        throw new Error('Unexpected Brevo module shape — required classes missing');
      }

      const client = new TransactionalEmailsApi();
      // set API key on ApiClient.instance
      ApiClient.instance.authentications['api-key'].apiKey = this.brevoKey;

      // Build recipients array
      const toAddrs = Array.isArray(mailOptions.to)
        ? mailOptions.to.map(t => ({ email: typeof t === 'string' ? t : t.address || t.email }))
        : [{ email: typeof mailOptions.to === 'string' ? mailOptions.to : (mailOptions.to?.address || mailOptions.to?.email) }];

      const senderEmail = process.env.SENDER_EMAIL || mailOptions.from || (mailOptions.sender && mailOptions.sender.email);

      const payload = new SendSmtpEmail({
        sender: { email: senderEmail },
        to: toAddrs,
        subject: mailOptions.subject,
        htmlContent: mailOptions.html,
        textContent: mailOptions.text,
      });

      const resp = await client.sendTransacEmail(payload);
      console.log('✅ Brevo API send successful:', resp);
      return resp;
    } catch (err) {
      // log full stack for Render
      console.error('❌ Brevo API send failed:', err && (err.stack || err.message) ? (err.stack || err.message) : err);
      throw err;
    }
  }

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

  // public method: prefer Brevo HTTP API, fallback to SMTP
  async sendMail(mailOptions) {
    // If BREVO_API_KEY configured, try Brevo first
    if (this.brevoKey) {
      try {
        return await this.sendViaBrevo(mailOptions);
      } catch (brevoErr) {
        console.warn('⚠️ Brevo API present but failed — attempting SMTP fallback if available');
        // fallthrough to SMTP fallback
      }
    }

    // SMTP fallback
    return await this.sendViaSmtp(mailOptions);
  }
}

const mailer = new Mailer();
export default mailer;
