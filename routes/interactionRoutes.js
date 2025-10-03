// routes/interactionRoutes.js
import express from 'express';
import {
  likePost,
  addComment,
  getPostInteractions,
  deleteComment,updateComment
} from '../controllers/interactionController.js';
import userAuth from '../middleware/userAuth.js';

const interactionRouter = express.Router();

interactionRouter.post('/posts/:id/like', userAuth, likePost);
interactionRouter.post('/posts/:id/comment', userAuth, addComment);
interactionRouter.get('/posts/:id/interactions', userAuth, getPostInteractions);
interactionRouter.delete('/posts/:postId/comments/:commentId', userAuth, deleteComment);
// Add the edit comment route
interactionRouter.put('/posts/:postId/comments/:commentId', userAuth, updateComment);

export default interactionRouter;