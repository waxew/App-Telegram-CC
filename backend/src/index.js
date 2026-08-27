// =============================================================================
// src/index.js
// نقطه‌ی ورودِ اصلیِ کل پروژه روی Cloudflare Workers.
//
// هر درخواست HTTP که به آدرس Worker شما برسد، ابتدا از همین فایل عبور
// می‌کند. وظیفه‌ی این فایل فقط «مسیریابی» (routing) است: بر اساس آدرس
// (URL) درخواست تصمیم می‌گیرد کدام بخش از کد باید آن را جواب بدهد.
//
// دو نوع مسیر اصلی داریم:
//   ۱. /webhook/master            → مخصوص ربات اصلی (ربات‌ساز)
//   ۲. /webhook/store/<merchantId> → مخصوص ربات فروشگاهیِ یک مشتری خاص
// =============================================================================

import { webhookCallback } from "grammy";
import { getSupabaseClient } from "./lib/supabase.js";
import { handleMasterWebhook } from "./masterBot.js";
import { createStoreBotInstance } from "./storeBot/engine.js";
import { handleAppApi } from "./api/appApi.js";

export default {
  /**
   * تابعی که Cloudflare Workers به‌ازای هر درخواست HTTP صدا می‌زند.
   * @param {Request} request
   * @param {object} env - شامل تمام Secret ها و متغیرهای محیطی تعریف‌شده
   * @param {object} ctx - ابزارهای اجرایی Cloudflare (مثل waitUntil)
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // یک صفحه‌ی خیلی ساده برای اطمینان از این‌که Worker درست بالا آمده
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("✅ Telegram Store Builder Worker is running.", { status: 200 });
    }

    // -----------------------------------------------------------------
    // REST API اپ اندروید. تمام کلیدهای پرقدرت فقط در Worker باقی می‌مانند.
    // -----------------------------------------------------------------
    if (url.pathname.startsWith("/api/v1/")) {
      const supabase = getSupabaseClient(env);
      const apiResponse = await handleAppApi(request, env, supabase);
      if (apiResponse) return apiResponse;
    }

    // -----------------------------------------------------------------
    // مسیر وب‌هوک ربات اصلی (ربات‌ساز)
    // -----------------------------------------------------------------
    if (url.pathname === "/webhook/master" && request.method === "POST") {
      try {
        return await handleMasterWebhook(request, env);
      } catch (err) {
        console.error("خطا در پردازش وب‌هوک ربات اصلی:", err);
        // همیشه به تلگرام 200 برمی‌گردانیم تا آپدیت را دوباره‌وباره نفرستد؛
        // فقط خطا را لاگ می‌کنیم تا خودمان بعدا بررسی کنیم
        return new Response("ok", { status: 200 });
      }
    }

    // -----------------------------------------------------------------
    // مسیر وب‌هوک ربات‌های فروشگاهی: /webhook/store/<merchantId>
    // -----------------------------------------------------------------
    const storeMatch = url.pathname.match(/^\/webhook\/store\/([a-zA-Z0-9-]+)$/);
    if (storeMatch && request.method === "POST") {
      const merchantId = storeMatch[1];
      try {
        return await handleStoreWebhook(request, env, merchantId);
      } catch (err) {
        console.error(`خطا در پردازش وب‌هوک فروشگاه ${merchantId}:`, err);
        return new Response("ok", { status: 200 });
      }
    }

    // هر مسیر دیگری = پیدا نشد
    return new Response("Not found", { status: 404 });
  },
};

/**
 * یک درخواست وب‌هوک واردشده برای یک ربات فروشگاهی مشخص را پردازش می‌کند:
 * ابتدا فروشگاه را از دیتابیس پیدا می‌کند، امنیت درخواست را تایید می‌کند،
 * سپس یک نمونه از ربات آن فروشگاه ساخته و آپدیت را به آن تحویل می‌دهد.
 *
 * @param {Request} request
 * @param {object} env
 * @param {string} merchantId
 */
async function handleStoreWebhook(request, env, merchantId) {
  const supabase = getSupabaseClient(env);

  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("id", merchantId)
    .maybeSingle();

  if (error || !merchant) {
    // فروشگاهی با این آیدی وجود ندارد (شاید حذف شده)
    return new Response("merchant not found", { status: 404 });
  }

  // -------------------------------------------------------------------
  // بررسی امنیتی: مطمئن می‌شویم این درخواست واقعا از طرف تلگرام آمده،
  // نه از یک منبع مخرب که آدرس Worker ما را حدس زده باشد. تلگرام این
  // هدر را دقیقا با مقداری که هنگام setWebhook تعیین کردیم پر می‌کند.
  // -------------------------------------------------------------------
  const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== merchant.webhook_secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const bot = await createStoreBotInstance(merchant, supabase, env);
  const handler = webhookCallback(bot, "cloudflare-mod");
  return handler(request);
}
