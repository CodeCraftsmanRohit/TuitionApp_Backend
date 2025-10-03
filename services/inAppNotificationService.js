// services/inAppNotificationService.js - FIXED VERSION
import Notification from '../models/notificationModel.js';

class InAppNotificationService {
  // ✅ FIXED: Single createBulkNotifications method (removed duplicate)
  // In the createBulkNotifications method, update the validUserIds logic:
async createBulkNotifications(userIds, title, message, type = 'tuition_post', relatedPost = null) {
  try {
    // Validate and clean user IDs
    const validUserIds = userIds
      .map(id => {
        // Handle various ID formats
        if (!id) return null;

        // If it's already a valid string ID
        if (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
          return id;
        }

        // If it's an object with _id
        if (id && id._id && typeof id._id === 'string') {
          return id._id;
        }

        // If it's a mongoose ObjectId
        if (id && id.toString) {
          return id.toString();
        }

        console.warn('Invalid user ID format:', id);
        return null;
      })
      .filter(id => id !== null && id.match(/^[0-9a-fA-F]{24}$/));

    if (validUserIds.length === 0) {
      console.log('⚠️ No valid user IDs for bulk notifications');
      return { success: true, count: 0 };
    }

    console.log(`📝 Creating ${validUserIds.length} bulk notifications for users:`, validUserIds);

    const notifications = validUserIds.map(userId => ({
      userId,
      title,
      message,
      type,
      relatedPost,
      createdAt: new Date()
    }));

    const result = await Notification.insertMany(notifications);
    console.log(`✅ Created ${result.length} in-app notifications`);
    return { success: true, count: result.length };
  } catch (error) {
    console.error('❌ Bulk in-app notification error:', error.message);
    return { success: false, error: error.message };
  }
}
  // ✅ Single createNotification method
  async createNotification(userId, title, message, type = 'tuition_post', relatedPost = null) {
    try {
      const notification = new Notification({
        userId,
        title,
        message,
        type,
        relatedPost
      });

      await notification.save();
      console.log(`✅ In-app notification created for user: ${userId}`);
      return { success: true, notification };
    } catch (error) {
      console.error('❌ Create notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;

     const notifications = await Notification.find({ userId })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate('relatedPost', 'title class subject salary') // ✅ Uses 'post' model
  .lean();

      const total = await Notification.countDocuments({ userId });
      const unreadCount = await Notification.countDocuments({
        userId,
        read: false
      });

      return {
        success: true,
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          unreadCount
        }
      };
    } catch (error) {
      console.error('❌ Get user notifications error:', error);
      return { success: false, error: error.message };
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { read: true },
        { new: true }
      );

      if (!notification) {
        console.warn(`⚠️ Notification not found: ${notificationId} for user: ${userId}`);
        return { success: false, error: 'Notification not found' };
      }

      console.log(`✅ Marked notification as read: ${notificationId}`);
      return { success: true, notification };
    } catch (error) {
      console.error('❌ Mark as read error:', error);
      return { success: false, error: error.message };
    }
  }

  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, read: false },
        { read: true }
      );

      console.log(`✅ Marked ${result.modifiedCount} notifications as read for user: ${userId}`);
      return {
        success: true,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      console.error('❌ Mark all as read error:', error);
      return { success: false, error: error.message };
    }
  }

  async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({
        userId,
        read: false
      });
      console.log(`📊 Unread notifications for user ${userId}: ${count}`);
      return { success: true, count };
    } catch (error) {
      console.error('❌ Get unread count error:', error);
      return { success: false, error: error.message };
    }
  }

  // ✅ Optional: Add method to delete notifications
  async deleteNotification(notificationId, userId) {
    try {
      const result = await Notification.findOneAndDelete({
        _id: notificationId,
        userId
      });

      if (!result) {
        return { success: false, error: 'Notification not found' };
      }

      console.log(`✅ Deleted notification: ${notificationId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Delete notification error:', error);
      return { success: false, error: error.message };
    }
  }

  // ✅ Optional: Add method to get notification by ID
  async getNotificationById(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        _id: notificationId,
        userId
      }).populate('relatedPost', 'title class subject salary');

      if (!notification) {
        return { success: false, error: 'Notification not found' };
      }

      return { success: true, notification };
    } catch (error) {
      console.error('❌ Get notification by ID error:', error);
      return { success: false, error: error.message };
    }
  }
}

const inAppNotificationService = new InAppNotificationService();
export default inAppNotificationService;