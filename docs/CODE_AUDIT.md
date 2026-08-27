# تحلیل کد ZIP اولیه

## نتیجهٔ کلی

فایل ZIP اولیه یک **اپ اندروید** نبود؛ یک Backend فروشگاه‌ساز چندمستاجری تلگرام با JavaScript بود که برای Cloudflare Workers و Supabase طراحی شده بود. معماری پایه قابل استفاده بود، بنابراین به‌جای حذف آن، همان Backend حفظ و برای اپ Android ایمن‌سازی و توسعه داده شد.

## اجزای اصلی نسخهٔ اولیه

- `src/masterBot.js`: دریافت توکن BotFather و ساخت Merchant جدید.
- `src/storeBot/engine.js`: ساخت Instance ربات فروشگاهی هر Merchant.
- `src/storeBot/customerHandlers.js`: مسیرهای مشتری، سبد خرید، سفارش، تخفیف و معرفی.
- `src/storeBot/admin*.js`: پنل مدیریتی داخل تلگرام.
- `src/lib/supabase.js`: اتصال Server-side به Supabase.
- `sql/schema.sql`: مدل دیتابیس فروشگاه چندمستاجری.

## مشکلات کشف‌شده و اصلاحات

### 1. نگهداری Secret خام

نسخهٔ اولیه ستون‌های `merchants.bot_token` و `merchants.admin_pin` را به‌صورت متن عادی داشت. در نسخهٔ جدید:

- Bot token با AES-256-GCM رمز می‌شود.
- SHA-256 مستقل توکن برای تشخیص Duplicate نگه داشته می‌شود.
- PIN مدیریت با HMAC-SHA-256 و Pepper سراسری محافظت می‌شود.
- کد Legacy هنوز برای Migration قابل خواندن است، اما ثبت جدید plaintext تولید نمی‌کند.

### 2. نبود API مناسب Android

استفاده مستقیم از Supabase `service_role` در APK خطرناک است. API جدید `/api/v1/*` روی Worker اضافه شد و Android فقط Session Token محدود خودش را دریافت می‌کند.

### 3. Pairing امن

مالک داخل ربات کد ۸ کاراکتری با عمر ۵ دقیقه می‌گیرد. در دیتابیس فقط Hash کد ذخیره می‌شود و کد پس از اولین استفاده باطل می‌شود. Session اپ ۳۰ روز اعتبار دارد و قابل Revoke است.

### 4. Tenant isolation ناقص در چند مسیر

چند Callback/Mutation نسخهٔ اولیه فقط بر اساس `id` کار می‌کردند. این مسیرها با `merchant_id` محدود شدند. علاوه بر آن Triggerهای SQL برای Product/Category، Cart، Order و Wallet اضافه شدند تا اشتباه کدنویسی در لایه Worker نتواند داده دو Merchant را به هم وصل کند.

### 5. اعتبارسنجی Webhook ربات اصلی

پشتیبانی از Header رسمی `X-Telegram-Bot-Api-Secret-Token` اضافه شد. در Production باید `MASTER_WEBHOOK_SECRET` تنظیم شود.

### 6. کنترل نسخه اپ

Route عمومی `/api/v1/app/version` اضافه شد. این Route نسخهٔ جدید، URL دانلود و `forceUpdate` را به اپ می‌دهد، بدون افشای اطلاعات خصوصی فروشگاه.

## موارد باقی‌مانده

- Rate Limiting اختصاصی API/Pairing در Cloudflare.
- RLS کامل در Supabase در کنار Server-side service role.
- تست یکپارچه Telegram webhook و Supabase با محیط Staging.
- Push Notification برای سفارش جدید.
- Audit Log مدیریتی.
- Rotation دوره‌ای Sessionها و صفحه مدیریت دستگاه‌های متصل.
