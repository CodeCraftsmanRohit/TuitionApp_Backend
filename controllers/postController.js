// controllers/postController.js
import postModel from '../models/postmodel.js';
import userModel from '../models/usermodel.js';
import Favorite from '../models/favoriteModel.js';
import transporter from '../config/modemailer.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import twilioService from '../config/twilio.js';
import emailService from '../config/modemailer.js';
import masterNotificationController from './masterNotificationController.js';
// Create new tuition post
export const createPost = async (req, res) => {
  const { title, class: className, subject, board, salary, time, address, genderPreference } = req.body;

  if (!title || !className || !subject || !board || !salary || !time || !address) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const salaryNum = Number(salary);
  if (!Number.isFinite(salaryNum)) {
    return res.status(400).json({ success: false, message: 'Salary must be a valid number' });
  }

  try {
    // Create post with placeholder image (so we can respond immediately)
    const post = new postModel({
      title,
      class: className,
      subject,
      board,
      salary: salaryNum,
      time,
      address,
      genderPreference,
      createdBy: req.userId,
      image: { url: '', public_id: '' }, // placeholder
    });

    await post.save();
    console.log('✅ Post saved to database (placeholder image):', post._id);

    // Respond immediately so client doesn't wait for uploads/notifications
    res.status(201).json({
      success: true,
      message: 'Post created (processing image & notifications in background)',
      post,
    });

    // Fire-and-forget: upload image (if any) and send notifications
    (async () => {
      try {
        let updatedPost = post;

        // If there's a file buffer, upload to Cloudinary and update the post
        if (req.file && req.file.buffer) {
          try {
            console.log('📤 Starting Cloudinary upload for post:', post._id);
            const result = await uploadOnCloudinary(req.file.buffer, 'tuition-posts');
            const imageObj = { url: result.secure_url, public_id: result.public_id };

            updatedPost = await postModel.findByIdAndUpdate(
              post._id,
              { image: imageObj },
              { new: true }
            ).lean();

            console.log('✅ Cloudinary upload complete and post updated:', post._id);
          } catch (cloudErr) {
            console.warn('⚠️ Cloudinary upload failed (non-blocking):', cloudErr?.message || cloudErr);
            // Continue to notifications even if image upload fails
          }
        }

        // Send notifications using masterNotificationController if available
        if (masterNotificationController && typeof masterNotificationController.sendNewPostNotifications === 'function') {
          try {
            // call but don't await at top-level — but we can await here inside background to log errors
            const notifyResult = await masterNotificationController.sendNewPostNotifications(updatedPost);
            console.log('🎯 Notification result (background):', notifyResult);
          } catch (notifyErr) {
            console.error('❌ masterNotificationController failed (non-blocking):', notifyErr?.message || notifyErr);
          }
        } else {
          // Fallback: if you want local notification implementation, call it here.
          console.warn('⚠️ masterNotificationController.sendNewPostNotifications not found. Skipping notifications.');
        }
      } catch (bgErr) {
        console.error('Background processing error for post:', post._id, bgErr);
      }
    })();

   (async () => {
  try {
    const emailResult = await sendNewPostEmailNotifications(updatedPost);
    console.log('📧 Email notification result:', emailResult);
  } catch (emailErr) {
    console.warn('⚠️ Email notification failed (non-blocking):', emailErr?.message || emailErr);
  }
})();

  } catch (err) {
    console.error('Create post server error (before response):', err);
    // If response already sent above, we don't try to send again. Only send if headers not sent.
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};
// Notification function
async function sendPostNotifications(post) {
  try {

    console.log('🔔 Starting notification process for post:', post._id);
    // Get all teachers who want notifications
    const teachers = await userModel.find({
      role: 'teacher',
      $or: [
        { emailNotifications: true },
        { whatsappNotifications: true }
      ]
    }).lean();
     console.log(`📋 Found ${teachers.length} teachers for notifications`);


    const emailRecipients = [];
    const whatsappRecipients = [];

    // Separate recipients by preference
    teachers.forEach(teacher => {
      if (teacher.emailNotifications && teacher.email) {
        emailRecipients.push(teacher);
      }
      if (teacher.whatsappNotifications && teacher.phone) {
        whatsappRecipients.push(teacher);
      }
    });

     console.log(`📧 Email recipients: ${emailRecipients.length}`);
    console.log(`📱 WhatsApp recipients: ${whatsappRecipients.length}`);

   // Send notifications
    if (emailRecipients.length > 0) {
      await sendEmailNotifications(emailRecipients, post);
    } else {
      console.log('⚠️ No email recipients found');
    }

    if (whatsappRecipients.length > 0) {
      await sendWhatsAppNotifications(whatsappRecipients, post);
    } else {
      console.log('⚠️ No WhatsApp recipients found');
    }

    console.log('✅ Notification process completed');
  } catch (error) {
    console.error('Notification error:', error);
    // Don't throw error - notifications are secondary to post creation
  }
}

// Email notifications
export async function sendEmailNotifications(teachers, post) {
  const promises = teachers.map(async (teacher) => {
    try {
      const isReady = await emailService.verify();
      if (!isReady) {
        console.log('⚠️ Email service not ready, skipping email to', teacher.email);
        return { email: teacher.email, success: false, reason: 'Mailer not ready' };
      }

      const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: teacher.email,
        subject: '🎓 New Tuition Vacancy Available!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1976D2;">New Tuition Opportunity!</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
              <h3>${post.title}</h3>
              <p><strong>Class:</strong> ${post.class}</p>
              <p><strong>Subject:</strong> ${post.subject}</p>
              <p><strong>Board:</strong> ${post.board}</p>
              <p><strong>Salary:</strong> ₹${post.salary}</p>
              <p><strong>Time:</strong> ${post.time}</p>
              <p><strong>Address:</strong> ${post.address}</p>
              <p><strong>Gender Preference:</strong> ${post.genderPreference || 'Any'}</p>
            </div>
            <p>Check the app for more details and to apply.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from Tuition App.
            </p>
          </div>
        `,
      };

      await emailService.sendMail(mailOptions);
      return { email: teacher.email, success: true };
    } catch (e) {
      console.warn(`Failed to send email to ${teacher.email} (non-blocking):`, e?.message || e);
      return { email: teacher.email, success: false, error: e?.message || e };
    }
  });

  const results = await Promise.allSettled(promises);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value && !r.value.success));
  if (failed.length > 0) console.warn(`${failed.length} email sends failed`);
  return results;
}

// Add this function to send email notifications for new posts
// Add this function to send email notifications for new posts
async function sendNewPostEmailNotifications(post) {
  try {
    console.log('📧 Starting email notifications for new post...');

    // Get all users (both teachers and admins) who want email notifications
    const allUsers = await userModel.find({
      emailNotifications: true,
      email: { $exists: true, $ne: '' }
    }).lean();

    console.log(`📋 Found ${allUsers.length} users for email notifications`);

    if (allUsers.length === 0) {
      console.log('⚠️ No users found for email notifications');
      return { success: true, sent: 0, total: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;

    // Send emails sequentially to avoid rate limiting
    for (const user of allUsers) {
      try {
        const mailOptions = {
          from: process.env.SENDER_EMAIL,
          to: user.email,
          subject: '🎓 New Tuition Opportunity Available!',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1976D2;">New Tuition Opportunity!</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
                <h3>${post.title}</h3>
                <p><strong>Class:</strong> ${post.class}</p>
                <p><strong>Subject:</strong> ${post.subject}</p>
                <p><strong>Board:</strong> ${post.board}</p>
                <p><strong>Salary:</strong> ₹${post.salary}</p>
                <p><strong>Time:</strong> ${post.time}</p>
                <p><strong>Address:</strong> ${post.address}</p>
                <p><strong>Gender Preference:</strong> ${post.genderPreference || 'Any'}</p>
              </div>
              <p>Check the Tuition App for more details and to apply.</p>
              <hr>
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from Tuition App.
              </p>
            </div>
          `,
        };

        await emailService.sendMail(mailOptions);
        console.log(`✅ Email sent to: ${user.email}`);
        sentCount++;
      } catch (emailErr) {
        console.warn(`❌ Failed to send email to ${user.email}:`, emailErr.message);
        failedCount++;
      }
    }

    console.log(`✅ Email notifications completed: ${sentCount}/${allUsers.length} successful`);
    return { success: true, sent: sentCount, failed: failedCount, total: allUsers.length };

  } catch (error) {
    console.error('❌ Email notification error:', error);
    return { success: false, error: error.message };
  }
}
// WhatsApp notifications
export async function sendWhatsAppNotifications(teachers, post) {
  try {
    const message = `🎓 *New Tuition Opportunity!*\n\n*${post.title}*\n\n📚 Class: ${post.class}\n📖 Subject: ${post.subject}\n🏫 Board: ${post.board}\n💰 Salary: ₹${post.salary}\n⏰ Time: ${post.time}\n📍 Address: ${post.address}\n⚧ Gender Preference: ${post.genderPreference || 'Any'}\n\nCheck the Tuition App for more details and to apply.\n\n_This is an automated notification_`;

    const phoneNumbers = teachers
      .map(t => t.phone)
      .filter(p => p && p.trim() !== '');

    if (phoneNumbers.length === 0) return [];

    // sendBulkWhatsAppMessages should itself be implemented to return array of { phone, success, error? }
    const results = await twilioService.sendBulkWhatsAppMessages(phoneNumbers, message);
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) console.warn(`${failed.length} WhatsApp messages failed`);
    return results;
  } catch (error) {
    console.error('WhatsApp notification error (non-blocking):', error);
    return [];
  }
}
// Get all posts (for teachers)
// controllers/postController.js - Update getAllPosts
export const getAllPosts = async (req, res) => {
  try {
    const posts = await postModel.find()
      .populate('createdBy', 'name profilePhoto')
      .populate('likes.user', 'name profilePhoto')
      .populate('comments.user', 'name profilePhoto')
      .sort({ createdAt: -1 });

    // Add interaction data for current user
    const postsWithInteractions = posts.map(post => {
      const postObj = post.toObject();
      postObj.isLiked = post.likes.some(like =>
        like.user && like.user._id.toString() === req.userId
      );
      postObj.likesCount = post.likes.length;
      postObj.commentsCount = post.comments.length;
      return postObj;
    });

    res.json({ success: true, posts: postsWithInteractions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update the updatePost function
// controllers/postController.js - Update updatePost function
export const updatePost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.userId;
  const userRole = req.userRole;

  try {
    const post = await postModel.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    // Check if user owns the post OR is admin
    if (post.createdBy.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
    }

    let updateData = { ...req.body };

    // Handle image upload if file exists
    if (req.file && req.file.buffer) {
      try {
        console.log('📤 Starting Cloudinary upload for post update:', postId);
        const result = await uploadOnCloudinary(req.file.buffer, 'tuition-posts');
        updateData.image = { url: result.secure_url, public_id: result.public_id };

        // Delete old image from Cloudinary if exists
        if (post.image && post.image.public_id) {
          try {
            await cloudinary.uploader.destroy(post.image.public_id);
          } catch (cloudErr) {
            console.warn('⚠️ Failed to delete old image from Cloudinary:', cloudErr);
          }
        }
      } catch (cloudErr) {
        console.warn('⚠️ Cloudinary upload failed:', cloudErr?.message || cloudErr);
        // Continue with update even if image upload fails
      }
    }

    // Handle image removal
    if (req.body.removeImage === 'true') {
      if (post.image && post.image.public_id) {
        try {
          await cloudinary.uploader.destroy(post.image.public_id);
        } catch (cloudErr) {
          console.warn('⚠️ Failed to delete image from Cloudinary:', cloudErr);
        }
      }
      updateData.image = { url: '', public_id: '' };
    }

    const updated = await postModel.findByIdAndUpdate(postId, updateData, { new: true })
      .populate('createdBy', 'name profilePhoto');

    return res.json({
      success: true,
      message: 'Post updated successfully',
      post: updated
    });
  } catch (err) {
    console.error('Update post error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update the deletePost function
export const deletePost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.userId;
  const userRole = req.userRole;

  try {
    const post = await postModel.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    // Check if user owns the post OR is admin
    if (post.createdBy.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    }

    await postModel.findByIdAndDelete(postId);

    // Also delete associated favorites - now with proper import
    await Favorite.deleteMany({ post: postId });

    return res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (err) {
    console.error('Delete post error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Add to controllers/postController.js
export const getUserLikes = async (req, res) => {
  try {
    const userId = req.params.userId;

    const postsWithLikes = await postModel.find({
      'likes.user': userId
    })
    .populate('createdBy', 'name profilePhoto')
    .select('title image likes createdAt')
    .sort({ createdAt: -1 });

    const likes = postsWithLikes.map(post => {
      const userLike = post.likes.find(like => like.user.toString() === userId);
      return {
        _id: userLike?._id,
        post: {
          _id: post._id,
          title: post.title,
          image: post.image,
          createdAt: post.createdAt
        },
        createdAt: userLike?.createdAt || post.createdAt
      };
    });

    res.json({
      success: true,
      likes
    });
  } catch (error) {
    console.error('Get user likes error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserComments = async (req, res) => {
  try {
    const userId = req.params.userId;

    const postsWithComments = await postModel.find({
      'comments.user': userId
    })
    .populate('createdBy', 'name profilePhoto')
    .select('title image comments createdAt')
    .sort({ createdAt: -1 });

    const comments = [];
    postsWithComments.forEach(post => {
      post.comments.forEach(comment => {
        if (comment.user.toString() === userId) {
          comments.push({
            _id: comment._id,
            post: {
              _id: post._id,
              title: post.title,
              image: post.image,
              createdAt: post.createdAt
            },
            text: comment.text,
            createdAt: comment.createdAt
          });
        }
      });
    });

    // Sort comments by date
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      comments
    });
  } catch (error) {
    console.error('Get user comments error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};