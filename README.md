# Simple Bot - Telegram Food Ordering Bot

Bot Telegram đơn giản hỗ trợ đặt cơm hằng ngày trong group, lưu dữ liệu vào MongoDB và thống kê kết quả.

## Tính năng

### 1. Gửi thực đơn

Admin gửi tin nhắn bắt đầu bằng "Em gửi thực đơn hôm nay...", bot sẽ tự động lưu thực đơn vào MongoDB.

**Ví dụ:**

```
Em gửi thực đơn hôm nay:
- Cơm sườn
- Cơm gà
- Cơm tấm
```

### 2. Đặt món

Thành viên trong group chỉ cần gửi tên món ăn, bot sẽ tự động lưu hoặc cập nhật lựa chọn của họ.

**Ví dụ:**

```
Cơm sườn
```

### 3. Thống kê ngày

Sử dụng lệnh `/summary` để xem thống kê số lượng từng món đã đặt trong ngày.

**Ví dụ output:**

```
📊 Thống kê đặt món hôm nay:

🍽 Cơm sườn: 5 phần
   └ John, Jane, Bob, Alice, Charlie

🍽 Cơm gà: 3 phần
   └ Dave, Eve, Frank

📝 Tổng cộng: 8 phần
```

### 4. Xóa dữ liệu ngày

Sử dụng lệnh `/reset` để xóa toàn bộ đơn đặt món trong ngày.

### 5. Thống kê nâng cao

#### Thống kê tuần

Sử dụng lệnh `/weeklySummary` để xem thống kê món ăn trong tuần.

#### Thống kê tháng

Sử dụng lệnh `/monthlySummary` để xem thống kê món ăn trong tháng.

## Cài đặt

### Yêu cầu

- Node.js 14+
- MongoDB
- Telegram Bot Token (từ @BotFather)

### Các bước cài đặt

1. Clone repository:

```bash
git clone https://github.com/timothy-pham/simple_bot.git
cd simple_bot
```

2. Cài đặt dependencies:

```bash
npm install
```

3. Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

4. Cấu hình file `.env`:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb://localhost:27017/simple_bot
```

5. Chạy bot:

```bash
npm start
```

Hoặc chạy với nodemon để tự động restart khi có thay đổi:

```bash
npm run dev
```

## Cấu trúc dự án

```
simple_bot/
├── config/
│   └── database.js       # Cấu hình kết nối MongoDB
├── models/
│   ├── Menu.js          # Schema cho thực đơn
│   └── Order.js         # Schema cho đơn đặt món
├── index.js             # File chính của bot
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Database Schema

### Menu Schema

```javascript
{
  text: String,      // Nội dung thực đơn
  date: Date,        // Ngày gửi thực đơn
  chatId: String     // ID của group chat
}
```

### Order Schema

```javascript
{
  userId: String,    // ID người đặt
  userName: String,  // Tên người đặt
  chatId: String,    // ID của group chat
  dish: String,      // Tên món đặt
  date: Date,        // Ngày đặt món
  createdAt: Date    // Thời gian tạo/cập nhật
}
```

## Các lệnh bot

| Lệnh                         | Mô tả                                     |
| ---------------------------- | ----------------------------------------- |
| `Em gửi thực đơn hôm nay...` | Admin gửi thực đơn                        |
| `<Tên món>`                  | Đặt món (bất kỳ text nào không phải lệnh) |
| `/summary`                   | Xem thống kê đặt món hôm nay              |
| `/reset`                     | Xóa dữ liệu đặt món hôm nay               |
| `/weeklySummary`             | Xem thống kê đặt món tuần này             |
| `/monthlySummary`            | Xem thống kê đặt món tháng này            |

## License

MIT
