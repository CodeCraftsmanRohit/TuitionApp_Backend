// models/Rating.js
import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

const ratingSchema = new Schema(
  {
    ratedUser: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rater: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
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

const Rating = model('Rating', ratingSchema);

export default Rating;
