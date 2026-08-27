const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[MongoDB] ❌ MONGODB_URI is not set in environment variables.');
    console.error('[MongoDB] Please add MONGODB_URI=mongodb+srv://... to your server/.env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('[MongoDB] ✅ Connected successfully to MongoDB Atlas');
  } catch (err) {
    console.error('[MongoDB] ❌ Connection failed:', err.message);
    console.error('[MongoDB] Check your MONGODB_URI in server/.env and ensure network access is allowed in Atlas.');
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] ⚠️  Disconnected from MongoDB. Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('[MongoDB] ✅ Reconnected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Connection error:', err.message);
  });
}

module.exports = { connectDB };
