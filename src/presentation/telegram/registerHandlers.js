const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const slugify = require('slugify');
const { UNSUPPORTED_FEATURE_MESSAGE } = require('../../common/constants');
const { getTodayRange, getWeekRange, getMonthRange } = require('../../common/utils/date');
const { escapeMarkdown, normalizeVietnamese, escapeRegex } = require('../../common/utils/text');

const countDishes = (orders) => {
  const dishCount = {};
  orders.forEach((order) => {
    dishCount[order.dish] = (dishCount[order.dish] || 0) + 1;
  });
  return dishCount;
};

const createBadWordDetector = () => {
  const badWordsPath = path.join(process.cwd(), 'vn_offensive_words.txt');
  const badWords = fs
    .readFileSync(badWordsPath, 'utf8')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('###'))
    .map((word) => escapeRegex(word));

  const getRegex = (flags) =>
    new RegExp(`(^|\\s|\\W)(${badWords.join('|')})(?=$|\\s|\\W)`, flags);

  return {
    containsBadWord(message) {
      return getRegex('i').test(message.toLowerCase().normalize('NFC'));
    },
    getBadWordsInMessage(message) {
      return [...message.toLowerCase().normalize('NFC').matchAll(getRegex('gi'))].map((m) => m[2]);
    },
  };
};

const registerHandlers = (bot, container) => {
  const { repositories, providers, messages, config } = container;
  const {
    menuRepository,
    orderRepository,
    photoRepository,
    groupMemberRepository,
    aiContextRepository,
  } = repositories;
  const { mediaProvider, aiClient } = providers;
  const waitingForPhoto = {};
  const waitingForChatImg = {};
  const waitingForMenu = {};
  const badWordDetector = createBadWordDetector();

  const sendUnsupported = (chatId) => bot.sendMessage(chatId, UNSUPPORTED_FEATURE_MESSAGE);

  const sendAdminLog = async (message) => {
    if (!config.adminChatId) return;
    try {
      await bot.sendMessage(config.adminChatId, message);
    } catch (error) {
      console.error('Failed to send admin log:', error.message);
    }
  };

  const isMediaSupported = () => mediaProvider.isSupported();
  const isAiSupported = () => Boolean(aiClient);

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = msg.from;

    if (!text) return;

    if (badWordDetector.containsBadWord(text)) {
      try {
        badWordDetector.getBadWordsInMessage(text);
      } catch (error) {
        console.error('Lỗi khi xử lý từ cấm:', error.message);
      }
    }

    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
      try {
        await groupMemberRepository.saveMember({
          userId: msg.from.id.toString(),
          chatId: chatId.toString(),
          username: msg.from.username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          lastSeen: new Date(),
        });
      } catch (error) {
        console.error('Error saving group member:', error.message);
      }
    }

    if (!text.startsWith('/')) {
      const lowerText = text.toLowerCase();
      for (const [trigger, reply] of Object.entries(messages.autoReplies)) {
        if (lowerText.includes(trigger)) {
          await bot.sendMessage(chatId, reply);
          break;
        }
      }
    }

    if (waitingForMenu[chatId] && !text.startsWith('/')) {
      delete waitingForMenu[chatId];

      try {
        const lines = text.split('\n').filter((line) => line.trim());
        const menuItems = [];

        for (const line of lines) {
          const match = line.match(/(?:\d+\.\s*)?(.+?)\s*-\s*(\d+)/);
          if (match) {
            menuItems.push({ name: match[1].trim(), price: parseInt(match[2], 10) });
          }
        }

        if (menuItems.length === 0) {
          await bot.sendMessage(
            chatId,
            '⚠️ Dạ em xin lỗi, em không hiểu định dạng menu ạ! Vui lòng gửi theo mẫu:\n1. Cafe sữa - 15000\n2. Trà tắc - 18000'
          );
          return;
        }

        await menuRepository.save(chatId.toString(), menuItems);

        let confirmMsg = '🌸 Dạ em đã lưu menu rồi ạ! Menu hiện tại:\n\n';
        menuItems.forEach((item, idx) => {
          confirmMsg += `${idx + 1}. ${escapeMarkdown(item.name)} - ${item.price.toLocaleString('vi-VN')}đ\n`;
        });

        await bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error saving menu:', error.message);
        await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu menu ạ!');
      }
      return;
    }

    if (!text.startsWith('/')) {
      try {
        const userId = msg.from.id.toString();
        const userName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '');
        const menu = await menuRepository.findByChatId(chatId.toString());

        if (!menu || !menu.items || menu.items.length === 0) return;

        const normalizedInput = normalizeVietnamese(text);
        let bestMatch = null;
        let bestMatchLength = 0;

        for (const item of menu.items) {
          const normalizedDish = normalizeVietnamese(item.name);
          if (normalizedInput === normalizedDish) {
            bestMatch = item;
            break;
          }

          if (normalizedInput.includes(normalizedDish) && normalizedDish.length > bestMatchLength) {
            bestMatch = item;
            bestMatchLength = normalizedDish.length;
          }
        }

        if (!bestMatch) return;

        const { isUpdate } = await orderRepository.upsertDailyOrder({
          userId,
          userName,
          chatId: chatId.toString(),
          dish: bestMatch.name,
          date: new Date(),
        });

        if (isUpdate) {
          await bot.sendMessage(
            chatId,
            `🍱 Dạ ${escapeMarkdown(userName)} ơi, em đã *cập nhật* món mới là: ${escapeMarkdown(bestMatch.name)} nha ạ ♥️`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await bot.sendMessage(
            chatId,
            `🍱 Dạ ${escapeMarkdown(userName)} đã đặt món *${escapeMarkdown(bestMatch.name)}* thành công rồi ạ ♥️`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (error) {
        console.error('Error saving order:', error.message);
        await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu đơn đặt món ạ!');
      }
    }
  });

  bot.onText(/\/summary/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const { start, end } = getTodayRange();
      const orders = await orderRepository.findForRange(chatId.toString(), start, end);

      if (orders.length === 0) {
        await bot.sendMessage(chatId, '📊 Dạ hôm nay chưa có ai đặt món hết ạ!');
        return;
      }

      const dishCount = {};
      orders.forEach((order) => {
        if (dishCount[order.dish]) {
          dishCount[order.dish].count += 1;
          dishCount[order.dish].users.push(order.userName);
        } else {
          dishCount[order.dish] = { count: 1, users: [order.userName] };
        }
      });

      let message = '📊 *Thống kê đặt món hôm nay nè ạ:*\n\n';
      Object.keys(dishCount).forEach((dish) => {
        message += `🍽 *${escapeMarkdown(dish)}*: ${dishCount[dish].count} phần\n`;
        message += `   └ ${dishCount[dish].users.map((userName) => escapeMarkdown(userName)).join(', ')}\n\n`;
      });
      message += `📝 Tổng cộng: ${orders.length} phần`;

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error getting summary:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, em bị lỗi khi xem thống kê ạ!');
    }
  });

  bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const { start, end } = getTodayRange();
      const result = await orderRepository.deleteForRange(chatId.toString(), start, end);
      await bot.sendMessage(chatId, `🧹 Dạ em đã xoá ${result.deletedCount} đơn đặt món hôm nay rồi ạ!`);
    } catch (error) {
      console.error('Error resetting orders:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi xoá đơn ạ!');
    }
  });

  bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const userName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '');

    try {
      const { start, end } = getTodayRange();
      const result = await orderRepository.deleteUserOrderForRange(userId, chatId.toString(), start, end);

      if (result.deletedCount > 0) {
        await bot.sendMessage(chatId, `🗑️ Dạ ${userName} ơi, em đã hủy món của bạn hôm nay rồi ạ!`);
      } else {
        await bot.sendMessage(chatId, `❌ Dạ ${userName} ơi, em không thấy bạn đặt món hôm nay để hủy ạ!`);
      }
    } catch (error) {
      console.error('Error canceling order:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi hủy món ạ!');
    }
  });

  bot.onText(/\/weeklySummary/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const { start, end } = getWeekRange();
      const orders = await orderRepository.findForRange(chatId.toString(), start, end);

      if (orders.length === 0) {
        await bot.sendMessage(chatId, '📊 Dạ tuần này chưa ai đặt món hết ạ!');
        return;
      }

      const dishCount = countDishes(orders);
      let message = '📊 *Thống kê đặt món tuần này nè ạ:*\n\n';
      Object.keys(dishCount)
        .sort((a, b) => dishCount[b] - dishCount[a])
        .forEach((dish) => {
          message += `🍽 *${escapeMarkdown(dish)}*: ${dishCount[dish]} phần\n`;
        });
      message += `\n📝 Tổng cộng: ${orders.length} phần`;

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error getting weekly summary:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, lỗi khi lấy thống kê tuần ạ!');
    }
  });

  bot.onText(/\/monthlySummary/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const { start, end } = getMonthRange();
      const orders = await orderRepository.findForRange(chatId.toString(), start, end);

      if (orders.length === 0) {
        await bot.sendMessage(chatId, '📊 Dạ tháng này chưa ai đặt món hết ạ!');
        return;
      }

      const dishCount = countDishes(orders);
      let message = '📊 *Thống kê đặt món tháng này nè ạ:*\n\n';
      Object.keys(dishCount)
        .sort((a, b) => dishCount[b] - dishCount[a])
        .forEach((dish) => {
          message += `🍽 *${escapeMarkdown(dish)}*: ${dishCount[dish]} phần\n`;
        });
      message += `\n📝 Tổng cộng: ${orders.length} phần`;

      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error getting monthly summary:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, lỗi khi lấy thống kê tháng ạ!');
    }
  });

  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const menu = await menuRepository.findByChatId(chatId.toString());

      if (!menu || !menu.items || menu.items.length === 0) {
        await bot.sendMessage(chatId, '🍽 Dạ chưa có thực đơn nào hết ạ! Dùng /savemenu để tạo menu nha ạ!');
        return;
      }

      let menuText = '🍽 *Thực đơn hiện tại nè ạ:*\n\n';
      menu.items.forEach((item, idx) => {
        menuText += `${idx + 1}. ${escapeMarkdown(item.name)} - ${item.price.toLocaleString('vi-VN')}đ\n`;
      });

      await bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error getting menu:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy thực đơn ạ!');
    }
  });

  bot.onText(/\/savemenu/, async (msg) => {
    const chatId = msg.chat.id;
    waitingForMenu[chatId] = true;
    await bot.sendMessage(chatId, '📝 Hãy gửi cho em menu ạ!\n\nVí dụ:\n1. Cafe sữa - 15000\n2. Trà tắc - 18000');
  });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name;
    const welcomeMessage = `Dạ em chào ${userName}! ạ ♥️\n\nEm là nhân viên đặt món ăn của nhóm mình ạ 🍱\n\nNếu ${userName} cần hỗ trợ, mình có thể gõ /help để xem hướng dẫn chi tiết nha ạ 🌸`;
    await bot.sendMessage(chatId, welcomeMessage);
  });

  bot.onText(/\/getchatid/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `🆔 Chat ID của cuộc hội thoại này là: ${msg.chat.id}`);
  });

  bot.onText(/\/help/, async (msg) => {
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
      `Menu sẽ được lưu cho tới khi cập nhật lại nha ạ.\n\n` +
      `💬 *Các lệnh hỗ trợ:* \n` +
      `/start - Bắt đầu làm quen với em nè 💖\n` +
      `/getchatid - Lấy chat ID của nhóm (dành cho admin) 🆔\n` +
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

    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/savephoto (.+)/, async (msg, match) => {
    if (!isMediaSupported()) {
      await sendUnsupported(msg.chat.id);
      return;
    }

    waitingForPhoto[msg.from.id] = match[1].trim();
    await bot.sendMessage(
      msg.chat.id,
      `📸 Dạ ${escapeMarkdown(msg.from.first_name)} ơi, gửi ảnh *${escapeMarkdown(match[1].trim())}* cho em nha ạ!`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/savechatimg (.+)/, async (msg, match) => {
    if (!isMediaSupported()) {
      await sendUnsupported(msg.chat.id);
      return;
    }

    waitingForChatImg[msg.chat.id] = match[1].trim();
    await bot.sendMessage(
      msg.chat.id,
      `📸 Dạ nhóm ơi, gửi ảnh *${escapeMarkdown(match[1].trim())}* cho em nha ạ!`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isMediaSupported()) {
      if (waitingForChatImg[chatId] || waitingForPhoto[userId]) {
        delete waitingForChatImg[chatId];
        delete waitingForPhoto[userId];
        await sendUnsupported(chatId);
      }
      return;
    }

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
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await bot.getFileLink(photo.file_id);
      const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const photoSlug = slugify(photoName, { lower: true });
      const objectName = `${isChatImg ? `chat_${chatId}` : userId}_${photoSlug}_${Date.now()}.jpg`;
      const metaData = {
        'Content-Type': mime.lookup(objectName) || 'image/jpeg',
        'Content-Disposition': 'inline',
      };

      const fileUrl = await mediaProvider.uploadObject(objectName, buffer, metaData);
      const query = isChatImg
        ? { chatId: chatId.toString(), photoName }
        : { userId: userId.toString(), photoName };

      await photoRepository.upsertPhoto(query, { url: fileUrl, type: 'photo' });
      await bot.sendMessage(chatId, `✅ Em đã lưu ảnh *${escapeMarkdown(photoName)}* thành công!\n`, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error saving photo:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu ảnh ạ!');
    }
  });

  bot.on('video', async (msg) => {
    const chatId = msg.chat.id;

    if (!waitingForChatImg[chatId]) return;

    if (!isMediaSupported()) {
      delete waitingForChatImg[chatId];
      await sendUnsupported(chatId);
      return;
    }

    const videoName = waitingForChatImg[chatId];
    delete waitingForChatImg[chatId];

    try {
      const fileLink = await bot.getFileLink(msg.video.file_id);
      const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const videoSlug = slugify(videoName, { lower: true });
      const objectName = `chat_${chatId}_${videoSlug}_${Date.now()}.mp4`;
      const metaData = {
        'Content-Type': mime.lookup(objectName) || 'video/mp4',
        'Content-Disposition': 'inline',
      };

      const fileUrl = await mediaProvider.uploadObject(objectName, buffer, metaData);
      await photoRepository.upsertPhoto(
        { chatId: chatId.toString(), photoName: videoName },
        { url: fileUrl, type: 'video' }
      );

      await bot.sendMessage(chatId, `✅ Em đã lưu video *${escapeMarkdown(videoName)}* thành công!`, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error saving video:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lưu video ạ!');
    }
  });

  bot.onText(/\/getphoto (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photoDoc = await photoRepository.findOne({
        userId: msg.from.id.toString(),
        photoName: match[1].trim(),
      });

      if (!photoDoc) {
        await bot.sendMessage(
          chatId,
          `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(match[1].trim())}* của ${escapeMarkdown(msg.from.first_name)} ạ!`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await bot.sendPhoto(chatId, photoDoc.url, {
        caption: `📸*${escapeMarkdown(match[1].trim())}*`,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error fetching photo:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy ảnh ạ!');
    }
  });

  bot.onText(/\/getchatimg(?:@[\w_]+)?\s*$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photos = await photoRepository.findMany({ chatId: chatId.toString() });
      if (photos.length === 0) {
        await bot.sendMessage(chatId, '📸 Dạ nhóm ơi, em không thấy ảnh nào của nhóm cả ạ!');
        return;
      }

      const pageSize = 20;
      const pagePhotos = photos.slice(0, pageSize);
      const buttons = pagePhotos.map((photo) => [
        { text: photo.photoName, callback_data: `getchatimg:${photo.photoName}` },
      ]);

      if (photos.length > pageSize) {
        buttons.push([{ text: 'Xem thêm...', callback_data: 'getchatimg:__page:2' }]);
      }

      await bot.sendMessage(chatId, '📸 Chọn ảnh nhóm để lấy:', {
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (error) {
      console.error('Error showing chat img suggestions:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy danh sách ảnh nhóm ạ!');
    }
  });

  bot.on('callback_query', async (callbackQuery) => {
    try {
      const data = callbackQuery.data;
      if (!data || !data.startsWith('getchatimg:')) return;

      const chatId = callbackQuery.message.chat.id;
      if (!isMediaSupported()) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: UNSUPPORTED_FEATURE_MESSAGE });
        return;
      }

      const parts = data.split(':');

      if (parts[1] === '__page') {
        const requestedPage = parseInt(parts[2], 10) || 1;
        const photos = await photoRepository.findMany({ chatId: chatId.toString() });
        const pageSize = 20;
        const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
        const page = Math.min(Math.max(1, requestedPage), totalPages);
        const start = (page - 1) * pageSize;
        const pagePhotos = photos.slice(start, start + pageSize);
        const buttons = pagePhotos.map((photo) => [
          { text: photo.photoName, callback_data: `getchatimg:${photo.photoName}` },
        ]);
        const nav = [];

        if (page > 1) nav.push({ text: '« Trước', callback_data: `getchatimg:__page:${page - 1}` });
        if (page < totalPages) nav.push({ text: 'Sau »', callback_data: `getchatimg:__page:${page + 1}` });
        if (nav.length) buttons.push(nav);

        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: buttons },
            { chat_id: chatId, message_id: callbackQuery.message.message_id }
          );
        } catch (error) {
          await bot.sendMessage(chatId, '📸 Chọn ảnh nhóm để lấy:', {
            reply_markup: { inline_keyboard: buttons },
          });
        }

        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      const photoName = parts.slice(1).join(':');
      const photoDoc = await photoRepository.findOne({ chatId: chatId.toString(), photoName });

      if (!photoDoc) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Không tìm thấy ảnh' });
        return;
      }

      if (photoDoc.type === 'video') {
        await bot.sendVideo(chatId, photoDoc.url, {
          caption: `📹*${escapeMarkdown(photoName)}*`,
          parse_mode: 'Markdown',
        });
      } else {
        await bot.sendPhoto(chatId, photoDoc.url, {
          caption: `📸*${escapeMarkdown(photoName)}*`,
          parse_mode: 'Markdown',
        });
      }

      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Error handling callback_query:', error.message);
    }
  });

  bot.onText(/\/getchatimg (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photoDoc = await photoRepository.findOne({
        chatId: chatId.toString(),
        photoName: match[1].trim(),
      });

      if (!photoDoc) {
        await bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(match[1].trim())}* của nhóm ạ!`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (photoDoc.type === 'video') {
        await bot.sendVideo(chatId, photoDoc.url, {
          caption: `📹*${escapeMarkdown(match[1].trim())}*`,
          parse_mode: 'Markdown',
        });
      } else {
        await bot.sendPhoto(chatId, photoDoc.url, {
          caption: `📸*${escapeMarkdown(match[1].trim())}*`,
          parse_mode: 'Markdown',
        });
      }
    } catch (error) {
      console.error('Error fetching chat img:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy ảnh nhóm ạ!');
    }
  });

  bot.onText(/\/renamephoto (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photoDoc = await photoRepository.rename(
        { userId: msg.from.id.toString(), photoName: match[1].trim() },
        match[2].trim()
      );

      if (!photoDoc) {
        await bot.sendMessage(
          chatId,
          `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(match[1].trim())}* của ${escapeMarkdown(msg.from.first_name)} để đổi tên ạ!`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await bot.sendMessage(
        chatId,
        `✅ Dạ em đã đổi tên ảnh từ *${escapeMarkdown(match[1].trim())}* thành *${escapeMarkdown(match[2].trim())}* rồi ạ!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error renaming photo:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi đổi tên ảnh ạ!');
    }
  });

  bot.onText(/\/renamechatimg (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photoDoc = await photoRepository.rename(
        { chatId: chatId.toString(), photoName: match[1].trim() },
        match[2].trim()
      );

      if (!photoDoc) {
        await bot.sendMessage(chatId, `❌ Dạ em không tìm thấy ảnh *${escapeMarkdown(match[1].trim())}* của nhóm để đổi tên ạ!`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      await bot.sendMessage(
        chatId,
        `✅ Dạ em đã đổi tên ảnh nhóm từ *${escapeMarkdown(match[1].trim())}* thành *${escapeMarkdown(match[2].trim())}* rồi ạ!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error renaming chat img:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi đổi tên ảnh nhóm ạ!');
    }
  });

  bot.onText(/\/allphoto/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photos = await photoRepository.findMany({ userId: msg.from.id.toString() });
      if (photos.length === 0) {
        await bot.sendMessage(chatId, `📸 Dạ ${escapeMarkdown(msg.from.first_name)} ơi, em không thấy ảnh nào của bạn cả ạ!`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      const photoNames = photos.map((photo) => escapeMarkdown(photo.photoName)).join(', ');
      await bot.sendMessage(chatId, `📸 Dạ ${escapeMarkdown(msg.from.first_name)} ơi, đây là tất cả ảnh của bạn: *${photoNames}*`, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error fetching all photos:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy danh sách ảnh ạ!');
    }
  });

  bot.onText(/\/allchatimg/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isMediaSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const photos = await photoRepository.findMany({ chatId: chatId.toString() });
      if (photos.length === 0) {
        await bot.sendMessage(chatId, '📸 Dạ nhóm ơi, em không thấy ảnh nào của nhóm cả ạ!', {
          parse_mode: 'Markdown',
        });
        return;
      }

      const photoNames = photos.map((photo) => escapeMarkdown(photo.photoName)).join(', ');
      await bot.sendMessage(chatId, `📸 Dạ nhóm ơi, đây là tất cả ảnh của nhóm: *${photoNames}*`, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error fetching all chat imgs:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy danh sách ảnh nhóm ạ!');
    }
  });

  bot.onText(/\/tagall/, async (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      await bot.sendMessage(chatId, '⚠️ Dạ lệnh này chỉ dùng trong nhóm thôi ạ!');
      return;
    }

    try {
      const members = await groupMemberRepository.findRecentByChatId(chatId.toString(), 50);

      if (members.length === 0) {
        await bot.sendMessage(chatId, '📋 Dạ em chưa thấy thành viên nào trong nhóm cả ạ!');
        return;
      }

      let mentions = '📢 *Gọi toàn bộ thành viên nè ạ:*\n\n';
      members.forEach((member) => {
        const fullName = `${member.firstName || ''}${member.lastName ? ` ${member.lastName}` : ''}`.trim();
        mentions += `[${escapeMarkdown(fullName || member.username || member.userId)}](tg://user?id=${member.userId}) `;
      });

      await bot.sendMessage(chatId, mentions, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in /tagall:', error.message);
      await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi tag mọi người ạ!');
    }
  });

  bot.onText(/\/roast(?:\s+@?(\w+))?/, async (msg, match) => {
    let targetUsername = match[1];

    if (!targetUsername && msg.reply_to_message) {
      const targetUser = msg.reply_to_message.from;
      targetUsername = targetUser.username || targetUser.first_name;
    } else if (!targetUsername) {
      targetUsername = msg.from.username || msg.from.first_name;
    }

    const roast = messages.roasts[Math.floor(Math.random() * messages.roasts.length)];
    await bot.sendMessage(msg.chat.id, `@${targetUsername} ${roast}`);
  });

  bot.onText(/\/lucky/, async (msg) => {
    const luckyTemplate = messages.luckyMessages[Math.floor(Math.random() * messages.luckyMessages.length)];
    const percent = Math.floor(Math.random() * 100) + 1;
    await bot.sendMessage(
      msg.chat.id,
      `🎰 *${escapeMarkdown(msg.from.first_name)}:* ${luckyTemplate.replace('{percent}', percent)}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/prompt (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAiSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const contextDoc = await aiContextRepository.findByChatId(chatId.toString());
      if (!contextDoc) {
        await bot.sendMessage(chatId, 'Chưa có context, dùng /setrawcontext để tạo trước!');
        return;
      }

      const currentContext = contextDoc.currentContext || contextDoc.rawContext;
      const geminiPrompt = `
Context hiện tại:
${currentContext}
Yêu cầu cập nhật: ${match[1]}
Người yêu cầu: ${msg.from.first_name} ${msg.from.last_name || ''}
Chỉ đổi liên quan tới người khác, không được đổi về bản thân. Nếu yêu cầu có liên quan đến bản thân (người yêu cầu), trả về chính xác đoạn text 'Mày không được đổi nội dung về bản thân đâu nhé'
Nếu hợp lệ trả về chính xác nội dung context mới đã được cập nhật dựa trên yêu cầu, giữ lại phần hợp lý từ context cũ. Không thêm bớt từ ngữ nào khác. Giữ lại cả phần mô tả hoàn cảnh nếu có.
`;

      const aiResponse = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: geminiPrompt,
      });
      const newContext = aiResponse.text.trim();

      if (newContext === 'Mày không được đổi nội dung về bản thân đâu nhé') {
        await bot.sendMessage(chatId, 'Yêu cầu của bạn liên quan đến bản thân, context không được thay đổi!');
        return;
      }

      await aiContextRepository.save(chatId.toString(), {
        rawContext: contextDoc.rawContext || '',
        currentContext: newContext,
      });
      await bot.sendMessage(chatId, 'Context đã được cập nhật!');
      await sendAdminLog(`[Prompt]\n${geminiPrompt}\n\n[Response]\n${JSON.stringify(aiResponse, null, 2)}`);
    } catch (error) {
      console.error('Error updating context:', error.message);
      await bot.sendMessage(chatId, 'Lỗi khi cập nhật context!');
    }
  });

  bot.onText(/\/setrawcontext (.+)/, async (msg, match) => {
    try {
      await aiContextRepository.save(msg.chat.id.toString(), {
        rawContext: match[1],
        currentContext: match[1],
      });
      await bot.sendMessage(msg.chat.id, 'Raw context đã được cập nhật!');
    } catch (error) {
      console.error('Error setting raw context:', error.message);
      await bot.sendMessage(msg.chat.id, 'Lỗi khi cập nhật raw context!');
    }
  });

  bot.onText(/\/getcontext/, async (msg) => {
    try {
      const contextDoc = await aiContextRepository.findByChatId(msg.chat.id.toString());
      if (!contextDoc) {
        await bot.sendMessage(msg.chat.id, 'Chưa có context!');
        return;
      }

      await bot.sendMessage(msg.chat.id, `Context hiện tại:\n\n${contextDoc.currentContext || contextDoc.rawContext}`);
    } catch (error) {
      console.error('Error getting context:', error.message);
      await bot.sendMessage(msg.chat.id, 'Lỗi khi lấy context!');
    }
  });

  bot.onText(/\/ai (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAiSupported()) {
      await sendUnsupported(chatId);
      return;
    }

    try {
      const contextDoc = await aiContextRepository.findByChatId(chatId.toString());
      if (!contextDoc) {
        await bot.sendMessage(chatId, 'Chưa có context, dùng /prompt để tạo!');
        return;
      }

      const userName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '');
      const context = contextDoc.currentContext || contextDoc.rawContext;
      const prompt = `
${context}

from: ${userName}
question: ${match[1]}
answer like close friends, short and real-life conversation style.`;

      const aiResponse = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      let responseText = aiResponse.text;

      await sendAdminLog(`[AI Prompt]\n${prompt}\n\n[AI Response]\n${JSON.stringify(aiResponse, null, 2)}`);
      await bot.sendMessage(chatId, responseText, {
        reply_to_message_id: msg.message_id,
      });
    } catch (error) {
      const errorCode = error?.status || error?.error?.code;
      const errorMessage = error?.error?.message || error?.message || JSON.stringify(error);

      if (errorCode === 429) {
        await bot.sendMessage(chatId, 'Free thì hỏi ít thôi, đang hết quota!', {
          reply_to_message_id: msg.message_id,
        });
      } else {
        await bot.sendMessage(chatId, '⚠️ Dạ em xin lỗi, có lỗi khi lấy phản hồi từ AI ạ!', {
          reply_to_message_id: msg.message_id,
        });
      }

      await sendAdminLog(`Error Code: ${errorCode}\nMessage: ${errorMessage}`);
    }
  });

  bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
  });
};

module.exports = {
  registerHandlers,
};
