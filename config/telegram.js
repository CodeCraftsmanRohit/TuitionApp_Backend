// config/telegram.js
import axios from 'axios';

class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.botUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(chatId, message) {
    try {
      const response = await axios.post(`${this.botUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      });

      console.log(`✅ Telegram message sent to ${chatId}`);
      return { success: true, messageId: response.data.result.message_id };
    } catch (error) {
      console.error('❌ Telegram send error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  async sendBulkMessages(chatIds, message) {
    const results = [];

    for (const chatId of chatIds) {
      try {
        const result = await this.sendMessage(chatId, message);
        results.push({
          chatId,
          success: result.success,
          messageId: result.messageId
        });

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({ chatId, success: false, error: error.message });
      }
    }

    return results;
  }

  // Setup webhook for receiving messages
  async setWebhook(url) {
    try {
      const response = await axios.post(`${this.botUrl}/setWebhook`, {
        url: url
      });
      console.log('✅ Telegram webhook set:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Telegram webhook error:', error);
      return null;
    }
  }
}

const telegramService = new TelegramService();
export default telegramService;