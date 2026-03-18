# Hướng Dẫn GitHub Copilot

## Tổng Quan Dự Án
- Project: simple_bot
- Stack phát hiện được: Node.js
- Dấu hiệu kiến trúc: Chưa xác định

## Skills Đã Cài
- architecture-blueprint-generator (GitHub Awesome Copilot): Comprehensive project architecture blueprint generator that analyzes codebases to create detailed architectural documentation. Automatically detects technology stacks and architectural patterns, generates visual diagrams, documents implementation patterns, and provides extensible blueprints for maintaining architectural consistency and guiding new development.
- add-educational-comments (GitHub Awesome Copilot): Add educational comments to the file specified, or prompt asking for file to comment if one is not provided.
- agentic-eval (GitHub Awesome Copilot): |

## Nguyên Tắc Kỹ Thuật
- Ưu tiên sự rõ ràng hơn là mẹo kỹ thuật.
- Giữ cho hàm và module tập trung vào một trách nhiệm chính.
- Tôn trọng convention sẵn có của repo trước khi thêm pattern mới.
- Ưu tiên thay đổi nhỏ, dễ review, trừ khi bài toán yêu cầu redesign rõ ràng.
- Chọn abstraction đơn giản, phù hợp codebase hiện tại thay vì dự đoán quá sớm.

## Xử Lý Lỗi
- Validate input ngay tại boundary và trả về thông tin lỗi có thể hành động được.
- Không nuốt exception; cần xử lý rõ ràng hoặc ném lại kèm context hữu ích.
- Chỉ log ở đúng boundary và không để lộ secret.

## Bảo Mật
- Xem secret, token và production data là dữ liệu nhạy cảm.
- Ưu tiên least-privilege cho script, automation và thay đổi hạ tầng.
- Không thêm side effect về network hay filesystem nếu task không thực sự cần.

## Test Và Chất Lượng
- Thêm hoặc cập nhật test cho thay đổi hành vi nếu repo đã có pattern test rõ ràng.
- Giữ test có tính xác định, tránh phụ thuộc ngầm vào thời gian hoặc network.
- Cập nhật tài liệu liên quan khi workflow hoặc hành vi thay đổi.

## Cách Cộng Tác
- Luôn đọc implementation hiện tại trước khi đề xuất thay đổi.
- Nếu giải pháp có tradeoff, giả định hoặc rủi ro quan trọng thì cần nêu rõ.
- Nếu nội dung file này vẫn quá chung chung, hãy refine dựa trên codebase thực tế.
