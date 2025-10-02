// controllers/favoriteController.js
import Favorite from '../models/favoriteModel.js';
import postModel from '../models/postmodel.js';
import userModel from '../models/userModel.js'; // <-- ADDED import
import inAppNotificationService from '../services/inAppNotificationService.js';

export const toggleFavorite = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Check if post exists
    const post = await postModel.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check if already favorited
    const existingFavorite = await Favorite.findOne({ user: userId, post: postId });

    if (existingFavorite) {
      // Remove from favorites
      await Favorite.findByIdAndDelete(existingFavorite._id);

      return res.json({
        success: true,
        message: 'Post removed from favorites',
        isFavorited: false
      });
    } else {
      // Add to favorites
      const favorite = new Favorite({
        user: userId,
        post: postId
      });
      await favorite.save();

      // Send notification to post owner (if not the same user)
      try {
        if (post.createdBy && post.createdBy.toString() !== userId) {
          const user = await userModel.findById(userId).select('name');
          const userName = user?.name || 'Someone';

          // guard the notification service to avoid unhandled errors
          if (inAppNotificationService && typeof inAppNotificationService.createNotification === 'function') {
            await inAppNotificationService.createNotification(
              post.createdBy,
              'New Favorite ⭐',
              `${userName} added your post to favorites`,
              'favorite',
              post._id
            );
          }
        }
      } catch (notifErr) {
        console.warn('Notification send failed (non-blocking):', notifErr);
      }

      return res.json({
        success: true,
        message: 'Post added to favorites',
        isFavorited: true
      });
    }
  } catch (error) {
    console.error('Toggle favorite error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserFavorites = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const favorites = await Favorite.find({ user: userId })
      .populate({
        path: 'post',
        populate: {
          path: 'createdBy',
          select: 'name profilePhoto averageRating ratingCount'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter out any favorites where post might be deleted
    const validFavorites = favorites.filter(fav => fav.post !== null);

    const total = await Favorite.countDocuments({ user: userId });

    res.json({
      success: true,
      favorites: validFavorites,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const checkFavoriteStatus = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const isFavorited = await Favorite.exists({ user: userId, post: postId });

    res.json({
      success: true,
      isFavorited: !!isFavorited
    });
  } catch (error) {
    console.error('Check favorite status error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
