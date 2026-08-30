# App-Telegram-CC — Release 1.1.0

این سند گزارش فنی انتشار نسخه `1.1.0` است و برای نگهداری تاریخچهٔ Release، Signing و وضعیت Production داخل Repository ذخیره می‌شود.

## مشخصات Android

- Application ID: `ir.asteam.telegramcc`
- Version code: `2`
- Version name: `1.1.0`
- Min SDK: `26`
- Target SDK: `36`
- Compile SDK: `36`
- Java/JVM target: `17`
- UI: Kotlin + Jetpack Compose
- Backend base URL: `https://app-telegram-cc.bustling-larch.workers.dev`

## Signing

Release 1.1.0 اولین نسخه‌ای است که با Keystore پایدار Production پروژه امضا می‌شود. خود Keystore و Passwordها Secret هستند و داخل GitHub قرار نمی‌گیرند.

- Alias: `telegramcc`
- Certificate SHA-256: `57:70:63:32:5B:26:2A:D2:67:6A:F7:64:E6:9C:31:19:18:E0:52:92:26:43:FE:AF:E4:A8:C7:68:8D:9C:A0:77`

تمام نسخه‌های بعدی باید با همین Keystore امضا شوند؛ تغییر کلید باعث می‌شود Android APK جدید را Update نسخه نصب‌شده تشخیص ندهد.

## Production Backend

- Cloudflare Worker: `app-telegram-cc`
- URL: `https://app-telegram-cc.bustling-larch.workers.dev`
- نسخه Worker منتشرشده برای 1.1.0: `f1984713-8f7c-4789-aabb-0dabfba86e35`
- Supabase project: `db_tel_cc`
- Supabase ref: `hovjhysmghcuxbknpvmr`

Worker 1.1.0 با این Version metadata منتشر شده است:

- `ANDROID_LATEST_VERSION_CODE=2`
- `ANDROID_LATEST_VERSION_NAME=1.1.0`
- `ANDROID_FORCE_UPDATE=false`

## تست‌های تأییدشده

Backend Deploy نسخه 1.1.0:

- JavaScript syntax check: PASS
- Backend test suite: 11/11 PASS
- Production Secret validation: PASS
- Cloudflare Worker deploy: PASS

Android CI:

- Unit test task: PASS
- Debug assemble: PASS
- Release assemble: PASS
- Debug Artifact: generated
- Release unsigned Artifact: generated
- Source ZIP: generated

Supabase Production smoke test قبلی بعد از اصلاح کلید سرور:

- Merchant lookup: HTTP 200
- Merchant create: HTTP 201
- App session create: HTTP 201
- Category operations: HTTP 200/201
- Product operations: HTTP 200/201
- Customer operations: HTTP 200
- Order operations: HTTP 200
- Bot session create: HTTP 201

Supabase Security Advisor در ممیزی Release بدون هشدار امنیتی (`lints: []`) بوده است.

## معماری اتصال

فلو اصلی کاربر:

`BotFather Token → Android → Cloudflare Worker → db_tel_cc → Telegram Bot`

کاربر نهایی فقط BotFather Token را وارد می‌کند. Worker URL، Supabase key و کلیدهای رمزنگاری هیچ‌کدام در UI درخواست نمی‌شوند.

## سیاست Secretها

موارد زیر نباید در Repository عمومی، APK یا مستندات قرار گیرند:

- Cloudflare API Token
- Supabase Secret/Service Role Key
- Token Encryption Key
- Keystore file/password
- BotFather Token کاربران

## Update Policy

برای هر Release بعدی:

1. `versionCode` باید افزایش پیدا کند.
2. `applicationId` باید ثابت بماند.
3. همان Keystore و Alias نسخه 1.1.0 استفاده شود.
4. Backend version endpoint باید با نسخه Android همگام شود.
5. Release APK باید بعد از Sign با ابزار رسمی Android Verify شود.
6. SHA-256 فایل Release ثبت و همراه Artifact نگهداری شود.

## نکته درباره Download URL

Version API فعال است، اما `ANDROID_DOWNLOAD_URL` تا زمانی که APK نهایی روی یک میزبان عمومی پایدار قرار نگیرد خالی می‌ماند. این موضوع مانع اجرای اپ یا اتصال فروشگاه نیست؛ فقط لینک دانلود خودکار Update را غیرفعال نگه می‌دارد.
