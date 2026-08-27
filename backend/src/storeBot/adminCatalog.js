// =============================================================================
// src/storeBot/adminCatalog.js
// بخش «📦 مدیریت محصولات» پنل مدیریت — یعنی همه‌ی کارهای مربوط به
// دسته‌بندی‌ها و محصولاتِ فروشگاه: افزودن، ویرایش، فعال/غیرفعال‌کردن و حذف.
//
// همه‌ی هندلرهای این فایل ابتدا بررسی می‌کنند که فرستنده‌ی پیام واقعا
// ادمین همین فروشگاه است یا نه (چون callback_data ثابت است و هرکسی که
// عدد آیدی محصول را حدس بزند نباید بتواند آن را دستکاری کند).
// =============================================================================

import { InlineKeyboard } from "grammy";
import { adminMenuKeyboard, confirmKeyboard } from "../lib/keyboards.js";
import { getSession, setSession, clearSession, buildSessionKey } from "../lib/session.js";
import { formatToman, parsePriceInput } from "../lib/format.js";
import { isStoreAdmin } from "./engine.js";

/**
 * یک میان‌افزار کوچک که قبل از هر هندلر ادمین اجرا می‌شود و مطمئن می‌شود
 * کاربر واقعا اجازه‌ی دسترسی به این بخش را دارد.
 * @returns {Promise<boolean>} true یعنی اجازه دارد
 */
async function requireAdmin(ctx) {
  const ok = await isStoreAdmin(ctx.supabase, ctx.merchant, ctx.from.id);
  if (!ok) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: "⛔️ دسترسی ندارید", show_alert: true });
    } else {
      await ctx.reply("⛔️ شما دسترسی مدیریتی ندارید.");
    }
  }
  return ok;
}

export function registerAdminCatalogHandlers(bot) {
  // -----------------------------------------------------------------------
  // ورود به بخش «مدیریت محصولات» از منوی پنل مدیریت
  // -----------------------------------------------------------------------
  bot.hears("📦 مدیریت محصولات", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const kb = new InlineKeyboard()
      .text("➕ افزودن دسته‌بندی", "ac:a")
      .text("🗂 لیست دسته‌بندی‌ها", "ac:l")
      .row()
      .text("➕ افزودن محصول", "ap:a")
      .text("📋 لیست محصولات", "ap:l");
    await ctx.reply("بخش مدیریت محصولات — یکی از گزینه‌ها را انتخاب کنید:", {
      reply_markup: kb,
    });
  });

  // =========================================================================
  // بخش دسته‌بندی‌ها (Categories)
  // =========================================================================

  bot.callbackQuery("ac:l", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await showCategoryAdminList(ctx);
  });

  async function showCategoryAdminList(ctx) {
    const { data: categories } = await ctx.supabase
      .from("categories")
      .select("id, name, is_active")
      .eq("merchant_id", ctx.merchant.id)
      .order("sort_order", { ascending: true });

    if (!categories || categories.length === 0) {
      await ctx.reply("هنوز دسته‌بندی‌ای ثبت نشده.", {
        reply_markup: new InlineKeyboard().text("➕ افزودن دسته‌بندی", "ac:a"),
      });
      return;
    }

    const kb = new InlineKeyboard();
    for (const cat of categories) {
      const flag = cat.is_active ? "🟢" : "🔴";
      kb.text(`${flag} ${cat.name}`, `ac:v:${cat.id}`).row();
    }
    kb.text("➕ افزودن دسته‌بندی جدید", "ac:a");

    await ctx.reply("🗂 دسته‌بندی‌های شما:", { reply_markup: kb });
  }

  // نمایش جزئیات یک دسته‌بندی به همراه گزینه‌های ویرایش/حذف
  bot.callbackQuery(/^ac:v:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const id = ctx.match[1];
    const { data: cat } = await ctx.supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .eq("merchant_id", ctx.merchant.id)
      .maybeSingle();
    if (!cat) {
      await ctx.reply("این دسته‌بندی پیدا نشد.");
      return;
    }
    const kb = new InlineKeyboard()
      .text("✏️ تغییر نام", `ac:e:${id}`)
      .text(cat.is_active ? "🔴 غیرفعال کردن" : "🟢 فعال کردن", `ac:t:${id}`)
      .row()
      .text("🗑 حذف دسته‌بندی", `ac:d:${id}`)
      .row()
      .text("🔙 بازگشت به لیست", "ac:l");
    await ctx.reply(`🗂 ${cat.name}\nوضعیت: ${cat.is_active ? "فعال" : "غیرفعال"}`, {
      reply_markup: kb,
    });
  });

  bot.callbackQuery("ac:a", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_category_name",
    });
    await ctx.reply("📝 نام دسته‌بندی جدید را وارد کنید:");
  });

  bot.callbackQuery(/^ac:e:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_category_rename",
      targetCategoryId: ctx.match[1],
    });
    await ctx.reply("📝 نام جدید دسته‌بندی را وارد کنید:");
  });

  bot.callbackQuery(/^ac:t:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const id = ctx.match[1];
    const { data: cat } = await ctx.supabase
      .from("categories")
      .select("is_active")
      .eq("id", id)
      .eq("merchant_id", ctx.merchant.id)
      .maybeSingle();
    if (cat) {
      await ctx.supabase.from("categories").update({ is_active: !cat.is_active }).eq("id", id).eq("merchant_id", ctx.merchant.id);
    }
    await ctx.answerCallbackQuery({ text: "وضعیت به‌روزرسانی شد ✅" });
    await showCategoryAdminList(ctx);
  });

  bot.callbackQuery(/^ac:d:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const id = ctx.match[1];
    await ctx.reply("⚠️ آیا از حذف این دسته‌بندی مطمئن هستید؟ (محصولات آن حذف نمی‌شوند، فقط بدون دسته‌بندی می‌مانند)", {
      reply_markup: confirmKeyboard(`ac:dy:${id}`, "ac:l"),
    });
  });

  bot.callbackQuery(/^ac:dy:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const id = ctx.match[1];
    await ctx.supabase.from("categories").delete().eq("id", id).eq("merchant_id", ctx.merchant.id);
    await ctx.answerCallbackQuery({ text: "دسته‌بندی حذف شد 🗑" });
    await showCategoryAdminList(ctx);
  });

  // =========================================================================
  // بخش محصولات (Products)
  // =========================================================================

  bot.callbackQuery("ap:l", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await showProductAdminList(ctx);
  });

  async function showProductAdminList(ctx) {
    const { data: products } = await ctx.supabase
      .from("products")
      .select("id, name_fa, price, is_active")
      .eq("merchant_id", ctx.merchant.id)
      .order("created_at", { ascending: false });

    if (!products || products.length === 0) {
      await ctx.reply("هنوز محصولی ثبت نشده.", {
        reply_markup: new InlineKeyboard().text("➕ افزودن محصول", "ap:a"),
      });
      return;
    }

    const kb = new InlineKeyboard();
    for (const p of products) {
      const flag = p.is_active ? "🟢" : "🔴";
      kb.text(`${flag} ${p.name_fa} — ${formatToman(p.price)}`, `ap:v:${p.id}`).row();
    }
    kb.text("➕ افزودن محصول جدید", "ap:a");

    await ctx.reply("📋 محصولات شما:", { reply_markup: kb });
  }

  bot.callbackQuery(/^ap:v:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await showProductAdminDetail(ctx, ctx.match[1]);
  });

  async function showProductAdminDetail(ctx, id) {
    const { data: p } = await ctx.supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("merchant_id", ctx.merchant.id)
      .maybeSingle();
    if (!p) {
      await ctx.reply("این محصول پیدا نشد.");
      return;
    }

    const caption =
      `🛍 ${p.name_fa}\n` +
      `${p.description ? p.description + "\n" : ""}` +
      `💰 قیمت: ${formatToman(p.price)}\n` +
      `وضعیت: ${p.is_active ? "🟢 فعال" : "🔴 غیرفعال"}`;

    const kb = new InlineKeyboard()
      .text("✏️ نام", `ap:en:${id}`)
      .text("📝 توضیحات", `ap:ed:${id}`)
      .row()
      .text("💰 قیمت", `ap:ep:${id}`)
      .text("🖼 عکس", `ap:ei:${id}`)
      .row()
      .text(p.is_active ? "🔴 غیرفعال کردن" : "🟢 فعال کردن", `ap:t:${id}`)
      .row()
      .text("🗑 حذف محصول", `ap:d:${id}`)
      .row()
      .text("🔙 بازگشت به لیست", "ap:l");

    if (p.image_file_id) {
      await ctx.replyWithPhoto(p.image_file_id, { caption, reply_markup: kb });
    } else {
      await ctx.reply(caption, { reply_markup: kb });
    }
  }

  bot.callbackQuery(/^ap:t:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const id = ctx.match[1];
    const { data: p } = await ctx.supabase.from("products").select("is_active").eq("id", id).eq("merchant_id", ctx.merchant.id).maybeSingle();
    if (p) {
      await ctx.supabase.from("products").update({ is_active: !p.is_active }).eq("id", id).eq("merchant_id", ctx.merchant.id);
    }
    await ctx.answerCallbackQuery({ text: "وضعیت به‌روزرسانی شد ✅" });
    await showProductAdminList(ctx);
  });

  bot.callbackQuery(/^ap:d:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const id = ctx.match[1];
    await ctx.reply("⚠️ آیا از حذف این محصول مطمئن هستید؟", {
      reply_markup: confirmKeyboard(`ap:dy:${id}`, "ap:l"),
    });
  });

  bot.callbackQuery(/^ap:dy:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const id = ctx.match[1];
    await ctx.supabase.from("products").delete().eq("id", id).eq("merchant_id", ctx.merchant.id);
    await ctx.answerCallbackQuery({ text: "محصول حذف شد 🗑" });
    await showProductAdminList(ctx);
  });

  // ---- شروع ویزارد افزودن محصول جدید ----
  bot.callbackQuery("ap:a", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();

    const { data: categories } = await ctx.supabase
      .from("categories")
      .select("id, name")
      .eq("merchant_id", ctx.merchant.id)
      .eq("is_active", true);

    const kb = new InlineKeyboard();
    for (const cat of categories || []) {
      kb.text(cat.name, `ap:ac:${cat.id}`).row();
    }
    kb.text("بدون دسته‌بندی", "ap:ac:none");

    await ctx.reply("محصول جدید در کدام دسته‌بندی قرار بگیرد؟", { reply_markup: kb });
  });

  bot.callbackQuery(/^ap:ac:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    const categoryId = ctx.match[1] === "none" ? null : ctx.match[1];
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_product_name",
      newProduct: { category_id: categoryId },
    });
    await ctx.reply("📝 نام فارسی محصول را وارد کنید:");
  });

  // ---------------------------------------------------------------------
  // هندلر عمومیِ متن — مراحل چندقدمیِ مربوط به دسته‌بندی و محصول
  // ---------------------------------------------------------------------
  bot.on("message:text", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);
    const text = ctx.message.text.trim();

    switch (session.step) {
      case "awaiting_category_name": {
        if (!(await requireAdmin(ctx))) return;
        await supabase.from("categories").insert({ merchant_id: merchant.id, name: text });
        await clearSession(supabase, sessionKey);
        await ctx.reply(`✅ دسته‌بندی «${text}» اضافه شد.`, { reply_markup: adminMenuKeyboard() });
        return;
      }

      case "awaiting_category_rename": {
        if (!(await requireAdmin(ctx))) return;
        await supabase
          .from("categories")
          .update({ name: text })
          .eq("id", session.targetCategoryId)
          .eq("merchant_id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ نام دسته‌بندی به‌روزرسانی شد.", { reply_markup: adminMenuKeyboard() });
        return;
      }

      case "awaiting_product_name": {
        if (!(await requireAdmin(ctx))) return;
        session.newProduct.name_fa = text;
        session.step = "awaiting_product_description";
        await setSession(supabase, sessionKey, session);
        await ctx.reply('📝 توضیحات محصول را وارد کنید (برای رد کردن بنویسید "ندارد"):');
        return;
      }

      case "awaiting_product_description": {
        if (!(await requireAdmin(ctx))) return;
        session.newProduct.description = text === "ندارد" ? null : text;
        session.step = "awaiting_product_price";
        await setSession(supabase, sessionKey, session);
        await ctx.reply("💰 قیمت محصول را به تومان وارد کنید (فقط عدد):");
        return;
      }

      case "awaiting_product_price": {
        if (!(await requireAdmin(ctx))) return;
        const price = parsePriceInput(text);
        if (price === null) {
          await ctx.reply("❌ عدد واردشده معتبر نیست. لطفا فقط قیمت را به‌صورت عدد وارد کنید:");
          return;
        }
        session.newProduct.price = price;
        session.step = "awaiting_product_image";
        await setSession(supabase, sessionKey, session);
        await ctx.reply('🖼 یک عکس برای محصول ارسال کنید (برای رد کردن بنویسید "ندارد"):');
        return;
      }

      case "awaiting_product_image": {
        if (!(await requireAdmin(ctx))) return;
        if (text === "ندارد") {
          await finalizeNewProduct(ctx, session, sessionKey, null);
        } else {
          await ctx.reply('🖼 لطفا یک عکس ارسال کنید یا بنویسید "ندارد":');
        }
        return;
      }

      case "awaiting_product_edit_name": {
        if (!(await requireAdmin(ctx))) return;
        await supabase
          .from("products")
          .update({ name_fa: text })
          .eq("id", session.targetProductId)
          .eq("merchant_id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ نام محصول به‌روزرسانی شد.");
        await showProductAdminDetail(ctx, session.targetProductId);
        return;
      }

      case "awaiting_product_edit_description": {
        if (!(await requireAdmin(ctx))) return;
        await supabase
          .from("products")
          .update({ description: text === "ندارد" ? null : text })
          .eq("id", session.targetProductId)
          .eq("merchant_id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ توضیحات محصول به‌روزرسانی شد.");
        await showProductAdminDetail(ctx, session.targetProductId);
        return;
      }

      case "awaiting_product_edit_price": {
        if (!(await requireAdmin(ctx))) return;
        const price = parsePriceInput(text);
        if (price === null) {
          await ctx.reply("❌ عدد معتبر نیست. دوباره قیمت را وارد کنید:");
          return;
        }
        await supabase
          .from("products")
          .update({ price })
          .eq("id", session.targetProductId)
          .eq("merchant_id", merchant.id);
        await clearSession(supabase, sessionKey);
        await ctx.reply("✅ قیمت محصول به‌روزرسانی شد.");
        await showProductAdminDetail(ctx, session.targetProductId);
        return;
      }

      case "awaiting_product_edit_image": {
        if (!(await requireAdmin(ctx))) return;
        await ctx.reply("🖼 لطفا یک عکس ارسال کنید:");
        return;
      }

      default:
        await next();
    }
  });

  // ---------------------------------------------------------------------
  // هندلر عمومیِ عکس — برای مرحله‌ی «افزودن عکس محصول» چه در ساخت محصول
  // جدید و چه در ویرایش عکس یک محصول موجود
  // ---------------------------------------------------------------------
  bot.on("message:photo", async (ctx, next) => {
    const { merchant, supabase } = ctx;
    const sessionKey = buildSessionKey(merchant.id, ctx.from.id);
    const session = await getSession(supabase, sessionKey);

    // بزرگ‌ترین سایز عکس ارسالی را برمی‌داریم (تلگرام چند سایز مختلف می‌فرستد)
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    if (session.step === "awaiting_product_image") {
      if (!(await requireAdmin(ctx))) return;
      await finalizeNewProduct(ctx, session, sessionKey, fileId);
      return;
    }

    if (session.step === "awaiting_product_edit_image") {
      if (!(await requireAdmin(ctx))) return;
      await supabase
        .from("products")
        .update({ image_file_id: fileId })
        .eq("id", session.targetProductId)
        .eq("merchant_id", merchant.id);
      await clearSession(supabase, sessionKey);
      await ctx.reply("✅ عکس محصول به‌روزرسانی شد.");
      await showProductAdminDetail(ctx, session.targetProductId);
      return;
    }

    await next();
  });

  async function finalizeNewProduct(ctx, session, sessionKey, imageFileId) {
    const { merchant, supabase } = ctx;
    const { data: created, error } = await supabase
      .from("products")
      .insert({
        merchant_id: merchant.id,
        category_id: session.newProduct.category_id,
        name_fa: session.newProduct.name_fa,
        description: session.newProduct.description,
        price: session.newProduct.price,
        image_file_id: imageFileId,
      })
      .select()
      .single();

    await clearSession(supabase, sessionKey);

    if (error || !created) {
      console.error("خطا در ثبت محصول:", error?.message);
      await ctx.reply("⚠️ مشکلی در ثبت محصول پیش آمد.");
      return;
    }

    await ctx.reply(`✅ محصول «${created.name_fa}» با موفقیت اضافه شد.`, {
      reply_markup: adminMenuKeyboard(),
    });
  }

  // ---- دکمه‌های ویرایش که فقط session.step را تنظیم می‌کنند ----
  bot.callbackQuery(/^ap:en:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_product_edit_name",
      targetProductId: ctx.match[1],
    });
    await ctx.reply("📝 نام جدید محصول را وارد کنید:");
  });

  bot.callbackQuery(/^ap:ed:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_product_edit_description",
      targetProductId: ctx.match[1],
    });
    await ctx.reply('📝 توضیحات جدید را وارد کنید (یا "ندارد"):');
  });

  bot.callbackQuery(/^ap:ep:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_product_edit_price",
      targetProductId: ctx.match[1],
    });
    await ctx.reply("💰 قیمت جدید را به تومان وارد کنید:");
  });

  bot.callbackQuery(/^ap:ei:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await setSession(ctx.supabase, buildSessionKey(ctx.merchant.id, ctx.from.id), {
      step: "awaiting_product_edit_image",
      targetProductId: ctx.match[1],
    });
    await ctx.reply("🖼 عکس جدید محصول را ارسال کنید:");
  });
}
