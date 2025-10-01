// routes/notificationRoutes.js
import express from 'express';
import userAuth from '../middleware/userAuth.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import telegramService from '../config/telegram.js';
import userModel from '../models/usermodel.js';
const notificationRouter = express.Router();

// Get user notifications
notificationRouter.get('/', userAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await inAppNotificationService.getUserNotifications(
      req.userId,
      parseInt(page),
      parseInt(limit)
    );

    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Mark notification as read
notificationRouter.put('/:id/read', userAuth, async (req, res) => {
  try {
    const result = await inAppNotificationService.markAsRead(
      req.params.id,
      req.userId
    );
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Mark all as read
notificationRouter.put('/read-all', userAuth, async (req, res) => {
  try {
    const result = await inAppNotificationService.markAllAsRead(req.userId);
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Get unread count
notificationRouter.get('/unread-count', userAuth, async (req, res) => {
  try {
    const result = await inAppNotificationService.getUnreadCount(req.userId);
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Connect Telegram account
notificationRouter.post('/connect-telegram', userAuth, async (req, res) => {
  try {
    const { chatId } = req.body;

    await userModel.findByIdAndUpdate(req.userId, {
      telegramChatId: chatId,
      telegramNotifications: true
    });

    // Send welcome message
    await telegramService.sendMessage(chatId,
      `Welcome to Tuition App notifications! 🎓\n\nYou will now receive new tuition opportunities via Telegram.\n\nYou can disable these notifications in the app settings.`
    );

    res.json({
      success: true,
      message: 'Telegram connected successfully'
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Update notification preferences
notificationRouter.put('/preferences', userAuth, async (req, res) => {
  try {
    const { emailNotifications, pushNotifications, telegramNotifications } = req.body;

    await userModel.findByIdAndUpdate(req.userId, {
      emailNotifications,
      pushNotifications,
      telegramNotifications
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

export default notificationRouter;