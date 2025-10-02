import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "teacher"], default: "teacher" },
    verifyOtp: { type: String, default: "" },
    verifyOtpExpireAt: { type: Number, default: 0 },
    isAccountVerified: { type: Boolean, default: false },
    resetOtp: { type: String, default: "" },
    resetOtpExpireAt: { type: Number, default: 0 },

    // Profile images
    profilePhoto: {
      url: { type: String, default: "" },
      public_id: { type: String, default: "" },
    },
    bgImage: {
      url: { type: String, default: "" },
      public_id: { type: String, default: "" },
    },

    // Phone and notification preferences
    phone: {
      type: String,
      default: "",
      validate: {
        validator: function (v) {
          // Basic phone validation - adjust for your country
          return !v || /^\+?[\d\s\-\(\)]{10,}$/.test(v);
        },
        message: "Invalid phone number format",
      },
    },
    whatsappNotifications: {
      type: Boolean,
      default: true,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    telegramChatId: {
      type: String,
      default: "",
    },
    telegramNotifications: {
      type: Boolean,
      default: true,
    },

    // Push Notifications
    fcmToken: {
      type: String,
      default: "",
    },
    pushNotifications: {
      type: Boolean,
      default: true,
    },
    // Activity tracking
    lastActive: {
      type: Date,
      default: Date.now,
    },
    postCount: {
      type: Number,
      default: 0,
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Update lastActive on save
userSchema.pre("save", function (next) {
  this.lastActive = new Date();
  next();
});

const userModel = mongoose.models.user || mongoose.model("user", userSchema);
export default userModel;
