# App-Telegram-CC

`App-Telegram-CC` یک سامانهٔ فروشگاه‌ساز تلگرامی با پنل مدیریت Android است که از سه لایهٔ جدا و امن تشکیل شده است:

- `app/` — اپ Android با Kotlin + Jetpack Compose.
- `backend/` — Cloudflare Worker برای API اپ و Webhook ربات‌های فروشگاهی.
- `db_tel_cc` — دیتابیس اختصاصی Supabase برای Merchantها، مشتری‌ها، محصولات، سفارش‌ها، Sessionها و داده‌های فروشگاه.

## وضعیت Production

نسخهٔ فعلی: **1.1.0**

- Android `versionCode`: `2`
- Android `versionName`: `1.1.0`
- Application ID پایدار: `ir.asteam.telegramcc`
- Worker Production: `https://app-telegram-cc.bustling-larch.workers.dev`
- Supabase Project: `db_tel_cc`
- Supabase Project ref: `hovjhysmghcuxbknpvmr`

مسیر اتصال واقعی در Production تست شده است:

`BotFather Token → Android APK → Cloudflare Worker → db_tel_cc → Telegram Bot`

کاربر نهایی دیگر Worker URL یا کد اتصال ۸ کاراکتری وارد نمی‌کند. تنها Token ربات ساخته‌شده در BotFather را داخل اپ وارد می‌کند؛ Backend اعتبار Token را با Telegram بررسی می‌کند، Merchant را ایجاد/بازیابی می‌کند، Webhook را تنظیم می‌کند و Session محدود اپ صادر می‌کند.

## قابلیت‌های Android

- اتصال مستقیم و امن با BotFather Token.
- عدم ذخیره BotFather Token داخل گوشی.
- Session محدود و رمز‌شده با Android Keystore.
- داشبورد تعداد مشتری، محصول و سفارش و فروش ۳۰ روز اخیر.
- مدیریت دسته‌بندی: ایجاد، ویرایش، ترتیب نمایش، فعال/غیرفعال و حذف.
- مدیریت محصول: ایجاد، ویرایش، دسته‌بندی، قیمت، توضیحات، فعال/غیرفعال و حذف.
- نمایش و جست‌وجوی مشتری‌ها.
- نمایش سفارش‌ها و جزئیات اقلام هر سفارش.
- تغییر وضعیت سفارش: `pending / paid / shipped / cancelled`.
- تنظیمات نام فروشگاه، کانال اجباری، کانال گزارش، لینک پشتیبانی و درصد معرفی.
- Drawer راست‌به‌چپ.
- معرفی به دوستان، درباره ما، تماس با ما و درباره نرم‌افزار.
- Back Navigation صحیح بین صفحات.
- بررسی نسخه جدید از Backend.
- پشتیبانی Dark/Light بر اساس Theme سیستم.

## قابلیت‌های ربات فروشگاهی

Backend یک موتور مشترک Multi-tenant دارد و برای هر فروشگاه کد جداگانه Deploy نمی‌شود. هر Merchant داده و Token رمز‌شدهٔ خودش را دارد.

قابلیت‌های فعلی شامل:

- نمایش دسته‌بندی و محصول.
- سبد خرید و تغییر تعداد.
- تسویه‌حساب و ثبت سفارش.
- شماره تماس، آدرس و روش ارسال.
- کد تخفیف.
- کیف پول و Ledger.
- معرفی/پورسانت.
- عضویت اجباری کانال.
- مدیریت دسته‌بندی و محصول از ربات.
- مدیریت سفارش‌ها.
- همکاران فروش.
- پیام همگانی و تنظیمات فروشگاه.

## امنیت

- Bot Token جدید به‌صورت AES-256-GCM رمزگذاری می‌شود.
- Token plaintext جدید وارد دیتابیس نمی‌شود.
- `TOKEN_ENCRYPTION_KEY` فقط Secret سرور است.
- `SUPABASE_SERVICE_ROLE_KEY` فقط روی Worker قرار دارد و وارد APK یا Repository نمی‌شود.
- Webhook هر فروشگاه `secret_token` اختصاصی دارد.
- App Sessionها فقط به Merchant خودشان دسترسی دارند.
- Queryهای حساس دوباره با `merchant_id` Scope می‌شوند.
- Triggerهای Tenant Integrity مانع اتصال داده‌های دو Merchant مختلف می‌شوند.
- RLS روی جدول‌های `public` فعال است.
- `anon` و `authenticated` دسترسی مستقیم مدیریتی ندارند.
- Security Advisor پروژه Supabase در ممیزی نسخه 1.1.0 بدون هشدار امنیتی است.
- Worker دارای Guard برای جلوگیری از اتصال تصادفی به Supabase Project دیگر است.

## دیتابیس اختصاصی

این پروژه فقط از پروژه زیر استفاده می‌کند:

- Name: `db_tel_cc`
- Ref: `hovjhysmghcuxbknpvmr`
- URL: `https://hovjhysmghcuxbknpvmr.supabase.co`

اتصال به پروژه‌های دیگر از جمله `ai-panel` برای این پروژه مجاز نیست.

## Secretهای Production

برای فلو فعلی Android فقط این Secretها برای Deploy اجباری هستند:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOKEN_ENCRYPTION_KEY`

مقادیر مربوط به Master Bot قدیمی فقط در صورت فعال‌کردن آن مسیر لازم می‌شوند و نباید مانع Deploy فلو مستقیم Android شوند.

هیچ Secret واقعی نباید داخل Commit، APK، `wrangler.toml` یا مستندات عمومی قرار گیرد.

## Release Signing Android

نسخه 1.1.0 برای امضای پایدار آماده شده است. تنظیمات Gradle اطلاعات Signing را فقط از Environment می‌خواند:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keystore خصوصی نباید در Repository عمومی Commit شود. تمام Updateهای آینده باید با همان Keystore امضا شوند؛ در غیر این صورت Android نسخه جدید را به‌عنوان Update نسخه قبلی قبول نمی‌کند.

## CI/CD

### Android CI

`.github/workflows/android-ci.yml`

روی Push/PR:

1. JDK 17 و Android API 36 را آماده می‌کند.
2. تست‌های Unit را اجرا می‌کند.
3. Debug APK را می‌سازد.
4. Release unsigned APK را می‌سازد.
5. ZIP کامل سورس همان Commit را تولید می‌کند.
6. SHA-256 Artifactها را تولید می‌کند.

### Backend CI

`.github/workflows/backend-ci.yml`

- Syntax Check
- تست‌های Backend
- تست پیکربندی Supabase اختصاصی
- Cloudflare Wrangler dry-run

### Production Deploy

`.github/workflows/backend-deploy.yml`

قبل از Deploy:

- Dependencyها نصب می‌شوند.
- تست‌ها اجرا می‌شوند.
- وجود Secretهای Production بررسی می‌شود.
- Secretهای Runtime روی Worker ثبت می‌شوند.
- Worker با Wrangler Deploy می‌شود.

Worker فعال:

`https://app-telegram-cc.bustling-larch.workers.dev`

Health Check:

`GET /`

Version API:

`GET /api/v1/app/version`

اتصال BotFather:

`POST /api/v1/app/connect-bot`

## اجرای محلی Backend

داخل پوشه `backend/`:

```bash
npm install
npm run check
npm test
npm run dev
```

Secretهای محلی را فقط داخل فایل Local مانند `.dev.vars` قرار دهید و هرگز Commit نکنید.

## ساخت Android

پروژه را با Android Studio باز کنید و Gradle Sync را اجرا کنید.

مشخصات فعلی:

- `applicationId`: `ir.asteam.telegramcc`
- `minSdk`: 26
- `targetSdk`: 36
- `compileSdk`: 36
- `versionCode`: 2
- `versionName`: 1.1.0

برای QA:

```text
:app:assembleDebug
```

برای Release unsigned:

```text
:app:assembleRelease
```

برای Release نهایی، Signing Environment Variables باید به Keystore پایدار اشاره کنند.

## ساختار Repository

```text
App-Telegram-CC/
├── app/                       # Android Kotlin/Compose
├── backend/                   # Cloudflare Worker + Telegram bot engine
│   ├── sql/                   # Schema/Migrations مرجع
│   ├── scripts/               # ابزارهای migration/security
│   ├── src/api/               # REST API Android
│   ├── src/lib/               # Crypto/Supabase/session helpers
│   └── src/storeBot/          # موتور فروشگاه تلگرامی
├── docs/                      # Architecture/Audit/Testing
└── .github/workflows/         # CI/CD
```

## وضعیت تست Production

در تست عملی Production موارد زیر با پاسخ موفق Supabase ثبت شده‌اند:

- Merchant lookup: `200`
- Merchant create: `201`
- App Session create: `201`
- Categories: `200/201`
- Products: `200/201`
- Customers: `200`
- Orders: `200`
- Bot Sessions: `201`

این موارد نشان می‌دهند مسیر Android، Worker، Supabase و Telegram از حالت اسکلت خارج شده و Backend واقعی پروژه فعال است.

## توسعه‌های نسخه‌های بعدی

مواردی مانند درگاه پرداخت آنلاین، موجودی انبار پیشرفته، زیر‌دسته‌بندی، گزارش‌های تحلیلی گسترده، Push Notification، پنل وب سراسری و سیستم پلن/اشتراک جزو Roadmap نسخه‌های بعدی هستند و جزء الزامات انتشار 1.1.0 محسوب نمی‌شوند.
