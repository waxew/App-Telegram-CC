// =============================================================================
// src/lib/supabase.js
// این فایل مسئول ساختن Client اتصال به Supabase است.
//
// نکتهٔ امنیتی مهم این پروژه:
// App-Telegram-CC دیتابیس مستقل خودش را دارد و نباید حتی بر اثر اشتباه تنظیمات
// به دیتابیس پروژهٔ دیگری متصل شود. به همین دلیل قبل از ساخت Client، Project Ref
// موجود در SUPABASE_URL با SUPABASE_PROJECT_REF مقایسه می‌شود.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

/**
 * تنظیمات آدرس Supabase را قبل از هر اتصال اعتبارسنجی می‌کند.
 * این Guard جلوی اتصال تصادفی Worker به پروژه‌هایی مثل ai-panel را می‌گیرد.
 *
 * @param {object} env - Environment bindings در Cloudflare Workers
 * @returns {string} آدرس HTTPS تاییدشدهٔ Supabase بدون slash انتهایی
 */
export function validateSupabaseProjectConfig(env) {
  const rawUrl = String(env?.SUPABASE_URL ?? "").trim();
  const expectedRef = String(env?.SUPABASE_PROJECT_REF ?? "").trim();

  if (!rawUrl) {
    throw new Error("SUPABASE_URL is not configured.");
  }
  if (!expectedRef) {
    throw new Error("SUPABASE_PROJECT_REF is not configured.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  const expectedHost = `${expectedRef}.supabase.co`;
  if (parsed.hostname.toLowerCase() !== expectedHost.toLowerCase()) {
    throw new Error(
      `Supabase project mismatch: expected ${expectedHost}, received ${parsed.hostname}.`,
    );
  }

  return parsed.origin;
}

/**
 * Client سروری Supabase را می‌سازد.
 * service_role فقط از Secretهای Cloudflare خوانده می‌شود و هیچ‌وقت نباید داخل
 * سورس Android، wrangler.toml یا GitHub commit شود.
 *
 * @param {object} env - آبجکت env که Cloudflare Workers در هر درخواست می‌دهد
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient(env) {
  const supabaseUrl = validateSupabaseProjectConfig(env);
  const serviceRoleKey = String(env?.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Worker Stateless است؛ Sessionهای Supabase Auth را در حافظه نگه نمی‌داریم.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
