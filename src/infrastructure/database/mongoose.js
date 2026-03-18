const mongoose = require('mongoose');

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn('MONGODB_URI is not configured, using local fallback storage');
    return { connected: false };
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
    return { connected: true };
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.warn('Falling back to local storage');
    return { connected: false, error };
  }
};

module.exports = {
  connectDatabase,
};
