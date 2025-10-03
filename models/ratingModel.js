import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

const ratingSchema = new Schema(
  {
    ratedUser: {
      type: Types.ObjectId,
      ref: 'user', // ✅ Use 'user' (lowercase)
      required: true,
    },
    rater: {
      type: Types.ObjectId,
      ref: 'user', // ✅ Use 'user' (lowercase)
      required: true,
    },
    post: {
      type: Types.ObjectId,
      ref: 'post', // ✅ Use 'post' (lowercase)
      default: null,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

// Sparse unique index to allow multiple null posts
ratingSchema.index({ rater: 1, ratedUser: 1, post: 1 }, {
  unique: true,
  sparse: true
});

// Compound index for better query performance
ratingSchema.index({ ratedUser: 1, createdAt: -1 });
ratingSchema.index({ rater: 1, createdAt: -1 });

const Rating = mongoose.models.Rating || mongoose.model('Rating', ratingSchema);
export default Rating;