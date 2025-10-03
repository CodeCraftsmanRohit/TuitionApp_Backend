// Load environment variables FIRST
import 'dotenv/config';

// Debug immediately
console.log('🔧 Environment check in server.js:');
console.log('SMTP_USER:', process.env.SMTP_USER ? '✅ Set' : '❌ Missing');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? '✅ Set' : '❌ Missing');
console.log('SENDER_EMAIL:', process.env.SENDER_EMAIL ? '✅ Set' : '❌ Missing');


// Now import other modules
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/mongodb.js";
import authRouter from './routes/authRoutes.js';
import userRouter from './routes/userRoutes.js';
import postRouter from './routes/postRoutes.js';
import testRouter from './routes/testroutes.js';
// server.js - Add these routes
import notificationRouter from './routes/notificationRoutes.js';
import interactionRouter from './routes/interactionRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import favoriteRouter from './routes/favoriteRoutes.js';
import searchRouter from './routes/searchRoutes.js';
import ratingRouter from './routes/ratingRoutes.js';

// Add after other routes
const app = express();
const port = process.env.PORT || 4000;

// Rest of your server.js code...
connectDB();

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = ['http://localhost:5173'];
app.use(cors({ origin: ['http://localhost:8081', 'exp://*'], credentials: true }));

app.get('/', (req, res) => {
  return res.send("API Working");
});

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/posts', postRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api', interactionRouter);
app.use('/api/admin', adminRouter);
app.use('/api/favorites', favoriteRouter);
app.use('/api/search', searchRouter);
app.use('/api/ratings', ratingRouter);

// app.use('/api/test', testRouter);
// In server.js, add this check:
console.log('🔧 Twilio Environment Check:');
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing');
console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing');
console.log('TWILIO_WHATSAPP_FROM:', process.env.TWILIO_WHATSAPP_FROM || '❌ Missing');

console.log('🔧 Email Environment Check:');
console.log('SMTP_USER:', process.env.SMTP_USER ? '✅ Set' : '❌ Missing');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? '✅ Set' : '❌ Missing');
console.log('SENDER_EMAIL:', process.env.SENDER_EMAIL || '❌ Missing');

app.listen(port, () => console.log(`Server started on PORT:${port}`));