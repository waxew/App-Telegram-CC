// =============================================================================
// src/storeBot/adminFinance.js
// بخش «💰 بخش مالی» پنل مدیریت:
//   - تنظیم شماره کارت برای پرداخت کارت‌به‌کارت
//   - ساخت، دیدن و حذف کدهای تخفیف
// =============================================================================

import { InlineKeyboard } from "grammy";
import { adminMenuKeyboard, confirmKeyboard } from "../lib/keyboards.js";
import { getSession, setSession, clearSession, buildSessionKey } from "../lib/session.js";
import { formatToman } from "../lib/format.js";
import { isStoreAdmin } from "./engine.js";

async function requireAdmin(ctx) {
  const ok = await isStoreAdmin(ctx.supabase, ctx.merchant, ctx.from.id);
  if (!ok) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "⛔️ دسترسی ندارید", show_alert: true });
    else await ctx.reply("⛔️ شما دسترسی مدیریتی ندارید.");
  }
  return ok;
}

export function registerAdminFinanceHandlers(bot) {
  bot.hears("💰 بخش مالی", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const kb = new InlineKeyboard()
      .text("💳 تنظیم شماره کارت", "af:card")
      .row()
      .text("🎟 مدیریت کدهای تخفیف", "ad:l");
    await ctx.reply("بخش مالی — یکی از گزینه‌ها را انتخاب کنید:", { reply_markup: kb });
  });

  // -----------------------------------------------------------------------
  // تنظیم شماره کارت برای پرداخت کارت‌به‌کارت
  // -----------------------------------------------------------------------
  bot.callbackQuery("af:card", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_card_number",
    });
    await ctx.reply("💳 شماره کارت ۱۶ رقمی را وارد کنید:");
  });

  // -----------------------------------------------------------------------
  // لیست کدهای تخفیف
  // -----------------------------------------------------------------------
  bot.callbackQuery("ad:l", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await showDiscountList(ctx);
  });

  async function showDiscountList(ctx) {
    const { data: codes } = await ctx.supabase
      .from("discount_codes")
      .select("id, code, type, value, usage_limit, used_count")
      .eq("merchant_id", ctx.merchant.id)
      .order("created_at", { ascending: false });

    if (!codes || codes.length === 0) {
      await ctx.reply("هنوز کد تخفیفی ثبت نشده.", {
        reply_markup: new InlineKeyboard().text("➕ افزودن کد تخفیف", "ad:a"),
      });
      return;
    }

    let text = "🎟 کدهای تخفیف فعال:\n\n";
    const kb = new InlineKeyboard();
    for (const c of codes) {
      const valueLabel = c.type === "percent" ? `${c.value}%` : formatToman(c.value);
      const limitLabel = c.usage_limit ? `${c.used_count}/${c.usage_limit}` : `${c.used_count}/نامحدود`;
      text += `▫️ ${c.code} — ${valueLabel} — استفاده‌شده: ${limitLabel}\n`;
      kb.text(`🗑 حذف ${c.code}`, `ad:d:${c.id}`).row();
    }
    kb.text("➕ افزودن کد تخفیف جدید", "ad:a");

    await ctx.reply(text, { reply_markup: kb });
  }

  bot.callbackQuery("ad:a", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_discount_code_text",
      newDiscount: {},
    });
    await ctx.reply("🎟 کد تخفیف را وارد کنید (مثلا: NOWRUZ1404):");
  });

  bot.callbackQuery(/^ad:ty:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const sessionKey = buildSessionKey(ctx.merchant.id, ctx.from.id);
    const session = await getSession(ctx.supabase, sessionKey);
    session.newDiscount.type = ctx.match[1];
    session.step = "awaiting_discount_value";
    await setSession(ctx.supabase, sessionKey, session);
    await ctx.reply(
      session.newDiscount.type === "percent"
        ? "🔢 عدد درصد تخفیف را وارد کنید (مثلا 20 برای ۲۰٪):"
        : "💰 مبلغ ثابت تخفیف را به تومان وارد کنید:"
    );
  });

  bot.callbackQuery(/^ad:d:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await ctx.reply("⚠️ از حذف این کد تخفیف مطمئن هستید؟", {
      reply_markup: confirmKeyboard(`ad:dy:${ctx.match[1]}`, "ad:l"),
    });
  });

  bot.callbackQuery(/^ad:dy:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.supabase.from("discount_codes").delete().eq("id", ctx.match[1]).eq("merchant_id", ctx.merchant.id);
    await ctx.answerCallbackQuery({ text: "کد تخفیف حذف شد 🗑" });
    await showDiscountList(ctx);
  });

  // ---------------------------------------------------------------------
  // هندلر عمومیِ متن — تنظیم کارت و ویزارد ساخت کد تخفیف
  // ---------------------------------------------------------------------
  bot.on("message:text", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);
    const text = ctx.message.text.trim();

    switch (session.step) {
      case "awaiting_card_number": {
        if (!(await requireAdmin(ctx))) return;
        session.cardNumber = text.replace(/[^\d]/g, "");
        session.step = "awaiting_card_holder";
        await setSession(supabase, sessionKey, session);
        await ctx.reply("👤 نام و نام‌خانوادگی صاحب کارت را وارد کنید:");
        return;
      }

      case "awaiting_card_holder": {
        if (!(await requireAdmin(ctx))) return;
        await supabase
          .from("merchants")
          .update({ card_number: session.cardNumber, card_holder_name: text })
          .eq("id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ اطلاعات کارت ذخیره شد.", { reply_markup: adminMenuKeyboard() });
        return;
      }

      case "awaiting_discount_code_text": {
        if (!(await requireAdmin(ctx))) return;
        session.newDiscount.code = text.toUpperCase();
        session.step = "awaiting_discount_type"; // فقط برای وضوح؛ انتخاب واقعی با دکمه انجام می‌شود
        await setSession(supabase, sessionKey, session);
        const kb = new InlineKeyboard()
          .text("درصدی 🔢", "ad:ty:percent")
          .text("مبلغ ثابت 💰", "ad:ty:fixed");
        await ctx.reply("نوع تخفیف را انتخاب کنید:", { reply_markup: kb });
        return;
      }

      case "awaiting_discount_value": {
        if (!(await requireAdmin(ctx))) return;
        const value = Number(text.replace(/[^\d.]/g, ""));
        if (!value || value <= 0) {
          await ctx.reply("❌ عدد معتبر نیست. دوباره وارد کنید:");
          return;
        }
        if (session.newDiscount.type === "percent" && value > 100) {
          await ctx.reply("❌ درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد. دوباره وارد کنید:");
          return;
        }
        session.newDiscount.value = value;
        session.step = "awaiting_discount_limit";
        await setSession(supabase, sessionKey, session);
        await ctx.reply("🔢 حداکثر تعداد دفعات استفاده از این کد چند بار باشد؟ (برای نامحدود عدد 0 بفرستید):");
        return;
      }

      case "awaiting_discount_limit": {
        if (!(await requireAdmin(ctx))) return;
        const limit = Number(text.replace(/[^\d]/g, ""));
        const usageLimit = limit > 0 ? limit : null;

        const { error } = await supabase.from("discount_codes").insert({
          merchant_id: merchant.id,
          code: session.newDiscount.code,
          type: session.newDiscount.type,
          value: session.newDiscount.value,
          usage_limit: usageLimit,
        });

        await clearSession(supabase, sessionKey);

        if (error) {
          console.error("خطا در ساخت کد تخفیف:", error.message);
          await ctx.reply("⚠️ مشکلی پیش آمد (شاید این کد قبلا ثبت شده). دوباره تلاش کنید.");
          return;
        }

        await ctx.reply(`✅ کد تخفیف «${session.newDiscount.code}» ساخته شد.`, {
          reply_markup: adminMenuKeyboard(),
        });
        return;
      }

      default:
        await next();
    }
  });
}
