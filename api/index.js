const { connectDB } = require('../src/config/db');
const createApp = require('../src/app');

const app = createApp();
let isConnected = false;

module.exports = async (req, res) => {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
  }
  return app(req, res);
};