// =============================================================================
// src/api/appAuth.js
// احراز هویت API اپ اندروید.
//
// اپ هرگز service_role یا BotFather token را دریافت نمی‌کند. بعد از Pair شدن،
// فقط یک Bearer Token تصادفی دارد. دیتابیس نیز نسخه‌ی خام این توکن را ذخیره
// نمی‌کند و فقط SHA-256 آن را نگه می‌دارد.
// =============================================================================

import { sha256Hex } from "../lib/crypto.js";

/**
 * توکن Bearer را از هدر Authorization استخراج می‌کند.
 * @param {Request} request
 * @returns {string|null}
 */
function readBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * نشست فعال را پیدا می‌کند و merchant مربوط را برمی‌گرداند.
 * @param {Request} request
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{session: object, merchant: object}|null>}
 */
export async function authenticateAppRequest(request, supabase) {
  const rawToken = readBearerToken(request);
  if (!rawToken) return null;

  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from("app_sessions")
    .select("id, merchant_id, expires_at, revoked_at, merchant:merchants(*)")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error || !session || !session.merchant) return null;

  // این به‌روزرسانی فقط برای ممیزی است؛ شکست آن نباید درخواست اصلی را خراب کند.
  try {
    await supabase
      .from("app_sessions")
      .update({ last_used_at: now })
      .eq("id", session.id);
  } catch {
    // عمداً نادیده گرفته می‌شود؛ اعتبار نشست قبلاً تأیید شده است.
  }

  return { session, merchant: session.merchant };
}
