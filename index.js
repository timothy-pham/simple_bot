require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./config/database');
const Menu = require('./models/Menu');
const Order = require('./models/Order');

// Connect to MongoDB
connectDB();

// Create bot instance
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Helper function to get start and end of today
const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Helper function to get start and end of week
const getWeekRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay()); // Sunday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Helper function to get start and end of month
const getMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Listen for admin menu posting: "Em gửi thực đơn hôm nay..."
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text) return;

  // Check if admin is posting menu
  if (text.toLowerCase().startsWith('em gửi thực đơn hôm nay')) {
    try {
      const menu = new Menu({
        text: text,
        chatId: chatId.toString()
      });
      await menu.save();
      bot.sendMessage(chatId, '✅ Đã lưu thực đơn hôm nay!');
    } catch (error) {
      console.error('Error saving menu:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lưu thực đơn!');
    }
  }
  // Check if member is ordering food (not a command)
  else if (!text.startsWith('/')) {
    try {
      const { start, end } = getTodayRange();
      const userId = msg.from.id.toString();
      const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
      
      // Check if user already has an order today
      const existingOrder = await Order.findOne({
        userId: userId,
        chatId: chatId.toString(),
        date: { $gte: start, $lte: end }
      });

      if (existingOrder) {
        // Update existing order
        existingOrder.dish = text;
        existingOrder.createdAt = new Date();
        await existingOrder.save();
        bot.sendMessage(chatId, `✅ ${userName} đã cập nhật đặt món: ${text}`);
      } else {
        // Create new order
        const order = new Order({
          userId: userId,
          userName: userName,
          chatId: chatId.toString(),
          dish: text,
          date: new Date()
        });
        await order.save();
        bot.sendMessage(chatId, `✅ ${userName} đã đặt món: ${text}`);
      }
    } catch (error) {
      console.error('Error saving order:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi đặt món!');
    }
  }
});

// /summary command - Show daily summary
bot.onText(/\/summary/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const { start, end } = getTodayRange();
    const orders = await Order.find({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (orders.length === 0) {
      bot.sendMessage(chatId, '📊 Chưa có ai đặt món hôm nay!');
      return;
    }

    // Count dishes
    const dishCount = {};
    orders.forEach(order => {
      if (dishCount[order.dish]) {
        dishCount[order.dish].count++;
        dishCount[order.dish].users.push(order.userName);
      } else {
        dishCount[order.dish] = {
          count: 1,
          users: [order.userName]
        };
      }
    });

    // Format message
    let message = '📊 *Thống kê đặt món hôm nay:*\n\n';
    Object.keys(dishCount).forEach(dish => {
      message += `🍽 *${dish}*: ${dishCount[dish].count} phần\n`;
      message += `   └ ${dishCount[dish].users.join(', ')}\n\n`;
    });
    message += `📝 Tổng cộng: ${orders.length} phần`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting summary:', error);
    bot.sendMessage(chatId, '❌ Lỗi khi lấy thống kê!');
  }
});

// /reset command - Clear daily orders
bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const { start, end } = getTodayRange();
    const result = await Order.deleteMany({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    bot.sendMessage(chatId, `✅ Đã xóa ${result.deletedCount} đơn đặt món hôm nay!`);
  } catch (error) {
    console.error('Error resetting orders:', error);
    bot.sendMessage(chatId, '❌ Lỗi khi xóa dữ liệu!');
  }
});

// /weekly_summary command - Show weekly summary
bot.onText(/\/weekly_summary/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const { start, end } = getWeekRange();
    const orders = await Order.find({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (orders.length === 0) {
      bot.sendMessage(chatId, '📊 Chưa có ai đặt món trong tuần này!');
      return;
    }

    // Count dishes
    const dishCount = {};
    orders.forEach(order => {
      if (dishCount[order.dish]) {
        dishCount[order.dish]++;
      } else {
        dishCount[order.dish] = 1;
      }
    });

    // Format message
    let message = '📊 *Thống kê đặt món tuần này:*\n\n';
    Object.keys(dishCount).sort((a, b) => dishCount[b] - dishCount[a]).forEach(dish => {
      message += `🍽 *${dish}*: ${dishCount[dish]} phần\n`;
    });
    message += `\n📝 Tổng cộng: ${orders.length} phần`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting weekly summary:', error);
    bot.sendMessage(chatId, '❌ Lỗi khi lấy thống kê tuần!');
  }
});

// /monthly_summary command - Show monthly summary
bot.onText(/\/monthly_summary/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const { start, end } = getMonthRange();
    const orders = await Order.find({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (orders.length === 0) {
      bot.sendMessage(chatId, '📊 Chưa có ai đặt món trong tháng này!');
      return;
    }

    // Count dishes
    const dishCount = {};
    orders.forEach(order => {
      if (dishCount[order.dish]) {
        dishCount[order.dish]++;
      } else {
        dishCount[order.dish] = 1;
      }
    });

    // Format message
    let message = '📊 *Thống kê đặt món tháng này:*\n\n';
    Object.keys(dishCount).sort((a, b) => dishCount[b] - dishCount[a]).forEach(dish => {
      message += `🍽 *${dish}*: ${dishCount[dish]} phần\n`;
    });
    message += `\n📝 Tổng cộng: ${orders.length} phần`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting monthly summary:', error);
    bot.sendMessage(chatId, '❌ Lỗi khi lấy thống kê tháng!');
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
