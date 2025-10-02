import express from 'express';
import {
  submitRating,
  getUserRatings,
  canUserRate
} from '../controllers/ratingController.js';
import userAuth from '../middleware/userAuth.js';

const ratingRouter = express.Router();

ratingRouter.post('/', userAuth, submitRating);
ratingRouter.get('/user/:userId', getUserRatings);
ratingRouter.get('/can-rate', userAuth, canUserRate);

export default ratingRouter;