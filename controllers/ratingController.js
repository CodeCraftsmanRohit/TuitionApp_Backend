import Rating from '../models/ratingModel.js';
import userModel from '../models/usermodel.js';
import postModel from '../models/postmodel.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import fcmService from '../config/firebase.js';
import mongoose from 'mongoose';

// Add this function for rating notifications
async function sendRatingNotifications(ratedUser, rater, rating, comment, postId) {
  try {
    const message = comment
      ? `${rater.name} rated you ${rating} stars: "${comment}"`
      : `${rater.name} rated you ${rating} stars`;

    console.log(`🔔 Sending rating notification to: ${ratedUser.name}`);

    // In-app notification to the rated user
    await inAppNotificationService.createNotification(
      ratedUser._id,
      'New Rating ⭐',
      message,
      'rating',
      postId
    );

    // Push notification if enabled
    if (ratedUser.fcmToken && ratedUser.pushNotifications) {
      try {
        await fcmService.sendRatingNotification(
          ratedUser.fcmToken,
          rater.name,
          rating,
          comment
        );
        console.log(`📱 Push notification sent for rating`);
      } catch (pushError) {
        console.warn('Push notification failed for rating:', pushError.message);
      }
    }

    // Notify admins about new ratings
    const adminUsers = await userModel.find({
      role: 'admin',
      pushNotifications: true,
      fcmToken: { $exists: true, $ne: '' }
    }).select('fcmToken');

    if (adminUsers.length > 0) {
      const adminTokens = adminUsers.map(admin => admin.fcmToken);
      const adminMessage = `${rater.name} rated ${ratedUser.name} ${rating} stars`;

      try {
        await fcmService.sendBulkPushNotifications(
          adminTokens,
          'New User Rating',
          adminMessage,
          {
            type: 'rating',
            ratedUserId: ratedUser._id.toString(),
            raterId: rater._id.toString(),
            adminAlert: 'true'
          }
        );
        console.log(`📱 Rating notifications sent to ${adminTokens.length} admins`);
      } catch (adminPushError) {
        console.warn('Rating notifications failed for admins:', adminPushError.message);
      }
    }

    console.log('✅ All rating notifications sent successfully');

  } catch (error) {
    console.error('❌ Rating notification error:', error);
  }
}

// Update the submitRating function to call the notification function
export const submitRating = async (req, res) => {
  try {
    const { ratedUserId, postId, rating, comment } = req.body;
    const raterId = req.userId;

    // ... existing validation code ...

    // Create new rating
    const newRating = new Rating({
      rater: raterId,
      ratedUser: ratedUserId,
      post: postId,
      rating,
      comment
    });

    await newRating.save();

    // Update user's average rating
    await updateUserAverageRating(ratedUserId);

    // Send notifications - use the new function
    await sendRatingNotifications(ratedUser, rater, rating, comment, postId);

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      rating: newRating
    });
  } catch (error) {
    console.error('Submit rating error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
// Helper functions
export const getUserRatings = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const ratings = await Rating.find({ ratedUser: userId })
      .populate('rater', 'name profilePhoto')
      .populate('post', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments({ ratedUser: userId });

    // Get average rating - FIXED: Use new mongoose.Types.ObjectId
    const averageResult = await Rating.aggregate([
      { $match: { ratedUser: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const averageRating = averageResult[0]?.average || 0;
    const totalRatings = averageResult[0]?.count || 0;

    // Get rating distribution - FIXED: Use new mongoose.Types.ObjectId
    const distribution = await Rating.aggregate([
      { $match: { ratedUser: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    res.json({
      success: true,
      ratings,
      summary: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        distribution
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user ratings error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Helper functions
async function updateUserAverageRating(userId) {
  // FIXED: Use new mongoose.Types.ObjectId
  const result = await Rating.aggregate([
    { $match: { ratedUser: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);

  const averageRating = result[0]?.average || 0;

  await userModel.findByIdAndUpdate(userId, {
    averageRating: Math.round(averageRating * 10) / 10,
    ratingCount: result[0]?.count || 0
  });
}
export const canUserRate = async (req, res) => {
  try {
    const { ratedUserId, postId } = req.query;
    const raterId = req.userId;

    // Users can't rate themselves
    if (raterId === ratedUserId) {
      return res.json({
        success: true,
        canRate: false,
        reason: 'Cannot rate yourself'
      });
    }

    // Check if already rated
    const existingRating = await Rating.findOne({
      rater: raterId,
      ratedUser: ratedUserId,
      post: postId || { $exists: false }
    });

    res.json({
      success: true,
      canRate: !existingRating,
      existingRating: existingRating || null
    });
  } catch (error) {
    console.error('Check can rate error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};



export const getRatingsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const ratings = await Rating.find({ rater: mongoose.Types.ObjectId(userId) }).populate('ratedUser', 'name');

    res.status(200).json(ratings);
  } catch (error) {
    console.error('Get ratings by user error:', error);
    res.status(500).json({ message: 'Failed to fetch ratings', error: error.message });
  }
};

export const addUserRating = async (req, res) => {
  try {
    const { ratedUser, rater, rating, comment } = req.body;

    const newRating = new Rating({
      ratedUser: mongoose.Types.ObjectId(ratedUser),
      rater: mongoose.Types.ObjectId(rater),
      rating,
      comment
    });

    await newRating.save();

    res.status(201).json({ message: 'Rating added successfully', rating: newRating });
  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({ message: 'Failed to add rating', error: error.message });
  }
};
