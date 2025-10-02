import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema({
  rater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  ratedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'post'
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure one rating per user per post combination
ratingSchema.index({ rater: 1, ratedUser: 1, post: 1 }, { unique: true });

const Rating = mongoose.models.Rating || mongoose.model('Rating', ratingSchema);
export default Rating;