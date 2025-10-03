// controllers/postController.js
import postModel from '../models/postmodel.js';
import userModel from '../models/usermodel.js';
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

export const updatePost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.userId;
  const userRole = req.userRole;
  const updateData = { ...req.body };

  try {
    const post = await postModel.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.createdBy.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Update logic...
    const updated = await postModel.findByIdAndUpdate(postId, updateData, { new: true });
    return res.json({ success: true, message: 'Post updated', post: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deletePost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.userId;
  const userRole = req.userRole;

  try {
    const post = await postModel.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.createdBy.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await postModel.findByIdAndDelete(postId);
    return res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
