// =============================================================================
// src/masterBot.js
// «ربات اصلی / ربات‌ساز» — همان رباتی که کاربر ابتدا وارد آن می‌شود (در
// ویدیوی نمونه اسمش «Babba.ir» بود) و با فرستادن توکن ربات شخصی‌اش،
// یک فروشگاه تلگرامی جدید برای خودش می‌سازد.
//
// وظیفه‌ی این فایل فقط «ثبت‌نام فروشگاه جدید» است؛ تمام منطق خودِ فروشگاه
// (محصولات، سبد خرید، پنل مدیریت و ...) در پوشه‌ی src/storeBot قرار دارد
// و کاملا جدا از این فایل است.
// =============================================================================

import { Bot, webhookCallback } from "grammy";
import { getSupabaseClient } from "./lib/supabase.js";
import { getSession, setSession, clearSession, buildSessionKey } from "./lib/session.js";
import { generateSecret } from "./lib/format.js";
import { protectBotToken } from "./lib/merchantSecrets.js";

// این پیشوند به‌عنوان merchantId استفاده نمی‌شود، فقط برای ساخت کلید session
// مخصوصِ خودِ ربات اصلی به کار می‌رود تا با session فروشگاه‌ها قاطی نشود
const MASTER_SESSION_SCOPE = "master";

/**
 * یک نمونه از ربات اصلی می‌سازد و تمام دستورها/پیام‌هایش را به آن وصل می‌کند.
 *
 * @param {object} env - متغیرهای محیطی Cloudflare Workers
 * @returns {Bot}
 */
export function createMasterBot(env) {
  const bot = new Bot(env.MASTER_BOT_TOKEN);
  const supabase = getSupabaseClient(env);

  // ---------------------------------------------------------------------
  // دستور /start — اولین پیامی که کاربر با ورود به ربات می‌بیند
  // ---------------------------------------------------------------------
  bot.command("start", async (ctx) => {
    const text =
      "👋 به ربات‌ساز فروشگاهی خوش آمدید!\n\n" +
      "با این ربات می‌توانید در چند دقیقه یک فروشگاه کامل داخل تلگرام برای خودتان بسازید.\n\n" +
      "مراحل کار:\n" +
      "۱️⃣ به @BotFather بروید و با دستور /newbot یک ربات جدید بسازید\n" +
      "۲️⃣ توکنی که BotFather به شما می‌دهد را کپی کنید (چیزی شبیه 123456:AAExample)\n" +
      "۳️⃣ همان توکن را همین‌جا برای من ارسال کنید\n\n" +
      "🔑 توکن ربات خودتان را ارسال کنید:";

    await ctx.reply(text);

    // با ذخیره‌ی این مرحله، وقتی پیام بعدی (که همان توکن است) برسد،
    // متوجه می‌شویم منتظر چه چیزی بودیم
    const sessionKey = buildSessionKey(MASTER_SESSION_SCOPE, ctx.from.id);
    await setSession(supabase, sessionKey, { step: "awaiting_bot_token" });
  });

  // ---------------------------------------------------------------------
  // دریافت پیام‌های متنی — اینجا فقط منتظر «توکن ربات» هستیم
  // ---------------------------------------------------------------------
  bot.on("message:text", async (ctx) => {
    const sessionKey = buildSessionKey(MASTER_SESSION_SCOPE, ctx.from.id);
    const session = await getSession(supabase, sessionKey);

    if (session.step !== "awaiting_bot_token") {
      // اگر کاربر در هیچ مرحله‌ی خاصی نیست، یعنی هنوز /start نزده
      await ctx.reply("برای شروع، دستور /start را بفرستید. 🙂");
      return;
    }

    const token = ctx.message.text.trim();

    // یک بررسی سطحی روی فرمت توکن قبل از تماس با تلگرام
    // (توکن‌های واقعی تلگرام همیشه شکل عدد:رشته دارند)
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
      await ctx.reply(
        "❌ این متن شبیه توکن معتبر تلگرام نیست.\n" +
          "توکن باید چیزی شبیه این باشد: 123456789:AAExampleToken\n" +
          "لطفا دوباره امتحان کنید یا از @BotFather یک ربات جدید بسازید."
      );
      return;
    }

    await ctx.reply("⏳ در حال بررسی توکن با سرورهای تلگرام...");

    // ---------------------------------------------------------------
    // فراخوانی مستقیم getMe از API تلگرام برای اطمینان از معتبر بودن
    // توکن و گرفتن اطلاعات پایه‌ی ربات (نام‌کاربری، آیدی عددی و ...)
    // ---------------------------------------------------------------
    let botInfo;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const json = await res.json();
      if (!json.ok) {
        await ctx.reply(
          "❌ تلگرام این توکن را تایید نکرد. مطمئن شوید توکن را درست کپی کرده‌اید."
        );
        return;
      }
      botInfo = json.result;
    } catch (err) {
      console.error("خطا در تماس با تلگرام برای بررسی توکن:", err);
      await ctx.reply("⚠️ مشکلی در ارتباط با تلگرام پیش آمد، لطفا دوباره امتحان کنید.");
      return;
    }

    // خود توکن را Query نمی‌کنیم. bot_id تلگرام شناسه‌ی پایدار و غیرمحرمانه‌ی ربات است
    // و حتی ردیف‌های قدیمی که هنوز توکن خام دارند با همین شناسه پیدا می‌شوند.
    const { data: existing } = await supabase
      .from("merchants")
      .select("id")
      .eq("bot_id", botInfo.id)
      .maybeSingle();

    if (existing) {
      await ctx.reply("⚠️ این ربات قبلا در سیستم ثبت شده است.");
      await clearSession(supabase, sessionKey);
      return;
    }

    // ---------------------------------------------------------------
    // ساخت ردیف جدید در جدول merchants — یعنی «تولد» یک فروشگاه جدید
    // ---------------------------------------------------------------
    const webhookSecret = generateSecret();
    // توکن BotFather قبل از INSERT با AES-GCM رمز می‌شود؛ plaintext وارد دیتابیس نمی‌شود.
    const protectedToken = await protectBotToken(token, env);

    const { data: merchant, error: insertError } = await supabase
      .from("merchants")
      .insert({
        owner_telegram_id: ctx.from.id,
        ...protectedToken,
        bot_username: botInfo.username,
        bot_id: botInfo.id,
        bot_first_name: botInfo.first_name,
        store_name: botInfo.first_name,
        webhook_secret: webhookSecret,
      })
      .select()
      .single();

    if (insertError || !merchant) {
      console.error("خطا در ساخت فروشگاه جدید:", insertError?.message);
      await ctx.reply("⚠️ مشکلی در ثبت فروشگاه پیش آمد. لطفا دوباره تلاش کنید.");
      return;
    }

    // ---------------------------------------------------------------
    // فعال‌سازی webhook ربات مشتری — یعنی از این لحظه به بعد، وقتی
    // کسی برای ربات او پیام بفرستد، تلگرام مستقیم به آدرس Worker ما
    // (مسیر اختصاصی همین فروشگاه) خبر می‌دهد
    // ---------------------------------------------------------------
    const webhookUrl = `${env.WEBHOOK_BASE_URL}/webhook/store/${merchant.id}`;
    try {
      const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
          // این دو نوع آپدیت برای عملکرد فروشگاه کافی‌اند (پیام و دکمه‌ی شیشه‌ای)
          allowed_updates: ["message", "callback_query"],
        }),
      });
      const setJson = await setRes.json();
      if (!setJson.ok) {
        console.error("setWebhook ناموفق بود:", setJson.description);
      }
    } catch (err) {
      console.error("خطا در تنظیم webhook ربات مشتری:", err);
    }

    await clearSession(supabase, sessionKey);

    await ctx.reply(
      "🎉 فروشگاه شما با موفقیت ساخته شد!\n\n" +
        `🤖 ربات فروشگاهی شما: @${botInfo.username}\n\n` +
        "همین الان به ربات فروشگاهی خودتان بروید و دستور /start را بزنید تا وارد پنل مدیریت شوید و دسته‌بندی و محصولات‌تان را اضافه کنید. 🚀"
    );
  });

  return bot;
}

/**
 * درخواست webhook مربوط به ربات اصلی را پردازش می‌کند.
 * این تابع از فایل src/index.js صدا زده می‌شود.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handleMasterWebhook(request, env) {
  // اگر Secret وب‌هوک ربات اصلی تنظیم شده باشد، فقط درخواست‌های واقعی تلگرام پذیرفته می‌شوند.
  if (env.MASTER_WEBHOOK_SECRET) {
    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== env.MASTER_WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  const bot = createMasterBot(env);
  const handler = webhookCallback(bot, "cloudflare-mod");
  return handler(request);
}
