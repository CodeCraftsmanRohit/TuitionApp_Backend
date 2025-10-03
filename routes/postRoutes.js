// routes/postRoutes.js
import express from 'express';
import { createPost, getAllPosts, updatePost, deletePost } from '../controllers/postController.js';
import adminAuth from '../middleware/adminAuth.js';
import userAuth from '../middleware/userAuth.js';
import { upload } from '../middleware/multer.js';

const postRouter = express.Router();

// Remove the duplicate routes and keep only these:
postRouter.post('/', userAuth, upload.single('image'), createPost);
postRouter.get('/', userAuth, getAllPosts);
postRouter.put('/:id', userAuth, updatePost); // Both users and admins can use this
postRouter.delete('/:id', userAuth, deletePost); // Both users and admins can use this
export default postRouter;
