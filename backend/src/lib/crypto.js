// =============================================================================
// src/lib/crypto.js
// ابزارهای رمزنگاری پروژه.
//
// این فایل عمداً فقط از Web Crypto API استاندارد استفاده می‌کند تا هم روی
// Cloudflare Workers اجرا شود و هم نیاز به پکیج رمزنگاری جانبی نداشته باشیم.
// مسئولیت‌های این فایل:
//   1) SHA-256 برای ساخت اثرانگشت مقادیر حساس.
//   2) HMAC-SHA256 برای هش کردن PIN با یک Pepper سروری.
//   3) AES-GCM برای رمزگذاری توکن BotFather در حالت ذخیره‌شده (at rest).
//   4) تولید توکن نشست و کد اتصال تصادفی با CSPRNG.
// =============================================================================

// الفبای کد اتصال؛ حروف/اعداد شبیه به هم حذف شده‌اند تا خطای تایپ کمتر شود.
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// TextEncoder/TextDecoder در Runtime کلادفلر به‌صورت استاندارد وجود دارند.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * آرایه بایت را به Base64 استاندارد تبدیل می‌کند.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Base64 استاندارد را به آرایه بایت تبدیل می‌کند.
 * @param {string} value
 * @returns {Uint8Array}
 */
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * آرایه بایت را به Base64URL بدون padding تبدیل می‌کند؛ مناسب توکن Bearer.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/**
 * ArrayBuffer را به رشته هگز تبدیل می‌کند تا بتوانیم روی آن Query دیتابیس بزنیم.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 یک رشته را برمی‌گرداند.
 * @param {string} value
 * @returns {Promise<string>}
 */
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bufferToHex(digest);
}

/**
 * HMAC-SHA256؛ برای PIN به‌جای ذخیره متن خام استفاده می‌شود.
 * Pepper فقط در Secretهای Worker قرار می‌گیرد و داخل دیتابیس ذخیره نمی‌شود.
 * @param {string} value
 * @param {string} pepper
 * @returns {Promise<string>}
 */
export async function hmacSha256Hex(value, pepper) {
  if (!pepper) throw new Error("PIN_PEPPER is not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bufferToHex(signature);
}

/**
 * کلید AES-256 را از Secret با فرمت Base64 وارد Web Crypto می‌کند.
 * Secret باید دقیقاً 32 بایت باشد.
 * @param {string} base64Key
 * @returns {Promise<CryptoKey>}
 */
async function importAesKey(base64Key) {
  if (!base64Key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const rawKey = base64ToBytes(base64Key);
  if (rawKey.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * یک Secret متنی را با AES-GCM رمز می‌کند.
 * IV برای هر رمزگذاری تصادفی است و کنار ciphertext ذخیره می‌شود.
 * @param {string} plaintext
 * @param {string} base64Key
 * @returns {Promise<{ciphertext: string, iv: string}>}
 */
export async function encryptSecret(plaintext, base64Key) {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Secret رمز‌شده با encryptSecret را باز می‌کند.
 * @param {string} ciphertext
 * @param {string} iv
 * @param {string} base64Key
 * @returns {Promise<string>}
 */
export async function decryptSecret(ciphertext, iv, base64Key) {
  const key = await importAesKey(base64Key);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ciphertext)
  );
  return decoder.decode(decrypted);
}

/**
 * توکن نشست پرآنتروپی تولید می‌کند.
 * مقدار خام فقط یک‌بار به اپ داده می‌شود؛ دیتابیس فقط SHA-256 آن را نگه می‌دارد.
 * @param {number} byteLength
 * @returns {string}
 */
export function generateSessionToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

/**
 * کد اتصال 8 کاراکتری قابل تایپ برای جفت‌کردن اپ و فروشگاه می‌سازد.
 * @param {number} length
 * @returns {string}
 */
export function generatePairingCode(length = 8) {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (const byte of randomBytes) {
    code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  }
  return code;
}
