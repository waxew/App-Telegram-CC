// =============================================================================
// src/storeBot/appPairing.js
// اتصال امن اپ اندروید به یک فروشگاه.
//
// فقط مالک اصلی فروشگاه می‌تواند کد اتصال بسازد. کد 8 کاراکتری تنها 5 دقیقه
// اعتبار دارد، یک‌بار مصرف است و مقدار خام آن در دیتابیس ذخیره نمی‌شود.
// =============================================================================

import { generatePairingCode, sha256Hex } from "../lib/crypto.js";

/**
 * هندلرهای مربوط به Pairing اپ را روی Bot فروشگاه ثبت می‌کند.
 * @param {import('grammy').Bot} bot
 */
export function registerAppPairingHandlers(bot) {
  // دستور /app مسیر کوتاه و قابل‌اعتماد برای گرفتن کد اتصال است.
  bot.command("app", async (ctx) => {
    await issuePairingCode(ctx);
  });

  // همان قابلیت از داخل منوی مدیریت هم قابل دسترسی است.
  bot.hears("📱 اتصال اپ مدیریت", async (ctx) => {
    await issuePairingCode(ctx);
  });
}

/**
 * کد اتصال را ایجاد و به مالک نمایش می‌دهد.
 * @param {import('grammy').Context} ctx
 */
async function issuePairingCode(ctx) {
  const { merchant, supabase } = ctx;

  // اپ دسترسی مدیریتی کامل دارد؛ بنابراین Pairing را فقط به مالک اصلی می‌دهیم.
  if (Number(ctx.from.id) !== Number(merchant.owner_telegram_id)) {
    await ctx.reply("⛔️ فقط مالک اصلی فروشگاه می‌تواند اپ مدیریت را متصل کند.");
    return;
  }

  const code = generatePairingCode(8);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // کدهای استفاده‌نشده‌ی قبلی این فروشگاه را باطل می‌کنیم تا فقط آخرین کد معتبر باشد.
  await supabase
    .from("app_pairing_codes")
    .delete()
    .eq("merchant_id", merchant.id)
    .is("used_at", null);

  const { error } = await supabase.from("app_pairing_codes").insert({
    merchant_id: merchant.id,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("خطا در ساخت کد اتصال اپ:", error.message);
    await ctx.reply("⚠️ ساخت کد اتصال ناموفق بود. دوباره تلاش کنید.");
    return;
  }

  await ctx.reply(
    "📱 کد اتصال اپ مدیریت:\n\n" +
      `🔐 ${code}\n\n` +
      "این کد فقط ۵ دقیقه و فقط برای یک‌بار استفاده معتبر است.\n" +
      "آن را فقط داخل اپ رسمی Telegram CC وارد کنید و برای شخص دیگری نفرستید."
  );
}
