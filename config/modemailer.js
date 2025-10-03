// config/modemailer.js
import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this.transporter;

    console.log('🔧 Initializing SMTP transporter...');
    const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
    const SMTP_SECURE = (process.env.SMTP_SECURE === 'true'); // true for 465
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const SENDER_EMAIL = process.env.SENDER_EMAIL || SMTP_USER;

    console.log('SMTP_HOST:', SMTP_HOST);
    console.log('SMTP_PORT:', SMTP_PORT);
    console.log('SMTP_SECURE:', SMTP_SECURE);
    console.log('SMTP_USER:', SMTP_USER ? '✅ Set' : '❌ Missing');
    console.log('SMTP_PASS:', SMTP_PASS ? `✅ Set (length ${SMTP_PASS.length})` : '❌ Missing');
    console.log('SENDER_EMAIL:', SENDER_EMAIL || '❌ Missing');

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('❌ SMTP credentials missing during initialization');
      return null;
    }

    // Create transporter with debug and timeouts to surfact problems in logs
    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      logger: true,
      debug: true,
      connectionTimeout: 20000,
      greetingTimeout: 10000,
      // If your environment requires it you may set rejectUnauthorized false
      // tls: { rejectUnauthorized: false },
    });

    this.initialized = true;
    console.log('✅ SMTP transporter initialized');
    return this.transporter;
  }

  async verify() {
    if (!this.transporter) {
      this.initialize();
    }

    if (!this.transporter) {
      console.error('Transporter not initialized; verify skipped');
      return false;
    }

    try {
      const ok = await this.transporter.verify();
      console.log('✅ SMTP connection verified successfully');
      return true;
    } catch (error) {
      // log full stack to render logs
      console.error('❌ SMTP verification failed:', error && (error.stack || error.message) ? (error.stack || error.message) : error);
      return false;
    }
  }

  /**
   * Try sending via SMTP. If it fails and BREVO_API_KEY exists, try Brevo HTTP API as fallback.
   * Throws on fatal failure.
   */
  async sendMail(mailOptions) {
    if (!this.transporter) {
      this.initialize();
    }

    if (!this.transporter) {
      const err = new Error('SMTP transporter not initialized');
      console.error(err);
      throw err;
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ sendMail success (SMTP):', {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        envelope: info.envelope,
      });
      return info;
    } catch (smtpErr) {
      // Log smtp error fully (stack)
      console.error('❌ sendMail failed via SMTP:', smtpErr && (smtpErr.stack || smtpErr.message) ? (smtpErr.stack || smtpErr.message) : smtpErr);

      // If Brevo HTTP API key available, attempt fallback
      const brevoKey = process.env.BREVO_API_KEY;
      if (brevoKey) {
        console.log('🔁 Attempting fallback via Brevo HTTP API because BREVO_API_KEY is set');
        try {
          // dynamic import so package is optional
          const Brevo = await import('@getbrevo/brevo').then(m => m.default || m);
          const apiClient = new Brevo.TransactionalEmailsApi();
          const defaultClient = Brevo.ApiClient.instance;
          defaultClient.authentications['api-key'].apiKey = brevoKey;

          const { sender = {}, to = [] } = mailOptions;
          // build payload
          const sendSmtpEmail = new Brevo.SendSmtpEmail({
            sender: { email: process.env.SENDER_EMAIL || sender?.from || sender?.email },
            to: Array.isArray(mailOptions.to) ? mailOptions.to.map(t => ({ email: t })) : [{ email: mailOptions.to }],
            subject: mailOptions.subject,
            htmlContent: mailOptions.html || undefined,
            textContent: mailOptions.text || undefined,
          });

          const res = await apiClient.sendTransacEmail(sendSmtpEmail);
          console.log('✅ Brevo API sendTransacEmail success:', res);
          return res;
        } catch (brevoErr) {
          console.error('❌ Brevo API fallback also failed:', brevoErr && (brevoErr.stack || brevoErr.message) ? (brevoErr.stack || brevoErr.message) : brevoErr);
          // prefer throwing original SMTP error or combine
          const e = new Error('Both SMTP and Brevo API sending failed');
          e.details = { smtpError: smtpErr?.message || String(smtpErr), brevoError: brevoErr?.message || String(brevoErr) };
          throw e;
        }
      }

      // If no fallback, rethrow SMTP error
      throw smtpErr;
    }
  }
}

const emailService = new EmailService();
export default emailService;
