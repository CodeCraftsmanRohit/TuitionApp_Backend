import express from 'express';
import {
  toggleFavorite,
  getUserFavorites,
  checkFavoriteStatus
} from '../controllers/favoriteController.js';
import userAuth from '../middleware/userAuth.js';

const favoriteRouter = express.Router();

favoriteRouter.post('/posts/:postId/favorite', userAuth, toggleFavorite);
favoriteRouter.get('/favorites', userAuth, getUserFavorites);
favoriteRouter.get('/posts/:postId/favorite-status', userAuth, checkFavoriteStatus);

export default favoriteRouter;