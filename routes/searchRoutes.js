import express from 'express';
import {
  searchPosts,
  getSearchSuggestions
} from '../controllers/searchController.js';
import userAuth from '../middleware/userAuth.js';

const searchRouter = express.Router();

searchRouter.get('/posts', userAuth, searchPosts);
searchRouter.get('/suggestions', userAuth, getSearchSuggestions);

export default searchRouter;