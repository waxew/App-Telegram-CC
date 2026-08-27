// =============================================================================
// src/api/botConnectApi.js
// اتصال مستقیم اپ اندروید به ربات تلگرام با BotFather Token.
//
// این Endpoint جایگزین فلو کاربرمحور «آدرس Worker + کد ۸ کاراکتری» است.
// کاربر فقط Token ربات خودش را وارد می‌کند. Worker پشت‌صحنه:
//   ۱) Token را با Telegram getMe اعتبارسنجی می‌کند.
//   ۲) فروشگاه موجود را پیدا می‌کند یا یک Merchant جدید می‌سازد.
//   ۳) Token را فقط به‌صورت AES-GCM رمزگذاری‌شده ذخیره می‌کند.
//   ۴) Webhook همان ربات را روی Worker فعلی تنظیم می‌کند.
//   ۵) یک Session محدود و امن برای همین اپ صادر می‌کند.
//
// BotFather Token هرگز داخل Log چاپ نمی‌شود و در پاسخ API نیز برگردانده نمی‌شود.
// =============================================================================

import { generateSessionToken, sha256Hex } from "../lib/crypto.js";
import { generateSecret } from "../lib/format.js";
import { protectBotToken } from "../lib/merchantSecrets.js";

/** پاسخ JSON استاندارد و بدون Cache می‌سازد. */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** ساختار ثابت خطا برای نمایش پیام مناسب در Android. */
function apiError(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

/** فقط اطلاعات غیرمحرمانه Merchant را به اپ برمی‌گرداند. */
function serializeMerchant(merchant) {
  return {
    id: merchant.id,
    storeName: merchant.store_name || merchant.bot_first_name || "فروشگاه",
    botUsername: merchant.bot_username || "",
    botFirstName: merchant.bot_first_name || "",
    mandatoryChannel: merchant.mandatory_channel || "",
    reportChannel: merchant.report_channel || "",
    supportLink: merchant.support_link || "",
    referralPercent: Number(merchant.referral_percent || 0),
    cardNumber: merchant.card_number || "",
    cardHolderName: merchant.card_holder_name || "",
    createdAt: merchant.created_at,
  };
}

/** Body درخواست را بدون Crash شدن Worker می‌خواند. */
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Token را با API رسمی Telegram بررسی می‌کند و botInfo را برمی‌گرداند.
 * هیچ بخش Token در خطا یا Log ثبت نمی‌شود.
 */
async function validateBotToken(token) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = await response.json();
    if (!response.ok || !payload?.ok || !payload?.result?.id) return null;
    return payload.result;
  } catch {
    return null;
  }
}

/**
 * Webhook ربات را روی Origin همین Worker فعال می‌کند.
 * به این ترتیب Android هیچ‌وقت آدرس Worker را از کاربر سؤال نمی‌کند.
 */
async function configureStoreWebhook(request, token, merchant) {
  const workerOrigin = new URL(request.url).origin;
  const webhookUrl = `${workerOrigin}/webhook/store/${merchant.id}`;

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: merchant.webhook_secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
  });

  const payload = await response.json();
  return Boolean(response.ok && payload?.ok);
}

/**
 * Router کوچک مخصوص اتصال Token.
 * @returns {Promise<Response|null>} اگر مسیر متعلق به این فایل نباشد null می‌دهد.
 */
export async function handleBotConnectApi(request, env, supabase) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/v1/app/connect-bot" || request.method !== "POST") {
    return null;
  }

  const body = await readJson(request);
  const token = String(body?.botToken || "").trim();
  const deviceName = String(body?.deviceName || "Android").trim().slice(0, 120);

  // BotFather Token به شکل <bot-id>:<secret> است. این Regex فقط خطاهای واضح را
  // زودتر رد می‌کند؛ اعتبار واقعی فقط با Telegram getMe تعیین می‌شود.
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
    return apiError("INVALID_BOT_TOKEN", "توکن ربات معتبر نیست.", 400);
  }

  const botInfo = await validateBotToken(token);
  if (!botInfo) {
    return apiError(
      "TELEGRAM_TOKEN_REJECTED",
      "تلگرام این توکن را تأیید نکرد. توکن را دوباره از BotFather کپی کنید.",
      401
    );
  }

  let protectedToken;
  try {
    protectedToken = await protectBotToken(token, env);
  } catch (error) {
    console.error("Token encryption configuration error:", error?.message || "unknown");
    return apiError("SERVER_SECURITY_CONFIG", "تنظیمات امنیتی سرور کامل نیست.", 500);
  }

  // bot_id شناسه پایدار ربات است. اگر کاربر قبلاً همین ربات را وصل کرده باشد،
  // Merchant تکراری نمی‌سازیم و فقط Token/مشخصات تازه را به‌روزرسانی می‌کنیم.
  const { data: existingMerchant, error: existingError } = await supabase
    .from("merchants")
    .select("*")
    .eq("bot_id", botInfo.id)
    .maybeSingle();

  if (existingError) {
    return apiError("DATABASE_ERROR", "بررسی فروشگاه ناموفق بود.", 500);
  }

  let merchant;

  if (existingMerchant) {
    const { data, error } = await supabase
      .from("merchants")
      .update({
        // اگر رکورد قدیمی plaintext داشته باشد، در اتصال جدید پاک می‌شود.
        bot_token: null,
        ...protectedToken,
        bot_username: botInfo.username || null,
        bot_first_name: botInfo.first_name || existingMerchant.bot_first_name,
      })
      .eq("id", existingMerchant.id)
      .select("*")
      .single();

    if (error || !data) {
      return apiError("DATABASE_ERROR", "به‌روزرسانی اتصال ربات ناموفق بود.", 500);
    }
    merchant = data;
  } else {
    const { data, error } = await supabase
      .from("merchants")
      .insert({
        // Merchantهایی که از اپ ساخته می‌شوند از داخل خود اپ مدیریت می‌شوند.
        // مقدار 0 یک sentinel است و به هیچ Telegram user واقعی تعلق ندارد.
        owner_telegram_id: 0,
        ...protectedToken,
        bot_username: botInfo.username || null,
        bot_id: botInfo.id,
        bot_first_name: botInfo.first_name || "Store Bot",
        store_name: botInfo.first_name || botInfo.username || "فروشگاه",
        webhook_secret: generateSecret(),
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Merchant creation failed:", error?.message || "unknown");
      return apiError("DATABASE_ERROR", "ساخت فروشگاه ناموفق بود.", 500);
    }
    merchant = data;
  }

  // اتصال موفق زمانی کامل است که Telegram Webhook همان ربات هم فعال شده باشد.
  const webhookConfigured = await configureStoreWebhook(request, token, merchant);
  if (!webhookConfigured) {
    return apiError(
      "WEBHOOK_SETUP_FAILED",
      "توکن معتبر است اما اتصال ربات به سرور کامل نشد. دوباره تلاش کنید.",
      502
    );
  }

  // APK از اینجا به بعد Bot Token را کنار می‌گذارد و فقط با Session کار می‌کند.
  const rawSessionToken = generateSessionToken(32);
  const tokenHash = await sha256Hex(rawSessionToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: sessionError } = await supabase.from("app_sessions").insert({
    merchant_id: merchant.id,
    token_hash: tokenHash,
    device_name: deviceName,
    expires_at: expiresAt,
  });

  if (sessionError) {
    console.error("App session creation failed:", sessionError.message);
    return apiError("SESSION_CREATE_FAILED", "ساخت نشست اپ ناموفق بود.", 500);
  }

  return json({
    ok: true,
    sessionToken: rawSessionToken,
    expiresAt,
    merchant: serializeMerchant(merchant),
  });
}
