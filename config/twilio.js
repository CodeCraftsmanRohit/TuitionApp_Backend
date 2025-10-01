import twilio from 'twilio';

class TwilioService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this.client;

    console.log('🔧 Initializing Twilio client...');
    console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing');
    console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing');
    console.log('TWILIO_WHATSAPP_FROM:', process.env.TWILIO_WHATSAPP_FROM || '❌ Missing');

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.error('❌ Twilio credentials missing');
      return null;
    }

    try {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      this.initialized = true;
      console.log('✅ Twilio client initialized successfully');
      return this.client;
    } catch (error) {
      console.error('❌ Twilio initialization failed:', error.message);
      return null;
    }
  }

  async sendWhatsAppMessage(to, message) {
    if (!this.client) {
      this.initialize();
    }

    if (!this.client) {
      throw new Error('Twilio client not initialized - check your credentials');
    }

    try {
      console.log(`📤 Sending WhatsApp to: ${to}`);
      console.log(`💬 Message length: ${message.length} characters`);

      const result = await this.client.messages.create({
        body: message,
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: to
      });

      console.log('✅ WhatsApp message sent successfully!');
      console.log('📱 Message SID:', result.sid);
      console.log('🕒 Status:', result.status);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: to
      };
    } catch (error) {
      console.error('❌ WhatsApp send error:', error);

      // More detailed error information
      let errorMessage = error.message;
      if (error.code === 21211) {
        errorMessage = 'Invalid phone number format';
      } else if (error.code === 21408) {
        errorMessage = 'WhatsApp not enabled for this number';
      } else if (error.code === 21608) {
        errorMessage = 'Not authorized to send to this number. Use Twilio sandbox.';
      } else if (error.code === 21610) {
        errorMessage = 'Recipient not in WhatsApp sandbox. Send "join [sandbox-code]" to Twilio number.';
      }

      return {
        success: false,
        error: errorMessage,
        code: error.code
      };
    }
  }

  async sendBulkWhatsAppMessages(phoneNumbers, message) {
    if (!this.client) {
      this.initialize();
    }

    const results = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        const formattedNumber = phoneNumber.startsWith('whatsapp:')
          ? phoneNumber
          : `whatsapp:${phoneNumber.replace(/\D/g, '')}`;

        const result = await this.sendWhatsAppMessage(formattedNumber, message);
        results.push({
          phoneNumber: formattedNumber,
          success: result.success,
          messageId: result.messageId,
          error: result.error
        });
      } catch (error) {
        results.push({
          phoneNumber,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}

// Create singleton instance
const twilioService = new TwilioService();
export default twilioService;