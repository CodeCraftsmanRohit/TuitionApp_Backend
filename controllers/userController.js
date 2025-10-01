import userModel from "../models/usermodel.js"
import { uploadOnCloudinary } from '../utils/cloudinary.js';

export const uploadProfileImages = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // req.files from multer.fields()
    const files = req.files || {};
    // process profile photo
    if (files.photo && files.photo[0] && files.photo[0].buffer) {
      const result = await uploadOnCloudinary(files.photo[0].buffer, 'user-profiles');
      user.profilePhoto = { url: result.secure_url, public_id: result.public_id };
    }

    // process background image
    if (files.bgImage && files.bgImage[0] && files.bgImage[0].buffer) {
      const result = await uploadOnCloudinary(files.bgImage[0].buffer, 'user-profiles/bg');
      user.bgImage = { url: result.secure_url, public_id: result.public_id };
    }

    await user.save();

    return res.json({
      success: true,
      message: 'Images uploaded',
      userData: {
        profilePhoto: user.profilePhoto,
        bgImage: user.bgImage
      }
    });
  } catch (err) {
    console.error('Upload profile images error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getUserData = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await userModel.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'user not found' });
    }

    // Return complete user data
    res.json({
      success: true,
      userData: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isAccountVerified: user.isAccountVerified,
        profilePhoto: user.profilePhoto || { url: '' },
        bgImage: user.bgImage || { url: '' }
      }
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, email, phone } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user' });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // If email change requested, ensure it's not already used
    if (email && email !== user.email) {
      const existingUser = await userModel.findOne({ email });
      if (existingUser && existingUser._id.toString() !== userId) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
      user.email = email;
    }

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    // Return updated user data
    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      profilePhoto: user.profilePhoto || { url: '' },
      bgImage: user.bgImage || { url: '' },
    };

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: safeUser
    });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};