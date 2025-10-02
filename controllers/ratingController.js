import express from 'express';
import {
  submitRating,
  getUserRatings,
  canUserRate,
  getRatingsByUser,
  addUserRating
} from '../controllers/ratingController.js';
import userAuth from '../middleware/userAuth.js';

const ratingRouter = express.Router();

ratingRouter.post('/', userAuth, submitRating);
ratingRouter.get('/user/:userId', getUserRatings);
ratingRouter.get('/can-rate', userAuth, canUserRate);
ratingRouter.get('/by-user/:userId', getRatingsByUser); // Get ratings given by a user
ratingRouter.post('/add', userAuth, addUserRating); // Alternative add rating endpoint

export default ratingRouter;