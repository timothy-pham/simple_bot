# Hướng dẫn Deploy với Docker Compose

## Yêu cầu

- Docker
- Docker Compose

## Cài đặt

### 1. Cấu hình môi trường

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env` và điền Telegram Bot Token của bạn:

```
TELEGRAM_BOT_TOKEN=your_actual_token_here
```

### 2. Khởi chạy ứng dụng

Chạy lệnh sau để build và khởi động tất cả services:

```bash
docker-compose up -d
```

Hoặc để xem logs:

```bash
docker-compose up
```

### 3. Kiểm tra trạng thái

Kiểm tra các container đang chạy:

```bash
docker-compose ps
```

Xem logs của bot:

```bash
docker-compose logs -f bot
```

Xem logs của MongoDB:

```bash
docker-compose logs -f mongodb
```

## Các lệnh hữu ích

### Dừng ứng dụng

```bash
docker-compose down
```

### Dừng và xóa volumes (xóa dữ liệu MongoDB)

```bash
docker-compose down -v
```

### Khởi động lại services

```bash
docker-compose restart
```

### Rebuild image khi có thay đổi code

```bash
docker-compose up -d --build
```

### Truy cập MongoDB shell

```bash
docker-compose exec mongodb mongosh -u admin -p admin123
```

## Cấu hình

### Port

- **Bot**: 3052 (như yêu cầu)
- **MongoDB**: 27017

### MongoDB Credentials

- Username: `admin`
- Password: `admin123`
- Database: `simple_bot`

**Lưu ý**: Nên thay đổi mật khẩu MongoDB trong môi trường production.

## Troubleshooting

### Bot không kết nối được MongoDB

Kiểm tra logs:

```bash
docker-compose logs bot
```

### Xóa và khởi động lại từ đầu

```bash
docker-compose down -v
docker-compose up -d --build
```

### Kiểm tra network

```bash
docker network ls
docker network inspect simple_bot_simple_bot_network
```
