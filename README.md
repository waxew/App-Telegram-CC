# App-Telegram-CC

پروژهٔ **App-Telegram-CC** از دو بخش مستقل اما متصل تشکیل شده است:

- `app/` — اپ اندروید مدیریت فروشگاه با Kotlin + Jetpack Compose.
- `backend/` — موتور فروشگاه‌ساز تلگرام روی Cloudflare Workers + Supabase.

این ساختار عمداً دو لایه است. کلید `SUPABASE_SERVICE_ROLE_KEY`، توکن‌های BotFather و سایر Secretها فقط روی سرور می‌مانند و APK هیچ‌وقت به آن‌ها دسترسی مستقیم ندارد.

## وضعیت نسخهٔ 1.0.0

نسخهٔ پایهٔ Android شامل این قسمت‌هاست:

- اتصال امن اپ به فروشگاه با **کد یک‌بارمصرف ۸ کاراکتری** از داخل ربات.
- نگهداری Bearer Session به‌صورت رمز‌شده با Android Keystore.
- داشبورد تعداد مشتری، محصول، سفارش و فروش ۳۰ روز اخیر.
- نمایش محصولات، افزودن محصول و فعال/غیرفعال کردن محصول.
- نمایش سفارش‌ها و تغییر وضعیت سفارش.
- تنظیمات نام فروشگاه، کانال‌ها، پشتیبانی و پورسانت معرفی.
- بخش اعلان‌ها در تنظیمات؛ کانال Push در نسخهٔ بعدی تکمیل می‌شود.
- Drawer راست‌به‌چپ، معرفی به دوستان، درباره ما، تماس با ما و درباره نرم‌افزار.
- Back Navigation صحیح؛ صفحات فرعی به داشبورد برمی‌گردند.
- API کنترل نسخه برای نصب Updateهای بعدی روی همین `applicationId`.

## امنیت

در تحلیل نسخهٔ ZIP اولیه چند مورد اصلاح شد:

1. `bot_token` و `admin_pin` در نسخهٔ اولیه به‌صورت plaintext قابل ذخیره بودند. ثبت‌های جدید به‌ترتیب با AES-GCM و HMAC محافظت می‌شوند.
2. برای دیتابیس‌های قدیمی، `backend/scripts/migrate-secrets.mjs` plaintextهای باقی‌مانده را مهاجرت می‌کند.
3. Webhook ربات اصلی امکان بررسی `MASTER_WEBHOOK_SECRET` دارد.
4. API اپ فقط بعد از Pairing یک Session محدود به همان Merchant می‌دهد.
5. Queryهای حساس با `merchant_id` Scope شده‌اند و Triggerهای دیتابیس نیز مانع ارتباط رکوردهای دو فروشگاه مختلف می‌شوند.
6. هیچ `service_role` یا BotFather token داخل سورس Android قرار ندارد.

جزئیات کامل Audit در [`docs/CODE_AUDIT.md`](docs/CODE_AUDIT.md) نوشته شده است.

## اجرای Backend

1. یک پروژه Supabase بسازید.
2. برای دیتابیس تازه، `backend/sql/schema.sql` را در SQL Editor اجرا کنید. برای دیتابیس نسخهٔ قدیمی، migration شماره 002 را اجرا کنید.
3. داخل `backend/` دستور `npm install` را اجرا کنید.
4. فایل `.env.example` را برای محیط محلی به `.dev.vars` تبدیل و مقادیر واقعی را وارد کنید.
5. برای Production، Secretها را با `wrangler secret put` در Cloudflare ثبت کنید؛ Secret واقعی را commit نکنید.
6. Worker را با `npm run deploy` منتشر کنید.
7. Webhook ربات اصلی را روی `/webhook/master` تنظیم و همان `MASTER_WEBHOOK_SECRET` را به Telegram بدهید.

بعد از Migration دیتابیس قدیمی، Secretهای قبلی را نیز مهاجرت کنید:

```bash
cd backend
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
TOKEN_ENCRYPTION_KEY=... \
PIN_PEPPER=... \
npm run migrate:secrets
```

## اجرای Android

پروژه را با Android Studio باز کنید و Gradle Sync را اجرا کنید. تنظیمات Build فعلی:

- `applicationId`: `ir.asteam.telegramcc`
- `minSdk`: 26
- `targetSdk / compileSdk`: 37
- `versionCode`: 1
- `versionName`: 1.0.0

اپ فقط آدرس **HTTPS** Worker را قبول می‌کند. سپس مالک فروشگاه داخل ربات فروشگاهی گزینه **«اتصال اپ مدیریت»** را می‌زند و کد یک‌بارمصرف را در اپ وارد می‌کند.

## CI

- `.github/workflows/android-ci.yml` پروژه Android را با JDK 17، Gradle 9.5 و API 37 Build می‌کند و APK دیباگ را به‌عنوان Artifact نگه می‌دارد.
- `.github/workflows/backend-ci.yml` Syntax و Dry-run Build بک‌اند Cloudflare را بررسی می‌کند.

## ساختار

```text
App-Telegram-CC/
├── app/                      # Kotlin / Jetpack Compose Android app
├── backend/                  # Cloudflare Worker + Telegram bots + Supabase
│   ├── sql/
│   ├── scripts/
│   └── src/
├── docs/                     # Audit و معماری
└── .github/workflows/        # CI
```

## گام‌های بعدی

نسخهٔ فعلی یک پایهٔ عملیاتی است. برای فاز بعد پیشنهاد می‌شود مدیریت کامل دسته‌بندی، ویرایش/حذف محصول، جزئیات سفارش، اعلان Push سفارش جدید، گزارش فروش، آپلود تصویر محصول و ساخت Release امضاشده اضافه شود.
