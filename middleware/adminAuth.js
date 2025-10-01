// middleware/adminAuth.js
import jwt from 'jsonwebtoken';
import userModel from '../models/usermodel.js';

const adminAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized, no token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // If you trust token role, optionally avoid DB lookup; but safer to fetch fresh user:
    const user = await userModel.findById(decoded.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admins only' });
    }

    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

export default adminAuth;
