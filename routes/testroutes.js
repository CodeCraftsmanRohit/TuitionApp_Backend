import express from 'express';
import twilioService from '../config/twilio.js';

const testRouter = express.Router();

// Test WhatsApp notification
testRouter.post('/test-whatsapp', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    // Use provided number or default from env
    const toNumber = phoneNumber ? `whatsapp:${phoneNumber.replace(/\D/g, '')}` : process.env.TWILIO_WHATSAPP_TO;

    if (!toNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number required. Provide phoneNumber in body or set TWILIO_WHATSAPP_TO in .env'
      });
    }

    const testMessage = message || '🚀 Test message from Tuition App! This confirms your WhatsApp notifications are working correctly.';

    console.log(`📱 Sending WhatsApp test to: ${toNumber}`);
    console.log(`💬 Message: ${testMessage}`);

    const result = await twilioService.sendWhatsAppMessage(toNumber, testMessage);

    if (result.success) {
      res.json({
        success: true,
        message: 'WhatsApp test message sent successfully!',
        messageId: result.messageId,
        to: toNumber
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send WhatsApp message',
        error: result.error
      });
    }
  } catch (error) {
    console.error('WhatsApp test error:', error);
    res.status(500).json({
      success: false,
      message: 'WhatsApp test failed',
      error: error.message
    });
  }
});

// Test creating a post with notifications
testRouter.post('/test-post-notification', async (req, res) => {
  try {
    // Simulate a post creation
    const mockPost = {
      title: 'Test Tuition Post - Mathematics',
      class: '10th Grade',
      subject: 'Mathematics',
      board: 'CBSE',
      salary: 5000,
      time: '4 PM - 6 PM',
      address: 'Test Location, City',
      genderPreference: 'any',
      _id: 'test_post_123'
    };

    // Import the notification function
    const { sendPostNotifications } = await import('../controllers/postController.js');

    console.log('📨 Testing post notifications...');

    // This will trigger both email and WhatsApp notifications
    await sendPostNotifications(mockPost);

    res.json({
      success: true,
      message: 'Test post notification triggered! Check your email and WhatsApp.',
      post: mockPost
    });
  } catch (error) {
    console.error('Test post notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Test post notification failed',
      error: error.message
    });
  }
});

// Get Twilio configuration status
testRouter.get('/twilio-status', async (req, res) => {
  try {
    const status = {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing',
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing',
      TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || '❌ Missing',
      TWILIO_WHATSAPP_TO: process.env.TWILIO_WHATSAPP_TO || '❌ Missing',
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      message: 'Twilio configuration status',
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get Twilio status',
      error: error.message
    });
  }
});

export default testRouter;