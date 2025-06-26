const admin = require("firebase-admin"); // Import Firebase Admin instance

const sendNotification = async (token, title, body) => {
  if (!token) {
    console.error("FCM Token not found");
    return;
  }

  const message = {
    notification: { title, body },
    token,
  };

  try {
    await admin.messaging().send(message);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

module.exports = { sendNotification };
