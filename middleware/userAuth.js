// middlewares/userAuth.js
import jwt from 'jsonwebtoken';

const userAuth = (req, res, next) => {
  try {
    // 1) check cookie
    let token = req.cookies?.token;

    // 2) fallback to Authorization header Bearer <token>
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

export default userAuth;
