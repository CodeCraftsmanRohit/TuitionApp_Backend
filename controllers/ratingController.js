import Rating from '../models/ratingModel.js';
import userModel from '../models/usermodel.js';
import postModel from '../models/postmodel.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import fcmService from '../config/firebase.js';

export const submitRating = async (req, res) => {
  try {
    const { ratedUserId, postId, rating, comment } = req.body;
    const raterId = req.userId;

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Check if users exist
    const [rater, ratedUser] = await Promise.all([
      userModel.findById(raterId),
      userModel.findById(ratedUserId)
    ]);

    if (!rater || !ratedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if post exists (if provided)
    if (postId) {
      const post = await postModel.findById(postId);
      if (!post) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }
    }

    // Check if already rated
    const existingRating = await Rating.findOne({
      rater: raterId,
      ratedUser: ratedUserId,
      post: postId || { $exists: false }
    });

    if (existingRating) {
      return res.status(400).json({ success: false, message: 'You have already rated this user' });
    }

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

    // Send notifications
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

    // Get average rating
    const averageResult = await Rating.aggregate([
      { $match: { ratedUser: mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const averageRating = averageResult[0]?.average || 0;
    const totalRatings = averageResult[0]?.count || 0;

    // Get rating distribution
    const distribution = await Rating.aggregate([
      { $match: { ratedUser: mongoose.Types.ObjectId(userId) } },
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

// Helper functions
async function updateUserAverageRating(userId) {
  const result = await Rating.aggregate([
    { $match: { ratedUser: mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);

  const averageRating = result[0]?.average || 0;

  await userModel.findByIdAndUpdate(userId, {
    averageRating: Math.round(averageRating * 10) / 10,
    ratingCount: result[0]?.count || 0
  });
}

async function sendRatingNotifications(ratedUser, rater, rating, comment, postId) {
  try {
    const message = comment
      ? `${rater.name} rated you ${rating} stars: "${comment}"`
      : `${rater.name} rated you ${rating} stars`;

    // In-app notification
    await inAppNotificationService.createNotification(
      ratedUser._id,
      'New Rating ⭐',
      message,
      'rating'
    );

    // Push notification if enabled
    if (ratedUser.fcmToken && ratedUser.pushNotifications) {
      await fcmService.sendRatingNotification(
        ratedUser.fcmToken,
        rater.name,
        rating,
        comment
      );
    }
  } catch (error) {
    console.error('Rating notification error:', error);
  }
}