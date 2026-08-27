# Backend — App-Telegram-CC

این پوشه موتور فروشگاه‌ساز تلگرام است و روی Cloudflare Workers اجرا می‌شود. دیتابیس Supabase از `service_role` فقط در همین لایهٔ Server-side استفاده می‌کند.

## مسیرهای اصلی

- `POST /webhook/master` — webhook ربات سازنده.
- `POST /webhook/store/:merchantId` — webhook هر ربات فروشگاهی.
- `POST /api/v1/app/pair` — اتصال یک‌بارمصرف اپ.
- `GET /api/v1/app/me` — اطلاعات Merchant متصل.
- `GET /api/v1/dashboard` — آمار داشبورد.
- `GET|POST|PATCH|DELETE /api/v1/categories...` — دسته‌بندی.
- `GET|POST|PATCH|DELETE /api/v1/products...` — محصول.
- `GET /api/v1/orders` و `PATCH /api/v1/orders/:id/status` — سفارش.
- `GET|PATCH /api/v1/settings` — تنظیمات.
- `GET /api/v1/app/version` — کنترل نسخه Android.

## Secretهای لازم

`MASTER_BOT_TOKEN`, `MASTER_WEBHOOK_SECRET`, `WEBHOOK_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `PIN_PEPPER`.

نمونه و توضیح هر مورد در `.env.example` وجود دارد. فایل واقعی `.dev.vars` نباید commit شود.

## دیتابیس

برای پروژه تازه `sql/schema.sql` را اجرا کنید. اگر دیتابیس نسخهٔ اولیه را دارید، `sql/migrations/002_android_app_and_security.sql` را اجرا و سپس `npm run migrate:secrets` را با Secretهای لازم اجرا کنید.
