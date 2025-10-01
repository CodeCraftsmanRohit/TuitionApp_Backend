// models/postmodel.js - Fix genderPreference enum
import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  class: { type: String, required: true },
  subject: { type: String, required: true },
  board: { type: String, required: true },
  salary: { type: Number, required: true },
  time: { type: String, required: true },
  address: { type: String, required: true },
  genderPreference: {
    type: String,
    enum: ['male', 'female', 'any'], // ✅ All lowercase
    default: 'any'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  createdAt: { type: Date, default: Date.now },

  // image for post (optional)
  image: {
    url: { type: String, default: '' },
    public_id: { type: String, default: '' },
  },

  // Like system
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Comment system
  comments: [commentSchema],

  // View count
  views: {
    type: Number,
    default: 0
  }
});

// Index for better performance
postSchema.index({ createdBy: 1, createdAt: -1 });
postSchema.index({ likes: 1 });
postSchema.index({ 'comments.createdAt': -1 });

const postModel = mongoose.models.post || mongoose.model('post', postSchema);
export default postModel;