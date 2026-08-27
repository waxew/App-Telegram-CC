// =============================================================================
// src/api/appApi.js
// REST API امن برای اپ اندروید Telegram CC.
//
// تمام عملیات دیتابیس با service_role فقط در Worker انجام می‌شود. اپ یک نشست
// محدود به merchant خودش دارد و هر Query دوباره با merchant_id Scope می‌شود.
// =============================================================================

import { authenticateAppRequest } from "./appAuth.js";
import { generateSessionToken, sha256Hex } from "../lib/crypto.js";

/** پاسخ JSON استاندارد با Header مناسب می‌سازد. */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** خطا را با ساختار ثابت برمی‌گرداند تا اپ بتواند پیام مناسب نشان دهد. */
function apiError(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

/** فقط فیلدهای غیرمحرمانه Merchant را برای اپ خروجی می‌دهد. */
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

/** JSON Body را با خطای قابل‌کنترل می‌خواند. */
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Router اصلی API اپ.
 * @param {Request} request
 * @param {object} env
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Response|null>}
 */
export async function handleAppApi(request, env, supabase) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Health/version عمداً Public است و هیچ اطلاعات محرمانه‌ای برنمی‌گرداند.
  if (path === "/api/v1/app/version" && request.method === "GET") {
    return json({
      ok: true,
      latestVersionCode: Number(env.ANDROID_LATEST_VERSION_CODE || 1),
      latestVersionName: env.ANDROID_LATEST_VERSION_NAME || "1.0.0",
      downloadUrl: env.ANDROID_DOWNLOAD_URL || "",
      forceUpdate: String(env.ANDROID_FORCE_UPDATE || "false").toLowerCase() === "true",
    });
  }

  // Pairing تنها Route بدون Bearer Token است؛ خود کد یک‌بارمصرف نقش Credential را دارد.
  if (path === "/api/v1/app/pair" && request.method === "POST") {
    const body = await readJson(request);
    const code = String(body?.code || "").trim().toUpperCase();
    const deviceName = String(body?.deviceName || "Android").trim().slice(0, 120);

    if (!/^[A-Z2-9]{8}$/.test(code)) {
      return apiError("INVALID_PAIRING_CODE", "کد اتصال معتبر نیست.", 400);
    }

    const codeHash = await sha256Hex(code);
    const now = new Date().toISOString();

    // update+select باعث می‌شود یک کد نتواند در دو درخواست هم‌زمان دوبار مصرف شود.
    const { data: pairing, error: pairingError } = await supabase
      .from("app_pairing_codes")
      .update({ used_at: now })
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("id, merchant_id, merchant:merchants(*)")
      .maybeSingle();

    if (pairingError || !pairing || !pairing.merchant) {
      return apiError("PAIRING_CODE_EXPIRED", "کد اتصال اشتباه، منقضی یا قبلاً استفاده شده است.", 401);
    }

    const rawSessionToken = generateSessionToken(32);
    const tokenHash = await sha256Hex(rawSessionToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessionError } = await supabase.from("app_sessions").insert({
      merchant_id: pairing.merchant_id,
      token_hash: tokenHash,
      device_name: deviceName,
      expires_at: expiresAt,
    });

    if (sessionError) {
      console.error("خطا در ساخت نشست اپ:", sessionError.message);
      return apiError("SESSION_CREATE_FAILED", "ساخت نشست اپ ناموفق بود.", 500);
    }

    return json({
      ok: true,
      sessionToken: rawSessionToken,
      expiresAt,
      merchant: serializeMerchant(pairing.merchant),
    });
  }

  // از اینجا به بعد همه Routeها باید نشست معتبر داشته باشند.
  if (!path.startsWith("/api/v1/")) return null;
  const auth = await authenticateAppRequest(request, supabase);
  if (!auth) return apiError("UNAUTHORIZED", "نشست معتبر نیست؛ دوباره اپ را متصل کنید.", 401);

  const { merchant, session } = auth;

  if (path === "/api/v1/app/me" && request.method === "GET") {
    return json({ ok: true, merchant: serializeMerchant(merchant), sessionExpiresAt: session.expires_at });
  }

  if (path === "/api/v1/app/logout" && request.method === "POST") {
    await supabase.from("app_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
    return json({ ok: true });
  }

  if (path === "/api/v1/dashboard" && request.method === "GET") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [customersResult, productsResult, ordersResult, recentOrdersResult] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("merchant_id", merchant.id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", merchant.id),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("merchant_id", merchant.id),
      supabase
        .from("orders")
        .select("total_amount, status")
        .eq("merchant_id", merchant.id)
        .gte("created_at", thirtyDaysAgo)
        .neq("status", "cancelled"),
    ]);

    const sales30Days = (recentOrdersResult.data || []).reduce(
      (sum, order) => sum + Number(order.total_amount || 0),
      0
    );

    return json({
      ok: true,
      dashboard: {
        customersCount: customersResult.count || 0,
        productsCount: productsResult.count || 0,
        ordersCount: ordersResult.count || 0,
        sales30Days,
      },
    });
  }

  if (path === "/api/v1/categories" && request.method === "GET") {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, is_active, sort_order, created_at")
      .eq("merchant_id", merchant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) return apiError("DATABASE_ERROR", "خواندن دسته‌بندی‌ها ناموفق بود.", 500);
    return json({ ok: true, categories: data || [] });
  }

  if (path === "/api/v1/categories" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body?.name || "").trim().slice(0, 120);
    if (!name) return apiError("INVALID_NAME", "نام دسته‌بندی خالی است.", 400);

    const { data, error } = await supabase
      .from("categories")
      .insert({ merchant_id: merchant.id, name })
      .select("id, name, is_active, sort_order, created_at")
      .single();
    if (error) return apiError("DATABASE_ERROR", "ساخت دسته‌بندی ناموفق بود.", 500);
    return json({ ok: true, category: data }, 201);
  }

  const categoryMatch = path.match(/^\/api\/v1\/categories\/([a-f0-9-]+)$/i);
  if (categoryMatch && request.method === "PATCH") {
    const body = await readJson(request);
    const patch = {};
    if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
    if (typeof body?.isActive === "boolean") patch.is_active = body.isActive;
    if (Number.isInteger(body?.sortOrder)) patch.sort_order = body.sortOrder;
    if (Object.keys(patch).length === 0) return apiError("EMPTY_PATCH", "تغییری ارسال نشده است.", 400);

    const { data, error } = await supabase
      .from("categories")
      .update(patch)
      .eq("id", categoryMatch[1])
      .eq("merchant_id", merchant.id)
      .select("id, name, is_active, sort_order, created_at")
      .maybeSingle();
    if (error || !data) return apiError("NOT_FOUND", "دسته‌بندی پیدا نشد.", 404);
    return json({ ok: true, category: data });
  }

  if (categoryMatch && request.method === "DELETE") {
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", categoryMatch[1])
      .eq("merchant_id", merchant.id);
    if (error) return apiError("DATABASE_ERROR", "حذف دسته‌بندی ناموفق بود.", 500);
    return json({ ok: true });
  }

  if (path === "/api/v1/products" && request.method === "GET") {
    const { data, error } = await supabase
      .from("products")
      .select("id, category_id, name_fa, name_en, description, price, image_file_id, is_active, created_at")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return apiError("DATABASE_ERROR", "خواندن محصولات ناموفق بود.", 500);
    return json({ ok: true, products: data || [] });
  }

  if (path === "/api/v1/products" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body?.name || "").trim().slice(0, 180);
    const price = Number(body?.price || 0);
    const categoryId = body?.categoryId ? String(body.categoryId) : null;

    if (!name || !Number.isFinite(price) || price < 0) {
      return apiError("INVALID_PRODUCT", "نام یا قیمت محصول معتبر نیست.", 400);
    }

    if (categoryId) {
      const { data: category } = await supabase
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .eq("merchant_id", merchant.id)
        .maybeSingle();
      if (!category) return apiError("INVALID_CATEGORY", "دسته‌بندی متعلق به این فروشگاه نیست.", 400);
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        merchant_id: merchant.id,
        category_id: categoryId,
        name_fa: name,
        description: String(body?.description || "").trim().slice(0, 4000) || null,
        price: Math.round(price),
        is_active: body?.isActive !== false,
      })
      .select("id, category_id, name_fa, name_en, description, price, image_file_id, is_active, created_at")
      .single();
    if (error) return apiError("DATABASE_ERROR", "ساخت محصول ناموفق بود.", 500);
    return json({ ok: true, product: data }, 201);
  }

  const productMatch = path.match(/^\/api\/v1\/products\/([a-f0-9-]+)$/i);
  if (productMatch && request.method === "PATCH") {
    const body = await readJson(request);
    const patch = {};
    if (typeof body?.name === "string" && body.name.trim()) patch.name_fa = body.name.trim().slice(0, 180);
    if (typeof body?.description === "string") patch.description = body.description.trim().slice(0, 4000) || null;
    if (typeof body?.isActive === "boolean") patch.is_active = body.isActive;
    if (body?.price !== undefined && Number.isFinite(Number(body.price)) && Number(body.price) >= 0) {
      patch.price = Math.round(Number(body.price));
    }

    if (body?.categoryId !== undefined) {
      if (body.categoryId === null || body.categoryId === "") {
        patch.category_id = null;
      } else {
        const requestedCategoryId = String(body.categoryId);
        const { data: category } = await supabase
          .from("categories")
          .select("id")
          .eq("id", requestedCategoryId)
          .eq("merchant_id", merchant.id)
          .maybeSingle();
        if (!category) return apiError("INVALID_CATEGORY", "دسته‌بندی متعلق به این فروشگاه نیست.", 400);
        patch.category_id = requestedCategoryId;
      }
    }

    if (Object.keys(patch).length === 0) return apiError("EMPTY_PATCH", "تغییری ارسال نشده است.", 400);

    const { data, error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", productMatch[1])
      .eq("merchant_id", merchant.id)
      .select("id, category_id, name_fa, name_en, description, price, image_file_id, is_active, created_at")
      .maybeSingle();
    if (error || !data) return apiError("NOT_FOUND", "محصول پیدا نشد.", 404);
    return json({ ok: true, product: data });
  }

  if (productMatch && request.method === "DELETE") {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productMatch[1])
      .eq("merchant_id", merchant.id);
    if (error) return apiError("DATABASE_ERROR", "حذف محصول ناموفق بود.", 500);
    return json({ ok: true });
  }

  if (path === "/api/v1/orders" && request.method === "GET") {
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, total_amount, phone, address, delivery_method, created_at, customer:customers(first_name, username)")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) return apiError("DATABASE_ERROR", "خواندن سفارش‌ها ناموفق بود.", 500);

    return json({
      ok: true,
      orders: (data || []).map((order) => ({
        id: order.id,
        status: order.status,
        totalAmount: Number(order.total_amount || 0),
        phone: order.phone || "",
        address: order.address || "",
        deliveryMethod: order.delivery_method || "",
        createdAt: order.created_at,
        customerName: order.customer?.first_name || "",
        customerUsername: order.customer?.username || "",
      })),
    });
  }

  const orderStatusMatch = path.match(/^\/api\/v1\/orders\/([a-f0-9-]+)\/status$/i);
  if (orderStatusMatch && request.method === "PATCH") {
    const body = await readJson(request);
    const status = String(body?.status || "");
    if (!["pending", "paid", "shipped", "cancelled"].includes(status)) {
      return apiError("INVALID_STATUS", "وضعیت سفارش معتبر نیست.", 400);
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderStatusMatch[1])
      .eq("merchant_id", merchant.id)
      .select("id")
      .maybeSingle();
    if (error || !data) return apiError("NOT_FOUND", "سفارش پیدا نشد.", 404);
    return json({ ok: true });
  }

  if (path === "/api/v1/settings" && request.method === "GET") {
    return json({ ok: true, merchant: serializeMerchant(merchant) });
  }

  if (path === "/api/v1/settings" && request.method === "PATCH") {
    const body = await readJson(request);
    const patch = {};
    if (typeof body?.storeName === "string") patch.store_name = body.storeName.trim().slice(0, 180);
    if (typeof body?.mandatoryChannel === "string") patch.mandatory_channel = body.mandatoryChannel.trim() || null;
    if (typeof body?.reportChannel === "string") patch.report_channel = body.reportChannel.trim() || null;
    if (typeof body?.supportLink === "string") patch.support_link = body.supportLink.trim() || null;
    if (body?.referralPercent !== undefined) {
      const value = Number(body.referralPercent);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return apiError("INVALID_REFERRAL_PERCENT", "درصد معرفی باید بین ۰ تا ۱۰۰ باشد.", 400);
      }
      patch.referral_percent = value;
    }

    if (Object.keys(patch).length === 0) return apiError("EMPTY_PATCH", "تغییری ارسال نشده است.", 400);

    const { data, error } = await supabase
      .from("merchants")
      .update(patch)
      .eq("id", merchant.id)
      .select("*")
      .single();
    if (error) return apiError("DATABASE_ERROR", "ذخیره تنظیمات ناموفق بود.", 500);
    return json({ ok: true, merchant: serializeMerchant(data) });
  }

  return apiError("NOT_FOUND", "مسیر API پیدا نشد.", 404);
}
