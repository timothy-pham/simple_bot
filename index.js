require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./config/database');
const Menu = require('./models/Menu');
const Order = require('./models/Order');
const Photo = require('./models/Photo');
const GroupMember = require('./models/GroupMember');
const AIContext = require('./models/AIContext');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const minioClient = require('./utils/minioClient');
const slugify = require('slugify');
const { GoogleGenAI } = require('@google/genai');
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
  .filter(line => line && !line.startsWith('#') && !line.startsWith('###'))
  .map(word => escapeRegex(word));

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsBadWord(message) {
  const normalized = message.toLowerCase().normalize('NFC');
  // Tạo regex ranh giới từ \b hoặc khoảng trắng
  const regex = new RegExp(`(^|\\s|\\W)(${badWords.join('|')})(?=$|\\s|\\W)`, 'i');
  return regex.test(normalized);
}

function getBadWordsInMessage(message) {
  const normalized = message.toLowerCase().normalize('NFC');
  const regex = new RegExp(`(^|\\s|\\W)(${badWords.join('|')})(?=$|\\s|\\W)`, 'gi');
  const matches = [...normalized.matchAll(regex)];
  return matches.map(m => m[2]);
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

// Helper function to normalize Vietnamese text for flexible matching
const normalizeVietnamese = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
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

  // Check for bad words
  if (containsBadWord(text)) {
    try {
      const badWordsInMessage = getBadWordsInMessage(text);
      // Thả cảm xúc phẫn nộ vào tin nhắn
      // await bot.setMessageReaction(chatId, msg.message_id, { reaction: [{ type: 'emoji', emoji: '😡' }] });


      // await bot.sendMessage(
      //   chatId,
      //   `🚫 <b>Cảnh báo</b>: Không nói bậy, chửi tục!!! Từ chửi bậy: ${badWordsInMessage.join(', ')}`,
      //   {
      //     parse_mode: 'HTML',
      //     reply_to_message_id: msg.message_id, // reply đúng tin nhắn đó
      //   }
      // );
      // ⏳ Ban user 1 phút
      // await bot.restrictChatMember(chatId, user.id, {
      //   can_send_messages: false,
      //   can_send_media_messages: false,
      //   can_send_polls: false,
      //   can_send_other_messages: false,
      //   until_date: Math.floor(Date.now() / 1000) + 60, // 1 phút
      // });


    } catch (err) {
      console.error('Lỗi khi ban user:', err.message);
    }
  }

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

  // Handle menu input (if waiting for menu)
  if (waitingForMenu[chatId] && !text.startsWith('/')) {
    delete waitingForMenu[chatId];

    try {
      // Parse menu items from the input
      // Expected format: "1. Cafe sữa - 15000\n2. Trà tắc - 18000"
      const lines = text.split('\n').filter(line => line.trim());
      const menuItems = [];

      for (const line of lines) {
        // Match format: "1. Cafe sữa - 15000" or "Cafe sữa - 15000"
        const match = line.match(/(?:\d+\.\s*)?(.+?)\s*-\s*(\d+)/);
        if (match) {
          const name = match[1].trim();
          const price = parseInt(match[2]);
          menuItems.push({ name, price });
        }
      }

      if (menuItems.length === 0) {
        bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, em không hiểu định dạng menu ạ! Vui lòng gửi theo mẫu:\n1. Cafe sữa - 15000\n2. Trà tắc - 18000');
        return;
      }

      // Save or update menu
      await Menu.findOneAndUpdate(
        { chatId: chatId.toString() },
        {
          items: menuItems,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      let confirmMsg = '🌸 Dạ em đã lưu menu rồi ạ! Menu hiện tại:\n\n';
      menuItems.forEach((item, idx) => {
        confirmMsg += `${idx + 1}. ${escapeMarkdown(item.name)} - ${item.price.toLocaleString('vi-VN')}đ\n`;
      });

      bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error saving menu:', error);
      bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu menu ạ!');
    }
    return;
  }

  // Thành viên đặt món
  if (!text.startsWith('/')) {
    try {
      const { start, end } = getTodayRange();
      const userId = msg.from.id.toString();
      const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');

      const menu = await Menu.findOne({
        chatId: chatId.toString()
      });

      if (!menu || menu.items.length === 0) return;

      // Normalize user input for flexible matching
      const normalizedInput = normalizeVietnamese(text);

      // Tìm món phù hợp — ưu tiên match đầy đủ hoặc có độ dài trùng lớn nhất
      let bestMatch = null;
      let bestMatchLength = 0;

      for (const item of menu.items) {
        const normalizedDish = normalizeVietnamese(item.name);

        // Exact match (toàn bộ tên món)
        if (normalizedInput === normalizedDish) {
          bestMatch = item;
          break;
        }

        // Nếu không exact thì ưu tiên món nào có độ trùng dài hơn
        if (normalizedInput.includes(normalizedDish) && normalizedDish.length > bestMatchLength) {
          bestMatch = item;
          bestMatchLength = normalizedDish.length;
        }
      }

      if (!bestMatch) return;

      const existingOrder = await Order.findOne({
        userId: userId,
        chatId: chatId.toString(),
        date: { $gte: start, $lte: end }
      });

      if (existingOrder) {
        existingOrder.dish = bestMatch.name;
        existingOrder.createdAt = new Date();
        await existingOrder.save();
        bot.sendMessage(
          chatId,
          `🍱 Dạ ${escapeMarkdown(userName)} ơi, em đã *cập nhật* món mới là: ${escapeMarkdown(bestMatch.name)} nha ạ ♥️`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const order = new Order({
          userId: userId,
          userName: userName,
          chatId: chatId.toString(),
          dish: bestMatch.name,
          date: new Date()
        });
        await order.save();
        bot.sendMessage(
          chatId,
          `🍱 Dạ ${escapeMarkdown(userName)} đã đặt món *${escapeMarkdown(bestMatch.name)}* thành công rồi ạ ♥️`,
          { parse_mode: 'Markdown' }
        );
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
      message += `🍽 *${escapeMarkdown(dish)}*: ${dishCount[dish].count} phần\n`;
      message += `   └ ${dishCount[dish].users.map(u => escapeMarkdown(u)).join(', ')}\n\n`;
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

// /cancel command
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');

  try {
    const { start, end } = getTodayRange();
    const result = await Order.deleteOne({
      userId: userId,
      chatId: chatId.toString(),
      date: { $gte: start, $lte: end }
    });

    if (result.deletedCount > 0) {
      bot.sendMessage(chatId, `🗑️ Dạ ${userName} ơi, em đã hủy món của bạn hôm nay rồi ạ!`);
    } else {
      bot.sendMessage(chatId, `❌ Dạ ${userName} ơi, em không thấy bạn đặt món hôm nay để hủy ạ!`);
    }
  } catch (error) {
    console.error('Error canceling order:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi hủy món ạ!');
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
      message += `🍽 *${escapeMarkdown(dish)}*: ${dishCount[dish]} phần\n`;
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
      message += `🍽 *${escapeMarkdown(dish)}*: ${dishCount[dish]} phần\n`;
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
    const menu = await Menu.findOne({
      chatId: chatId.toString()
    });

    if (!menu || menu.items.length === 0) {
      bot.sendMessage(chatId, '🍽 Dạ chưa có thực đơn nào hết ạ! Dùng /savemenu để tạo menu nha ạ!');
      return;
    }

    let menuText = '🍽 *Thực đơn hiện tại nè ạ:*\n\n';
    menu.items.forEach((item, idx) => {
      menuText += `${idx + 1}. ${escapeMarkdown(item.name)} - ${item.price.toLocaleString('vi-VN')}đ\n`;
    });

    bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting menu:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy thực đơn ạ!');
  }
});

// /savemenu command
bot.onText(/\/savemenu/, async (msg) => {
  const chatId = msg.chat.id;

  waitingForMenu[chatId] = true;
  bot.sendMessage(chatId, '📝 Hãy gửi cho em menu ạ!\n\nVí dụ:\n1. Cafe sữa - 15000\n2. Trà tắc - 18000');
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
    `Chỉ cần gửi tên món ăn có trong menu thôi ạ.\n` +
    `Ví dụ: "Cafe sữa", "Cho 1 trà tắc", "tra tac"...\n\n` +
    `👩‍🍳 *Admin lưu menu:* \n` +
    `Dùng lệnh /savemenu, sau đó gửi menu theo định dạng:\n` +
    `1. Cafe sữa - 15000\n` +
    `2. Trà tắc - 18000\n` +
    `Menu sẽ được lưu vĩnh viễn cho đến khi cập nhật lại nha ạ.\n\n` +
    `💬 *Các lệnh hỗ trợ:* \n` +
    `/start - Bắt đầu làm quen với em nè 💖\n` +
    `/help - Xem lại hướng dẫn sử dụng 📖\n` +
    `/savemenu - Lưu/cập nhật menu 📝\n` +
    `/menu - Xem menu hiện tại 🍽\n` +
    `/summary - Thống kê hôm nay 🍱\n` +
    `/weeklySummary - Thống kê tuần 📆\n` +
    `/monthlySummary - Thống kê tháng 🗓️\n` +
    `/reset - Xoá đơn đặt món hôm nay 🧹\n` +
    `/cancel - Hủy món đã đặt hôm nay 🗑️\n` +
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
    `🤖 *Tính năng AI:* \n` +
    `/ai <question> - Hỏi AI 🤖\n` +
    `/prompt <yêu cầu> - Cập nhật currentContext bằng Gemini 📝\n` +
    `/setrawcontext <raw context> - Đặt rawContext 📝\n` +
    `/getcontext - Xem context hiện tại 🔍\n\n` +
    `💡 Mỗi người chỉ đặt được 1 món/ngày thôi ạ. Nếu đặt lại thì em sẽ tự cập nhật nha ♥️`;


  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

const waitingForPhoto = {}; // userId -> photoName
const waitingForChatImg = {}; // chatId -> photoName
const waitingForMenu = {}; // chatId -> true (waiting for menu input)

// 💾 Command: /savephoto momo
bot.onText(/\/savephoto (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photoName = match[1].trim();

  waitingForPhoto[userId] = photoName;
  bot.sendMessage(chatId, `📸 Dạ ${escapeMarkdown(msg.from.first_name)} ơi, gửi ảnh *${escapeMarkdown(photoName)}* cho em nha ạ!`, {
    parse_mode: 'Markdown',
  });
});

// 💾 Command: /savechatimg momo
bot.onText(/\/savechatimg (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const photoName = match[1].trim();

  waitingForChatImg[chatId] = photoName;
  bot.sendMessage(chatId, `📸 Dạ nhóm ơi, gửi ảnh *${escapeMarkdown(photoName)}* cho em nha ạ!`, {
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
      { url: fileUrl, type: 'photo' },
      { new: true, upsert: true }
    );

    bot.sendMessage(chatId, `✅ Em đã lưu ảnh *${escapeMarkdown(photoName)}* thành công!\n`, {
      parse_mode: 'Markdown',
    });

    // console.log(`[Photo SAVED] ${isChatImg ? 'Chat ' + chatId : msg.from.first_name} → ${fileUrl}`);
  } catch (err) {
    console.error('Error saving photo:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu ảnh ạ!');
  }
});

// 📹 Khi user gửi video (hỗ trợ cho /savechatimg)
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  let videoName;
  let isChatImg = false;

  if (waitingForChatImg[chatId]) {
    videoName = waitingForChatImg[chatId];
    delete waitingForChatImg[chatId];
    isChatImg = true;
  } else {
    return;
  }

  try {
    const video = msg.video;
    const fileId = video.file_id;
    const fileLink = await bot.getFileLink(fileId);

    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    const videoNameify = slugify(videoName, { lower: true });
    const minioPath = `${isChatImg ? 'chat_' + chatId : userId}_${videoNameify}_${Date.now()}.mp4`;
    const metaData = {
      'Content-Type': mime.lookup(minioPath) || 'video/mp4',
      'Content-Disposition': 'inline',
    };

    // Upload lên MinIO
    await minioClient.putObject('telebot', minioPath, buffer, metaData);

    // URL public
    const fileUrl = `https://${process.env.MINIO_ENDPOINT}/telebot/${minioPath}`;

    // Lưu DB (loại video)
    const query = { chatId: chatId.toString(), photoName: videoName };
    const photoDoc = await Photo.findOneAndUpdate(
      query,
      { url: fileUrl, type: 'video' },
      { new: true, upsert: true }
    );

    bot.sendMessage(chatId, `✅ Em đã lưu video *${escapeMarkdown(videoName)}* thành công!
`, {
      parse_mode: 'Markdown',
    });

  } catch (err) {
    console.error('Error saving video:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu video ạ!');
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
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(photoName)}* của ${escapeMarkdown(msg.from.first_name)} ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendPhoto(chatId, photoDoc.url, {
      caption: `📸*${escapeMarkdown(photoName)}*`,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Error fetching photo:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy ảnh ạ!');
  }
});

// If user runs "/getchatimg" without args, show suggestions as inline buttons
// Match `/getchatimg`, `/getchatimg@BotName`, and allow trailing spaces
bot.onText(/\/getchatimg(?:@[\w_]+)?\s*$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const photos = await Photo.find({ chatId: chatId.toString() });

    if (photos.length === 0) {
      bot.sendMessage(chatId, '📸 Dạ nhóm ơi, em không thấy ảnh nào của nhóm cả ạ!');
      return;
    }

    // Build inline keyboard with pagination (page size = 20)
    const PAGE_SIZE = 20;
    const page = 1;
    const pagePhotos = photos.slice(0, PAGE_SIZE);
    const buttons = pagePhotos.map(photo => ([{ text: photo.photoName, callback_data: `getchatimg:${photo.photoName}` }]));
    if (photos.length > PAGE_SIZE) buttons.push([{ text: 'Xem thêm...', callback_data: `getchatimg:__page:2` }]);

    bot.sendMessage(chatId, '📸 Chọn ảnh nhóm để lấy:', {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (err) {
    console.error('Error showing chat img suggestions:', err);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy danh sách ảnh nhóm ạ!');
  }
});

// Handle callback when user taps suggested photo buttons
bot.on('callback_query', async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    if (!data || !data.startsWith('getchatimg:')) return;
    const parts = data.split(':');
    const chatId = callbackQuery.message.chat.id;

    // Pagination handler: get next/prev page and edit the inline keyboard
    if (parts[1] === '__page') {
      const requestedPage = parseInt(parts[2], 10) || 1;
      const photos = await Photo.find({ chatId: chatId.toString() });
      const PAGE_SIZE = 20;
      const totalPages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
      const page = Math.min(Math.max(1, requestedPage), totalPages);
      const start = (page - 1) * PAGE_SIZE;
      const pagePhotos = photos.slice(start, start + PAGE_SIZE);

      const buttons = pagePhotos.map(photo => ([{ text: photo.photoName, callback_data: `getchatimg:${photo.photoName}` }]));

      // Navigation row
      const nav = [];
      if (page > 1) nav.push({ text: '« Trước', callback_data: `getchatimg:__page:${page - 1}` });
      if (page < totalPages) nav.push({ text: 'Sau »', callback_data: `getchatimg:__page:${page + 1}` });
      if (nav.length) buttons.push(nav);

      try {
        await bot.editMessageReplyMarkup({ inline_keyboard: buttons }, { chat_id: chatId, message_id: callbackQuery.message.message_id });
      } catch (err) {
        // Fallback: send a new message if editing fails
        await bot.sendMessage(chatId, '📸 Chọn ảnh nhóm để lấy:', { reply_markup: { inline_keyboard: buttons } });
      }

      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }

    const photoName = parts.slice(1).join(':');
    const photoDoc = await Photo.findOne({ chatId: chatId.toString(), photoName });
    if (!photoDoc) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Không tìm thấy ảnh' });
      return;
    }

    if (photoDoc.type === 'video') {
      await bot.sendVideo(chatId, photoDoc.url, { caption: `📹*${escapeMarkdown(photoName)}*`, parse_mode: 'Markdown' });
    } else {
      await bot.sendPhoto(chatId, photoDoc.url, { caption: `📸*${escapeMarkdown(photoName)}*`, parse_mode: 'Markdown' });
    }

    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (err) {
    console.error('Error handling callback_query:', err);
  }
});

// 🔍 Command: /getchatimg momo
bot.onText(/\/getchatimg (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const photoName = match[1].trim();

  try {
    const photoDoc = await Photo.findOne({ chatId: chatId.toString(), photoName });

    if (!photoDoc) {
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(photoName)}* của nhóm ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    if (photoDoc.type === 'video') {
      bot.sendVideo(chatId, photoDoc.url, {
        caption: `📹*${escapeMarkdown(photoName)}*`,
        parse_mode: 'Markdown',
      });
    } else {
      bot.sendPhoto(chatId, photoDoc.url, {
        caption: `📸*${escapeMarkdown(photoName)}*`,
        parse_mode: 'Markdown',
      });
    }
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
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(oldName)}* của ${escapeMarkdown(msg.from.first_name)} để đổi tên ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendMessage(chatId, `✅ Dạ em đã đổi tên ảnh từ *${escapeMarkdown(oldName)}* thành *${escapeMarkdown(newName)}* rồi ạ!`, {
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
      bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(oldName)}* của nhóm để đổi tên ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    bot.sendMessage(chatId, `✅ Dạ em đã đổi tên ảnh nhóm từ *${escapeMarkdown(oldName)}* thành *${escapeMarkdown(newName)}* rồi ạ!`, {
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
      bot.sendMessage(chatId, `📸 Dạ ${escapeMarkdown(msg.from.first_name)} ơi, em không thấy ảnh nào của bạn cả ạ!`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    const photoNames = photos.map(photo => escapeMarkdown(photo.photoName)).join(', ');
    bot.sendMessage(chatId, `📸 Dạ ${escapeMarkdown(msg.from.first_name)} ơi, đây là tất cả ảnh của bạn: *${photoNames}*`, {
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

    const photoNames = photos.map(photo => escapeMarkdown(photo.photoName)).join(', ');
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

  bot.sendMessage(chatId, `🎰 *${escapeMarkdown(userName)}:* ${luckyMessage}`, { parse_mode: 'Markdown' });
});

// /prompt command - Update currentContext using Gemini
bot.onText(/\/prompt (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userPrompt = match[1];

  try {
    let contextDoc = await AIContext.findOne({ chatId: chatId.toString() });
    if (!contextDoc) {
      bot.sendMessage(chatId, 'Chưa có context, dùng /setrawcontext để tạo trước!');
      return;
    }

    const currentContext = contextDoc.currentContext || contextDoc.rawContext;

    const geminiPrompt = `
Context hiện tại:
${currentContext}
Yêu cầu cập nhật: ${userPrompt}
Người yêu cầu: ${msg.from.first_name} ${msg.from.last_name || ''}
Chỉ đổi liên quan tới người khác, không được đổi về bản thân. Nếu yêu cầu có liên quan đến bản thân (người yêu cầu), trả về chính xác đoạn text 'Mày không được đổi nội dung về bản thân đâu nhé'
Nếu hợp lệ trả về chính xác nội dung context mới đã được cập nhật dựa trên yêu cầu, giữ lại phần hợp lý từ context cũ. Không thêm bớt từ ngữ nào khác. Giữ lại cả phần mô tả hoàn cảnh nếu có.
VD:
Context cũ:
Bạn đang nhập vai AI trong group "Tổ rắn độc"
Các nhân vật trong group (có thể nhắc đến khi phù hợp, theo kiểu bạn bè thân thiết cà khịa nhau)
- Minh C: BA NNS, bắn pubg ngu, hay bị chị H chửi.
- Minh D: Dev Fullstack, trùm đánh cầu lông.

Yêu cầu: "Hãy thêm thành viên mới tên Tuấn Anh, là Dev AI, thích chơi game và đọc sách."

Trả lời chính xác, không thêm bớt từ ngữ nào khác ngoài phần context mới:
Bạn đang nhập vai AI trong group "Tổ rắn độc"
Các nhân vật trong group (có thể nhắc đến khi phù hợp, theo kiểu bạn bè thân thiết cà khịa nhau)
- Minh C: BA NNS, bắn pubg ngu, hay bị chị H chửi.
- Minh D: Dev Fullstack, trùm đánh cầu lông.
- Tuấn Anh: Dev AI, thích chơi game và đọc sách.
`;

    const aiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: geminiPrompt,
    });

    const newContext = aiResponse.text.trim();

    if (newContext === 'Mày không được đổi nội dung về bản thân đâu nhé') {
      // Không đổi gì
      bot.sendMessage(chatId, 'Yêu cầu của bạn liên quan đến bản thân, context không được thay đổi!');
    } else {
      contextDoc.currentContext = newContext;
      await contextDoc.save();
      bot.sendMessage(chatId, 'Context đã được cập nhật!');
      // send log to chatId = 1644321884
      bot.sendMessage(1644321884, `[Prompt]\n${geminiPrompt}\n\n[Response]\n${JSON.stringify(aiResponse, null, 2)}`);
    }


  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, 'Lỗi khi cập nhật context!');
  }
});

// /setrawcontext command - Set rawContext
bot.onText(/\/setrawcontext (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const newRawContext = match[1];

  try {
    let contextDoc = await AIContext.findOne({ chatId: chatId.toString() });
    if (!contextDoc) {
      contextDoc = new AIContext({
        chatId: chatId.toString(),
        rawContext: newRawContext,
        currentContext: newRawContext,
      });
    } else {
      contextDoc.rawContext = newRawContext;
    }
    await contextDoc.save();
    bot.sendMessage(chatId, 'Raw context đã được cập nhật!');
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, 'Lỗi khi cập nhật raw context!');
  }
});

// /getcontext command - Get current context
bot.onText(/\/getcontext/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const contextDoc = await AIContext.findOne({ chatId: chatId.toString() });
    if (!contextDoc) {
      bot.sendMessage(chatId, 'Chưa có context!');
      return;
    }

    const currentContext = contextDoc.currentContext || contextDoc.rawContext;
    bot.sendMessage(chatId, 'Context hiện tại:\n\n' + currentContext);
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, 'Lỗi khi lấy context!');
  }
});

const ai = new GoogleGenAI({
  GEMINI_API_KEY: process.env.GOOGLE_API_KEY,
});

bot.onText(/\/ai (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');

  try {
    const contextDoc = await AIContext.findOne({ chatId: chatId.toString() });
    if (!contextDoc) {
      bot.sendMessage(chatId, 'Chưa có context, dùng /prompt để tạo!');
      return;
    }

    let context = contextDoc.currentContext || contextDoc.rawContext;

    let prompt = `
${context}

from: ${userName}
question: ${match[1]}
answer like close friends, short and real-life conversation style.`
    //`answer with rude tone and swear like close friends, short and real-life conversation style.`;

    const aiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let responseText = aiResponse.text;

    if (responseText.startsWith('/prompt ')) {
      const userPrompt = responseText.substring(8).trim();
      const geminiPrompt = `
Context hiện tại:
${context}

Yêu cầu cập nhật: ${userPrompt}

Hãy trả về context mới đã được cập nhật dựa trên yêu cầu, giữ lại phần hợp lý từ context cũ.
`;

      const updateResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: geminiPrompt,
      });

      const newContext = updateResponse.text.trim();
      await AIContext.findOneAndUpdate({ chatId: chatId.toString() }, { currentContext: newContext }, { upsert: true });
      responseText = 'Context đã được cập nhật bởi AI!';
    } else if (responseText === 'bạn không được đổi nội dung về bản thân đâu nhé') {
      // Không đổi gì
    }

    // send log to chatId = 1644321884
    bot.sendMessage(1644321884, `[AI Prompt]\n${prompt}\n\n[AI Response]\n${JSON.stringify(aiResponse, null, 2)}`);
    bot.sendMessage(chatId, responseText, {
      reply_to_message_id: msg.message_id,
    });
  } catch (error) {
    console.error('Error getting AI response:', error);
    bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy phản hồi từ AI ạ!');
    bot.sendMessage(1644321884, `[AI Prompt_ERROR]\n${prompt}\n\n[AI Response]\n${JSON.stringify(error, null, 2)}`);
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Dạ Simple Bot đang chạy rồi ạ 🌸...');
