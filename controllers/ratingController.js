import Rating from '../models/ratingModel.js';
import userModel from '../models/usermodel.js';
import postModel from '../models/postmodel.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import fcmService from '../config/firebase.js';
import mongoose from 'mongoose';

/**
 * Send rating notifications (in-app + push + admin alert)
 * ratedUser and rater must be full user documents (not just ids)
 */
async function sendRatingNotifications(ratedUser, rater, rating, comment, postId) {
  try {
    const message = comment
      ? `${rater.name} rated you ${rating} stars: "${comment}"`
      : `${rater.name} rated you ${rating} stars`;

    console.log(`🔔 Sending rating notification to: ${ratedUser.name}`);

    // In-app notification
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

    // Notify admins
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

/**
 * Helper: recalc average + count for a user
 */
async function updateUserAverageRating(userId) {
  try {
    const result = await Rating.aggregate([
      { $match: { ratedUser: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const averageRating = result[0]?.average || 0;
    const count = result[0]?.count || 0;

    await userModel.findByIdAndUpdate(userId, {
      averageRating: Math.round(averageRating * 10) / 10,
      ratingCount: count
    });
  } catch (error) {
    // don't throw — caller can decide how to handle
    console.warn('updateUserAverageRating failed:', error);
  }
}

/**
 * Check if rating already exists
 */
async function checkExistingRating(raterId, ratedUserId, postId) {
  try {
    const query = {
      rater: raterId,
      ratedUser: ratedUserId
    };

    // If postId is provided, check for exact match
    // If postId is not provided, check for ratings with null post
    if (postId) {
      query.post = postId;
    } else {
      query.post = null;
    }

    return await Rating.findOne(query);
  } catch (error) {
    console.error('Check existing rating error:', error);
    return null;
  }
}

/**
 * submitRating - robust server-side handler
 * Accepts either `ratedUser` OR `ratedUserId` in body.
 * Requires authenticated user (req.userId via userAuth middleware)
 */
export const submitRating = async (req, res) => {
  try {
    console.log('submitRating body:', req.body);

    const {
      ratedUser: ratedUserFromBody,
      ratedUserId,
      postId,
      rating,
      comment
    } = req.body;

    const ratedUserIdFinal = ratedUserFromBody || ratedUserId;
    const raterId = req.userId || req.body.rater || null;

    // Basic validation
    if (!ratedUserIdFinal) {
      return res.status(400).json({ success: false, message: 'ratedUser (or ratedUserId) is required' });
    }
    if (rating === undefined || rating === null) {
      return res.status(400).json({ success: false, message: 'rating is required' });
    }
    if (!raterId) {
      return res.status(401).json({ success: false, message: 'Unauthenticated: rater id missing' });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Validate ids
    if (!mongoose.isValidObjectId(ratedUserIdFinal) || !mongoose.isValidObjectId(raterId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id(s) provided' });
    }

    // Construct ObjectId instances using `new`
    const ratedUserObjId = new mongoose.Types.ObjectId(ratedUserIdFinal);
    const raterObjId = new mongoose.Types.ObjectId(raterId);

    // Prevent self-rating
    if (raterObjId.toString() === ratedUserObjId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot rate yourself' });
    }

    // Optional: validate postId if provided
    let postObjId = null;
    if (postId) {
      if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ success: false, message: 'Invalid postId' });
      }
      postObjId = new mongoose.Types.ObjectId(postId);
      const exists = await postModel.findById(postObjId);
      if (!exists) return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check for existing rating FIRST
    const existingRating = await checkExistingRating(raterObjId, ratedUserObjId, postObjId);
    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this user'
      });
    }

    // Load rated user and rater docs
    const [ratedUserDoc, raterDoc] = await Promise.all([
      userModel.findById(ratedUserObjId).select('+fcmToken +pushNotifications'),
      userModel.findById(raterObjId).select('name')
    ]);

    if (!ratedUserDoc) {
      return res.status(404).json({ success: false, message: 'Rated user not found' });
    }
    if (!raterDoc) {
      return res.status(404).json({ success: false, message: 'Rater (current user) not found' });
    }

    // Create rating
    const newRating = new Rating({
      rater: raterObjId,
      ratedUser: ratedUserObjId,
      post: postObjId,
      rating,
      comment: comment ? comment.trim() : ''
    });

    const savedRating = await newRating.save();

    // Recalculate average & counts (non-fatal)
    try {
      await updateUserAverageRating(ratedUserObjId);
    } catch (err) {
      console.warn('Failed updating average rating (non-fatal):', err);
    }

    // Send notifications (non-fatal)
    try {
      await sendRatingNotifications(ratedUserDoc, raterDoc, rating, comment, postId);
    } catch (notifErr) {
      console.warn('sendRatingNotifications failed (non-fatal):', notifErr);
    }

    return res.status(201).json({
      success: true,
      message: 'Rating submitted successfully',
      rating: savedRating
    });
  } catch (error) {
    console.error('Submit rating error (controller):', error);

    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this user'
      });
    }

    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * Get ratings for a user (received ratings)
 */
export const getUserRatings = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const ratings = await Rating.find({ ratedUser: userId })
      .populate('rater', 'name profilePhoto') // ✅ Uses 'user' model automatically via ref
      .populate('post', 'title') // ✅ Uses 'post' model automatically via ref
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments({ ratedUser: userId });

    const averageResult = await Rating.aggregate([
      { $match: { ratedUser: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const averageRating = averageResult[0]?.average || 0;
    const totalRatings = averageResult[0]?.count || 0;

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

/**
 * Check if current user can rate a given user/post
 */
export const canUserRate = async (req, res) => {
  try {
    const { ratedUserId, postId } = req.query;
    const raterId = req.userId;

    if (!ratedUserId) {
      return res.status(400).json({ success: false, message: 'ratedUserId required' });
    }

    // Users can't rate themselves
    if (raterId === ratedUserId) {
      return res.json({
        success: true,
        canRate: false,
        reason: 'Cannot rate yourself'
      });
    }

    let postObjId = null;
    if (postId) {
      if (!mongoose.isValidObjectId(postId)) {
        return res.status(400).json({ success: false, message: 'Invalid postId' });
      }
      postObjId = new mongoose.Types.ObjectId(postId);
    }

    const existingRating = await checkExistingRating(
      new mongoose.Types.ObjectId(raterId),
      new mongoose.Types.ObjectId(ratedUserId),
      postObjId
    );

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

/**
 * Get ratings given BY a user
 */
export const getRatingsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const ratings = await Rating.find({ rater: mongoose.Types.ObjectId(userId) })
      .populate('ratedUser', 'name profilePhoto') // ✅ Uses 'user' model
      .populate('post', 'title') // ✅ Uses 'post' model
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      ratings
    });
  } catch (error) {
    console.error('Get ratings by user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ratings', error: error.message });
  }
};
/**
 * addUserRating - alternate endpoint (keeps original behavior)
 */
export const addUserRating = async (req, res) => {
  try {
    const { ratedUser, rater, rating, comment } = req.body;

    if (!ratedUser || !rater || rating === undefined || rating === null) {
      return res.status(400).json({ message: 'ratedUser, rater and rating are required' });
    }

    if (!mongoose.isValidObjectId(ratedUser) || !mongoose.isValidObjectId(rater)) {
      return res.status(400).json({ message: 'Invalid user id(s) provided' });
    }

    // Check for existing rating
    const existingRating = await checkExistingRating(
      new mongoose.Types.ObjectId(rater),
      new mongoose.Types.ObjectId(ratedUser),
      null
    );

    if (existingRating) {
      return res.status(400).json({ message: 'You have already rated this user' });
    }

    const newRating = new Rating({
      ratedUser: new mongoose.Types.ObjectId(ratedUser),
      rater: new mongoose.Types.ObjectId(rater),
      rating,
      comment: comment ? comment.trim() : ''
    });

    await newRating.save();

    // Update user's average rating
    try {
      await updateUserAverageRating(ratedUser);
    } catch (err) {
      console.warn('Failed updating average rating:', err);
    }

    res.status(201).json({ message: 'Rating added successfully', rating: newRating });
  } catch (error) {
    console.error('Add rating error:', error);

    if (error.code === 11000) {
      return res.status(400).json({ message: 'You have already rated this user' });
    }

    res.status(500).json({ message: 'Failed to add rating', error: error.message });
  }
};