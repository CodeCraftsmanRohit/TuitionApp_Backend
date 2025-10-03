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

  // Primary: send via Brevo API with robust module handling
  async sendViaBrevo(mailOptions) {
  if (!this.brevoKey) throw new Error('BREVO_API_KEY not set');

  try {
    const toArray = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];
    const to = toArray.map(recipient => ({
      email: typeof recipient === 'string' ? recipient : (recipient.address || recipient.email)
    }));

    const payload = {
      sender: {
        email: process.env.SENDER_EMAIL || mailOptions.from || 'noreply@example.com'
      },
      to: to,
      subject: mailOptions.subject,
      htmlContent: mailOptions.html,
      textContent: mailOptions.text
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': this.brevoKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Brevo API send successful:', result);
    return result;

  } catch (err) {
    console.error('❌ Brevo API send failed:', err.message);
    throw err;
  }
}

  async sendViaSmtp(mailOptions) {
    const transporter = this.initSmtp();
    if (!transporter) throw new Error('SMTP transporter not available');

    try {
      // Ensure proper from address
      const finalMailOptions = {
        ...mailOptions,
        from: mailOptions.from || process.env.SENDER_EMAIL
      };

      const info = await transporter.sendMail(finalMailOptions);
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