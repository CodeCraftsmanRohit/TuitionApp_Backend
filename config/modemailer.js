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
    console.log('SMTP_USER:', process.env.SMTP_USER ? '✅ Set' : '❌ Missing');
    console.log('SMTP_PASS:', process.env.SMTP_PASS ? `✅ Set (length: ${process.env.SMTP_PASS.length})` : '❌ Missing');

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('❌ SMTP credentials missing during initialization');
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    this.initialized = true;
    console.log('✅ SMTP transporter initialized');
    return this.transporter;
  }

  async verify() {
    if (!this.transporter) {
      this.initialize();
    }

    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('❌ SMTP verification failed:', error.message);
      return false;
    }
  }

  async sendMail(mailOptions) {
    if (!this.transporter) {
      this.initialize();
    }

    if (!this.transporter) {
      throw new Error('SMTP transporter not initialized');
    }

    return await this.transporter.sendMail(mailOptions);
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export the service (don't verify immediately)
export default emailService;