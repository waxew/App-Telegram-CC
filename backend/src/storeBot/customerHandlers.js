// =============================================================================
// src/storeBot/customerHandlers.js
// تمام رفتارهایی که «مشتریِ نهاییِ» یک فروشگاه (کسی که می‌خواهد خرید کند)
// با آن‌ها سروکار دارد: شروع کار، دیدن دسته‌بندی‌ها و محصولات، سبد خرید،
// تسویه‌حساب، و بخش «حساب کاربری من».
//
// همچنین ورودی به «پنل مدیریت» (دکمه‌ی 🔧 پنل مدیریت) هم همین‌جا تعریف
// شده، چون از نظر کاربر بخشی از منوی اصلی است؛ ولی خودِ صفحات داخل پنل
// مدیریت در فایل‌های adminCatalog.js، adminOrders.js و... هستند.
// =============================================================================

import { InlineKeyboard } from "grammy";
import { mainMenuKeyboard, adminMenuKeyboard } from "../lib/keyboards.js";
import { getSession, setSession, clearSession, buildSessionKey } from "../lib/session.js";
import { formatToman } from "../lib/format.js";
import { isStoreAdmin } from "./engine.js";
import { verifyAdminPin } from "../lib/merchantSecrets.js";

/**
 * سبد خرید یک مشتری را همراه با اطلاعات محصولات (نام/قیمت) و جمع کل برمی‌گرداند.
 * از قابلیت "resource embedding" سوپابیس استفاده می‌کنیم تا در یک درخواست،
 * هم ردیف‌های cart_items و هم اطلاعات محصول مرتبط با هرکدام را بگیریم.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} customerId
 */
async function getCartWithTotal(supabase, customerId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("id, quantity, product:products(id, name_fa, price, is_active)")
    .eq("customer_id", customerId);

  if (error || !data) {
    console.error("خطا در خواندن سبد خرید:", error?.message);
    return { items: [], total: 0 };
  }

  // فقط محصولاتی که هنوز فعال‌اند را در جمع نهایی حساب می‌کنیم
  // (اگر ادمین محصولی را غیرفعال کرده باشد، از سبد حذف نمی‌شود ولی حسابش نمی‌آید)
  const items = data.filter((row) => row.product);
  const total = items.reduce((sum, row) => {
    if (!row.product.is_active) return sum;
    return sum + row.product.price * row.quantity;
  }, 0);

  return { items, total };
}

/**
 * یا آیدی مشتری موجود در جدول customers را برمی‌گرداند، یا در صورت نبودن
 * یک ردیف جدید برایش می‌سازد (اولین باری که وارد این فروشگاه شده).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} merchant
 * @param {import('grammy').Context} ctx
 * @param {string|null} referralPayload - مقدار بعد از "/start " اگر از آن‌جا
 *   صدا زده شده باشد (مثلا آیدی تلگرامِ معرف). فقط هندلر /start این مقدار
 *   را واقعی پاس می‌دهد؛ بقیه‌ی جاها چون کاربر از قبل مشتری است اصلا
 *   استفاده نمی‌شود. این مقدار را عمدا به‌صورت پارامتر جدا می‌گیریم (نه
 *   این‌که خودمان از ctx.match بخوانیم) تا این تابع در هر جایی که صدا زده
 *   شود (دکمه‌های مختلف با ctx.match های کاملا متفاوت) رفتار غیرمنتظره
 *   نداشته باشد.
 */
async function ensureCustomer(supabase, merchant, ctx, referralPayload = null) {
  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("merchant_id", merchant.id)
    .eq("telegram_id", ctx.from.id)
    .maybeSingle();

  if (existing) return existing;

  // بررسی کد معرف (referral payload) که همراه لینک /start آمده، اگر بوده باشد
  let referredBy = null;
  const payload = (referralPayload || "").toString().trim();
  if (payload && /^\d+$/.test(payload) && Number(payload) !== ctx.from.id) {
    const { data: referrer } = await supabase
      .from("customers")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("telegram_id", Number(payload))
      .maybeSingle();
    if (referrer) referredBy = referrer.id;
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      merchant_id: merchant.id,
      telegram_id: ctx.from.id,
      first_name: ctx.from.first_name,
      username: ctx.from.username,
      referred_by: referredBy,
    })
    .select()
    .single();

  if (error) {
    console.error("خطا در ساخت مشتری جدید:", error.message);
  }
  return created;
}

/**
 * عضویت کاربر در کانال اجباری فروشگاه (در صورت تنظیم‌شدن) را بررسی می‌کند.
 * @returns {Promise<boolean>} true یعنی اجازه‌ی ادامه دارد
 */
async function checkMandatoryChannel(ctx, merchant) {
  if (!merchant.mandatory_channel) return true; // قفلی تنظیم نشده

  try {
    const member = await ctx.api.getChatMember(merchant.mandatory_channel, ctx.from.id);
    // این وضعیت‌ها یعنی کاربر واقعا عضو کانال است
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (err) {
    // اگر خطا بدهد (مثلا ربات ادمین کانال نیست)، برای امنیت فرض می‌کنیم
    // کاربر عضو نیست تا صاحب فروشگاه متوجه‌ی مشکل تنظیمات شود
    console.error("خطا در بررسی عضویت کانال:", err.message);
    return false;
  }
}

function joinChannelKeyboard(merchant) {
  const channelLink = merchant.mandatory_channel.startsWith("@")
    ? `https://t.me/${merchant.mandatory_channel.slice(1)}`
    : merchant.mandatory_channel;
  return new InlineKeyboard()
    .url("📢 عضویت در کانال", channelLink)
    .row()
    .text("✅ عضو شدم، بررسی کن", "chk:join");
}

/**
 * تمام هندلرهای مربوط به مشتری را روی نمونه‌ی ربات ثبت می‌کند.
 * @param {import('grammy').Bot} bot
 */
export function registerCustomerHandlers(bot) {
  // -----------------------------------------------------------------------
  // /start — نقطه‌ی ورود هر مشتری به فروشگاه
  // -----------------------------------------------------------------------
  bot.command("start", async (ctx) => {
    const { merchant, supabase } = ctx;

    // هر بار /start زده شود، هر مرحله‌ی نیمه‌کاره‌ای که کاربر در آن بوده پاک می‌شود
    await clearSession(supabase, buildSessionKey(merchant.id, ctx.from.id));

    // ctx.match در دستور /start همان متنی است که بعد از "/start " آمده
    // (یعنی payload لینک دعوت، اگر کاربر از طریق یک لینک دعوت وارد شده باشد)
    const customer = await ensureCustomer(supabase, merchant, ctx, ctx.match);
    if (!customer) {
      await ctx.reply("⚠️ مشکلی در اتصال به فروشگاه پیش آمد، لطفا کمی بعد دوباره تلاش کنید.");
      return;
    }

    const isMember = await checkMandatoryChannel(ctx, merchant);
    if (!isMember) {
      await ctx.reply(
        "برای استفاده از این فروشگاه، ابتدا باید عضو کانال زیر شوید:",
        { reply_markup: joinChannelKeyboard(merchant) }
      );
      return;
    }

    await showWelcome(ctx, merchant, customer);
  });

  // دکمه‌ی «✅ عضو شدم، بررسی کن» زیر پیام قفل کانال
  bot.callbackQuery("chk:join", async (ctx) => {
    const { merchant, supabase } = ctx;
    const isMember = await checkMandatoryChannel(ctx, merchant);
    if (!isMember) {
      await ctx.answerCallbackQuery({ text: "هنوز عضو کانال نشده‌اید ❌", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: "عضویت تایید شد ✅" });
    const customer = await ensureCustomer(supabase, merchant, ctx);
    await ctx.deleteMessage().catch(() => {}); // پیام قفل کانال را پاک می‌کنیم
    await showWelcome(ctx, merchant, customer);
  });

  async function showWelcome(ctx, merchant, customer) {
    const admin = await isStoreAdmin(ctx.supabase, merchant, ctx.from.id);
    if (merchant.start_image_file_id) {
      await ctx.replyWithPhoto(merchant.start_image_file_id, {
        caption: merchant.start_text || "به فروشگاه ما خوش آمدید! 🛍",
      });
    } else {
      await ctx.reply(merchant.start_text || "به فروشگاه ما خوش آمدید! 🛍");
    }
    await ctx.reply("از منوی زیر یکی از گزینه‌ها را انتخاب کنید:", {
      reply_markup: mainMenuKeyboard(admin),
    });
  }

  // -----------------------------------------------------------------------
  // 🛍 محصولات — نمایش لیست دسته‌بندی‌های فعال
  // -----------------------------------------------------------------------
  bot.hears("🛍 محصولات", async (ctx) => showCategoryList(ctx));

  async function showCategoryList(ctx) {
    const { merchant, supabase } = ctx;
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!categories || categories.length === 0) {
      await ctx.reply("😔 هنوز هیچ دسته‌بندی‌ای ثبت نشده است.");
      return;
    }

    const kb = new InlineKeyboard();
    for (const cat of categories) {
      kb.text(cat.name, `c:${cat.id}`).row();
    }
    await ctx.reply("🗂 یک دسته‌بندی را انتخاب کنید:", { reply_markup: kb });
  }

  bot.callbackQuery("cats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCategoryList(ctx);
  });

  // -----------------------------------------------------------------------
  // انتخاب یک دسته‌بندی → نمایش محصولات فعالِ همان دسته
  // -----------------------------------------------------------------------
  bot.callbackQuery(/^c:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const categoryId = ctx.match[1];
    const { merchant, supabase } = ctx;

    const { data: products } = await supabase
      .from("products")
      .select("id, name_fa, price")
      .eq("merchant_id", merchant.id)
      .eq("category_id", categoryId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (!products || products.length === 0) {
      await ctx.reply("😔 محصولی در این دسته‌بندی موجود نیست.", {
        reply_markup: new InlineKeyboard().text("🔙 بازگشت به دسته‌بندی‌ها", "cats"),
      });
      return;
    }

    const kb = new InlineKeyboard();
    for (const p of products) {
      kb.text(`${p.name_fa} — ${formatToman(p.price)}`, `p:${p.id}`).row();
    }
    kb.text("🔙 بازگشت به دسته‌بندی‌ها", "cats");

    await ctx.reply("🛒 یک محصول را برای مشاهده انتخاب کنید:", { reply_markup: kb });
  });

  // -----------------------------------------------------------------------
  // نمایش جزئیات یک محصول
  // -----------------------------------------------------------------------
  bot.callbackQuery(/^p:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = ctx.match[1];
    const { merchant, supabase } = ctx;

    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();

    if (!product || !product.is_active) {
      await ctx.reply("این محصول دیگر در دسترس نیست.");
      return;
    }

    const caption =
      `🛍 ${product.name_fa}\n\n` +
      (product.description ? `${product.description}\n\n` : "") +
      `💰 قیمت: ${formatToman(product.price)}`;

    const kb = new InlineKeyboard()
      .text("➕ افزودن به سبد خرید", `ca:${product.id}`)
      .row()
      .text("🔙 بازگشت", product.category_id ? `c:${product.category_id}` : "cats");

    if (product.image_file_id) {
      await ctx.replyWithPhoto(product.image_file_id, { caption, reply_markup: kb });
    } else {
      await ctx.reply(caption, { reply_markup: kb });
    }
  });

  // -----------------------------------------------------------------------
  // افزودن محصول به سبد خرید
  // -----------------------------------------------------------------------
  bot.callbackQuery(/^ca:(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const { merchant, supabase } = ctx;
    const customer = await ensureCustomer(supabase, merchant, ctx);

    // Callback data قابل جعل است؛ پس قبل از افزودن، مالکیت و فعال‌بودن محصول را دوباره بررسی می‌کنیم.
    const { data: allowedProduct } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!allowedProduct) {
      await ctx.answerCallbackQuery({ text: "این محصول در این فروشگاه در دسترس نیست.", show_alert: true });
      return;
    }

    // اگر این محصول از قبل در سبد بوده، فقط تعدادش را یکی زیاد می‌کنیم؛
    // در غیر این صورت یک ردیف جدید با تعداد ۱ می‌سازیم
    const { data: existingItem } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("customer_id", customer.id)
      .eq("product_id", productId)
      .maybeSingle();

    if (existingItem) {
      await supabase
        .from("cart_items")
        .update({ quantity: existingItem.quantity + 1 })
        .eq("id", existingItem.id);
    } else {
      await supabase
        .from("cart_items")
        .insert({ customer_id: customer.id, product_id: productId, quantity: 1 });
    }

    await ctx.answerCallbackQuery({ text: "✅ به سبد خرید اضافه شد" });
  });

  // -----------------------------------------------------------------------
  // 👤 حساب کاربری — نمایش موجودی کیف‌پول و لینک دعوت
  // -----------------------------------------------------------------------
  bot.hears("👤 حساب کاربری", async (ctx) => {
    const { merchant, supabase } = ctx;
    const customer = await ensureCustomer(supabase, merchant, ctx);
    const refLink = `https://t.me/${merchant.bot_username}?start=${ctx.from.id}`;

    let text =
      `👤 حساب کاربری شما\n\n` +
      `💳 موجودی کیف‌پول: ${formatToman(customer.wallet_balance)}\n`;

    if (merchant.referral_percent > 0) {
      text +=
        `\n🤝 لینک دعوت اختصاصی شما:\n${refLink}\n\n` +
        `با هر خرید دوستانی که با این لینک وارد شوند، ${merchant.referral_percent}% از مبلغ خریدشان به کیف‌پول شما اضافه می‌شود.`;
    }

    const kb = new InlineKeyboard()
      .text("🛒 مشاهده سبد خرید", "cv")
      .row()
      .text("🗂 مشاهده محصولات", "cats");

    await ctx.reply(text, { reply_markup: kb });
  });

  // -----------------------------------------------------------------------
  // مشاهده‌ی سبد خرید
  // -----------------------------------------------------------------------
  bot.callbackQuery("cv", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCart(ctx);
  });

  async function showCart(ctx) {
    const { merchant, supabase } = ctx;
    const customer = await ensureCustomer(supabase, merchant, ctx);
    const { items, total } = await getCartWithTotal(supabase, customer.id);

    if (items.length === 0) {
      await ctx.reply("🛒 سبد خرید شما خالی است.", {
        reply_markup: new InlineKeyboard().text("🗂 مشاهده محصولات", "cats"),
      });
      return;
    }

    let text = "🛒 سبد خرید شما:\n\n";
    const kb = new InlineKeyboard();
    for (const item of items) {
      text += `▫️ ${item.product.name_fa} × ${item.quantity} = ${formatToman(
        item.product.price * item.quantity
      )}\n`;
      kb.text(`➖ ${item.product.name_fa}`, `cqd:${item.product.id}`)
        .text(`➕`, `cqi:${item.product.id}`)
        .row();
    }
    text += `\n💰 جمع کل: ${formatToman(total)}`;

    kb.text("💳 نهایی کردن خرید", "co").row();
    kb.text("🗂 ادامه‌ی خرید", "cats");

    await ctx.reply(text, { reply_markup: kb });
  }

  // افزایش/کاهش تعداد یک قلم داخل سبد خرید
  bot.callbackQuery(/^cqi:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = ctx.match[1];
    const customer = await ensureCustomer(ctx.supabase, ctx.merchant, ctx);
    const { data: item } = await ctx.supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("customer_id", customer.id)
      .eq("product_id", productId)
      .maybeSingle();
    if (item) {
      await ctx.supabase
        .from("cart_items")
        .update({ quantity: item.quantity + 1 })
        .eq("id", item.id);
    }
    await showCart(ctx);
  });

  bot.callbackQuery(/^cqd:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = ctx.match[1];
    const customer = await ensureCustomer(ctx.supabase, ctx.merchant, ctx);
    const { data: item } = await ctx.supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("customer_id", customer.id)
      .eq("product_id", productId)
      .maybeSingle();
    if (item) {
      if (item.quantity <= 1) {
        // اگر تعداد به صفر برسد، کلا از سبد حذفش می‌کنیم
        await ctx.supabase.from("cart_items").delete().eq("id", item.id);
      } else {
        await ctx.supabase
          .from("cart_items")
          .update({ quantity: item.quantity - 1 })
          .eq("id", item.id);
      }
    }
    await showCart(ctx);
  });

  // -----------------------------------------------------------------------
  // شروع فرآیند تسویه‌حساب (checkout)
  // -----------------------------------------------------------------------
  bot.callbackQuery("co", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { merchant, supabase } = ctx;
    const customer = await ensureCustomer(supabase, merchant, ctx);
    const { items } = await getCartWithTotal(supabase, customer.id);

    if (items.length === 0) {
      await ctx.reply("🛒 سبد خرید شما خالی است.");
      return;
    }

    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    await setSession(supabase, sessionKey, { step: "awaiting_delivery_method" });

    const kb = new InlineKeyboard()
      .text("📮 ارسال پستی", "cd:post")
      .row()
      .text("🏪 دریافت حضوری", "cd:pickup");

    await ctx.reply("روش دریافت سفارش را انتخاب کنید:", { reply_markup: kb });
  });

  bot.callbackQuery(/^cd:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const method = ctx.match[1];
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);
    session.deliveryMethod = method;
    session.step = "awaiting_phone";
    await setSession(supabase, sessionKey, session);

    await ctx.reply("📱 لطفا شماره تماس خود را ارسال کنید:");
  });

  // -----------------------------------------------------------------------
  // 🔍 جستجوی محصول
  // -----------------------------------------------------------------------
  bot.hears("🔍 جستجوی محصول", async (ctx) => {
    const sessionKey = buildSessionKey(ctx.merchant.id, ctx.from.id);
    await setSession(ctx.supabase, sessionKey, { step: "awaiting_search_text" });
    await ctx.reply("🔎 اسم محصول موردنظرتان را تایپ کنید:");
  });

  // -----------------------------------------------------------------------
  // ☎️ پشتیبانی
  // -----------------------------------------------------------------------
  bot.hears("☎️ پشتیبانی", async (ctx) => {
    const link = ctx.merchant.support_link;
    await ctx.reply(
      link ? `☎️ برای پشتیبانی با لینک زیر در ارتباط باشید:\n${link}` : "فعلا لینک پشتیبانی ثبت نشده است."
    );
  });

  // -----------------------------------------------------------------------
  // 🔧 پنل مدیریت — فقط برای مالک/همکاران
  // -----------------------------------------------------------------------
  bot.hears("🔧 پنل مدیریت", async (ctx) => {
    const { merchant, supabase } = ctx;
    const admin = await isStoreAdmin(supabase, merchant, ctx.from.id);
    if (!admin) {
      await ctx.reply("⛔️ شما به پنل مدیریت این فروشگاه دسترسی ندارید.");
      return;
    }

    if (merchant.admin_pin_hash || merchant.admin_pin) {
      const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
      await setSession(supabase, sessionKey, { step: "awaiting_admin_pin" });
      await ctx.reply("🔒 کد امنیتی پنل مدیریت را وارد کنید:");
      return;
    }

    await ctx.reply("🔧 به پنل مدیریت خوش آمدید:", { reply_markup: adminMenuKeyboard() });
  });

  // بازگشت از پنل مدیریت به منوی اصلی مشتری
  bot.hears("🔙 بازگشت", async (ctx) => {
    const admin = await isStoreAdmin(ctx.supabase, ctx.merchant, ctx.from.id);
    await ctx.reply("منوی اصلی:", { reply_markup: mainMenuKeyboard(admin) });
  });

  // -----------------------------------------------------------------------
  // هندلر عمومیِ پیام‌های متنی — فقط زمانی وارد عمل می‌شود که هیچ‌کدام از
  // دکمه‌های بالا (hears) با متن پیام مطابقت نداشته باشند. اینجا بر اساس
  // «مرحله‌ی فعلی مکالمه» (session.step) تصمیم می‌گیریم چه کار کنیم.
  // اگر مرحله‌ای که می‌بینیم مربوط به این فایل نباشد، next() را صدا
  // می‌زنیم تا فایل بعدی (مثلا adminCatalog.js) بتواند بررسی‌اش کند.
  // -----------------------------------------------------------------------
  bot.on("message:text", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);

    switch (session.step) {
      case "awaiting_admin_pin": {
        if (await verifyAdminPin(merchant, ctx.message.text.trim(), ctx.env)) {
          await clearSession(supabase, sessionKey);
          await ctx.reply("✅ تایید شد. به پنل مدیریت خوش آمدید:", {
            reply_markup: adminMenuKeyboard(),
          });
        } else {
          await ctx.reply("❌ کد اشتباه است. دوباره تلاش کنید یا از منو خارج شوید.");
        }
        return;
      }

      case "awaiting_search_text": {
        await clearSession(supabase, sessionKey);
        const q = ctx.message.text.trim();
        const { data: results } = await supabase
          .from("products")
          .select("id, name_fa, price")
          .eq("merchant_id", merchant.id)
          .eq("is_active", true)
          .ilike("name_fa", `%${q}%`)
          .limit(15);

        if (!results || results.length === 0) {
          await ctx.reply("😔 محصولی با این نام پیدا نشد.");
          return;
        }
        const kb = new InlineKeyboard();
        for (const p of results) {
          kb.text(`${p.name_fa} — ${formatToman(p.price)}`, `p:${p.id}`).row();
        }
        await ctx.reply(`🔎 نتایج جستجو برای «${q}»:`, { reply_markup: kb });
        return;
      }

      case "awaiting_phone": {
        session.phone = ctx.message.text.trim();
        session.step = "awaiting_address";
        await setSession(supabase, sessionKey, session);
        await ctx.reply("🏠 لطفا آدرس کامل خود را ارسال کنید:");
        return;
      }

      case "awaiting_address": {
        session.address = ctx.message.text.trim();
        session.step = "awaiting_discount_code";
        await setSession(supabase, sessionKey, session);
        await ctx.reply("🎟 اگر کد تخفیف دارید ارسال کنید، یا بنویسید «رد کن»:");
        return;
      }

      case "awaiting_discount_code": {
        await handleDiscountAndSummary(ctx, session, sessionKey, ctx.message.text.trim());
        return;
      }

      default:
        // هیچ مرحله‌ی مربوط به این فایل در جریان نیست؛ بگذار فایل بعدی بررسی کند
        await next();
    }
  });

  /**
   * کد تخفیف واردشده را بررسی کرده، خلاصه‌ی نهایی سفارش را نمایش می‌دهد
   * و منتظر تایید نهایی مشتری می‌ماند.
   */
  async function handleDiscountAndSummary(ctx, session, sessionKey, discountText) {
    const { merchant, supabase } = ctx;
    const customer = await ensureCustomer(supabase, merchant, ctx);
    const { items, total } = await getCartWithTotal(supabase, customer.id);

    let discountAmount = 0;
    let discountCodeRow = null;

    if (discountText && discountText !== "رد کن") {
      const { data: code } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("merchant_id", merchant.id)
        .eq("code", discountText)
        .maybeSingle();

      const now = new Date();
      const isExpired = code?.expires_at && new Date(code.expires_at) < now;
      const isMaxedOut = code?.usage_limit != null && code.used_count >= code.usage_limit;

      if (!code || isExpired || isMaxedOut) {
        await ctx.reply("❌ کد تخفیف نامعتبر است. سفارش بدون تخفیف ثبت می‌شود.");
      } else {
        discountCodeRow = code;
        discountAmount =
          code.type === "percent" ? Math.round((total * code.value) / 100) : code.value;
        // مبلغ تخفیف هرگز نباید از جمع کل بیشتر شود
        discountAmount = Math.min(discountAmount, total);
      }
    }

    session.discountCodeId = discountCodeRow?.id || null;
    session.discountAmount = discountAmount;
    session.step = "awaiting_order_confirm";
    await setSession(supabase, sessionKey, session);

    const finalTotal = total - discountAmount;
    const methodLabel = session.deliveryMethod === "post" ? "ارسال پستی" : "دریافت حضوری";

    let summary =
      "📋 خلاصه‌ی سفارش شما:\n\n" +
      items
        .map((i) => `▫️ ${i.product.name_fa} × ${i.quantity}`)
        .join("\n") +
      `\n\n🚚 روش دریافت: ${methodLabel}\n` +
      `📱 شماره تماس: ${session.phone}\n` +
      `🏠 آدرس: ${session.address}\n` +
      (discountAmount > 0 ? `🎟 تخفیف: ${formatToman(discountAmount)}\n` : "") +
      `\n💰 مبلغ قابل‌پرداخت: ${formatToman(finalTotal)}`;

    const kb = new InlineKeyboard()
      .text("✅ ثبت نهایی سفارش", "ord:confirm")
      .row()
      .text("❌ انصراف", "ord:cancel");

    await ctx.reply(summary, { reply_markup: kb });
  }

  // -----------------------------------------------------------------------
  // ثبت نهایی سفارش
  // -----------------------------------------------------------------------
  bot.callbackQuery("ord:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);

    if (session.step !== "awaiting_order_confirm") {
      await ctx.reply("این سفارش دیگر معتبر نیست، لطفا از ابتدا شروع کنید.");
      return;
    }

    const customer = await ensureCustomer(supabase, merchant, ctx);
    const { items, total } = await getCartWithTotal(supabase, customer.id);

    if (items.length === 0) {
      await ctx.reply("🛒 سبد خرید شما خالی است.");
      await clearSession(supabase, sessionKey);
      return;
    }

    const finalTotal = total - (session.discountAmount || 0);

    // ساخت ردیف سفارش
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        merchant_id: merchant.id,
        customer_id: customer.id,
        status: "pending",
        subtotal_amount: total,
        discount_code_id: session.discountCodeId || null,
        discount_amount: session.discountAmount || 0,
        total_amount: finalTotal,
        delivery_method: session.deliveryMethod,
        phone: session.phone,
        address: session.address,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("خطا در ثبت سفارش:", orderError?.message);
      await ctx.reply("⚠️ مشکلی در ثبت سفارش پیش آمد. دوباره تلاش کنید.");
      return;
    }

    // کپی کردن اقلام سبد خرید به‌عنوان order_items (با قیمت لحظه‌ی خرید)
    const orderItemsPayload = items.map((i) => ({
      order_id: order.id,
      product_id: i.product.id,
      product_name: i.product.name_fa,
      unit_price: i.product.price,
      quantity: i.quantity,
    }));
    await supabase.from("order_items").insert(orderItemsPayload);

    // افزایش شمارنده‌ی استفاده از کد تخفیف (اگر استفاده شده)
    // ابتدا مقدار فعلی را می‌خوانیم، بعد یکی زیادش می‌کنیم و ذخیره می‌کنیم
    if (session.discountCodeId) {
      const { data: discountRow } = await supabase
        .from("discount_codes")
        .select("used_count")
        .eq("id", session.discountCodeId)
        .eq("merchant_id", merchant.id)
        .maybeSingle();
      if (discountRow) {
        await supabase
          .from("discount_codes")
          .update({ used_count: discountRow.used_count + 1 })
          .eq("id", session.discountCodeId)
          .eq("merchant_id", merchant.id);
      }
    }

    // خالی کردن سبد خرید
    await supabase.from("cart_items").delete().eq("customer_id", customer.id);

    // اگر این مشتری از طریق کسی معرفی شده، پورسانتش را به کیف‌پول معرف اضافه کن
    if (customer.referred_by && merchant.referral_percent > 0) {
      const commission = Math.round((finalTotal * merchant.referral_percent) / 100);
      if (commission > 0) {
        await supabase.from("wallet_ledger").insert({
          merchant_id: merchant.id,
          customer_id: customer.referred_by,
          amount: commission,
          type: "referral_commission",
          description: `پورسانت معرفی سفارش #${order.id.slice(0, 8)}`,
        });
        const { data: referrer } = await supabase
          .from("customers")
          .select("wallet_balance")
          .eq("id", customer.referred_by)
          .eq("merchant_id", merchant.id)
          .maybeSingle();
        if (referrer) {
          await supabase
            .from("customers")
            .update({ wallet_balance: referrer.wallet_balance + commission })
            .eq("id", customer.referred_by)
            .eq("merchant_id", merchant.id);
        }
      }
    }

    await clearSession(supabase, sessionKey);

    const admin = await isStoreAdmin(supabase, merchant, ctx.from.id);
    await ctx.reply(
      `🎉 سفارش شما با موفقیت ثبت شد!\n\nشماره پیگیری: #${order.id.slice(0, 8)}\n💰 مبلغ: ${formatToman(
        finalTotal
      )}\n\nهمکاران ما به‌زودی برای پیگیری با شما در ارتباط خواهند بود.`,
      { reply_markup: mainMenuKeyboard(admin) }
    );

    // اطلاع‌رسانی سفارش جدید به کانال گزارشات (اگر تنظیم شده باشد)
    if (merchant.report_channel) {
      try {
        await ctx.api.sendMessage(
          merchant.report_channel,
          `🆕 سفارش جدید #${order.id.slice(0, 8)}\n` +
            `👤 مشتری: ${ctx.from.first_name || ""} (@${ctx.from.username || "-"})\n` +
            `💰 مبلغ: ${formatToman(finalTotal)}\n` +
            `📱 تماس: ${session.phone}\n` +
            `🏠 آدرس: ${session.address}`
        );
      } catch (err) {
        console.error("ارسال گزارش سفارش به کانال ناموفق بود:", err.message);
      }
    }
  });

  bot.callbackQuery("ord:cancel", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "سفارش لغو شد" });
    await clearSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id));
    await ctx.reply("سفارش لغو شد. سبد خرید شما همچنان حفظ شده است.");
  });
}
