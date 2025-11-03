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
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
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

// Helper function to count dishes
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

// Listen for messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  // Admin gửi menu
  if (text.toLowerCase().startsWith('em gửi thực đơn hôm nay')) {
    try {
      const menu = new Menu({
        text: text,
        chatId: chatId.toString()
      });
      await menu.save();
      bot.sendMessage(chatId, '🌸 Dạ em đã lưu thực đơn hôm nay rồi ạ!');
    } catch (error) {
      console.error('Error saving menu:', error);
      bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu thực đơn ạ!');
    }
  }

  // Thành viên đặt món
  else if (!text.startsWith('/')) {
    try {
      const { start, end } = getTodayRange();
      const userId = msg.from.id.toString();
      const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');

      const todayMenu = await Menu.findOne({
        chatId: chatId.toString(),
        date: { $gte: start, $lte: end }
      });

      if (!todayMenu) return;

      const menuItems = todayMenu.text
        .split('\n')
        .map(line => line.replace(/^[-•]\s*/, '').trim())
        .filter(line => line && !line.toLowerCase().includes('thực đơn'));

      const matchedDish = menuItems.find(item => item.toLowerCase() === text.toLowerCase());

      if (!matchedDish) return;

      const existingOrder = await Order.findOne({
        userId: userId,
        chatId: chatId.toString(),
        date: { $gte: start, $lte: end }
      });

      if (existingOrder) {
        existingOrder.dish = matchedDish;
        existingOrder.createdAt = new Date();
        await existingOrder.save();
        bot.sendMessage(chatId, `🍱 Dạ ${userName} ơi, em đã *cập nhật* món mới là: ${matchedDish} nha ạ ♥️`, { parse_mode: 'Markdown' });
      } else {
        const order = new Order({
          userId: userId,
          userName: userName,
          chatId: chatId.toString(),
          dish: matchedDish,
          date: new Date()
        });
        await order.save();
        bot.sendMessage(chatId, `🍱 Dạ ${userName} đã đặt món *${matchedDish}* thành công rồi ạ ♥️`, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error('Error saving order:', error);
      bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu đơn đặt món ạ!');
    }
  }
});

// /summary command
bot.onText(/\/summary/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { start, end } = getTodayRange();
    const orders = await Order.find({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (orders.length === 0) {
      bot.sendMessage(chatId, '📊 Dạ hôm nay chưa có ai đặt món hết ạ!');
      return;
    }

    const dishCount = {};
    orders.forEach(order => {
      if (dishCount[order.dish]) {
        dishCount[order.dish].count++;
        dishCount[order.dish].users.push(order.userName);
      } else {
        dishCount[order.dish] = { count: 1, users: [order.userName] };
      }
    });

    let message = '📊 *Thống kê đặt món hôm nay nè ạ:*\n\n';
    Object.keys(dishCount).forEach(dish => {
      message += `🍽 *${dish}*: ${dishCount[dish].count} phần\n`;
      message += `   └ ${dishCount[dish].users.join(', ')}\n\n`;
    });
    message += `📝 Tổng cộng: ${orders.length} phần`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting summary:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, em bị lỗi khi xem thống kê ạ!');
  }
});

// /reset command
bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { start, end } = getTodayRange();
    const result = await Order.deleteMany({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    bot.sendMessage(chatId, `🧹 Dạ em đã xoá ${result.deletedCount} đơn đặt món hôm nay rồi ạ!`);
  } catch (error) {
    console.error('Error resetting orders:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi xoá đơn ạ!');
  }
});

// /weeklySummary command
bot.onText(/\/weeklySummary/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { start, end } = getWeekRange();
    const orders = await Order.find({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (orders.length === 0) {
      bot.sendMessage(chatId, '📊 Dạ tuần này chưa ai đặt món hết ạ!');
      return;
    }

    const dishCount = countDishes(orders);
    let message = '📊 *Thống kê đặt món tuần này nè ạ:*\n\n';
    Object.keys(dishCount).sort((a, b) => dishCount[b] - dishCount[a]).forEach(dish => {
      message += `🍽 *${dish}*: ${dishCount[dish]} phần\n`;
    });
    message += `\n📝 Tổng cộng: ${orders.length} phần`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting weekly summary:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, lỗi khi lấy thống kê tuần ạ!');
  }
});

// /monthlySummary command
bot.onText(/\/monthlySummary/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { start, end } = getMonthRange();
    const orders = await Order.find({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (orders.length === 0) {
      bot.sendMessage(chatId, '📊 Dạ tháng này chưa ai đặt món hết ạ!');
      return;
    }

    const dishCount = countDishes(orders);
    let message = '📊 *Thống kê đặt món tháng này nè ạ:*\n\n';
    Object.keys(dishCount).sort((a, b) => dishCount[b] - dishCount[a]).forEach(dish => {
      message += `🍽 *${dish}*: ${dishCount[dish]} phần\n`;
    });
    message += `\n📝 Tổng cộng: ${orders.length} phần`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting monthly summary:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, lỗi khi lấy thống kê tháng ạ!');
  }
});

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;

  const welcomeMessage = `Dạ em chào ${userName}! ạ ♥️\n\n` +
    `Em là nhân viên đặt món ăn của nhóm mình ạ 🍱\n\n` +
    `Nếu ${userName} cần hỗ trợ, mình có thể gõ /help để xem hướng dẫn chi tiết nha ạ 🌸`;

  bot.sendMessage(chatId, welcomeMessage);
});

// /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  const helpMessage =
    `📖 *Hướng dẫn sử dụng bot đặt món dễ thương nè ạ:*\n\n` +
    `🍚 *Đặt món:*\n` +
    `Chỉ cần gửi tên món ăn có trong thực đơn hôm nay thôi ạ.\n` +
    `Ví dụ: Cơm gà, Phở bò...\n\n` +
    `👩‍🍳 *Admin đăng thực đơn:* \n` +
    `Soạn tin: "Em gửi thực đơn hôm nay..." kèm danh sách món nha ạ.\n` +
    `- Món 1\n- Món 2\n- Món 3\n\n` +
    `💬 *Các lệnh hỗ trợ:* \n` +
    `/start - Bắt đầu làm quen với em nè 💖\n` +
    `/help - Xem lại hướng dẫn sử dụng 📖\n` +
    `/summary - Thống kê hôm nay 🍱\n` +
    `/weeklySummary - Thống kê tuần 📆\n` +
    `/monthlySummary - Thống kê tháng 🗓️\n` +
    `/reset - Xoá đơn đặt món hôm nay 🧹\n\n` +
    `💡 Mỗi người chỉ đặt được 1 món/ngày thôi ạ. Nếu đặt lại thì em sẽ tự cập nhật nha ♥️`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Dạ bot đặt món đang chạy rồi ạ 🌸...');
