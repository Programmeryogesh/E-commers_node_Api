const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const admin = require("firebase-admin");  // ✅ Import Firebase Admin SDK
const authRoutes = require("./routes/authRoutes");  
const productRoutes = require("./routes/productRoutes"); 
const path = require("path"); 
const serviceAccount = require("./firebase-adminsdk.json");

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Correct Firebase Initialization
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

mongoose
  .connect(process.env.MONGO_URL) // ✅ Ensure proper connection options
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB Connection Error:", error);
  });

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
module.exports = admin;