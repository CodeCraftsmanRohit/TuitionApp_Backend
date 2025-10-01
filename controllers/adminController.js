// controllers/adminController.js
import userModel from '../models/usermodel.js';
import mongoose from 'mongoose';
import postModel from '../models/postmodel.js';
import Notification from '../models/notificationModel.js';

export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;

    const query = search ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const users = await userModel.find(query)
      .select('-password -verifyOtp -resetOtp')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get user stats
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const posts = await postModel.find({ createdBy: user._id })
        .select('title createdAt likes comments')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const totalPosts = await postModel.countDocuments({ createdBy: user._id });
      const totalLikes = await postModel.aggregate([
        { $match: { createdBy: user._id } },
        { $project: { likesCount: { $size: '$likes' } } },
        { $group: { _id: null, total: { $sum: '$likesCount' } } }
      ]);

      const totalComments = await postModel.aggregate([
        { $match: { createdBy: user._id } },
        { $project: { commentsCount: { $size: '$comments' } } },
        { $group: { _id: null, total: { $sum: '$commentsCount' } } }
      ]);

      // Recent activity (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentPosts = await postModel.countDocuments({
        createdBy: user._id,
        createdAt: { $gte: weekAgo }
      });

      const recentLikes = await postModel.aggregate([
        {
          $match: {
            'likes.user': user._id,
            'likes.createdAt': { $gte: weekAgo }
          }
        },
        { $count: 'count' }
      ]);

      const recentComments = await postModel.aggregate([
        {
          $match: {
            'comments.user': user._id,
            'comments.createdAt': { $gte: weekAgo }
          }
        },
        { $count: 'count' }
      ]);

      return {
        ...user,
        stats: {
          totalPosts,
          totalLikes: totalLikes[0]?.total || 0,
          totalComments: totalComments[0]?.total || 0,
          recentPosts,
          recentLikes: recentLikes[0]?.count || 0,
          recentComments: recentComments[0]?.count || 0
        },
        recentPosts: posts
      };
    }));

    const totalUsers = await userModel.countDocuments(query);

    res.json({
      success: true,
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserDetailedActivity = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await userModel.findById(userId)
      .select('-password -verifyOtp -resetOtp');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's posts with interactions
    const userPosts = await postModel.find({ createdBy: userId })
      .populate('likes.user', 'name profilePhoto')
      .populate('comments.user', 'name profilePhoto')
      .sort({ createdAt: -1 })
      .lean();

    // Get posts liked by user
    const likedPosts = await postModel.find({ 'likes.user': userId })
      .populate('createdBy', 'name profilePhoto')
      .select('title createdAt likes comments')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get user's comments - FIXED: Use mongoose.Types.ObjectId
    const userComments = await postModel.aggregate([
      { $unwind: '$comments' },
      { $match: { 'comments.user': new mongoose.Types.ObjectId(userId) } }, // ✅ Fixed
      {
        $project: {
          postTitle: '$title',
          postId: '$_id',
          comment: '$comments.text',
          commentedAt: '$comments.createdAt'
        }
      },
      { $sort: { commentedAt: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      user,
      activity: {
        posts: userPosts,
        likedPosts,
        comments: userComments
      }
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPlatformStats = async (req, res) => {
  try {
    const totalUsers = await userModel.countDocuments();
    const totalTeachers = await userModel.countDocuments({ role: 'teacher' });
    const totalAdmins = await userModel.countDocuments({ role: 'admin' });
    const totalPosts = await postModel.countDocuments();

    const totalLikes = await postModel.aggregate([
      { $project: { likesCount: { $size: '$likes' } } },
      { $group: { _id: null, total: { $sum: '$likesCount' } } }
    ]);

    const totalComments = await postModel.aggregate([
      { $project: { commentsCount: { $size: '$comments' } } },
      { $group: { _id: null, total: { $sum: '$commentsCount' } } }
    ]);

    // Recent activity (last 30 days)
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const newUsers = await userModel.countDocuments({ createdAt: { $gte: monthAgo } });
    const newPosts = await postModel.countDocuments({ createdAt: { $gte: monthAgo } });
    const newLikes = await postModel.aggregate([
      { $unwind: '$likes' },
      { $match: { 'likes.createdAt': { $gte: monthAgo } } },
      { $count: 'count' }
    ]);

    const newComments = await postModel.aggregate([
      { $unwind: '$comments' },
      { $match: { 'comments.createdAt': { $gte: monthAgo } } },
      { $count: 'count' }
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          teachers: totalTeachers,
          admins: totalAdmins,
          new: newUsers
        },
        content: {
          posts: totalPosts,
          newPosts,
          likes: totalLikes[0]?.total || 0,
          newLikes: newLikes[0]?.count || 0,
          comments: totalComments[0]?.total || 0,
          newComments: newComments[0]?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('Get platform stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deleting themselves
    if (userId === req.userId) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const user = await userModel.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete user's posts and related data
    await postModel.deleteMany({ createdBy: userId });
    await Notification.deleteMany({ userId });

    res.json({
      success: true,
      message: 'User and all associated data deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};