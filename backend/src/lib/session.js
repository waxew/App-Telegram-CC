// =============================================================================
// src/lib/session.js
// مدیریت «حافظه‌ی مکالمه» (session) برای مکالمات چندمرحله‌ای.
//
// مثال ساده برای درک بهتر: وقتی ادمین دکمه‌ی «افزودن محصول» را می‌زند، ربات
// باید چند پیام پشت‌سرهم از او بپرسد (اول اسم، بعد قیمت، بعد عکس...).
// اما هر پیام تلگرام که به Worker می‌رسد، یک درخواست کاملاً جدید و بی‌حافظه
// است — Worker به‌خودی‌خود یادش نمی‌ماند «این کاربر الان منتظر چه جوابی
// بودیم». به همین دلیل، بعد از هر پیام، وضعیت فعلی مکالمه (session) را
// در جدول bot_sessions ذخیره می‌کنیم و در پیام بعدی همان‌جا می‌خوانیمش.
//
// ساختار یک session معمولا شبیه این آبجکت است:
//   { step: "awaiting_product_price", newProduct: { name_fa: "شامپو" } }
// یعنی: «الان منتظریم کاربر قیمت را بفرستد، و اسم محصول را قبلا گرفته‌ایم»
// =============================================================================

/**
 * کلید یکتای session را برای یک کاربر در یک فروشگاه مشخص می‌سازد.
 * برای ربات اصلی (ربات‌ساز) از merchantId مقدار "master" استفاده می‌شود.
 *
 * @param {string} merchantId - آیدی فروشگاه یا رشته‌ی "master"
 * @param {number|string} telegramUserId - آیدی عددی کاربر در تلگرام
 * @returns {string}
 */
export function buildSessionKey(merchantId, telegramUserId) {
  return `${merchantId}:${telegramUserId}`;
}

/**
 * وضعیت فعلی مکالمه‌ی یک کاربر را از دیتابیس می‌خواند.
 * اگر چیزی ذخیره نشده باشد، یک آبجکت خالی برمی‌گرداند (یعنی «مرحله‌ی خاصی
 * در جریان نیست»).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionKey
 * @returns {Promise<object>}
 */
export async function getSession(supabase, sessionKey) {
  const { data, error } = await supabase
    .from("bot_sessions")
    .select("data")
    .eq("session_key", sessionKey)
    .maybeSingle(); // maybeSingle یعنی «اگر ردیفی نبود، خطا نده، فقط null برگردان»

  if (error) {
    // اگر خواندن دیتابیس با خطا مواجه شد، به‌جای متوقف‌کردن کل ربات،
    // فقط یک session خالی برمی‌گردانیم تا کاربر بتواند دوباره از اول شروع کند
    console.error("خطا در خواندن session:", error.message);
    return {};
  }

  return data?.data ?? {};
}

/**
 * وضعیت مکالمه را ذخیره یا به‌روزرسانی می‌کند.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionKey
 * @param {object} sessionData
 */
export async function setSession(supabase, sessionKey, sessionData) {
  // upsert یعنی: اگر ردیفی با این session_key وجود دارد آن را به‌روزرسانی کن،
  // در غیر این صورت یک ردیف جدید بساز
  const { error } = await supabase.from("bot_sessions").upsert({
    session_key: sessionKey,
    data: sessionData,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("خطا در ذخیره‌ی session:", error.message);
  }
}

/**
 * مکالمه را پاک می‌کند (یعنی کاربر را از هر مرحله‌ی در حال انجام خارج می‌کند).
 * معمولا بعد از پایان موفق یک عملیات (مثلا بعد از ثبت محصول جدید) صدا زده می‌شود.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionKey
 */
export async function clearSession(supabase, sessionKey) {
  const { error } = await supabase
    .from("bot_sessions")
    .delete()
    .eq("session_key", sessionKey);

  if (error) {
    console.error("خطا در پاک‌کردن session:", error.message);
  }
}
