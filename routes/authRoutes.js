const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const nodemailer = require("nodemailer");
const rateLimitMap = new Map();
const { sendNotification } = require("../utils/notification"); // ✅ Import the sendNotification function
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const { storage } = require("./cloudinary.config");

const router = express.Router();
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Multer setup for profile photo uploads
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, path.join(__dirname, "../uploads"));
//   },
//   filename: function (req, file, cb) {
//     const ext = path.extname(file.originalname);
//     cb(null, Date.now() + "-profile" + ext);
//   },
// });
const upload = multer({ storage });

// ✅ Register Route (User Registration)
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role, fcmToken } = req.body; // Added fcmToken for notifications
    const hashPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
      password: hashPassword,
      role,
      fcmToken,
    });
    await user.save();
    res.status(200).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.status(200).json({
      token,
      user: {
        username: user.username,
        email: user.email,
        id: user._id,
        role: user.role,
        fcmToken: user.fcmToken, // Return FCM token on login
      },
    });
    await sendNotification(
      user.fcmToken,
      "Login Notification",
      "You have logged in successfully."
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Forgot Password Route
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = Date.now();
    const lastRequestTime = rateLimitMap.get(email);

    if (lastRequestTime && now - lastRequestTime < 2 * 60 * 1000) {
      return res
        .status(429)
        .json({ error: "Please wait 2 minutes before requesting again" });
    }

    rateLimitMap.set(email, now);
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    const frontendUrl = "http://localhost:5173";
    const resetLink = `http://localhost:5173/ResetPassword?token=${token}`;

    await transporter.sendMail({
      from: '"Support Team" <yogeshkumarkumawat700@gmail.com>',
      to: email,
      subject: "Password Reset Request",
      html: `
        <p>Click the button below to reset your password:</p>
        <a href="${resetLink}" style="background-color: #4CAF50; border: none; border-radius: 5px; color: white; padding: 10px 20px; text-align: center; text-decoration: none; font-size: 16px; display: inline-block;">Reset Password</a>
        <p>If you didn't request a password reset, please ignore this email.</p>
      `,
    });

    res
      .status(200)
      .json({ message: "Password reset link sent to your email." });
  } catch (error) {
    console.error("Error sending email:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Reset Password Route
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "Token and newPassword are required" });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decodedToken.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashPassword;

    // Save password change notification
    user.notifications.push({
      message: "Your password has been reset successfully!",
    });

    // Send notification after password reset
    await sendNotification(
      user.fcmToken,
      "Password Reset",
      "Your password has been changed successfully."
    );

    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get Notifications Route
router.get("/notifications", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user.notifications);
  } catch (error) {
    console.error("Notifications error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Delete Single Notification Route
router.delete("/notifications", async (req, res) => {
  try {
    const { userId, notificationIndex } = req.query;

    if (!userId || notificationIndex === undefined) {
      return res
        .status(400)
        .json({ error: "User ID and notification index are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const index = parseInt(notificationIndex);
    if (index < 0 || index >= user.notifications.length) {
      return res.status(400).json({ error: "Invalid notification index" });
    }

    // Remove the notification at the specified index
    user.notifications.splice(index, 1);
    await user.save();

    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Delete All Notifications Route
router.delete("/notifications/all", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Clear all notifications
    user.notifications = [];
    await user.save();

    res.status(200).json({ message: "All notifications deleted successfully" });
  } catch (error) {
    console.error("Delete all notifications error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Update FCM Token Route (Optional if users are storing tokens in DB)
router.post("/update-fcm-token", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res
        .status(400)
        .json({ error: "User ID and FCM Token are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.fcmToken = fcmToken; // Save FCM token to user profile
    await user.save();

    res.status(200).json({ message: "FCM Token updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get User Profile Route
router.get("/profile", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Upload Profile Photo Route
router.post("/profile-photo", upload.single("photo"), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !req.file) {
      return res.status(400).json({ error: "User ID and photo are required" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // Save the file path as the profile photo URL
    const fileUrl = req.file.path;
    user.profilePhoto = fileUrl;
    // Save password change notification
    user.notifications.push({
      message: "Your profile photo has been updated successfully!",
    });

    // Send notification after password reset
    await sendNotification(
      user.fcmToken,
      "Your profile photo has been updated successfully."
    );
    await user.save();
    res.status(200).json({ profilePhoto: fileUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
