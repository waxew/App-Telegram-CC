# نقشه راه App-Telegram-CC

این فایل وضعیت واقعی بعد از عملیاتی‌شدن نسخه `1.1.0` را ثبت می‌کند. مواردی که در Production تست شده‌اند از Roadmap خارج شده‌اند؛ قابلیت‌های این سند توسعه‌های بعدی هستند و مانع انتشار نسخه فعلی نیستند.

## وضعیت فعلی Production

موارد زیر در نسخه 1.1.0 فعال و تست شده‌اند:

- اتصال مستقیم BotFather Token از Android، بدون Worker URL و کد ۸ کاراکتری.
- اعتبارسنجی Token با Telegram `getMe`.
- رمزگذاری Bot Token با AES-256-GCM.
- تنظیم خودکار Webhook اختصاصی هر Merchant.
- Session محدود Android و نگهداری امن آن با Android Keystore.
- Cloudflare Worker فعال روی `app-telegram-cc.bustling-larch.workers.dev`.
- Supabase مستقل `db_tel_cc` با RLS و Tenant Integrity.
- Security Advisor بدون هشدار امنیتی در ممیزی نسخه 1.1.0.
- دسته‌بندی، محصول، مشتری، سفارش و تنظیمات از Android.
- سبد خرید، ثبت سفارش، تخفیف، معرفی/پورسانت، عضویت اجباری کانال و امکانات مدیریتی ربات.
- Backend CI، Android CI و Production Deploy.
- Android Update Version API.
- Release 1.1.0 با applicationId پایدار و Keystore ثابت.

در تست Production پاسخ‌های `200/201/204` برای Merchant، Session، دسته‌بندی، محصول، مشتری، سفارش و Bot Session ثبت شده‌اند.

## توسعه‌های تجاری بعدی

| قابلیت | وضعیت 1.1.0 | هدف نسخه بعدی |
|---|---|---|
| درگاه پرداخت آنلاین | کارت‌به‌کارت/ثبت اطلاعات پرداخت | API پرداخت + Callback امن + تطبیق تراکنش |
| موجودی انبار پیشرفته | محصول و فروش فعال است | موجودی عددی، رزرو موجودی، هشدار کمبود و جلوگیری از فروش بیشتر از موجودی |
| زیردسته‌بندی | یک سطح | `parent_id` و نمایش درختی |
| مجوز همکاران | نقش همکاری پایه | Permissionهای ریزدانه برای سفارش/مالی/محصول/تنظیمات |
| تاریخچه سفارش مشتری | فرایند سفارش فعلی | صفحه «سفارش‌های من» و پیگیری وضعیت |
| گزارش پیشرفته | Dashboard پایه | فروش روزانه/هفتگی/ماهانه، پرفروش‌ها و نرخ بازگشت مشتری |
| Push Notification Android | Toggle محلی | FCM/Push برای سفارش و رویدادهای مدیریتی |
| پنل وب مدیریت | Android + Telegram | Dashboard وب Responsive |
| اشتراک سرویس | بدون Billing مالک فروشگاه | پلن رایگان/حرفه‌ای، محدودیت و تمدید اشتراک |
| مدیریت سراسری | فاقد Super Admin UI | پنل مالک سرویس، وضعیت Merchantها و Block/Unblock |

## مقیاس‌پذیری

برای Merchantهای بزرگ‌تر این موارد در اولویت هستند:

1. Cloudflare Queue برای Broadcast و پردازش‌های حجیم به‌جای Loop طولانی داخل درخواست.
2. Pagination/Cursor برای محصولات، سفارش‌ها و مشتری‌ها در Android و Telegram.
3. Rate Limiting روی Endpoint اتصال Bot و مسیرهای حساس API.
4. Idempotency برای عملیات مالی و Callback پرداخت.
5. Observability مرکزی برای خطاهای Worker و متریک‌های عملیاتی.
6. سیاست Retention برای Sessionها و داده‌های موقت.

## بهبود تجربه فروشگاه

- یادآوری سبد خرید رهاشده.
- زبان دوم فروشگاه و استفاده کامل از `name_en`.
- کد تخفیف قابل مدیریت از Android.
- تغییر گروهی قیمت محصولات.
- مرجوعی/Refund با ثبت Ledger کامل.
- اعتبارسنجی بهتر شماره تلفن و آدرس.
- تصویر و Media management پیشرفته برای محصولات.

## بدهی فنی سازگاری

فلو قدیمی Pairing هشت‌کاراکتری دیگر در UI اصلی Android نمایش داده نمی‌شود، اما بخشی از کد سازگاری قدیمی و جدول `app_pairing_codes` فعلاً باقی مانده است. حذف آن باید در یک Migration کنترل‌شده انجام شود، نه با حذف ناگهانی، تا هیچ Merchant یا Session قدیمی آسیب نبیند.

همچنین تعدادی Composable/Compatibility helper قدیمی داخل Android وجود دارد که Route اصلی از آن‌ها استفاده نمی‌کند. پاک‌سازی آن‌ها باید همراه با Regression Test UI انجام شود و برای انتشار 1.1.0 الزام نیست.

## کنترل کیفیت مستمر

برای هر نسخه جدید باید این چرخه حفظ شود:

- Backend Syntax Check و Unit Test.
- Android Unit Test و Build هر دو Variant.
- Supabase Security Advisor بعد از تغییر Schema/RLS.
- Deploy کنترل‌شده Worker و Health Check.
- تست Merchant مجزا برای جلوگیری از نشت Tenant.
- Verify امضای APK و استفاده از همان Keystore نسخه 1.1.0.
- افزایش `versionCode` در هر انتشار.

این Roadmap عمداً قابلیت‌های «نسخه بعدی» را از مشکلات «نسخه فعلی» جدا نگه می‌دارد تا وضعیت Production پروژه مبهم نباشد.
