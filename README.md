# MettaCitta — Quản lý thiện pháp và sao kê VIB

Ứng dụng Next.js tiếp nhận file sao kê Excel từ VIB, chống trùng giao dịch và phân loại nội dung theo bộ từ khóa của từng thiện pháp.

## Định dạng sao kê

Dán bảng gồm 5 cột, phân cách bằng tab. Dòng tiêu đề có thể có hoặc không:

```text
Ngày giao dịch\tNội dung giao dịch\tSố tiền\tSố dư\tMã giao dịch
10/07/2026 07:43:11\tTHU PHI BSMS T06/2026 CIF 26152572\t-11000 VND\t37007 VND\t0792HcJq-8AU3U9ma4
```

- Ngày giao dịch: `dd/MM/yyyy HH:mm:ss` (múi giờ Việt Nam).
- Số tiền bắt buộc có dấu `+` hoặc `-` và có thể kết thúc bằng `VND`.
- Số dư có thể kết thúc bằng `VND`.
- Mã giao dịch là khóa unique dùng để bỏ qua giao dịch đã import.

Số tài khoản, số dư và giao dịch được đọc trực tiếp từ file sao kê VIB.

## Chạy dự án

```bash
pnpm install
pnpm db:deploy
pnpm dev
```

Cấu hình trong `.env.local` (không commit thông tin bí mật):

- `DATABASE_URL`: kết nối PostgreSQL pooled cho ứng dụng.
- `POSTGRES_URL`: kết nối trực tiếp cho Prisma migrations; nếu không có sẽ dùng `DATABASE_URL`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: thông tin OAuth client loại Web application.
- `AUTH_SECRET`: khóa ký phiên đăng nhập, cần giữ ổn định và bí mật.
- `NEXT_PUBLIC_APP_URL`: URL gốc của ứng dụng khi triển khai, ví dụ `https://your-domain.com`. Khi chạy local có thể để trống để dùng origin của request.

Trong Google Cloud Console, thêm Authorized redirect URI chính xác:

```text
http://localhost:3000/api/auth/google/callback
https://your-domain.com/api/auth/google/callback
```

Hệ thống chỉ cho hai email Google đã xác minh đăng nhập quản trị: `phuongtu213@gmail.com` và `fchienvuhoang@gmail.com`. Nếu OAuth app đang ở chế độ Testing, thêm cả hai vào Test users của Google. Luồng đăng nhập dùng authorization code, state và PKCE; phiên quản trị hết hạn sau 7 ngày. Đăng nhập bằng mật khẩu đã được tắt.

DB mới dùng toàn bộ migration trong `prisma/migrations`; không cần tạo lại migration khởi tạo. `pnpm db:deploy` có thể chạy lại an toàn. Không chạy `db:push` thay cho migration trên môi trường triển khai.

`pnpm db:seed` chỉ dùng khi muốn thêm các thiện pháp mẫu của project cũ. DB mới không tự chèn dữ liệu mẫu.

Kiểm tra đăng nhập:

```bash
node --test tests/auth.test.mjs
pnpm exec tsc --noEmit
```
