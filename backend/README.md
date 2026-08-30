# Backend — App-Telegram-CC

این پوشه Backend واقعی فروشگاه‌ساز تلگرام است و روی Cloudflare Workers اجرا می‌شود. دیتابیس Production پروژه فقط Supabase مستقل `db_tel_cc` با ref `hovjhysmghcuxbknpvmr` است.

`SUPABASE_SERVICE_ROLE_KEY` و سایر Secretهای پرقدرت فقط در همین لایه Server-side استفاده می‌شوند و نباید وارد APK یا Repository عمومی شوند.

## Production

- Worker: `app-telegram-cc`
- URL: `https://app-telegram-cc.bustling-larch.workers.dev`
- Android API version: `1.1.0 / versionCode 2`
- Supabase: `https://hovjhysmghcuxbknpvmr.supabase.co`

Health check:

```text
GET /
```

خروجی مورد انتظار:

```text
✅ Telegram Store Builder Worker is running.
```

## مسیر اصلی اتصال Android

```text
POST /api/v1/app/connect-bot
```

Android فقط BotFather Token را ارسال می‌کند. Backend:

1. قالب Token را بررسی می‌کند.
2. Token را با Telegram `getMe` اعتبارسنجی می‌کند.
3. Merchant را با `bot_id` پیدا یا ایجاد می‌کند.
4. Bot Token را با AES-256-GCM محافظت می‌کند.
5. Webhook ربات را روی Worker تنظیم می‌کند.
6. App Session محدود ۳۰روزه صادر می‌کند.
7. خود BotFather Token را در پاسخ برنمی‌گرداند.

فلو قدیمی `POST /api/v1/app/pair` فقط برای سازگاری نسخه‌های قدیمی کد باقی مانده و UI اصلی Android دیگر از آن استفاده نمی‌کند.

## REST API Android

Public:

- `GET /api/v1/app/version`
- `POST /api/v1/app/connect-bot`

Authenticated با App Session:

- `GET /api/v1/app/me`
- `POST /api/v1/app/logout`
- `GET /api/v1/dashboard`
- `GET|POST /api/v1/categories`
- `PATCH|DELETE /api/v1/categories/:id`
- `GET|POST /api/v1/products`
- `PATCH|DELETE /api/v1/products/:id`
- `GET /api/v1/customers`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `PATCH /api/v1/orders/:id/status`
- `GET|PATCH /api/v1/settings`

## Telegram Webhookها

- `POST /webhook/store/:merchantId` — Webhook هر ربات فروشگاهی.
- `POST /webhook/master` — مسیر Master Bot قدیمی/اختیاری؛ فقط در صورت تنظیم Secretهای مربوط به آن استفاده می‌شود.

Webhook فروشگاهی قبل از پردازش، `X-Telegram-Bot-Api-Secret-Token` را با `webhook_secret` Merchant مقایسه می‌کند.

## Secretهای اجباری Production برای فلو Android

این چهار Secret برای Deploy فعلی لازم‌اند:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOKEN_ENCRYPTION_KEY`

Secretهای `MASTER_BOT_TOKEN`, `MASTER_WEBHOOK_SECRET`, `WEBHOOK_BASE_URL`, `PIN_PEPPER` و `ADMIN_SETUP_SECRET` فقط برای مسیرهای قدیمی/اختیاری Master Bot و Admin setup لازم می‌شوند و نباید مانع Deploy فلو مستقیم Android شوند.

هیچ مقدار واقعی Secret داخل این README یا `wrangler.toml` قرار نمی‌گیرد.

## دیتابیس

Schema مرجع:

```text
sql/schema.sql
```

Migration امنیتی/Android:

```text
sql/migrations/002_android_app_and_security.sql
```

جداول اصلی شامل Merchant، Category، Product، Customer، Cart، Discount، Order، Order Item، Wallet Ledger، Cooperator، Bot Session و App Session هستند.

RLS روی جدول‌های `public` فعال است و Triggerهای Tenant Integrity جلوی ارتباط داده‌های دو Merchant متفاوت را می‌گیرند.

## اجرای محلی

```bash
npm install
npm run check
npm test
npm run dev
```

فایل Secret محلی مانند `.dev.vars` نباید Commit شود.

## CI/CD

Backend CI روی Push:

- JavaScript syntax check
- 11 تست Backend
- بررسی Guard پروژه Supabase
- Wrangler dry-run

Production Deploy از `.github/workflows/backend-deploy.yml` به‌صورت دستی اجرا می‌شود تا انتشار ناخواسته اتفاق نیفتد. قبل از Deploy، تست‌ها و Secretهای اجباری دوباره بررسی می‌شوند.

## وضعیت Release 1.1.0

در Deploy Production این نسخه تمام 11 تست Backend پاس شده‌اند و Worker با Supabase اختصاصی `db_tel_cc` با موفقیت عملیاتی شده است. جزئیات Release در `docs/RELEASE_1.1.0.md` ثبت شده است.
