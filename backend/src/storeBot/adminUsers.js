// =============================================================================
// src/storeBot/adminUsers.js
// بخش «👥 مدیریت کاربران» پنل مدیریت:
//   - دیدن لیست مشتری‌های فروشگاه
//   - ارسال پیام همگانی (Broadcast) به همه‌ی مشتری‌ها
//   - افزودن/حذف «همکاران فروش» (کسانی که اجازه‌ی ورود به پنل مدیریت را دارند)
// =============================================================================

import { InlineKeyboard } from "grammy";
import { setSession, clearSession, getSession, buildSessionKey } from "../lib/session.js";
import { isStoreAdmin } from "./engine.js";

async function requireAdmin(ctx) {
  const ok = await isStoreAdmin(ctx.supabase, ctx.merchant, ctx.from.id);
  if (!ok) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "⛔️ دسترسی ندارید", show_alert: true });
    else await ctx.reply("⛔️ شما دسترسی مدیریتی ندارید.");
  }
  return ok;
}

export function registerAdminUserHandlers(bot) {
  bot.hears("👥 مدیریت کاربران", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const kb = new InlineKeyboard()
      .text("📋 لیست کاربران", "au:l")
      .row()
      .text("📣 پیام همگانی", "au:b")
      .row()
      .text("🤝 لیست همکاران فروش", "au:c:l")
      .text("➕ افزودن همکار", "au:c:a");
    await ctx.reply("بخش مدیریت کاربران:", { reply_markup: kb });
  });

  // -----------------------------------------------------------------------
  // لیست کاربران (آخرین ۳۰ نفر، برای جلوگیری از پیام‌های خیلی طولانی؛
  // برای فروشگاه‌های بزرگ‌تر، صفحه‌بندی در فایل ROADMAP پیشنهاد شده)
  // -----------------------------------------------------------------------
  bot.callbackQuery("au:l", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();

    const { data: customers, count } = await ctx.supabase
      .from("customers")
      .select("first_name, username, telegram_id", { count: "exact" })
      .eq("merchant_id", ctx.merchant.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!customers || customers.length === 0) {
      await ctx.reply("هنوز کاربری وارد فروشگاه شما نشده.");
      return;
    }

    const list = customers
      .map((c) => `▫️ ${c.first_name || "بدون نام"} — @${c.username || "بدون یوزرنیم"}`)
      .join("\n");

    await ctx.reply(`👥 تعداد کل کاربران: ${count}\n\nآخرین ${customers.length} نفر:\n\n${list}`);
  });

  // -----------------------------------------------------------------------
  // پیام همگانی
  // -----------------------------------------------------------------------
  bot.callbackQuery("au:b", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_broadcast_message",
    });
    await ctx.reply("📣 متنی که می‌خواهید برای همه‌ی کاربران ارسال شود را بنویسید:");
  });

  // -----------------------------------------------------------------------
  // همکاران فروش
  // -----------------------------------------------------------------------
  bot.callbackQuery("au:c:l", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const { data: cooperators } = await ctx.supabase
      .from("cooperators")
      .select("id, telegram_id")
      .eq("merchant_id", ctx.merchant.id);

    if (!cooperators || cooperators.length === 0) {
      await ctx.reply("هنوز همکاری اضافه نشده.", {
        reply_markup: new InlineKeyboard().text("➕ افزودن همکار", "au:c:a"),
      });
      return;
    }

    const kb = new InlineKeyboard();
    for (const c of cooperators) {
      kb.text(`🗑 حذف ${c.telegram_id}`, `au:c:d:${c.id}`).row();
    }
    await ctx.reply(
      "🤝 همکاران فروش فعلی (آیدی عددی تلگرام):\n\n" +
        cooperators.map((c) => `▫️ ${c.telegram_id}`).join("\n"),
      { reply_markup: kb }
    );
  });

  bot.callbackQuery("au:c:a", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_cooperator_id",
    });
    await ctx.reply(
      "🤝 آیدی عددی تلگرام همکار موردنظر را ارسال کنید.\n" +
        "(می‌تواند این آیدی را با ارسال پیام به رباتی مثل @userinfobot بگیرد)"
    );
  });

  bot.callbackQuery(/^au:c:d:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.supabase.from("cooperators").delete().eq("id", ctx.match[1]).eq("merchant_id", ctx.merchant.id);
    await ctx.answerCallbackQuery({ text: "همکار حذف شد 🗑" });
  });

  // ---------------------------------------------------------------------
  // هندلر عمومیِ متن — پیام همگانی و افزودن همکار
  // ---------------------------------------------------------------------
  bot.on("message:text", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);
    const text = ctx.message.text.trim();

    switch (session.step) {
      case "awaiting_broadcast_message": {
        if (!(await requireAdmin(ctx))) return;
        await clearSession(supabase, sessionKey);
        await sendBroadcast(ctx, text);
        return;
      }

      case "awaiting_cooperator_id": {
        if (!(await requireAdmin(ctx))) return;
        const telegramId = Number(text.replace(/[^\d]/g, ""));
        if (!telegramId) {
          await ctx.reply("❌ این یک آیدی عددی معتبر نیست. دوباره ارسال کنید:");
          return;
        }
        await supabase
          .from("cooperators")
          .upsert({ merchant_id: merchant.id, telegram_id: telegramId }, { onConflict: "merchant_id,telegram_id" });
        await clearSession(supabase, sessionKey);
        await ctx.reply(`✅ کاربر با آیدی ${telegramId} به‌عنوان همکار فروش اضافه شد.`);
        return;
      }

      default:
        await next();
    }
  });

  /**
   * پیام همگانی را به تک‌تک مشتری‌های این فروشگاه ارسال می‌کند.
   * توجه: چون Cloudflare Workers محدودیت زمانی روی هر درخواست دارد، این
   * روش برای فروشگاه‌های با چند صد مشتری مناسب است؛ برای مقیاس بسیار
   * بزرگ‌تر، استفاده از یک صف پیام (queue) در فایل ROADMAP پیشنهاد شده.
   */
  async function sendBroadcast(ctx, text) {
    const { data: customers } = await ctx.supabase
      .from("customers")
      .select("telegram_id")
      .eq("merchant_id", ctx.merchant.id);

    if (!customers || customers.length === 0) {
      await ctx.reply("هیچ کاربری برای ارسال پیام وجود ندارد.");
      return;
    }

    await ctx.reply(`⏳ در حال ارسال پیام به ${customers.length} کاربر...`);

    let success = 0;
    let failed = 0;
    for (const c of customers) {
      try {
        await ctx.api.sendMessage(c.telegram_id, text);
        success++;
      } catch {
        // اگر کاربر ربات را بلاک کرده باشد یا خطای دیگری رخ دهد، فقط شمارش
        // می‌کنیم و به سراغ نفر بعدی می‌رویم، ارسال کل پیام متوقف نمی‌شود
        failed++;
      }
    }

    await ctx.reply(`✅ پیام ارسال شد.\nموفق: ${success} | ناموفق: ${failed}`);
  }
}
