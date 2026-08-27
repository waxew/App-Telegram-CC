// =============================================================================
// src/index.js
// نقطه‌ی ورودِ اصلیِ کل پروژه روی Cloudflare Workers.
//
// هر درخواست HTTP که به آدرس Worker برسد ابتدا از همین فایل عبور می‌کند.
// این فایل فقط Routing را انجام می‌دهد و منطق هر بخش در فایل خودش قرار دارد.
// =============================================================================

import { webhookCallback } from "grammy";
import { getSupabaseClient } from "./lib/supabase.js";
import { handleMasterWebhook } from "./masterBot.js";
import { createStoreBotInstance } from "./storeBot/engine.js";
import { handleAppApi } from "./api/appApi.js";
import { handleBotConnectApi } from "./api/botConnectApi.js";

export default {
  /**
   * تابع اصلی Cloudflare Worker برای تمام درخواست‌های HTTP.
   * @param {Request} request
   * @param {object} env
   * @param {object} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health Check ساده برای تشخیص بالا بودن Worker.
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("✅ Telegram Store Builder Worker is running.", { status: 200 });
    }

    // -----------------------------------------------------------------
    // REST API اپ اندروید.
    // service_role فقط داخل Worker استفاده می‌شود و هرگز وارد APK نمی‌شود.
    // -----------------------------------------------------------------
    if (url.pathname.startsWith("/api/v1/")) {
      const supabase = getSupabaseClient(env);

      // اتصال اولیه با BotFather Token باید قبل از Router احراز هویت‌شده بررسی شود.
      const connectResponse = await handleBotConnectApi(request, env, supabase);
      if (connectResponse) return connectResponse;

      // سایر APIهای اپ از Session محدود Merchant استفاده می‌کنند.
      const apiResponse = await handleAppApi(request, env, supabase);
      if (apiResponse) return apiResponse;
    }

    // -----------------------------------------------------------------
    // وب‌هوک ربات اصلی/ربات‌ساز.
    // -----------------------------------------------------------------
    if (url.pathname === "/webhook/master" && request.method === "POST") {
      try {
        return await handleMasterWebhook(request, env);
      } catch (err) {
        console.error("خطا در پردازش وب‌هوک ربات اصلی:", err);
        return new Response("ok", { status: 200 });
      }
    }

    // -----------------------------------------------------------------
    // وب‌هوک هر ربات فروشگاهی: /webhook/store/<merchantId>
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

    return new Response("Not found", { status: 404 });
  },
};

/**
 * درخواست وب‌هوک یک ربات فروشگاهی را پردازش می‌کند.
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
    return new Response("merchant not found", { status: 404 });
  }

  // Telegram هنگام setWebhook همین Secret را در Header درخواست برمی‌گرداند.
  const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secretHeader !== merchant.webhook_secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const bot = await createStoreBotInstance(merchant, supabase, env);
  const handler = webhookCallback(bot, "cloudflare-mod");
  return handler(request);
}
