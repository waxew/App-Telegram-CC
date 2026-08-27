// =============================================================================
// src/lib/merchantSecrets.js
// لایه‌ی واحد برای مدیریت Secretهای هر فروشگاه.
//
// هیچ فایل دیگری نباید مستقیماً درباره‌ی نحوه‌ی رمزگذاری توکن BotFather یا
// هش PIN تصمیم بگیرد. با متمرکز کردن این منطق، مهاجرت امنیتی و تست آسان‌تر است.
// =============================================================================

import { decryptSecret, encryptSecret, hmacSha256Hex, sha256Hex } from "./crypto.js";

/**
 * توکن ربات را برای ذخیره امن آماده می‌کند.
 * @param {string} token
 * @param {object} env
 */
export async function protectBotToken(token, env) {
  const tokenHash = await sha256Hex(token);
  const encrypted = await encryptSecret(token, env.TOKEN_ENCRYPTION_KEY);
  return {
    bot_token_hash: tokenHash,
    bot_token_ciphertext: encrypted.ciphertext,
    bot_token_iv: encrypted.iv,
  };
}

/**
 * توکن ربات را برای استفاده لحظه‌ای توسط grammY برمی‌گرداند.
 * فیلد bot_token فقط برای مهاجرت نسخه‌های قدیمی پشتیبانی می‌شود.
 * @param {object} merchant
 * @param {object} env
 * @returns {Promise<string>}
 */
export async function getMerchantBotToken(merchant, env) {
  if (merchant.bot_token_ciphertext && merchant.bot_token_iv) {
    return decryptSecret(
      merchant.bot_token_ciphertext,
      merchant.bot_token_iv,
      env.TOKEN_ENCRYPTION_KEY
    );
  }

  if (merchant.bot_token) return merchant.bot_token;
  throw new Error(`Merchant ${merchant.id} has no usable bot token`);
}

/**
 * PIN را با HMAC و Pepper سروری هش می‌کند.
 * merchantId داخل پیام HMAC قرار می‌گیرد تا هش دو فروشگاه برای PIN یکسان برابر نباشد.
 * @param {string} merchantId
 * @param {string} pin
 * @param {object} env
 */
export async function hashAdminPin(merchantId, pin, env) {
  return hmacSha256Hex(`${merchantId}:${pin}`, env.PIN_PEPPER);
}

/**
 * PIN واردشده را بررسی می‌کند.
 * admin_pin خام فقط برای سازگاری با داده‌های قدیمی نگه داشته شده است.
 * @param {object} merchant
 * @param {string} candidatePin
 * @param {object} env
 */
export async function verifyAdminPin(merchant, candidatePin, env) {
  if (merchant.admin_pin_hash) {
    const candidateHash = await hashAdminPin(merchant.id, candidatePin, env);
    return candidateHash === merchant.admin_pin_hash;
  }
  return Boolean(merchant.admin_pin) && merchant.admin_pin === candidatePin;
}
