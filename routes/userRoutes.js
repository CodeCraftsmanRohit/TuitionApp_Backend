import express from 'express';
import userAuth from '../middleware/userAuth.js';
import {
  getUserData,
  uploadProfileImages,
  updateUser
} from '../controllers/userController.js';
import { upload } from '../middleware/multer.js';

const userRouter = express.Router();

// Add this route for updating user info
userRouter.put('/update', userAuth, updateUser);

userRouter.put('/upload-images', userAuth, upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'bgImage', maxCount: 1 }
]), uploadProfileImages);

userRouter.get('/data', userAuth, getUserData);

export default userRouter;