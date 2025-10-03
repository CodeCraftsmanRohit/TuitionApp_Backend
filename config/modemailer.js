// config/modemailer.js
import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this.transporter;

    console.log('🔧 Initializing SMTP transporter (pooled, keepAlive recommended)...');
    const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
    const SMTP_SECURE = (process.env.SMTP_SECURE === 'true'); // true for 465
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;

    console.log({ SMTP_HOST, SMTP_PORT, SMTP_SECURE });
    console.log('SMTP_USER:', SMTP_USER ? '✅ Set' : '❌ Missing');
    console.log('SMTP_PASS:', SMTP_PASS ? `✅ Set (len ${SMTP_PASS.length})` : '❌ Missing');

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('❌ SMTP credentials missing; transporter will not be created');
      return null;
    }

    // pooled transporter: reuses connections and handles bursts better
    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      keepAlive: true,
      connectionTimeout: 30000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      logger: true,
      debug: true,
      // tls: { rejectUnauthorized: false }, // uncomment only if necessary
    });

    this.initialized = true;
    console.log('✅ SMTP transporter initialized (pool:true, keepAlive:true)');
    return this.transporter;
  }

  async verifySafe() {
    try {
      this.initialize();
      if (!this.transporter) return false;
      const ok = await this.transporter.verify();
      console.log('✅ SMTP verify OK');
      return ok;
    } catch (err) {
      console.warn('⚠️ SMTP verify failed (non-fatal):', err && (err.stack || err.message) ? (err.stack || err.message) : err);
      return false;
    }
  }

  async _retry(fn, attempts = 3, delayMs = 800) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const backoff = delayMs * Math.pow(2, i);
        console.warn(`Attempt ${i + 1} failed. Retrying in ${backoff}ms...`, err && err.message ? err.message : err);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  }

  async sendMail(mailOptions) {
    this.initialize();
    if (!this.transporter) {
      throw new Error('SMTP transporter not initialized');
    }

    const brevoKey = process.env.BREVO_API_KEY;

    // Try SMTP with retries
    try {
      const info = await this._retry(() => this.transporter.sendMail(mailOptions), 3, 800);
      console.log('✅ sendMail success (SMTP):', {
        messageId: info?.messageId,
        accepted: info?.accepted,
        rejected: info?.rejected,
      });
      return info;
    } catch (smtpErr) {
      console.error('❌ sendMail via SMTP failed after retries:', smtpErr && (smtpErr.stack || smtpErr.message) ? (smtpErr.stack || smtpErr.message) : smtpErr);

      // If Brevo API key present, attempt HTTP fallback
      if (brevoKey) {
        console.log('🔁 Attempting Brevo HTTP API fallback because BREVO_API_KEY is present');
        try {
          // dynamic import - optional dependency
          const Brevo = await import('@getbrevo/brevo').then(m => m.default || m);
          const apiClient = new Brevo.TransactionalEmailsApi();
          const defaultClient = Brevo.ApiClient.instance;
          defaultClient.authentications['api-key'].apiKey = brevoKey;

          const toAddrs = Array.isArray(mailOptions.to)
            ? mailOptions.to.map(t => ({ email: typeof t === 'string' ? t : t.address || t.email }))
            : [{ email: typeof mailOptions.to === 'string' ? mailOptions.to : (mailOptions.to?.address || mailOptions.to?.email) }];

          const sendSmtpEmail = new Brevo.SendSmtpEmail({
            sender: { email: process.env.SENDER_EMAIL || mailOptions.from || (mailOptions.sender && mailOptions.sender.email) },
            to: toAddrs,
            subject: mailOptions.subject,
            htmlContent: mailOptions.html,
            textContent: mailOptions.text,
          });

          const resp = await apiClient.sendTransacEmail(sendSmtpEmail);
          console.log('✅ Brevo API fallback success:', resp);
          return resp;
        } catch (brevoErr) {
          console.error('❌ Brevo API fallback failed:', brevoErr && (brevoErr.stack || brevoErr.message) ? (brevoErr.stack || brevoErr.message) : brevoErr);
          const e = new Error('Both SMTP and Brevo API sending failed');
          e.details = { smtp: (smtpErr && smtpErr.message) || String(smtpErr), brevo: (brevoErr && brevoErr.message) || String(brevoErr) };
          throw e;
        }
      }

      // no fallback available — rethrow
      throw smtpErr;
    }
  }
}

const emailService = new EmailService();
export default emailService;
