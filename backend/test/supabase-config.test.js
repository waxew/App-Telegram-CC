// =============================================================================
// test/supabase-config.test.js
// تست‌های Guard اتصال دیتابیس اختصاصی App-Telegram-CC.
// هدف این فایل این است که یک تغییر اشتباه در تنظیمات نتواند Worker را به
// Supabase پروژهٔ دیگری متصل کند.
// =============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { validateSupabaseProjectConfig } from "../src/lib/supabase.js";

// Project Ref واقعی دیتابیس اختصاصی این پروژه.
const PROJECT_REF = "hovjhysmghcuxbknpvmr";

test("accepts the dedicated db_tel_cc Supabase URL", () => {
  const origin = validateSupabaseProjectConfig({
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    SUPABASE_PROJECT_REF: PROJECT_REF,
  });

  assert.equal(origin, `https://${PROJECT_REF}.supabase.co`);
});

test("rejects a different Supabase project", () => {
  assert.throws(
    () =>
      validateSupabaseProjectConfig({
        SUPABASE_URL: "https://spncmjuvnvfkrahjnyjm.supabase.co",
        SUPABASE_PROJECT_REF: PROJECT_REF,
      }),
    /Supabase project mismatch/,
  );
});

test("rejects non-HTTPS Supabase URLs", () => {
  assert.throws(
    () =>
      validateSupabaseProjectConfig({
        SUPABASE_URL: `http://${PROJECT_REF}.supabase.co`,
        SUPABASE_PROJECT_REF: PROJECT_REF,
      }),
    /must use HTTPS/,
  );
});

test("requires the project ref guard", () => {
  assert.throws(
    () =>
      validateSupabaseProjectConfig({
        SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      }),
    /SUPABASE_PROJECT_REF is not configured/,
  );
});
