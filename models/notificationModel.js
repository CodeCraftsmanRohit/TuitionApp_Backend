import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user', // ✅ Use 'user' (lowercase) to match your user model
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['tuition_post', 'application', 'message', 'system', 'like', 'comment', 'rating'], // ✅ Added 'rating'
    default: 'tuition_post'
  },
  relatedPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'post' // ✅ Use 'post' (lowercase) to match your post model
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for better performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;