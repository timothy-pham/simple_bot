require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./config/database');
const Menu = require('./models/Menu');
const Order = require('./models/Order');
const Photo = require('./models/Photo');
const GroupMember = require('./models/GroupMember');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const minioClient = require('./utils/minioClient');
const slugify = require('slugify');
const messages = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'messages.json'), 'utf8'));


// Connect to MongoDB
connectDB();

// Create bot instance
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// 1️⃣ Load file chứa từ cấm
const badWordsPath = path.join(process.cwd(), 'vn_offensive_words.txt');
const badWords = fs
  .readFileSync(badWordsPath, 'utf8')
  .split('\n')
  .map(line => line.trim().toLowerCase())
  .filter(line => line && !line.startsWith('#') && !line.startsWith('###'));


// 2️⃣ Hàm kiểm tra tin nhắn
function containsBadWord(message) {
  const normalized = message.toLowerCase().normalize('NFC');
  return badWords.some(word => normalized.includes(word));
}

// Helper function to get start and end of today
const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Helper function to escape Markdown special characters
const escapeMarkdown = (text) => {
  if (!text) return '';
  // Escape backslash first, then other special characters
  return text.replace(/\\/g, '\\\\').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
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
  const user = msg.from;

  if (!text) return;

  // Save group member info (for /tagall feature)
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    try {
      await GroupMember.findOneAndUpdate(
        { userId: msg.from.id.toString(), chatId: chatId.toString() },
        {
          username: msg.from.username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          lastSeen: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error saving group member:', error);
    }
  }

  // Check for auto-reply triggers (skip commands)
  if (!text.startsWith('/')) {
    const lowerText = text.toLowerCase();
    for (const [trigger, reply] of Object.entries(messages.autoReplies)) {
      if (lowerText.includes(trigger)) {
        bot.sendMessage(chatId, reply);
        break; // Only reply once per message
      }
    }
  }

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

      const matchedDish = menuItems.find(item => text.toLowerCase().includes(item.toLowerCase()));

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

// /menu command
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { start, end } = getTodayRange();
    const todayMenu = await Menu.findOne({
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (!todayMenu) {
      bot.sendMessage(chatId, '🍽 Dạ hôm nay chưa có thực đơn nào hết ạ!');
      return;
    }

    bot.sendMessage(chatId, `🍽 *Thực đơn hôm nay nè ạ:*\n\n${todayMenu.text}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting menu:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy thực đơn ạ!');
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
    `/menu - Xem thực đơn hôm nay 🍽\n` +
    `/summary - Thống kê hôm nay 🍱\n` +
    `/weeklySummary - Thống kê tuần 📆\n` +
    `/monthlySummary - Thống kê tháng 🗓️\n` +
    `/reset - Xoá đơn đặt món hôm nay 🧹\n` +
    `/savephoto <tên> - Lưu ảnh với tên chỉ định 📸\n` +
    `/getphoto <tên> - Lấy ảnh đã lưu với tên chỉ định 🔍\n` +
    `/allphoto - Xem tất cả tên ảnh của bạn 📸\n` +
    `/renamephoto <tên cũ> <tên mới> - Đổi tên ảnh đã lưu 🔄\n` +
    `/savechatimg <tên> - Lưu ảnh nhóm với tên chỉ định 📸\n` +
    `/getchatimg <tên> - Lấy ảnh nhóm đã lưu với tên chỉ định 🔍\n` +
    `/allchatimg - Xem tất cả tên ảnh của nhóm 📸\n` +
    `/renamechatimg <tên cũ> <tên mới> - Đổi tên ảnh nhóm 🔄\n\n` +
    `🎉 *Tính năng vui:* \n` +
    `/tagall - Mention toàn bộ thành viên nhóm 📢\n` +
    `/roast @user - Chửi vui 1 câu ngẫu nhiên 🤣\n` +
    `/lucky - Xem vận may hôm nay 🎰\n\n` +
    `💡 Mỗi người chỉ đặt được 1 món/ngày thôi ạ. Nếu đặt lại thì em sẽ tự cập nhật nha ♥️`;


  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

const waitingForPhoto = {}; // userId -> photoName
const waitingForChatImg = {}; // chatId -> photoName

// 💾 Command: /savephoto momo
bot.onText(/\/savephoto (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photoName = match[1].trim();

  waitingForPhoto[userId] = photoName;
  bot.sendMessage(chatId, `📸 Dạ ${msg.from.first_name} ơi, gửi ảnh *${photoName}* cho em nha ạ!`, {
    parse_mode: 'Markdown',
  });
});

// 💾 Command: /savechatimg momo
bot.onText(/\/savechatimg (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const photoName = match[1].trim();

  waitingForChatImg[chatId] = photoName;
  bot.sendMessage(chatId, `📸 Dạ nhóm ơi, gửi ảnh *${photoName}* cho em nha ạ!`, {
    parse_mode: 'Markdown',
  });
});

// 📷 Khi user gửi ảnh
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  let photoName;
  let isChatImg = false;

  if (waitingForChatImg[chatId]) {
    photoName = waitingForChatImg[chatId];
    delete waitingForChatImg[chatId];
    isChatImg = true;
  } else if (waitingForPhoto[userId]) {
    photoName = waitingForPhoto[userId];
    delete waitingForPhoto[userId];
  } else {
    return;
  }

  try {
    const photo = msg.photo[msg.photo.length - 1]; // ảnh độ phân giải cao nhất
    const fileId = photo.file_id;
    const fileLink = await bot.getFileLink(fileId);

    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const photoNameify = slugify(photoName, { lower: true });
    const minioPath = `${isChatImg ? 'chat_' + chatId : userId}_${photoNameify}_${Date.now()}.jpg`
    const metaData = {
      'Content-Type': mime.lookup(minioPath) || 'image/jpeg',
      'Content-Disposition': 'inline',
    };

    // Upload lên MinIO
    await minioClient.putObject('telebot', minioPath, buffer, metaData);

    // URL public
    const fileUrl = `https://${process.env.MINIO_ENDPOINT}/telebot/${minioPath}`;

    // Lưu DB
    const query = isChatImg ? { chatId: chatId.toString(), photoName } : { userId, photoName };
    const photoDoc = await Photo.findOneAndUpdate(
      query,
      { url: fileUrl },
      { new: true, upsert: true }
    );

    bot.sendMessage(chatId, `✅ Em đã lưu ảnh *${photoName}* thành công!\n`, {
      parse_mode: 'Markdown',
    });

    // console.log(`[Photo SAVED] ${isChatImg ? 'Chat ' + chatId : msg.from.first_name} → ${fileUrl}`);
  } catch (err) {
    console.error('Error saving photo:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu ảnh ạ!');
  }
});

// 🔍 Command: /getphoto momo
bot.onText(/\/getphoto (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photoName = match[1].trim();

  try {
    const photoDoc = await Photo.findOne({ userId, photoName });

    if (!photoDoc) {
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${photoName}* của ${msg.from.first_name} ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendPhoto(chatId, photoDoc.url, {
      caption: `📸*${photoName}*`,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error fetching photo:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy ảnh ạ!');
  }
});

// 🔍 Command: /getchatimg momo
bot.onText(/\/getchatimg (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const photoName = match[1].trim();

  try {
    const photoDoc = await Photo.findOne({ chatId: chatId.toString(), photoName });

    if (!photoDoc) {
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${photoName}* của nhóm ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendPhoto(chatId, photoDoc.url, {
      caption: `📸*${photoName}*`,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error fetching chat img:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy ảnh nhóm ạ!');
  }
});

// 🔄 Command: /renamephoto oldName newName
bot.onText(/\/renamephoto (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const oldName = match[1].trim();
  const newName = match[2].trim();

  try {
    const photoDoc = await Photo.findOneAndUpdate(
      { userId, photoName: oldName },
      { photoName: newName },
      { new: true }
    );

    if (!photoDoc) {
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${oldName}* của ${msg.from.first_name} để đổi tên ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendMessage(chatId, `✅ Dạ em đã đổi tên ảnh từ *${oldName}* thành *${newName}* rồi ạ!`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error renaming photo:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi đổi tên ảnh ạ!');
  }
});// 🔄 Command: /renamechatimg oldName newName
bot.onText(/\/renamechatimg (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const oldName = match[1].trim();
  const newName = match[2].trim();

  try {
    const photoDoc = await Photo.findOneAndUpdate(
      { chatId: chatId.toString(), photoName: oldName },
      { photoName: newName },
      { new: true }
    );

    if (!photoDoc) {
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${oldName}* của nhóm để đổi tên ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendMessage(chatId, `✅ Dạ em đã đổi tên ảnh nhóm từ *${oldName}* thành *${newName}* rồi ạ!`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error renaming chat img:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi đổi tên ảnh nhóm ạ!');
  }
});

// 🔍 Command: /allphoto
bot.onText(/\/allphoto/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const photos = await Photo.find({ userId });

    if (photos.length === 0) {
      bot.sendMessage(chatId, `📸 Dạ ${msg.from.first_name} ơi, em không thấy ảnh nào của bạn cả ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    const photoNames = photos.map(photo => photo.photoName).join(', ');
    bot.sendMessage(chatId, `📸 Dạ ${msg.from.first_name} ơi, đây là tất cả ảnh của bạn: *${photoNames}*`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error fetching all photos:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy danh sách ảnh ạ!');
  }
});

// 🔍 Command: /allchatimg
bot.onText(/\/allchatimg/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const photos = await Photo.find({ chatId: chatId.toString() });

    if (photos.length === 0) {
      bot.sendMessage(chatId, '📸 Dạ nhóm ơi, em không thấy ảnh nào của nhóm cả ạ!', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const photoNames = photos.map(photo => photo.photoName).join(', ');
    bot.sendMessage(chatId, `📸 Dạ nhóm ơi, đây là tất cả ảnh của nhóm: *${photoNames}*`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error fetching all chat imgs:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy danh sách ảnh nhóm ạ!');
  }
});

// /tagall command - Mention all group members
bot.onText(/\/tagall/, async (msg) => {
  const chatId = msg.chat.id;

  // Only work in groups
  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
    bot.sendMessage(chatId, '⚠️ Dạ lệnh này chỉ dùng trong nhóm thôi ạ!');
    return;
  }

  try {
    const members = await GroupMember.find({ chatId: chatId.toString() })
      .sort({ lastSeen: -1 })
      .limit(50);

    if (members.length === 0) {
      bot.sendMessage(chatId, '📋 Dạ em chưa thấy thành viên nào trong nhóm cả ạ!');
      return;
    }

    // Create mention string
    let mentions = '📢 *Gọi toàn bộ thành viên nè ạ:*\n\n';
    members.forEach(member => {
      const name = escapeMarkdown(member.firstName + (member.lastName ? ' ' + member.lastName : ''));
      mentions += `[${name}](tg://user?id=${member.userId}) `;
    });

    bot.sendMessage(chatId, mentions, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in /tagall:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi tag mọi người ạ!');
  }
});

// /roast command - Roast a user
bot.onText(/\/roast(?:\s+@?(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  let targetUsername = match[1];

  // If no username provided and it's a reply, roast the replied user
  if (!targetUsername && msg.reply_to_message) {
    const targetUser = msg.reply_to_message.from;
    targetUsername = targetUser.username || targetUser.first_name;
  } else if (!targetUsername) {
    // Roast the sender if no target specified
    targetUsername = msg.from.username || msg.from.first_name;
  }

  // Get random roast message
  const roast = messages.roasts[Math.floor(Math.random() * messages.roasts.length)];
  bot.sendMessage(chatId, `@${targetUsername} ${roast}`);
});

// /lucky command - Random fortune
bot.onText(/\/lucky/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name;

  // Get random lucky message and random percentage
  const luckyTemplate = messages.luckyMessages[Math.floor(Math.random() * messages.luckyMessages.length)];
  const percent = Math.floor(Math.random() * 100) + 1;
  const luckyMessage = luckyTemplate.replace('{percent}', percent);

  bot.sendMessage(chatId, `🎰 *${userName}:* ${luckyMessage}`, { parse_mode: 'Markdown' });
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Dạ Simple Bot đang chạy rồi ạ 🌸...');
