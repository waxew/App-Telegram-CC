// =============================================================================
// src/lib/supabase.js
// این فایل مسئول ساختن «کلاینت» (client) اتصال به دیتابیس Supabase است.
// هر فایل دیگری که بخواهد با دیتابیس کار کند (خواندن/نوشتن محصول، سفارش و...)
// همین تابع را صدا می‌زند تا یک اتصال آماده بگیرد.
// =============================================================================

// وارد کردن تابع createClient از پکیج رسمی Supabase برای جاوااسکریپت
import { createClient } from "@supabase/supabase-js";

/**
 * یک کلاینت Supabase می‌سازد و برمی‌گرداند.
 *
 * چرا این کار را به‌شکل یک تابع جدا نوشتیم و مستقیم createClient صدا نزدیم؟
 * چون در Cloudflare Workers، متغیرهای محیطی (مثل آدرس و کلید Supabase) از
 * طریق پارامتر `env` که Cloudflare خودش به هر درخواست پاس می‌دهد در دسترس‌اند
 * (بر خلاف Node.js معمولی که از process.env استفاده می‌کند). پس این تابع
 * همان env را می‌گیرد و کلاینت را با مقادیر درست می‌سازد.
 *
 * @param {object} env - آبجکت env که Cloudflare Workers در هر درخواست می‌دهد
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient(env) {
  // SUPABASE_URL: آدرس پروژه‌ی شما در Supabase (از تنظیمات پروژه قابل کپی است)
  // SUPABASE_SERVICE_ROLE_KEY: کلید سرویس که دسترسی کامل خواندن/نوشتن می‌دهد
  // (فقط سمت سرور استفاده می‌شود، هرگز نباید در فرانت‌اند یا جای عمومی باشد)
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // در محیط سرور به‌صورت خودکار session/token را در حافظه نگه نمی‌داریم
      // چون هر درخواست Worker کاملا مستقل و بدون حافظه‌ی قبلی اجرا می‌شود
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
