# App-Telegram-CC

پروژهٔ **App-Telegram-CC** از دو بخش مستقل اما متصل تشکیل شده است:

- `app/` — اپ اندروید مدیریت فروشگاه با Kotlin + Jetpack Compose.
- `backend/` — موتور فروشگاه‌ساز تلگرام روی Cloudflare Workers + Supabase.

این ساختار عمداً دو لایه است. کلید `SUPABASE_SERVICE_ROLE_KEY`، توکن‌های BotFather و سایر Secretها فقط روی سرور می‌مانند و APK هیچ‌وقت به آن‌ها دسترسی مستقیم ندارد.

## دیتابیس اختصاصی پروژه

این پروژه از یک Supabase Project مستقل استفاده می‌کند و نباید با دیتابیس پروژه‌های دیگر ترکیب شود:

- Supabase Project name: `db_tel_cc`
- Project ref: `hovjhysmghcuxbknpvmr`
- Project URL: `https://hovjhysmghcuxbknpvmr.supabase.co`
- Region: `eu-central-1`

آدرس عمومی دیتابیس در `backend/wrangler.toml` قفل شده است و Backend علاوه بر آن، قبل از ساخت Supabase Client مقدار `SUPABASE_PROJECT_REF` را با hostname بررسی می‌کند. در نتیجه اگر کسی بعداً اشتباهاً URL پروژه‌ای مثل `ai-panel` را جایگزین کند، Worker اتصال را رد می‌کند.

تمام جدول‌های `public` با RLS محافظت شده‌اند. نقش‌های `anon` و `authenticated` دسترسی مستقیم ندارند و Backend فقط از `service_role` سمت سرور استفاده می‌کند. `service_role` هرگز داخل Android، GitHub source یا `wrangler.toml` قرار نمی‌گیرد.

## وضعیت نسخهٔ 1.0.0

نسخهٔ Android فعلی شامل این قسمت‌هاست:

- اتصال امن اپ به فروشگاه با کد یک‌بارمصرف ۸ کاراکتری.
- نگهداری Bearer Session با Android Keystore.
- داشبورد تعداد مشتری، محصول، سفارش و فروش ۳۰ روز اخیر.
- مدیریت دسته‌بندی‌ها: ایجاد، ویرایش، ترتیب، فعال/غیرفعال و حذف.
- مدیریت محصولات: ایجاد، ویرایش، دسته‌بندی، فعال/غیرفعال و حذف.
- فهرست و جست‌وجوی مشتری‌ها با نمایش اطلاعات تماس و کیف‌پول به‌صورت Read-only.
- فهرست سفارش‌ها، جزئیات اقلام، جمع مبلغ، تخفیف، اطلاعات ارسال و تغییر وضعیت سفارش.
- تنظیمات نام فروشگاه، کانال‌ها، پشتیبانی و پورسانت معرفی.
- بخش اعلان‌ها در تنظیمات؛ کانال Push در نسخهٔ بعدی تکمیل می‌شود.
- Drawer راست‌به‌چپ، معرفی به دوستان، درباره ما، تماس با ما و درباره نرم‌افزار.
- Back Navigation صحیح بین صفحات.
- API کنترل نسخه برای Updateهای بعدی روی همین `applicationId`.

## امنیت

1. `bot_token` ثبت‌های جدید با AES-GCM محافظت می‌شود و plaintext وارد دیتابیس نمی‌شود.
2. `admin_pin` با HMAC و Pepper سروری نگهداری می‌شود.
3. Webhook ربات اصلی امکان بررسی `MASTER_WEBHOOK_SECRET` دارد.
4. Webhook هر فروشگاه `secret_token` اختصاصی همان Merchant را بررسی می‌کند.
5. API اپ فقط بعد از Pairing یک Session محدود به همان Merchant می‌دهد.
6. Queryهای حساس با `merchant_id` Scope شده‌اند.
7. Triggerهای دیتابیس مانع اتصال رکوردهای دو Merchant مختلف می‌شوند.
8. RLS و Deny-All Policy دسترسی مستقیم کلاینت به Data API را مسدود می‌کند.
9. Backend دارای Guard مستقل برای جلوگیری از اتصال تصادفی به Supabase Project اشتباه است.
10. هیچ `service_role` یا BotFather token داخل سورس Android قرار ندارد.

جزئیات Audit در [`docs/CODE_AUDIT.md`](docs/CODE_AUDIT.md) قرار دارد.

## اجرای Backend محلی

1. داخل `backend/` دستور `npm install` را اجرا کنید.
2. فایل `.env.example` را به `.dev.vars` تبدیل کنید.
3. Secretهای واقعی را فقط داخل `.dev.vars` قرار دهید و آن را commit نکنید.
4. `npm test` و `npm run check` را اجرا کنید.
5. برای اجرای محلی از `npm run dev` استفاده کنید.

Schema مرجع دیتابیس در `backend/sql/schema.sql` با ساختار فعلی `db_tel_cc` همگام است و شامل جدول‌ها، indexها، Triggerهای tenant-integrity و RLS است.

## Secretهای Production

برای Deploy واقعی Worker این مقادیر باید به‌صورت GitHub/Cloudflare Secret تعریف شوند و نباید در Repository نوشته شوند:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_SERVICE_ROLE_KEY` — فقط مربوط به `db_tel_cc`
- `MASTER_BOT_TOKEN`
- `MASTER_WEBHOOK_SECRET`
- `WEBHOOK_BASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `PIN_PEPPER`
- `ADMIN_SETUP_SECRET`

`SUPABASE_URL` و `SUPABASE_PROJECT_REF` Secret نیستند و در `wrangler.toml` به دیتابیس اختصاصی این پروژه ثابت شده‌اند.

## انتشار Backend روی Cloudflare

Workflow دستی Production در مسیر زیر قرار دارد:

`.github/workflows/backend-deploy.yml`

این Workflow قبل از Deploy:

1. dependencyها را نصب می‌کند.
2. Syntax Check را اجرا می‌کند.
3. تست‌های Backend را اجرا می‌کند.
4. وجود تمام Secretهای Production را بدون چاپ مقدارشان بررسی می‌کند.
5. Secretهای Runtime را به Worker متصل می‌کند.
6. Worker `app-telegram-cc` را با Wrangler منتشر می‌کند.

تا زمانی که Secretهای Production کامل نشده باشند، Workflow عمداً Deploy را متوقف می‌کند.

بعد از اولین Deploy موفق، Webhook ربات اصلی باید روی مسیر زیر تنظیم شود:

`<WEBHOOK_BASE_URL>/webhook/master`

و فروشگاه‌های ساخته‌شده به‌صورت خودکار Webhook اختصاصی خود را روی مسیر زیر می‌گیرند:

`<WEBHOOK_BASE_URL>/webhook/store/<merchantId>`

## اجرای Android

پروژه را با Android Studio باز کنید و Gradle Sync را اجرا کنید. تنظیمات Build فعلی:

- `applicationId`: `ir.asteam.telegramcc`
- `minSdk`: 26
- `targetSdk / compileSdk`: 36
- `versionCode`: 1
- `versionName`: 1.0.0

اپ فقط آدرس HTTPS Worker را قبول می‌کند. سپس مالک فروشگاه داخل ربات فروشگاهی گزینهٔ «اتصال اپ مدیریت» را می‌زند و کد یک‌بارمصرف را در اپ وارد می‌کند.

## CI

- `.github/workflows/android-ci.yml` پروژه Android را Build و تست می‌کند و APK دیباگ را Artifact نگه می‌دارد.
- `.github/workflows/backend-ci.yml` Syntax، تست‌های امنیتی و Cloudflare dry-run را اجرا می‌کند.
- `.github/workflows/backend-deploy.yml` فقط با اجرای دستی و Secretهای کامل، Production را Deploy می‌کند.

## ساختار

```text
App-Telegram-CC/
├── app/                      # Kotlin / Jetpack Compose Android app
├── backend/                  # Cloudflare Worker + Telegram bots + Supabase
│   ├── sql/
│   ├── scripts/
│   └── src/
├── docs/                     # Audit و معماری
└── .github/workflows/        # CI + Production deploy
```

## گام‌های بعدی

- تکمیل اتصال Production Cloudflare به `db_tel_cc` با Secretهای واقعی.
- مدیریت کدهای تخفیف در اپ Android.
- تکمیل تنظیمات پرداخت و شماره کارت.
- گزارش‌های پیشرفته فروش.
- اعلان Push سفارش جدید.
- پاک‌سازی UIهای قدیمی و Compatibility code باقی‌مانده.
- ساخت Release امضاشده و Update-friendly با کلید امضای ثابت.
