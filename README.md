# Simple Bot - Telegram Food Ordering And Storage Photo Bot

Bot Telegram đơn giản hỗ trợ đặt cơm hằng ngày trong group, lưu dữ liệu vào MongoDB và thống kê kết quả.
Ngoài ra còn hỗ trợ lưu trữ và truy xuất hình ảnh theo người dùng, cùng các tính năng vui như mention toàn bộ thành viên, roast bạn bè, và xem vận may ngẫu nhiên.

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

### 6. Lưu và lấy ảnh

Bot hỗ trợ lưu trữ và truy xuất ảnh cá nhân của người dùng.

#### Lưu ảnh cá nhân

Sử dụng lệnh `/savephoto <tên>` để chuẩn bị lưu ảnh với tên chỉ định, sau đó gửi ảnh vào chat.

**Ví dụ:**

```
/savephoto momo
```

Sau đó gửi ảnh QR code hoặc bất kỳ ảnh nào.

#### Lấy ảnh cá nhân

Sử dụng lệnh `/getphoto <tên>` để lấy ảnh đã lưu với tên chỉ định.

**Ví dụ:**

```
/getphoto momo
```

#### Đổi tên ảnh cá nhân

Sử dụng lệnh `/renamephoto <tên cũ> <tên mới>` để đổi tên ảnh đã lưu.

**Ví dụ:**

```
/renamephoto momo momo2
```

### 7. Ảnh nhóm

Bot hỗ trợ lưu trữ và truy xuất ảnh chia sẻ trong nhóm chat.

#### Lưu ảnh nhóm

Sử dụng lệnh `/savechatimg <tên>` để chuẩn bị lưu ảnh nhóm với tên chỉ định, sau đó gửi ảnh vào chat.

**Ví dụ:**

```
/savechatimg menu
```

Sau đó gửi ảnh thực đơn hoặc bất kỳ ảnh nào.

#### Lấy ảnh nhóm

Sử dụng lệnh `/getchatimg <tên>` để lấy ảnh nhóm đã lưu với tên chỉ định.

**Ví dụ:**

```
/getchatimg menu
```

#### Đổi tên ảnh nhóm

Sử dụng lệnh `/renamechatimg <tên cũ> <tên mới>` để đổi tên ảnh nhóm đã lưu.

**Ví dụ:**

```
/renamechatimg menu menu_today
```

### 8. Tính năng vui

Bot hỗ trợ các tính năng giải trí cho nhóm.

#### /tagall - Mention toàn bộ thành viên

Sử dụng lệnh `/tagall` để mention tối đa 50 thành viên trong nhóm. Bot sẽ tự động lưu thông tin thành viên khi họ gửi tin nhắn trong nhóm.

**Ví dụ:**

```
/tagall
```

Bot sẽ gửi tin nhắn mention tất cả thành viên đã từng nhắn tin trong nhóm.

#### /roast - Chửi vui

Sử dụng lệnh `/roast @user` để bot chửi vui một người dùng với câu ngẫu nhiên.

**Ví dụ:**

```
/roast @username
/roast (khi reply tin nhắn của ai đó)
/roast (để roast chính mình)
```

**Các câu chửi vui mẫu:**
- "hôm nay lag não à?"
- "code bug mà tự tin dữ ha!"
- "sao hôm nay nhìn giống con bug vậy? 🐛"

#### Auto-reply meme

Bot tự động trả lời khi phát hiện các từ khóa đặc biệt:

- "buồn quá" hoặc "buồn" → "Đừng buồn nữa, mai code tiếp 😎"
- "mệt quá" hoặc "mệt" → "Nghỉ ngơi đi, uống cà phê nào ☕"
- "stress" hoặc "stress quá" → "Thôi đừng stress nữa, nghỉ ngơi đi 💆"

#### /lucky - Xem vận may

Sử dụng lệnh `/lucky` để xem vận may ngẫu nhiên trong ngày.

**Ví dụ:**

```
/lucky
```

Bot sẽ trả lời với một câu may mắn ngẫu nhiên như:
- "Bạn hôm nay có 87% cơ hội bị QA chửi."
- "Bạn hôm nay có 92% cơ hội deploy thành công."
- "Bạn hôm nay có 45% cơ hội code không bug."

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
MINIO_ENDPOINT=your_minio_endpoint_here
MINIO_ACCESS_KEY=your_minio_access_key_here
MINIO_SECRET_KEY=your_minio_secret_key_here
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
│   ├── Order.js         # Schema cho đơn đặt món
│   ├── Photo.js         # Schema cho ảnh
│   └── GroupMember.js   # Schema cho thành viên nhóm
├── utils/
│   └── minioClient.js   # Cấu hình kết nối MinIO
├── data/
│   └── messages.json    # Dữ liệu cho roast, auto-reply, và lucky
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

### Photo Schema

```javascript
{
  userId: String,    // ID người dùng (cho ảnh cá nhân, có thể null nếu là ảnh nhóm)
  chatId: String,    // ID của group chat (cho ảnh nhóm, có thể null nếu là ảnh cá nhân)
  photoName: String, // Tên ảnh
  url: String        // URL của ảnh trên MinIO
}
```

### GroupMember Schema

```javascript
{
  userId: String,    // ID người dùng
  chatId: String,    // ID của group chat
  username: String,  // Username Telegram
  firstName: String, // Tên
  lastName: String,  // Họ
  lastSeen: Date     // Lần cuối nhắn tin
}
```

## Các lệnh bot

| Lệnh                                | Mô tả                                     |
| ----------------------------------- | ----------------------------------------- |
| `Em gửi thực đơn hôm nay...`        | Admin gửi thực đơn                        |
| `<Tên món>`                         | Đặt món (bất kỳ text nào không phải lệnh) |
| `/menu`                             | Xem thực đơn hôm nay                      |
| `/summary`                          | Xem thống kê đặt món hôm nay              |
| `/reset`                            | Xóa dữ liệu đặt món hôm nay               |
| `/weeklySummary`                    | Xem thống kê đặt món tuần này             |
| `/monthlySummary`                   | Xem thống kê đặt món tháng này            |
| `/savephoto <tên>`                  | Lưu ảnh cá nhân với tên chỉ định          |
| `/getphoto <tên>`                   | Lấy ảnh cá nhân đã lưu với tên chỉ định   |
| `/renamephoto <tên cũ> <tên mới>`   | Đổi tên ảnh cá nhân đã lưu                |
| `/savechatimg <tên>`                | Lưu ảnh nhóm với tên chỉ định             |
| `/getchatimg <tên>`                 | Lấy ảnh nhóm đã lưu với tên chỉ định      |
| `/renamechatimg <tên cũ> <tên mới>` | Đổi tên ảnh nhóm đã lưu                   |
| `/tagall`                           | Mention toàn bộ thành viên nhóm           |
| `/roast @user`                      | Chửi vui 1 câu ngẫu nhiên                 |
| `/lucky`                            | Xem vận may ngẫu nhiên trong ngày         |

## License

MIT
