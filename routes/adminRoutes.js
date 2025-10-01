// routes/adminRoutes.js
import express from 'express';
import {
  getAllUsers,
  getUserDetailedActivity,
  getPlatformStats,
  deleteUser
} from '../controllers/adminController.js';
import adminAuth from '../middleware/adminAuth.js';

const adminRouter = express.Router();

adminRouter.get('/users', adminAuth, getAllUsers);
adminRouter.get('/users/:id/activity', adminAuth, getUserDetailedActivity);
adminRouter.get('/stats', adminAuth, getPlatformStats);
adminRouter.delete('/users/:id', adminAuth, deleteUser);

export default adminRouter;