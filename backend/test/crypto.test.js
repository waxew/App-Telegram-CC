// =============================================================================
// test/crypto.test.js
// تست‌های رگرسیون برای ابزارهای امنیتی Backend.
//
// هدف این تست‌ها این است که تغییرات آینده نتوانند بی‌صدا رفتار SHA-256، HMAC،
// AES-GCM، Session Token یا Pairing Code را خراب کنند. این فایل فقط از Runner
// داخلی Node.js استفاده می‌کند و هیچ dependency تستی اضافی وارد پروژه نمی‌کند.
// =============================================================================

// Runner استاندارد Node.js برای تعریف Test Caseها.
import test from "node:test";
// Assertionهای Strict برای مقایسه دقیق خروجی‌ها.
import assert from "node:assert/strict";

// توابع امنیتی واقعی همان Backend را تست می‌کنیم؛ Mock رمزنگاری استفاده نمی‌شود.
import {
  decryptSecret,
  encryptSecret,
  generatePairingCode,
  generateSessionToken,
  hmacSha256Hex,
  sha256Hex,
} from "../src/lib/crypto.js";

// الفبای مجاز Pairing باید با نسخه Production هماهنگ بماند.
const PAIRING_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

// SHA-256 ورودی ثابت باید همیشه Digest استاندارد و شناخته‌شده را برگرداند.
test("sha256Hex returns the standard SHA-256 digest", async () => {
  // مقدار مرجع رسمی برای رشته abc استفاده می‌شود تا تست مستقل از پیاده‌سازی باشد.
  const digest = await sha256Hex("abc");

  // اگر الگوریتم/Encoding ناخواسته تغییر کند این Assertion فوراً Fail می‌شود.
  assert.equal(
    digest,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

// HMAC باید برای ورودی و Pepper یکسان خروجی پایدار داشته باشد.
test("hmacSha256Hex is deterministic and pepper-dependent", async () => {
  // دو بار همان ورودی را با Pepper یکسان هش می‌کنیم.
  const first = await hmacSha256Hex("1234", "server-pepper");
  const second = await hmacSha256Hex("1234", "server-pepper");
  // یک Pepper متفاوت باید خروجی متفاوت تولید کند.
  const changedPepper = await hmacSha256Hex("1234", "another-pepper");

  // خروجی HMAC-SHA256 در Hex دقیقاً 64 کاراکتر است.
  assert.match(first, /^[a-f0-9]{64}$/);
  // ورودی یکسان باید Digest یکسان داشته باشد.
  assert.equal(first, second);
  // Pepper متفاوت نباید همان Digest را بسازد.
  assert.notEqual(first, changedPepper);
});

// بدون Pepper نباید PIN قابل هش‌کردن باشد؛ این Guard بخشی از امنیت پروژه است.
test("hmacSha256Hex rejects an empty pepper", async () => {
  // Promise باید با پیام تنظیم نبودن Secret رد شود.
  await assert.rejects(
    () => hmacSha256Hex("1234", ""),
    /PIN_PEPPER is not configured/,
  );
});

// AES-GCM باید Secret را رمز و سپس بدون تغییر بازیابی کند.
test("AES-GCM encryptSecret/decryptSecret round-trips a bot token", async () => {
  // یک کلید 32 بایتی ثابت فقط برای تست می‌سازیم؛ Secret واقعی در Repository نیست.
  const testKey = Buffer.alloc(32, 7).toString("base64");
  // نمونه توکن ساختگی است و Credential واقعی محسوب نمی‌شود.
  const plaintext = "123456789:TEST_TELEGRAM_BOT_TOKEN";

  // رمزگذاری باید Ciphertext و IV تصادفی تولید کند.
  const encrypted = await encryptSecret(plaintext, testKey);
  // سپس همان داده را با همان کلید باز می‌کنیم.
  const decrypted = await decryptSecret(encrypted.ciphertext, encrypted.iv, testKey);

  // Ciphertext نباید متن خام را لو بدهد.
  assert.notEqual(encrypted.ciphertext, plaintext);
  // IV باید وجود داشته باشد.
  assert.ok(encrypted.iv.length > 0);
  // Round-trip باید دقیقاً متن اولیه را برگرداند.
  assert.equal(decrypted, plaintext);
});

// کلید AES اشتباه از نظر طول باید قبل از رمزگذاری رد شود.
test("encryptSecret rejects an AES key that is not 32 bytes", async () => {
  // این Base64 فقط 16 بایت دارد و برای AES-256 معتبر نیست.
  const invalidKey = Buffer.alloc(16, 1).toString("base64");

  // Guard باید خطای واضح 32-byte تولید کند.
  await assert.rejects(
    () => encryptSecret("secret", invalidKey),
    /exactly 32 bytes/,
  );
});

// Session Token باید طول/آنتروپی مناسب و فرمت Base64URL داشته باشد.
test("generateSessionToken creates unique base64url bearer tokens", () => {
  // چند Token می‌سازیم تا هم فرمت و هم عدم تکرار ساده بررسی شود.
  const tokens = Array.from({ length: 32 }, () => generateSessionToken(32));

  // Base64URL فقط حروف، اعداد، خط تیره و underscore دارد.
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    // 32 بایت در Base64URL بدون padding معمولاً 43 کاراکتر است.
    assert.equal(token.length, 43);
  }

  // در این نمونه کوچک هیچ Token نباید تکراری باشد.
  assert.equal(new Set(tokens).size, tokens.length);
});

// Pairing Code باید دقیقاً طول خواسته‌شده و فقط حروف/اعداد غیرمبهم داشته باشد.
test("generatePairingCode uses the safe human-readable alphabet", () => {
  // چندین کد تولید می‌کنیم تا Constraint فرمت روی خروجی واقعی بررسی شود.
  const codes = Array.from({ length: 64 }, () => generatePairingCode(8));

  // تمام کدها باید 8 کاراکتر و مطابق Alphabet امن باشند.
  for (const code of codes) {
    assert.equal(code.length, 8);
    assert.match(code, PAIRING_PATTERN);
  }

  // احتمال Collision در 64 نمونه بسیار ناچیز است؛ تکرار می‌تواند Regression RNG باشد.
  assert.equal(new Set(codes).size, codes.length);
});
