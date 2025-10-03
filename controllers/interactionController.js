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

    // Check if user owns the comment OR is admin
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
// Update the sendCommentNotifications function
async function sendCommentNotifications(post, comment, commenterId) {
  try {
    const commenter = await userModel.findById(commenterId).select('name');
    const postOwner = await userModel.findById(post.createdBy).select('name email pushNotifications fcmToken');

    console.log(`🔔 Starting comment notifications for post: ${post.title}`);

    // Notify post owner (if commenter is not the owner)
    if (post.createdBy.toString() !== commenterId.toString()) {
      console.log(`📨 Notifying post owner: ${postOwner.name}`);

      await inAppNotificationService.createNotification(
        post.createdBy,
        'New Comment 💬',
        `${commenter.name} commented on your post: "${post.title}"`,
        'comment',
        post._id
      );

      // Send push notification if enabled
      if (postOwner.fcmToken && postOwner.pushNotifications) {
        try {
          await fcmService.sendPushNotification(
            postOwner.fcmToken,
            'New Comment on Your Post',
            `${commenter.name} commented: "${comment.text.substring(0, 100)}..."`,
            {
              type: 'comment',
              postId: post._id.toString(),
              screen: 'Comments'
            }
          );
          console.log(`📱 Push notification sent to post owner`);
        } catch (pushError) {
          console.warn('Push notification failed for post owner:', pushError.message);
        }
      }
    }

    // Notify admins (excluding commenter and post owner)
    const adminUsers = await userModel.find({ role: 'admin' }).select('_id name email pushNotifications fcmToken');
    const adminIdsToNotify = adminUsers
      .filter(admin =>
        admin._id.toString() !== commenterId.toString() &&
        admin._id.toString() !== post.createdBy.toString()
      )
      .map(admin => admin._id.toString());

    if (adminIdsToNotify.length > 0) {
      console.log(`📨 Notifying ${adminIdsToNotify.length} admins`);

      await inAppNotificationService.createBulkNotifications(
        adminIdsToNotify,
        'New Comment on Post',
        `${commenter.name} commented on "${post.title}" by ${postOwner.name}`,
        'comment',
        post._id
      );

      // Send push notifications to admins
      const adminPushTokens = adminUsers
        .filter(admin => adminIdsToNotify.includes(admin._id.toString()))
        .filter(admin => admin.fcmToken && admin.pushNotifications)
        .map(admin => admin.fcmToken);

      if (adminPushTokens.length > 0) {
        try {
          await fcmService.sendBulkPushNotifications(
            adminPushTokens,
            'New Comment - Admin Alert',
            `${commenter.name} commented on "${post.title}"`,
            {
              type: 'comment',
              postId: post._id.toString(),
              screen: 'Comments',
              adminAlert: 'true'
            }
          );
          console.log(`📱 Push notifications sent to ${adminPushTokens.length} admins`);
        } catch (pushError) {
          console.warn('Push notifications failed for admins:', pushError.message);
        }
      }
    }

    // Notify other commenters (excluding commenter, post owner, and admins)
    const uniqueCommenterIds = [...new Set(
      post.comments
        .map(c => c.user.toString())
        .filter(id =>
          id !== commenterId.toString() &&
          id !== post.createdBy.toString() &&
          !adminIdsToNotify.includes(id)
        )
    )];

    if (uniqueCommenterIds.length > 0) {
      console.log(`📨 Notifying ${uniqueCommenterIds.length} other commenters`);

      await inAppNotificationService.createBulkNotifications(
        uniqueCommenterIds,
        'New Comment on Post',
        `${commenter.name} also commented on "${post.title}"`,
        'comment',
        post._id
      );

      // Get commenters with push notifications enabled
      const commenterUsers = await userModel.find({
        _id: { $in: uniqueCommenterIds },
        pushNotifications: true,
        fcmToken: { $exists: true, $ne: '' }
      }).select('fcmToken');

      const commenterPushTokens = commenterUsers.map(user => user.fcmToken);

      if (commenterPushTokens.length > 0) {
        try {
          await fcmService.sendBulkPushNotifications(
            commenterPushTokens,
            'New Comment',
            `${commenter.name} also commented on "${post.title}"`,
            {
              type: 'comment',
              postId: post._id.toString(),
              screen: 'Comments'
            }
          );
          console.log(`📱 Push notifications sent to ${commenterPushTokens.length} commenters`);
        } catch (pushError) {
          console.warn('Push notifications failed for commenters:', pushError.message);
        }
      }
    }

    console.log('✅ All comment notifications sent successfully');

  } catch (error) {
    console.error('❌ Comment notification error:', error);
  }
}
// Add this new function for editing comments
export const updateComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.userId;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const post = await postModel.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.user.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this comment' });
    }

    comment.text = text.trim();
    comment.updatedAt = new Date();

    await post.save();

    // Populate the updated comment for response
    await post.populate('comments.user', 'name profilePhoto');

    const updatedComment = post.comments.id(commentId);

    return res.json({
      success: true,
      message: 'Comment updated successfully',
      comment: updatedComment
    });
  } catch (error) {
    console.error('Update comment error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};