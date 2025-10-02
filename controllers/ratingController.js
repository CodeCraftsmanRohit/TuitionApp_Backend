import Rating from '../models/ratingModel.js';
import userModel from '../models/usermodel.js';
import postModel from '../models/postmodel.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import fcmService from '../config/firebase.js';
import mongoose from 'mongoose';

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

    // Convert userId to ObjectId safely
    const userObjectId = mongoose.Types.ObjectId(userId);

    // Aggregate average rating
    const averageResult = await Rating.aggregate([
      { $match: { ratedUser: userObjectId } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Aggregate rating distribution
    const distribution = await Rating.aggregate([
      { $match: { ratedUser: userObjectId } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    const averageRating = averageResult[0]?.average || 0;
    const ratingCount = averageResult[0]?.count || 0;

    res.status(200).json({
      averageRating,
      ratingCount,
      distribution
    });
  } catch (error) {
    console.error('Get user ratings error:', error);
    res.status(500).json({ message: 'Failed to fetch user ratings', error: error.message });
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
    { $match: { ratedUser: new mongoose.Types.ObjectId(userId) } },
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
