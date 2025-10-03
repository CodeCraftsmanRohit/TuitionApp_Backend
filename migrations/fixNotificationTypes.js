// migrations/fixNotificationTypes.js
import mongoose from 'mongoose';
import 'dotenv/config';

async function fixNotificationTypes() {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/app-users`);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Update existing notifications with invalid types to 'system'
    try {
      const result = await db.collection('notifications').updateMany(
        {
          type: {
            $nin: ['tuition_post', 'application', 'message', 'system', 'like', 'comment', 'rating', 'favorite']
          }
        },
        { $set: { type: 'system' } }
      );
      console.log(`✅ Updated ${result.modifiedCount} notifications with invalid types to 'system'`);
    } catch (error) {
      console.log('ℹ️ No notifications with invalid types found');
    }

    console.log('🎉 Notification types migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixNotificationTypes();