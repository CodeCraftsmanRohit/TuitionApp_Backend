// controllers/masterNotificationController.js
import userModel from '../models/usermodel.js';
import telegramService from '../config/telegram.js';
import fcmService from '../config/firebase.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import emailService from '../config/modemailer.js';

class MasterNotificationController {
 // controllers/masterNotificationController.js - Fix inApp notification call
// controllers/masterNotificationController.js - FIX sendNewPostNotifications
// In the sendNewPostNotifications method, update the user ID extraction:
async sendNewPostNotifications(post) {
  console.log('🔔 Starting ALL free notifications for new post...');

  try {
    // Get all teachers with their preferences
    const teachers = await userModel.find({ role: 'teacher' }).lean();
    console.log(`📋 Found ${teachers.length} teachers for notifications`);

    const results = {
      email: { sent: 0, failed: 0 },
      telegram: { sent: 0, failed: 0 },
      push: { sent: 0, failed: 0 },
      inApp: { created: 0 }
    };

    const notificationTitle = '🎓 New Tuition Opportunity';
    const notificationMessage = `${post.title} - ${post.class} ${post.subject} (₹${post.salary})`;

    // ✅ FIXED: Extract user IDs properly
    const allTeacherIds = teachers.map(t => {
      // Handle both string and ObjectId formats
      if (typeof t._id === 'string') return t._id;
      if (t._id && t._id.toString) return t._id.toString();
      return null;
    }).filter(id => id !== null);

    console.log(`👥 Teacher IDs for in-app notifications: ${allTeacherIds.length}`);

    // Prepare user groups
    const emailUsers = teachers.filter(t => t.emailNotifications && t.email);
    const telegramUsers = teachers.filter(t => t.telegramNotifications && t.telegramChatId);
    const pushUsers = teachers.filter(t => t.pushNotifications && t.fcmToken);

    // Send all notifications in parallel
    const notificationPromises = await Promise.allSettled([
      this.sendEmailNotifications(emailUsers, post),
      this.sendTelegramNotifications(telegramUsers, post),
      this.sendPushNotifications(pushUsers, notificationTitle, notificationMessage, post),
      inAppNotificationService.createBulkNotifications(allTeacherIds, notificationTitle, notificationMessage, 'tuition_post', post._id)
    ]);

    // Process results
    if (notificationPromises[0].status === 'fulfilled') {
      results.email = notificationPromises[0].value;
    }
    if (notificationPromises[1].status === 'fulfilled') {
      results.telegram = notificationPromises[1].value;
    }
    if (notificationPromises[2].status === 'fulfilled') {
      results.push = notificationPromises[2].value;
    }
    if (notificationPromises[3].status === 'fulfilled') {
      results.inApp.created = notificationPromises[3].value.count || 0;
    } else if (notificationPromises[3].status === 'rejected') {
      console.error('❌ In-app notification failed:', notificationPromises[3].reason);
    }

    console.log('✅ ALL FREE NOTIFICATIONS COMPLETED:', results);
    return { success: true, results };

  } catch (error) {
    console.error('❌ Master notification error:', error);
    return { success: false, error: error.message };
  }
}
async sendEmailNotifications(teachers, post) {
    if (teachers.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;

    for (const teacher of teachers) {
      try {
        const mailOptions = {
          from: process.env.SENDER_EMAIL,
          to: teacher.email,
          subject: '🎓 New Tuition Opportunity Available!',
          html: this.formatEmailMessage(post)
        };

        await emailService.sendMail(mailOptions);
        sent++;
      } catch (error) {
        console.error(`❌ Email failed for ${teacher.email}:`, error.message);
        failed++;
      }
    }

    return { sent, failed };
  }

  async sendTelegramNotifications(teachers, post) {
    if (teachers.length === 0) return { sent: 0, failed: 0 };

    const chatIds = teachers.map(t => t.telegramChatId);
    const message = this.formatTelegramMessage(post);

    const results = await telegramService.sendBulkMessages(chatIds, message);
    const successful = results.filter(r => r.success);

    return { sent: successful.length, failed: results.length - successful.length };
  }

  async sendPushNotifications(teachers, title, body, post) {
    if (teachers.length === 0) return { sent: 0, failed: 0 };

    const tokens = teachers.map(t => t.fcmToken).filter(token => token);
    const data = {
      postId: post._id.toString(),
      type: 'tuition_post',
      screen: 'PostDetails'
    };

    const result = await fcmService.sendBulkPushNotifications(tokens, title, body, data);

    return result.success ? { sent: result.sent, failed: result.failed } : { sent: 0, failed: teachers.length };
  }

  formatTelegramMessage(post) {
    return `🎓 *New Tuition Opportunity!*

*${post.title}*

📚 Class: ${post.class}
📖 Subject: ${post.subject}
🏫 Board: ${post.board}
💰 Salary: ₹${post.salary}
⏰ Time: ${post.time}
📍 Address: ${post.address}
⚧ Gender: ${post.genderPreference}

_Check the Tuition App for more details and to apply._`;
  }

  formatEmailMessage(post) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976D2;">🎓 New Tuition Opportunity!</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
          <h3>${post.title}</h3>
          <p><strong>Class:</strong> ${post.class}</p>
          <p><strong>Subject:</strong> ${post.subject}</p>
          <p><strong>Board:</strong> ${post.board}</p>
          <p><strong>Salary:</strong> ₹${post.salary}</p>
          <p><strong>Time:</strong> ${post.time}</p>
          <p><strong>Address:</strong> ${post.address}</p>
          <p><strong>Gender Preference:</strong> ${post.genderPreference}</p>
        </div>
        <p>Check the Tuition App for more details and to apply.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          This is an automated notification from Tuition App.
        </p>
      </div>
    `;
  }
}

const masterNotificationController = new MasterNotificationController();
export default masterNotificationController;