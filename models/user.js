const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true, // Removes leading & trailing spaces
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // Ensures emails are stored in lowercase
      match: [
        /^\S+@\S+\.\S+$/,
        "Please enter a valid email address",
      ],
    },
    password: {
      type: String,
      required: true,
      minlength: 6, // Enforce minimum password length
    },
    role: {
      type: String,
      enum: ["buyer", "seller" , "admin"],
      default: "buyer",
    },
    notifications: [
      {
        message: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    fcmToken:{
      type: String
    },
    profilePhoto: {
      type: String,
      default: null
    }
  },
  { timestamps: true } // Adds createdAt and updatedAt fields
);

module.exports = mongoose.model("User", userSchema);
