// config/firebase.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';

let admin = null;
let firebaseInitialized = false;

try {
  // Check if Firebase environment variables exist
  const hasFirebaseConfig =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL;

  if (hasFirebaseConfig) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
    };

    // Check if Firebase app is already initialized
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    admin = { messaging: () => require('firebase-admin/messaging') };
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.log('⚠️ Firebase config missing - Push notifications disabled');
  }
} catch (error) {
  console.log('❌ Firebase initialization failed:', error.message);
  console.log('💡 Push notifications will be disabled');
}

class FCMService {
  constructor() {
    this.initialized = firebaseInitialized;
  }

  async sendPushNotification(fcmToken, title, body, data = {}) {
    if (!this.initialized) {
      console.log('⚠️ Firebase not initialized - Push notification skipped');
      return { success: false, error: 'Firebase not configured' };
    }

    try {
      if (!fcmToken) {
        return { success: false, error: 'No FCM token provided' };
      }

      const message = {
        token: fcmToken,
        notification: {
          title: title,
          body: body,
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log(`✅ Push notification sent successfully`);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ FCM error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendBulkPushNotifications(tokens, title, body, data = {}) {
    if (!this.initialized) {
      console.log('⚠️ Firebase not initialized - Bulk push notifications skipped');
      return {
        success: false,
        error: 'Firebase not configured',
        sent: 0,
        failed: tokens ? tokens.length : 0
      };
    }

    try {
      if (!tokens || tokens.length === 0) {
        return { success: false, error: 'No tokens provided' };
      }

      // Remove duplicates and invalid tokens
      const validTokens = [...new Set(tokens.filter(token =>
        token && typeof token === 'string' && token.length > 0
      ))];

      if (validTokens.length === 0) {
        return { success: false, error: 'No valid tokens' };
      }

      console.log(`📱 Sending bulk push to ${validTokens.length} devices`);

      const message = {
        notification: {
          title: title,
          body: body,
        },
        data: data,
        tokens: validTokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`✅ Bulk push results: ${response.successCount} successful, ${response.failureCount} failed`);

      return {
        success: true,
        sent: response.successCount,
        failed: response.failureCount
      };
    } catch (error) {
      console.error('❌ Bulk FCM error:', error.message);
      return { success: false, error: error.message };
    }
  }

  isAvailable() {
    return this.initialized;
  }
}

const fcmService = new FCMService();
export default fcmService;