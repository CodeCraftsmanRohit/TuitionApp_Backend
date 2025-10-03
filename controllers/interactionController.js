// controllers/interactionController.js
import postModel from '../models/postmodel.js';
import userModel from '../models/usermodel.js';
import inAppNotificationService from '../services/inAppNotificationService.js';
import masterNotificationController from './masterNotificationController.js';
import { extractUserIds, isValidUserId } from '../utils/userIdHelper.js';

export const likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await postModel.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check if already liked
    const alreadyLiked = post.likes.some(like => like.user.toString() === userId);

    if (alreadyLiked) {
      // Unlike the post
      post.likes = post.likes.filter(like => like.user.toString() !== userId);
      await post.save();

      return res.json({
        success: true,
        message: 'Post unliked',
        likesCount: post.likes.length,
        isLiked: false
      });
    } else {
      // Like the post
      post.likes.push({ user: userId });
      await post.save();

      // Send notification to post owner if it's not the same user
      if (post.createdBy.toString() !== userId) {
        const liker = await userModel.findById(userId).select('name');

        // ✅ FIXED: Use proper notification service
        await inAppNotificationService.createNotification(
          post.createdBy,
          'New Like ❤️',
          `${liker.name} liked your post: "${post.title}"`,
          'like',
          post._id
        );
      }

      return res.json({
        success: true,
        message: 'Post liked',
        likesCount: post.likes.length,
        isLiked: true
      });
    }
  } catch (error) {
    console.error('Like post error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    if (text.length > 500) {
      return res.status(400).json({ success: false, message: 'Comment too long (max 500 characters)' });
    }

    const post = await postModel.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Add comment
    const newComment = {
      user: userId,
      text: text.trim()
    };

    post.comments.push(newComment);
    await post.save();

    // Populate comment with user data for response
    await post.populate('comments.user', 'name email profilePhoto');

    const addedComment = post.comments[post.comments.length - 1];

    // Send notifications
    await sendCommentNotifications(post, addedComment, userId);

    return res.json({
      success: true,
      message: 'Comment added successfully',
      comment: addedComment,
      commentsCount: post.comments.length
    });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPostInteractions = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await postModel.findById(postId)
      .populate('likes.user', 'name profilePhoto')
      .populate('comments.user', 'name profilePhoto')
      .select('likes comments');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Check if current user liked the post
    const isLiked = post.likes.some(like => like.user._id.toString() === userId);

    return res.json({
      success: true,
      likes: post.likes,
      comments: post.comments,
      likesCount: post.likes.length,
      commentsCount: post.comments.length,
      isLiked
    });
  } catch (error) {
    console.error('Get interactions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.userId;

    const post = await postModel.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Check if user owns the comment or is admin
    const user = await userModel.findById(userId);
    if (comment.user.toString() !== userId && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    post.comments.pull(commentId);
    await post.save();

    return res.json({
      success: true,
      message: 'Comment deleted successfully',
      commentsCount: post.comments.length
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Notification function for comments
// controllers/interactionController.js - Fix sendCommentNotifications function
// controllers/interactionController.js - Fix sendCommentNotifications
async function sendCommentNotifications(post, comment, commenterId) {
  try {
    const commenter = await userModel.findById(commenterId).select('name');
    const postOwner = await userModel.findById(post.createdBy).select('name');

    // Notify post owner
    if (isValidUserId(post.createdBy) && post.createdBy.toString() !== commenterId.toString()) {
      await inAppNotificationService.createNotification(
        post.createdBy,
        'New Comment 💬',
        `${commenter.name} commented on your post: "${post.title}"`,
        'comment',
        post._id
      );
    }

    // Notify admins
    const adminUsers = await userModel.find({ role: 'admin' }).select('_id');
    const adminIds = adminUsers.map(admin => admin._id.toString());
    const adminIdsToNotify = adminIds.filter(adminId =>
      adminId !== commenterId.toString() && adminId !== post.createdBy.toString()
    );

    if (adminIdsToNotify.length > 0) {
      await inAppNotificationService.createBulkNotifications(
        adminIdsToNotify,
        'New Comment on Post',
        `${commenter.name} commented on "${post.title}" by ${postOwner.name}`,
        'comment',
        post._id
      );
    }

    // Notify other commenters
    const uniqueCommenterIds = [...new Set(
      post.comments
        .map(c => c.user.toString())
        .filter(id => id !== commenterId.toString() && id !== post.createdBy.toString())
    )];

    if (uniqueCommenterIds.length > 0) {
      await inAppNotificationService.createBulkNotifications(
        uniqueCommenterIds,
        'New Comment',
        `${commenter.name} also commented on "${post.title}"`,
        'comment',
        post._id
      );
    }
  } catch (error) {
    console.error('Comment notification error:', error);
  }
}