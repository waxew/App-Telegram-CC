// =============================================================================
// src/storeBot/adminSettings.js
// بخش «⚙️ تنظیمات عمومی» پنل مدیریت — تنظیماتی که روی کل رفتار فروشگاه
// اثر می‌گذارند: متن/عکس خوش‌آمدگویی، قفل عضویت اجباری در کانال، کانال
// گزارش سفارش‌ها، لینک پشتیبانی، درصد پورسانت همکاری در فروش، و کد پین
// امنیتی ورود به پنل مدیریت.
// =============================================================================

import { InlineKeyboard } from "grammy";
import { adminMenuKeyboard } from "../lib/keyboards.js";
import { getSession, setSession, clearSession, buildSessionKey } from "../lib/session.js";
import { isStoreAdmin } from "./engine.js";
import { hashAdminPin } from "../lib/merchantSecrets.js";

async function requireAdmin(ctx) {
  const ok = await isStoreAdmin(ctx.supabase, ctx.merchant, ctx.from.id);
  if (!ok) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "⛔️ دسترسی ندارید", show_alert: true });
    else await ctx.reply("⛔️ شما دسترسی مدیریتی ندارید.");
  }
  return ok;
}

export function registerAdminSettingsHandlers(bot) {
  bot.hears("⚙️ تنظیمات عمومی", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const kb = new InlineKeyboard()
      .text("📝 متن خوش‌آمدگویی", "as:st")
      .text("🖼 عکس خوش‌آمدگویی", "as:si")
      .row()
      .text("🔒 کانال عضویت اجباری", "as:mc")
      .text("📢 کانال گزارش سفارش‌ها", "as:rc")
      .row()
      .text("☎️ لینک پشتیبانی", "as:sl")
      .text("🤝 درصد همکاری در فروش", "as:rp")
      .row()
      .text("🔐 کد پین پنل مدیریت", "as:pin");
    await ctx.reply("تنظیمات عمومی فروشگاه:", { reply_markup: kb });
  });

  const startStep = async (ctx, step, promptText) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), { step });
    await ctx.reply(promptText);
  };

  bot.callbackQuery("as:st", (ctx) =>
    startStep(ctx, "awaiting_start_text", "📝 متن جدید خوش‌آمدگویی را ارسال کنید:")
  );
  bot.callbackQuery("as:si", (ctx) =>
    startStep(ctx, "awaiting_start_image", "🖼 عکس جدید خوش‌آمدگویی را ارسال کنید:")
  );
  bot.callbackQuery("as:mc", (ctx) =>
    startStep(
      ctx,
      "awaiting_mandatory_channel",
      "🔒 آیدی کانال را با @ ارسال کنید (مثلا @MyChannel).\n" +
        "⚠️ حتما ربات را ادمین همان کانال کنید، وگرنه این قفل کار نمی‌کند.\n" +
        "برای غیرفعال‌کردن کامل این قفل، کلمه‌ی «حذف» را بفرستید."
    )
  );
  bot.callbackQuery("as:rc", (ctx) =>
    startStep(
      ctx,
      "awaiting_report_channel",
      "📢 آیدی کانال گزارش سفارش‌ها را با @ ارسال کنید (ربات باید ادمین آن باشد):"
    )
  );
  bot.callbackQuery("as:sl", (ctx) =>
    startStep(ctx, "awaiting_support_link", "☎️ لینک یا آیدی پشتیبانی را ارسال کنید:")
  );
  bot.callbackQuery("as:rp", (ctx) =>
    startStep(
      ctx,
      "awaiting_referral_percent",
      "🤝 چند درصد از هر خرید، به‌عنوان پورسانت به معرف‌کننده تعلق بگیرد؟ (عدد بین ۰ تا ۱۰۰، برای غیرفعال‌کردن 0 بفرستید):"
    )
  );
  bot.callbackQuery("as:pin", (ctx) =>
    startStep(
      ctx,
      "awaiting_admin_pin_set",
      "🔐 کد پین جدید را ارسال کنید (فقط عدد).\nبرای حذف کامل پین، کلمه‌ی «حذف» را بفرستید:"
    )
  );

  // ---------------------------------------------------------------------
  // هندلر عمومیِ متن — این فایل آخرین فایلی است که ثبت می‌شود، پس اگر
  // هیچ‌کدام از مراحل زیر مطابقت نداشت، دیگر فایل بعدی‌ای برای next()
  // وجود ندارد؛ در آن حالت پیام بدون واکنش خاصی نادیده گرفته می‌شود.
  // ---------------------------------------------------------------------
  bot.on("message:text", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);
    const text = ctx.message.text.trim();

    switch (session.step) {
      case "awaiting_start_text": {
        if (!(await requireAdmin(ctx))) return;
        await supabase.from("merchants").update({ start_text: text }).eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ متن خوش‌آمدگویی به‌روزرسانی شد.", { reply_markup: adminMenuKeyboard() });
        return;
      }

      case "awaiting_mandatory_channel": {
        if (!(await requireAdmin(ctx))) return;
        const value = text === "حذف" ? null : text;
        await supabase.from("merchants").update({ mandatory_channel: value }).eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply(
          value ? "✅ قفل عضویت اجباری فعال شد." : "✅ قفل عضویت اجباری غیرفعال شد.",
          { reply_markup: adminMenuKeyboard() }
        );
        return;
      }

      case "awaiting_report_channel": {
        if (!(await requireAdmin(ctx))) return;
        await supabase.from("merchants").update({ report_channel: text }).eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ کانال گزارش سفارش‌ها ثبت شد.", { reply_markup: adminMenuKeyboard() });
        return;
      }

      case "awaiting_support_link": {
        if (!(await requireAdmin(ctx))) return;
        await supabase.from("merchants").update({ support_link: text }).eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ لینک پشتیبانی ثبت شد.", { reply_markup: adminMenuKeyboard() });
        return;
      }

      case "awaiting_referral_percent": {
        if (!(await requireAdmin(ctx))) return;
        const percent = Number(text.replace(/[^\d.]/g, ""));
        if (Number.isNaN(percent) || percent < 0 || percent > 100) {
          await ctx.reply("❌ عدد باید بین ۰ تا ۱۰۰ باشد. دوباره وارد کنید:");
          return;
        }
        await supabase.from("merchants").update({ referral_percent: percent }).eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply(`✅ درصد همکاری در فروش روی ${percent}% تنظیم شد.`, {
          reply_markup: adminMenuKeyboard(),
        });
        return;
      }

      case "awaiting_admin_pin_set": {
        if (!(await requireAdmin(ctx))) return;
        const value = text === "حذف" ? null : text.replace(/[^\d]/g, "");
        const pinHash = value ? await hashAdminPin(merchant.id, value, ctx.env) : null;
        // admin_pin خام را پاک می‌کنیم تا PIN قابل بازیابی از دیتابیس نباشد.
        await supabase
          .from("merchants")
          .update({ admin_pin: null, admin_pin_hash: pinHash })
          .eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply(value ? "✅ کد پین تنظیم شد." : "✅ کد پین حذف شد.", {
          reply_markup: adminMenuKeyboard(),
        });
        return;
      }

      default:
        await next();
    }
  });

  // ---------------------------------------------------------------------
  // هندلر عمومیِ عکس — فقط برای مرحله‌ی «عکس خوش‌آمدگویی»
  // ---------------------------------------------------------------------
  bot.on("message:photo", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);

    if (session.step === "awaiting_start_image") {
      if (!(await requireAdmin(ctx))) return;
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      await supabase.from("merchants").update({ start_image_file_id: fileId }).eq("id", merchant.id);
      await clearSession(supabase, sessionKey);
      await ctx.reply("✅ عکس خوش‌آمدگویی به‌روزرسانی شد.", { reply_markup: adminMenuKeyboard() });
      return;
    }

    await next();
  });
}
