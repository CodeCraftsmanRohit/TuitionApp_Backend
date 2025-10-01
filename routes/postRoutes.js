// routes/postRoutes.js
import express from 'express';
import { createPost, getAllPosts, updatePost, deletePost } from '../controllers/postController.js';
import adminAuth from '../middleware/adminAuth.js';
import userAuth from '../middleware/userAuth.js';
import { upload } from '../middleware/multer.js';

const postRouter = express.Router();

postRouter.post('/', userAuth, upload.single('image'), createPost);
postRouter.get('/', userAuth, getAllPosts);
postRouter.put('/:id', adminAuth, updatePost);
postRouter.delete('/:id', adminAuth, deletePost);
export default postRouter;
