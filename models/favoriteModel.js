import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'post',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure unique combination of user and post
favoriteSchema.index({ user: 1, post: 1 }, { unique: true });

const Favorite = mongoose.models.Favorite || mongoose.model('Favorite', favoriteSchema);
export default Favorite;