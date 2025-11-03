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

// Helper function to count dishes from orders
const countDishes = (orders) => {
  const dishCount = {};
  orders.forEach(order => {
    if (dishCount[order.dish]) {
      dishCount[order.dish]++;
    } else {
      dishCount[order.dish] = 1;
    }
  });
  return dishCount;
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

      // Lấy thực đơn hôm nay trong group
      const todayMenu = await Menu.findOne({
        chatId: chatId.toString(),
        date: { $gte: start, $lte: end }
      });

      if (!todayMenu) {
        // bot.sendMessage(chatId, '⚠️ Chưa có thực đơn hôm nay, không thể đặt món!');
        return;
      }

      // Tách danh sách món từ thực đơn (lọc ra từng dòng có tên món)
      const menuItems = todayMenu.text
        .split('\n')
        .map(line => line.replace(/^[-•]\s*/, '').trim()) // bỏ ký hiệu đầu dòng
        .filter(line => line && !line.toLowerCase().includes('thực đơn')); // bỏ dòng tiêu đề

      // Kiểm tra món có trong menu không (so sánh không phân biệt hoa thường)
      const matchedDish = menuItems.find(item => item.toLowerCase() === text.toLowerCase());

      if (!matchedDish) {
        // bot.sendMessage(chatId, '❌ Món này không có trong thực đơn hôm nay!');
        return;
      }

      // Check if user already has an order today
      const existingOrder = await Order.findOne({
        userId: userId,
        chatId: chatId.toString(),
        date: { $gte: start, $lte: end }
      });

      if (existingOrder) {
        existingOrder.dish = matchedDish;
        existingOrder.createdAt = new Date();
        await existingOrder.save();
        bot.sendMessage(chatId, `✅ ${userName} đã cập nhật đặt món: ${matchedDish}`);
      } else {
        const order = new Order({
          userId: userId,
          userName: userName,
          chatId: chatId.toString(),
          dish: matchedDish,
          date: new Date()
        });
        await order.save();
        bot.sendMessage(chatId, `✅ ${userName} đã đặt món: ${matchedDish}`);
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

// /weeklySummary command - Show weekly summary
bot.onText(/\/weeklySummary/, async (msg) => {
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

    // Count dishes using helper function
    const dishCount = countDishes(orders);

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

// /monthlySummary command - Show monthly summary
bot.onText(/\/monthlySummary/, async (msg) => {
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

    // Count dishes using helper function
    const dishCount = countDishes(orders);

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

// /start command - Welcome message
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;

  const welcomeMessage = `Xin chào ${userName}! 👋\n\n` +
    `🤖 Bot đặt món ăn của nhóm\n\n` +
    `Sử dụng /help để xem hướng dẫn sử dụng.`;

  bot.sendMessage(chatId, welcomeMessage);
});

// /help command - Show help message
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;

  const helpMessage = `📖 *Hướng dẫn sử dụng bot*\n\n` +
    `*Đặt món:*\n` +
    `Để đặt món, chỉ cần gửi tên món ăn (phải có trong thực đơn hôm nay)\n` +
    `Ví dụ: Cơm gà\n\n` +
    `*Admin đăng thực đơn:*\n` +
    `Em gửi thực đơn hôm nay...\n` +
    `- Món 1\n` +
    `- Món 2\n` +
    `- Món 3\n\n` +
    `*Các lệnh:*\n` +
    `/start - Bắt đầu sử dụng bot\n` +
    `/help - Hiển thị trợ giúp\n` +
    `/summary - Xem thống kê đặt món hôm nay\n` +
    `/weeklySummary - Xem thống kê tuần này\n` +
    `/monthlySummary - Xem thống kê tháng này\n` +
    `/reset - Xóa tất cả đơn đặt món hôm nay\n\n` +
    `💡 Mỗi người chỉ đặt được 1 món/ngày. Đặt món mới sẽ cập nhật món cũ.`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');
