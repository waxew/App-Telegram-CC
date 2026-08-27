// =============================================================================
// src/lib/format.js
// چند تابع کوچک کمکی برای زیبا و خوانا کردن اعداد و متن‌ها.
// =============================================================================

/**
 * یک عدد را به شکل «۱۲۳٬۴۵۶ تومان» فرمت می‌کند (با جداکننده‌ی هزارگان).
 * مثال: formatToman(123456) → "123,456 تومان"
 *
 * @param {number} amount
 * @returns {string}
 */
export function formatToman(amount) {
  const num = Number(amount) || 0;
  // toLocaleString با "en-US" کاما را به‌عنوان جداکننده‌ی هزارگان می‌گذارد
  // (همان جداکننده‌ای که در ویدیوی نمونه هم دیده می‌شود، مثل ۱۲۳,۴۵۶)
  return `${num.toLocaleString("en-US")} تومان`;
}

/**
 * رشته‌ی قیمتی که کاربر تایپ کرده (که ممکن است شامل کاما، فاصله یا «تومان»
 * باشد) را تمیز کرده و به یک عدد صحیح مثبت تبدیل می‌کند.
 * اگر مقدار نامعتبر بود، null برمی‌گرداند تا کد صدازننده بتواند دوباره
 * از کاربر بخواهد که درست واردش کند.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function parsePriceInput(text) {
  if (!text) return null;
  // حذف هرچیزی جز رقم از متن ورودی (کاما، فاصله، کلمه‌ی تومان و ...)
  const cleaned = text.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const value = parseInt(cleaned, 10);
  if (Number.isNaN(value) || value < 0) return null;
  return value;
}

/**
 * یک تاریخ را به‌صورت خوانا (میلادی، ساده) برمی‌گرداند.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  try {
    const d = new Date(date);
    return d.toLocaleString("fa-IR");
  } catch {
    return String(date);
  }
}

/**
 * یک شناسه‌ی تصادفی کوتاه و خوانا می‌سازد (برای مثال برای webhook_secret).
 * از crypto.randomUUID که در Cloudflare Workers به‌صورت پیش‌فرض موجود است استفاده می‌کند.
 * @returns {string}
 */
export function generateSecret() {
  // crypto یک API استاندارد وب است که در Cloudflare Workers هم در دسترس است
  // (نیازی به import ندارد، جزو خودِ محیط اجراست)
  return crypto.randomUUID().replace(/-/g, "");
}
