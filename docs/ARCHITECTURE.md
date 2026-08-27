# معماری App-Telegram-CC

```text
مالک فروشگاه
   │
   ├── Telegram Store Bot ── /app ──> One-time Pairing Code
   │                                  │
   │                                  ▼
   └── Android App ── HTTPS ──> Cloudflare Worker API
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             Telegram Bot API               Supabase
             webhook/setWebhook          merchant-scoped data
```

## اصل امنیتی

Android App یک Client غیرقابل‌اعتماد در نظر گرفته می‌شود. بنابراین هیچ Secret سراسری در آن وجود ندارد. تمام دسترسی پرقدرت به Supabase در Worker باقی می‌ماند و هر درخواست Android با Session محدود Merchant احراز هویت می‌شود.

## چرخه Pairing

1. مالک در ربات فروشگاهی `/app` یا «اتصال اپ مدیریت» را می‌زند.
2. Worker یک کد تصادفی تولید و فقط SHA-256 آن را با تاریخ انقضا ذخیره می‌کند.
3. اپ کد را به `/api/v1/app/pair` می‌فرستد.
4. Worker کد را به‌صورت اتمیک `used_at` می‌کند.
5. Worker یک Session Token تصادفی می‌سازد، فقط Hash آن را ذخیره و Raw Token را یک‌بار به اپ می‌دهد.
6. اپ Raw Token را با Android Keystore رمز می‌کند.

## چرخه درخواست

هر Route مدیریتی:

1. Bearer Token را Hash می‌کند.
2. Session معتبر، منقضی‌نشده و revoke‌نشده را پیدا می‌کند.
3. Merchant را از همان Session تعیین می‌کند.
4. Query دیتابیس را با `merchant_id = merchant.id` Scope می‌کند.
