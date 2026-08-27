// =============================================================================
// src/storeBot/engine.js
// این فایل «موتور مشترک» تمام فروشگاه‌هاست.
//
// نکته‌ی کلیدی معماری این پروژه همین‌جاست: ما به ازای هر فروشگاه یک نسخه‌ی
// جداگانه از کد ننوشته‌ایم! به‌جایش، یک کد واحد داریم که هر بار با
// «اطلاعات همان فروشگاه» (merchant) از دیتابیس اجرا می‌شود. یعنی هزار
// فروشگاه مختلف، همگی از همین یک موتور مشترک استفاده می‌کنند و فقط
// داده‌هایشان (محصولات، تنظیمات، رنگ متن خوش‌آمدگویی و ...) فرق دارد.
// =============================================================================

import { Bot } from "grammy";
import { registerCustomerHandlers } from "./customerHandlers.js";
import { registerAdminCatalogHandlers } from "./adminCatalog.js";
import { registerAdminOrderHandlers } from "./adminOrders.js";
import { registerAdminUserHandlers } from "./adminUsers.js";
import { registerAdminFinanceHandlers } from "./adminFinance.js";
import { registerAdminSettingsHandlers } from "./adminSettings.js";
import { registerAppPairingHandlers } from "./appPairing.js";
import { getMerchantBotToken } from "../lib/merchantSecrets.js";

/**
 * یک نمونه‌ی کامل از ربات فروشگاهیِ یک مشتری خاص می‌سازد.
 *
 * @param {object} merchant - ردیف کامل این فروشگاه از جدول merchants
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} env
 * @returns {Promise<Bot>}
 */
export async function createStoreBotInstance(merchant, supabase, env) {
  // اگر قبلا اطلاعات پایه‌ی ربات (botInfo) را در دیتابیس ذخیره کرده باشیم،
  // آن را مستقیم به grammY می‌دهیم تا لازم نباشد هر بار دوباره از تلگرام
  // با یک درخواست getMe اضافه بپرسد (باعث سریع‌تر شدن پاسخ ربات می‌شود)
  const botInfo = merchant.bot_id
    ? {
        id: merchant.bot_id,
        is_bot: true,
        first_name: merchant.bot_first_name || merchant.store_name || "Store",
        username: merchant.bot_username,
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      }
    : undefined;

  // توکن در دیتابیس به‌صورت رمز‌شده نگه‌داری می‌شود و فقط در حافظه باز می‌شود.
  const botToken = await getMerchantBotToken(merchant, env);
  const bot = new Bot(botToken, botInfo ? { botInfo } : undefined);

  // ---------------------------------------------------------------------
  // میان‌افزار (middleware) مشترک: قبل از هر هندلر دیگری اجرا می‌شود و
  // اطلاعات فروشگاه + اتصال دیتابیس را روی ctx می‌گذارد تا تمام فایل‌های
  // دیگر (customerHandlers، adminCatalog و ...) به‌راحتی به آن‌ها دسترسی
  // داشته باشند بدون این‌که مجبور باشند دوباره پارامتر اضافه بگیرند.
  // ---------------------------------------------------------------------
  bot.use(async (ctx, next) => {
    ctx.merchant = merchant;
    ctx.supabase = supabase;
    ctx.env = env;
    await next(); // اجازه بده به هندلر بعدی برسد
  });

  // ثبت تمام گروه‌های هندلر — ترتیب ثبت مهم است:
  // ابتدا هندلرهای مشخص (دکمه‌های خاص با bot.hears / bot.callbackQuery)
  // و در آخرِ customerHandlers یک «هندلر عمومی متن» هست که فقط وقتی
  // هیچ‌کدام از موارد بالا با پیام مطابقت نداشتند اجرا می‌شود (برای
  // مراحل چندقدمی مثل تایپ قیمت محصول). به همین دلیل آن را در انتهای
  // فایل customerHandlers.js نگه داشته‌ایم.
  registerCustomerHandlers(bot);
  registerAdminCatalogHandlers(bot);
  registerAdminOrderHandlers(bot);
  registerAdminUserHandlers(bot);
  registerAdminFinanceHandlers(bot);
  registerAdminSettingsHandlers(bot);
  registerAppPairingHandlers(bot);

  return bot;
}

/**
 * بررسی می‌کند آیا یک کاربر تلگرامی روی این فروشگاه دسترسی مدیریتی دارد یا نه
 * (یعنی یا مالک اصلی است، یا در جدول cooperators به‌عنوان همکار اضافه شده)
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} merchant
 * @param {number} telegramUserId
 * @returns {Promise<boolean>}
 */
export async function isStoreAdmin(supabase, merchant, telegramUserId) {
  if (Number(merchant.owner_telegram_id) === Number(telegramUserId)) {
    return true;
  }
  const { data } = await supabase
    .from("cooperators")
    .select("id")
    .eq("merchant_id", merchant.id)
    .eq("telegram_id", telegramUserId)
    .maybeSingle();
  return Boolean(data);
}
