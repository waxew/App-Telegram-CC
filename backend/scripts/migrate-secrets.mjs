// =============================================================================
// scripts/migrate-secrets.mjs
// مهاجرت یک‌بارهٔ Secretهای نسخهٔ قدیمی دیتابیس.
//
// این اسکریپت فقط روی ماشین/CI امن اجرا می‌شود. توکن خام ربات و PIN قدیمی را
// به قالب امن نسخهٔ جدید تبدیل می‌کند و سپس ستون plaintext را خالی می‌کند.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { protectBotToken, hashAdminPin } from "../src/lib/merchantSecrets.js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "PIN_PEPPER",
];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`متغیر محیطی ${name} تنظیم نشده است.`);
    process.exit(1);
  }
}

// همان shape متغیرهای Cloudflare را برای helperهای مشترک می‌سازیم.
const env = {
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  PIN_PEPPER: process.env.PIN_PEPPER,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data: merchants, error } = await supabase
  .from("merchants")
  .select("id, bot_token, bot_token_ciphertext, admin_pin, admin_pin_hash");

if (error) throw error;

let migratedTokens = 0;
let migratedPins = 0;

for (const merchant of merchants || []) {
  const patch = {};

  if (merchant.bot_token && !merchant.bot_token_ciphertext) {
    Object.assign(patch, await protectBotToken(merchant.bot_token, env));
    patch.bot_token = null;
    migratedTokens += 1;
  }

  if (merchant.admin_pin && !merchant.admin_pin_hash) {
    patch.admin_pin_hash = await hashAdminPin(merchant.id, merchant.admin_pin, env);
    patch.admin_pin = null;
    migratedPins += 1;
  }

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase
      .from("merchants")
      .update(patch)
      .eq("id", merchant.id);

    if (updateError) {
      throw new Error(`مهاجرت merchant ${merchant.id} ناموفق بود: ${updateError.message}`);
    }
  }
}

console.log(`توکن‌های مهاجرت‌داده‌شده: ${migratedTokens}`);
console.log(`PINهای مهاجرت‌داده‌شده: ${migratedPins}`);
console.log("مهاجرت Secretها با موفقیت تمام شد.");
