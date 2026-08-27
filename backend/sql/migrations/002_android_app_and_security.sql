-- =============================================================================
-- Migration 002: Android management app + secret hardening.
-- این فایل برای دیتابیس‌هایی است که نسخه‌ی اولیه schema.sql قبلاً روی آن‌ها
-- اجرا شده است. اجرای چندباره تا حد ممکن idempotent طراحی شده است.
-- =============================================================================

-- توکن خام نسخه‌ی قبلی باید اجازه NULL داشته باشد تا ثبت‌های جدید فقط رمز‌شده باشند.
alter table merchants alter column bot_token drop not null;

-- ستون‌های امنیتی جدید؛ IF NOT EXISTS مانع خطا در اجرای مجدد می‌شود.
alter table merchants add column if not exists bot_token_hash text;
alter table merchants add column if not exists bot_token_ciphertext text;
alter table merchants add column if not exists bot_token_iv text;
alter table merchants add column if not exists admin_pin_hash text;

create unique index if not exists idx_merchants_bot_token_hash_unique
  on merchants (bot_token_hash) where bot_token_hash is not null;
create unique index if not exists idx_merchants_bot_id_unique
  on merchants (bot_id) where bot_id is not null;

-- کدهای اتصال یک‌بارمصرف اپ.
create table if not exists app_pairing_codes (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  code_hash   text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pairing_merchant on app_pairing_codes (merchant_id);
create index if not exists idx_pairing_expiry on app_pairing_codes (expires_at);

-- نشست‌های اپ؛ raw token هرگز در دیتابیس ذخیره نمی‌شود.
create table if not exists app_sessions (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  token_hash   text not null unique,
  device_name  text,
  expires_at   timestamptz not null,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_app_sessions_merchant on app_sessions (merchant_id);
create index if not exists idx_app_sessions_expiry on app_sessions (expires_at);

-- توجه مهم مهاجرت:
-- ردیف‌های قدیمی ممکن است هنوز bot_token/admin_pin خام داشته باشند. کد Worker
-- جدید برای سازگاری آن‌ها را می‌خواند، اما تمام ثبت‌ها و تغییر PINهای جدید امن
-- هستند. بعد از راه‌اندازی ابزار migration secrets می‌توان plaintextهای قدیمی
-- را نیز حذف کرد.


-- دفاع در عمق: همان Triggerهای tenant-integrity نسخهٔ کامل schema.
create or replace function enforce_product_category_same_merchant()
returns trigger language plpgsql as $$
declare
  category_merchant uuid;
begin
  if new.category_id is null then
    return new;
  end if;

  select merchant_id into category_merchant from categories where id = new.category_id;
  if category_merchant is null or category_merchant <> new.merchant_id then
    raise exception 'category does not belong to product merchant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_category_same_merchant on products;
create trigger trg_product_category_same_merchant
before insert or update of merchant_id, category_id on products
for each row execute function enforce_product_category_same_merchant();

create or replace function enforce_cart_item_same_merchant()
returns trigger language plpgsql as $$
declare
  customer_merchant uuid;
  product_merchant uuid;
begin
  select merchant_id into customer_merchant from customers where id = new.customer_id;
  select merchant_id into product_merchant from products where id = new.product_id;

  if customer_merchant is null or product_merchant is null or customer_merchant <> product_merchant then
    raise exception 'cart item customer/product merchant mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cart_item_same_merchant on cart_items;
create trigger trg_cart_item_same_merchant
before insert or update of customer_id, product_id on cart_items
for each row execute function enforce_cart_item_same_merchant();

create or replace function enforce_order_same_merchant()
returns trigger language plpgsql as $$
declare
  customer_merchant uuid;
  discount_merchant uuid;
begin
  select merchant_id into customer_merchant from customers where id = new.customer_id;
  if customer_merchant is null or customer_merchant <> new.merchant_id then
    raise exception 'order customer merchant mismatch';
  end if;

  if new.discount_code_id is not null then
    select merchant_id into discount_merchant from discount_codes where id = new.discount_code_id;
    if discount_merchant is null or discount_merchant <> new.merchant_id then
      raise exception 'order discount merchant mismatch';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_same_merchant on orders;
create trigger trg_order_same_merchant
before insert or update of merchant_id, customer_id, discount_code_id on orders
for each row execute function enforce_order_same_merchant();

create or replace function enforce_wallet_same_merchant()
returns trigger language plpgsql as $$
declare
  customer_merchant uuid;
begin
  select merchant_id into customer_merchant from customers where id = new.customer_id;
  if customer_merchant is null or customer_merchant <> new.merchant_id then
    raise exception 'wallet ledger customer merchant mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wallet_same_merchant on wallet_ledger;
create trigger trg_wallet_same_merchant
before insert or update of merchant_id, customer_id on wallet_ledger
for each row execute function enforce_wallet_same_merchant();
