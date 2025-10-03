// migrations/fixModelsAndIndex.js
import mongoose from 'mongoose';
import 'dotenv/config';

async function fixModelsAndIndex() {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/app-users`);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Drop the existing unique index
    try {
      await db.collection('ratings').dropIndex('rater_1_ratedUser_1_post_1');
      console.log('✅ Dropped existing unique index');
    } catch (error) {
      console.log('ℹ️  Existing index not found or already dropped');
    }

    // Create new sparse unique index
    await db.collection('ratings').createIndex(
      { rater: 1, ratedUser: 1, post: 1 },
      {
        unique: true,
        sparse: true,
        name: 'rater_ratedUser_post_sparse'
      }
    );
    console.log('✅ Created new sparse unique index');

    // Update existing notifications with 'rating' type to a valid type temporarily
    try {
      const result = await db.collection('notifications').updateMany(
        { type: 'rating' },
        { $set: { type: 'system' } }
      );
      console.log(`✅ Updated ${result.modifiedCount} notifications with 'rating' type to 'system'`);
    } catch (error) {
      console.log('ℹ️ No notifications with rating type found');
    }

    console.log('🎉 Models and index migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixModelsAndIndex();