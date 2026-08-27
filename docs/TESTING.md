# راهنمای تست و کنترل کیفیت App-Telegram-CC

این سند مشخص می‌کند قبل از تحویل هر نسخه چه بررسی‌هایی باید انجام شود. هدف این است که فقط وجود فایل APK ملاک «آماده بودن» نباشد؛ سورس Android، Backend و ارتباط امنیتی آن‌ها باید جداگانه کنترل شوند.

## 1) Android CI

Workflow فایل `.github/workflows/android-ci.yml` روی تغییرات Android اجرا می‌شود و این مراحل را انجام می‌دهد:

1. Checkout همان Commit که قرار است Build شود.
2. راه‌اندازی JDK 17.
3. نصب Android SDK و API 36.
4. راه‌اندازی Gradle 9.5.
5. اجرای `:app:testDebugUnitTest`.
6. اجرای `:app:assembleDebug`.
7. ذخیره `app-debug.apk` به‌عنوان GitHub Actions Artifact.

اگر مرحله Compile یا ساخت APK Fail شود، Artifact قابل تحویل تولید نمی‌شود.

## 2) Backend CI

Workflow فایل `.github/workflows/backend-ci.yml` روی Backend این کنترل‌ها را انجام می‌دهد:

1. نصب dependencyهای واقعی با Node.js 22.
2. Syntax Check تمام فایل‌های `js` و `mjs`.
3. اجرای تست‌های خودکار با `npm test`.
4. اجرای `wrangler deploy --dry-run` بدون انتشار Production.

به این ترتیب یک تغییر Backend فقط زمانی معتبر است که هم JavaScript قابل اجرا باشد، هم تست‌های امنیتی پاس شوند و هم Wrangler بتواند Worker را Build کند.

## 3) تست‌های امنیتی فعلی

فایل `backend/test/crypto.test.js` موارد زیر را کنترل می‌کند:

- SHA-256 با Digest مرجع استاندارد.
- HMAC-SHA256 و وابستگی آن به `PIN_PEPPER`.
- رد شدن PIN Hash در نبود Pepper.
- Round-trip رمزگذاری و رمزگشایی AES-GCM.
- رد شدن کلید AES با طول نامعتبر.
- فرمت و طول Bearer Session Token.
- عدم تکرار نمونه‌ای Session Tokenها.
- طول و Alphabet امن کد Pairing هشت‌کاراکتری.

هیچ Bot Token، کلید Supabase یا Secret واقعی در Testها وجود ندارد.

## 4) کنترل دستی قبل از Release

بعد از سبز شدن CI، نسخه انتشار باید روی حداقل یک دستگاه واقعی Android تست شود:

- نصب تمیز برنامه.
- اجرای Pairing با کد یک‌بارمصرف.
- بستن و باز کردن برنامه و بازیابی Session.
- باز شدن Drawer از سمت راست.
- Back Navigation از صفحات فرعی به داشبورد.
- مشاهده داشبورد.
- ساخت/ویرایش/فعال‌غیرفعال/حذف دسته‌بندی.
- ساخت و مدیریت محصول.
- مشاهده سفارش و تغییر وضعیت.
- ذخیره تنظیمات فروشگاه.
- Logout و حذف Session محلی.
- نصب نسخه با `versionCode` بالاتر روی نسخه قبلی بدون پاک شدن تنظیمات موردنیاز.

## 5) Release Signing

APK دیباگ GitHub Actions فقط برای تست توسعه است. نسخه‌ای که برای انتشار عمومی یا مارکت ساخته می‌شود باید با Release Key ثابت امضا شود.

Release Key نباید داخل Repository، سورس Android، فایل ZIP عمومی یا GitHub Artifact عمومی قرار گیرد. از دست رفتن این کلید می‌تواند امکان انتشار Update روی همان برنامه را از بین ببرد.

## 6) معیار آماده بودن نسخه

یک نسخه زمانی «قابل انتشار» محسوب می‌شود که:

- Android CI سبز باشد.
- Backend CI سبز باشد.
- تست دستی مسیرهای اصلی انجام شده باشد.
- نسخه Release با کلید ثابت امضا شده باشد.
- `versionCode` از نسخه قبلی بزرگ‌تر باشد.
- Secret واقعی داخل APK یا Repository وجود نداشته باشد.
