const express = require("express");
const router = express.Router();
const multer = require("multer");
const Product = require("../models/products");
const mongoose = require("mongoose");
const path = require("path");
const User = require('../models/user');
const { sendNotification } = require('../utils/notification');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Helper function to emit WebSocket notification
const emitNotification = (req, userId, notification) => {
  try {
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${userId}`).emit("newNotification", notification);
      console.log(`WebSocket notification sent to user ${userId}`);
    }
  } catch (error) {
    console.error("Error emitting WebSocket notification:", error);
  }
};

router.post("/upload", upload.array("images", 5), async (req, res) => {
  try {
    const { title, description, price, category, rate, count, userId } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const imageUrls = req.files.map(
      (file) => `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
    );

    if (!title || !description || !price || !category || !rate || !count) {
      return res
        .status(400)
        .json({ error: "All fields including rating are required" });
    }

    const product = new Product({
      title,
      description,
      price,
      category,
      image: imageUrls,
      rating: {
        rate: parseFloat(rate),
        count: parseInt(count),
      },
    });

    await product.save();

    // Send notification to user if userId is provided
    if (userId) {
      const user = await User.findById(userId);
      if (user && user.fcmToken) {
        await sendNotification(user.fcmToken, 'Product Created', `Product "${product.title}" has been created successfully!`);
        
        // Add notification to user's notifications array
        const newNotification = { 
          message: `Product "${product.title}" has been created successfully!`,
          createdAt: new Date()
        };
        user.notifications.push(newNotification);
        await user.save();
        
        // Emit WebSocket notification
        emitNotification(req, userId, newNotification);
        
        console.log('Product creation notification sent to user:', userId);
      } else {
        console.log('User not found or no FCM token:', userId);
      }
    }

    res.status(200).json({ message: "Product uploaded successfully", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/getProducts", async (req, res) => {
  try {
    const products = await Product.find();
    const data = products.map((product) => ({
      id: product._id,
      title: product.title,
      description: product.description,
      price: product.price,
      category: product.category,
      image: product.image,
      rating: {
        rate: product.rating.rate,
        count: product.rating.count,
      },
    }));
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/getProductById/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({ product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/deleteProduct", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put(
  "/updateProduct/:id",
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid Product ID" });
      }

      let updateData = { ...req.body };

      const existingProduct = await Product.findById(id);
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      let updatedImages = existingProduct.image || [];

      if (req.files && req.files.length > 0) {
        const newImageUrls = req.files.map(
          (file) =>
            `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
        );
        updatedImages = [...updatedImages, ...newImageUrls];
      }

      updateData.image = updatedImages;

      const product = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      // Send notification to user if userId is provided
      if (userId) {

        try {
          const user = await User.findById(userId);
          if (user && user.fcmToken) {
            await sendNotification(user.fcmToken, 'Product Updated', `Product "${product.title}" has been updated successfully!`);
            
            // Add notification to user's notifications array
            const newNotification = { 
              message: `Product "${product.title}" has been updated successfully!`,
              createdAt: new Date()
            };
            user.notifications.push(newNotification);
            await user.save();
            
            // Emit WebSocket notification
            emitNotification(req, userId, newNotification);
            
          }
        } catch (error) {
          throw error;
        }
        
      }

      res
        .status(200)
        .json({ message: "Product updated successfully", product });
    } catch (error) {
      console.error("Update Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Checkout route
router.post('/checkout', async (req, res) => {
  try {
    // Here you would handle order creation, payment, etc.
    const { userId, cart } = req.body;
    console.log('Checkout request:', { userId, cart });
    
    // TODO: Save order to DB, process payment, etc.

    // Send notification to user
    if (userId) {
      const user = await User.findById(userId);
      if (user && user.fcmToken) {
        await sendNotification(user.fcmToken, 'Order Confirmed', 'Your order has been placed successfully!');
        
        // Add notification to user's notifications array
        const newNotification = { 
          message: 'Your order has been placed successfully!',
          createdAt: new Date()
        };
        user.notifications.push(newNotification);
        await user.save();
        
        // Emit WebSocket notification
        emitNotification(req, userId, newNotification);
        
        console.log('Notification sent to user:', userId);
      } else {
        console.log('User not found or no FCM token:', userId);
      }
    }

    res.status(200).json({ message: 'Order placed successfully!', cart });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search products by name
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    const products = await Product.find({ title: { $regex: q, $options: 'i' } });
    const data = products.map((product) => ({
      id: product._id,
      title: product.title,
      description: product.description,
      price: product.price,
      category: product.category,
      image: product.image,
      rating: {
        rate: product.rating.rate,
        count: product.rating.count,
      },
    }));
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
