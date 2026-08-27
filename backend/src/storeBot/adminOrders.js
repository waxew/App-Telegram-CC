// =============================================================================
// src/storeBot/adminOrders.js
// بخش «📑 مدیریت سفارشات» و «📊 دریافت گزارش» پنل مدیریت.
// اینجا صاحب فروشگاه می‌تواند سفارش‌های واردشده را ببیند، وضعیتشان را
// تغییر دهد (که به‌صورت خودکار به مشتری هم اطلاع داده می‌شود)، و یک
// گزارش خلاصه از وضعیت کلی فروشگاه بگیرد.
// =============================================================================

import { InlineKeyboard } from "grammy";
import { formatToman, formatDate } from "../lib/format.js";
import { isStoreAdmin } from "./engine.js";

// نگاشت کد کوتاه (برای callback_data) به مقدار واقعی وضعیت در دیتابیس،
// و برچسب فارسیِ قابل‌نمایش برای هرکدام
const STATUS_MAP = {
  pending: { label: "⏳ در انتظار بررسی", code: "pe" },
  paid: { label: "✅ پرداخت‌شده", code: "pd" },
  shipped: { label: "📦 ارسال‌شده", code: "sh" },
  cancelled: { label: "❌ لغوشده", code: "cx" },
};
// نسخه‌ی معکوسِ همان جدول، برای وقتی که کد کوتاه را از callback_data داریم
const CODE_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([status, v]) => [v.code, status])
);

async function requireAdmin(ctx) {
  const ok = await isStoreAdmin(ctx.supabase, ctx.merchant, ctx.from.id);
  if (!ok) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "⛔️ دسترسی ندارید", show_alert: true });
    else await ctx.reply("⛔️ شما دسترسی مدیریتی ندارید.");
  }
  return ok;
}

export function registerAdminOrderHandlers(bot) {
  // -----------------------------------------------------------------------
  // ورود به بخش مدیریت سفارشات
  // -----------------------------------------------------------------------
  bot.hears("📑 مدیریت سفارشات", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const kb = new InlineKeyboard()
      .text("⏳ در انتظار", "ao:l:pe")
      .text("✅ پرداخت‌شده", "ao:l:pd")
      .row()
      .text("📦 ارسال‌شده", "ao:l:sh")
      .text("❌ لغوشده", "ao:l:cx")
      .row()
      .text("📋 نمایش همه", "ao:l:all");
    await ctx.reply("کدام سفارش‌ها را می‌خواهید ببینید؟", { reply_markup: kb });
  });

  bot.callbackQuery(/^ao:l:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const filter = ctx.match[1];

    let query = ctx.supabase
      .from("orders")
      .select("id, total_amount, status, created_at")
      .eq("merchant_id", ctx.merchant.id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (filter !== "all") {
      query = query.eq("status", CODE_TO_STATUS[filter]);
    }

    const { data: orders } = await query;

    if (!orders || orders.length === 0) {
      await ctx.reply("سفارشی با این وضعیت پیدا نشد.");
      return;
    }

    const kb = new InlineKeyboard();
    for (const o of orders) {
      const info = STATUS_MAP[o.status];
      kb.text(
        `#${o.id.slice(0, 8)} — ${formatToman(o.total_amount)} — ${info.label}`,
        `ao:v:${o.id}`
      ).row();
    }
    await ctx.reply(`📋 آخرین ${orders.length} سفارش:`, { reply_markup: kb });
  });

  // -----------------------------------------------------------------------
  // نمایش جزئیات کامل یک سفارش
  // -----------------------------------------------------------------------
  bot.callbackQuery(/^ao:v:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await showOrderDetail(ctx, ctx.match[1]);
  });

  async function showOrderDetail(ctx, orderId) {
    const { data: order } = await ctx.supabase
      .from("orders")
      .select("*, customer:customers(first_name, username, telegram_id)")
      .eq("id", orderId)
      .eq("merchant_id", ctx.merchant.id)
      .maybeSingle();

    if (!order) {
      await ctx.reply("این سفارش پیدا نشد.");
      return;
    }

    const { data: items } = await ctx.supabase
      .from("order_items")
      .select("product_name, unit_price, quantity")
      .eq("order_id", orderId);

    const itemsText = (items || [])
      .map((i) => `▫️ ${i.product_name} × ${i.quantity} = ${formatToman(i.unit_price * i.quantity)}`)
      .join("\n");

    const text =
      `🧾 سفارش #${order.id.slice(0, 8)}\n` +
      `🕒 ${formatDate(order.created_at)}\n\n` +
      `👤 مشتری: ${order.customer?.first_name || "-"} (@${order.customer?.username || "-"})\n` +
      `📱 تماس: ${order.phone || "-"}\n` +
      `🏠 آدرس: ${order.address || "-"}\n` +
      `🚚 روش ارسال: ${order.delivery_method === "post" ? "پستی" : "حضوری"}\n\n` +
      `${itemsText}\n\n` +
      (order.discount_amount > 0 ? `🎟 تخفیف: ${formatToman(order.discount_amount)}\n` : "") +
      `💰 مبلغ نهایی: ${formatToman(order.total_amount)}\n` +
      `📌 وضعیت فعلی: ${STATUS_MAP[order.status].label}`;

    const kb = new InlineKeyboard()
      .text("✅ پرداخت‌شده", `ao:s:${order.id}:pd`)
      .text("📦 ارسال‌شده", `ao:s:${order.id}:sh`)
      .row()
      .text("❌ لغو سفارش", `ao:s:${order.id}:cx`)
      .row()
      .text("🔙 بازگشت به لیست", "ao:l:all");

    await ctx.reply(text, { reply_markup: kb });
  }

  // -----------------------------------------------------------------------
  // تغییر وضعیت سفارش — و اطلاع‌رسانی خودکار به مشتری
  // -----------------------------------------------------------------------
  bot.callbackQuery(/^ao:s:([^:]+):(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const [orderId, code] = [ctx.match[1], ctx.match[2]];
    const newStatus = CODE_TO_STATUS[code];

    const { data: order } = await ctx.supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId)
      .eq("merchant_id", ctx.merchant.id)
      .select("*, customer:customers(telegram_id)")
      .single();

    await ctx.answerCallbackQuery({ text: "وضعیت سفارش به‌روزرسانی شد ✅" });

    if (order?.customer?.telegram_id) {
      const messages = {
        paid: "✅ پرداخت سفارش شما تایید شد.",
        shipped: "📦 سفارش شما ارسال شد.",
        cancelled: "❌ متاسفانه سفارش شما لغو شد.",
      };
      const msg = messages[newStatus];
      if (msg) {
        try {
          await ctx.api.sendMessage(
            order.customer.telegram_id,
            `${msg}\n\nشماره سفارش: #${orderId.slice(0, 8)}`
          );
        } catch (err) {
          console.error("اطلاع‌رسانی به مشتری ناموفق بود:", err.message);
        }
      }
    }

    await showOrderDetail(ctx, orderId);
  });

  // -----------------------------------------------------------------------
  // 📊 دریافت گزارش — یک خلاصه‌ی آماری ساده از وضعیت فروشگاه
  // -----------------------------------------------------------------------
  bot.hears("📊 دریافت گزارش", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const { merchant, supabase } = ctx;

    // شروع امروز به وقت UTC (برای سادگی؛ در صورت نیاز به منطقه‌ی زمانی
    // دقیق‌تر می‌توان بعدا اصلاح کرد — نکته‌ای که در فایل ROADMAP هم آمده)
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [{ count: customerCount }, { count: totalOrders }, { data: todayOrders }, { data: allOrders }] =
      await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("merchant_id", merchant.id),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("merchant_id", merchant.id),
        supabase
          .from("orders")
          .select("total_amount")
          .eq("merchant_id", merchant.id)
          .gte("created_at", startOfToday.toISOString()),
        supabase
          .from("orders")
          .select("total_amount")
          .eq("merchant_id", merchant.id)
          .neq("status", "cancelled"),
      ]);

    const todaySum = (todayOrders || []).reduce((s, o) => s + Number(o.total_amount), 0);
    const totalSum = (allOrders || []).reduce((s, o) => s + Number(o.total_amount), 0);

    const text =
      "📊 گزارش کلی فروشگاه\n\n" +
      `👥 تعداد کاربران: ${customerCount ?? 0} نفر\n` +
      `📦 تعداد کل سفارش‌ها: ${totalOrders ?? 0}\n` +
      `🛒 سفارش‌های امروز: ${(todayOrders || []).length} عدد — ${formatToman(todaySum)}\n` +
      `💰 مجموع فروش (بدون لغوشده‌ها): ${formatToman(totalSum)}`;

    await ctx.reply(text);
  });
}
