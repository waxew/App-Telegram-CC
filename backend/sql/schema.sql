-- =============================================================================
-- schema.sql
-- ساختار کامل دیتابیس پروژه «ربات تلگرامی فروشگاه‌ساز» روی Supabase (Postgres)
--
-- نحوه اجرا:
--   ۱. وارد پنل پروژه‌ی خودتان در supabase.com بشوید
--   ۲. از منوی سمت چپ وارد بخش "SQL Editor" شوید
--   ۳. کل این فایل را کپی و اجرا (Run) کنید
--   ۴. تمام جدول‌های زیر به‌صورت خودکار ساخته می‌شوند
--
-- چرا اصلا به دیتابیس خارجی نیاز داریم؟
-- تلگرام فقط پیام‌ها را بین کاربر و ربات جابه‌جا می‌کند و خودش هیچ فضایی
-- برای ذخیره‌ی دائمی «لیست محصولات»، «سفارش‌ها» یا «کاربران» در اختیار
-- ربات‌نویس قرار نمی‌دهد. اگر این اطلاعات را جایی ذخیره نکنیم، به محض
-- ری‌استارت شدن سرور ربات، همه‌چیز از دست می‌رود. به همین دلیل از Supabase
-- (یک دیتابیس Postgres ابری) به‌عنوان «حافظه‌ی دائمی» پروژه استفاده می‌کنیم.
-- =============================================================================

-- فعال کردن افزونه‌ی تولید شناسه‌های یکتای UUID (در اکثر پروژه‌های Supabase
-- از قبل فعال است، اجرای دوباره‌ی آن مشکلی ایجاد نمی‌کند)
create extension if not exists pgcrypto;


-- =============================================================================
-- جدول merchants (فروشندگان / صاحبان فروشگاه)
-- هر ردیف این جدول یعنی یک نفر ربات خودش را به سیستم ما وصل کرده و صاحب
-- یک «فروشگاه» مستقل است. تمام جدول‌های دیگر با merchant_id به این جدول
-- وصل می‌شوند تا اطلاعات هر فروشگاه کاملاً از فروشگاه‌های دیگر جدا بماند
-- (این یعنی معماری چند-مستاجری / multi-tenant).
-- =============================================================================
create table if not exists merchants (
  id                  uuid primary key default gen_random_uuid(),
  owner_telegram_id   bigint not null,
  bot_token             text unique,
  bot_token_hash        text unique,
  bot_token_ciphertext  text,
  bot_token_iv          text,
  bot_username        text,
  bot_id              bigint,
  bot_first_name      text,
  store_name          text,
  start_text          text default 'به فروشگاه ما خوش آمدید! 🛍',
  start_image_file_id text,
  mandatory_channel   text,
  report_channel      text,
  support_link        text,
  admin_pin           text,
  admin_pin_hash      text,
  referral_percent    numeric(5,2) not null default 0,
  card_number         text,
  card_holder_name    text,
  webhook_secret      text not null,
  created_at          timestamptz not null default now(),
  constraint merchants_bot_token_present check (
    bot_token is not null or (bot_token_ciphertext is not null and bot_token_iv is not null)
  )
);
create index if not exists idx_merchants_owner on merchants (owner_telegram_id);
create unique index if not exists idx_merchants_bot_id_unique on merchants (bot_id) where bot_id is not null;
create unique index if not exists idx_merchants_bot_token_hash_unique on merchants (bot_token_hash) where bot_token_hash is not null;


-- =============================================================================
-- جدول categories (دسته‌بندی‌های محصولات هر فروشگاه)
-- =============================================================================
create table if not exists categories (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  name         text not null,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_categories_merchant on categories (merchant_id);


-- =============================================================================
-- جدول products (محصولات هر فروشگاه)
-- =============================================================================
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name_fa       text not null,
  name_en       text,
  description   text,
  price         numeric(14,0) not null default 0,
  image_file_id text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_products_merchant on products (merchant_id);
create index if not exists idx_products_category on products (category_id);


-- =============================================================================
-- جدول customers (مشتری‌های هر فروشگاه)
-- =============================================================================
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references merchants(id) on delete cascade,
  telegram_id    bigint not null,
  first_name     text,
  username       text,
  phone          text,
  address        text,
  referred_by    uuid references customers(id) on delete set null,
  wallet_balance numeric(14,0) not null default 0,
  created_at     timestamptz not null default now(),
  unique (merchant_id, telegram_id)
);
create index if not exists idx_customers_merchant on customers (merchant_id);
create index if not exists idx_customers_referred_by on customers (referred_by);


-- =============================================================================
-- جدول cart_items (سبد خرید فعلی هر مشتری)
-- =============================================================================
create table if not exists cart_items (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  quantity    integer not null default 1,
  created_at  timestamptz not null default now(),
  unique (customer_id, product_id)
);
create index if not exists idx_cart_items_product on cart_items (product_id);


-- =============================================================================
-- جدول discount_codes (کدهای تخفیف هر فروشگاه)
-- =============================================================================
create table if not exists discount_codes (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  code          text not null,
  type          text not null check (type in ('percent', 'fixed')),
  value         numeric(14,2) not null,
  usage_limit   integer,
  used_count    integer not null default 0,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (merchant_id, code)
);
create index if not exists idx_discount_merchant on discount_codes (merchant_id);


-- =============================================================================
-- جدول orders (سفارش‌های ثبت‌شده)
-- =============================================================================
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null references merchants(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete cascade,
  status            text not null default 'pending'
                      check (status in ('pending', 'paid', 'shipped', 'cancelled')),
  subtotal_amount   numeric(14,0) not null,
  discount_code_id  uuid references discount_codes(id) on delete set null,
  discount_amount   numeric(14,0) not null default 0,
  total_amount      numeric(14,0) not null,
  delivery_method   text,
  phone             text,
  address            text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_orders_merchant on orders (merchant_id);
create index if not exists idx_orders_customer on orders (customer_id);
create index if not exists idx_orders_status on orders (merchant_id, status);
create index if not exists idx_orders_discount_code on orders (discount_code_id);


-- =============================================================================
-- جدول order_items (ریز اقلام هر سفارش)
-- =============================================================================
create table if not exists order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  product_name text not null,
  unit_price   numeric(14,0) not null,
  quantity     integer not null
);
create index if not exists idx_order_items_order on order_items (order_id);
create index if not exists idx_order_items_product on order_items (product_id);


-- =============================================================================
-- جدول wallet_ledger (دفتر تراکنش‌های کیف‌پول)
-- =============================================================================
create table if not exists wallet_ledger (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  amount       numeric(14,0) not null,
  type         text not null default 'referral_commission',
  description  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_wallet_customer on wallet_ledger (customer_id);
create index if not exists idx_wallet_merchant on wallet_ledger (merchant_id);


-- =============================================================================
-- جدول cooperators (همکاران فروش / ادمین‌های کمکی هر فروشگاه)
-- =============================================================================
create table if not exists cooperators (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  telegram_id  bigint not null,
  added_at     timestamptz not null default now(),
  unique (merchant_id, telegram_id)
);


-- =============================================================================
-- جدول bot_sessions (وضعیت مکالمه چندمرحله‌ای کاربران)
-- =============================================================================
create table if not exists bot_sessions (
  session_key text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);


-- =============================================================================
-- کدهای اتصال یک‌بارمصرف اپ اندروید
-- =============================================================================
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


-- =============================================================================
-- نشست‌های اپ اندروید؛ فقط hash توکن Bearer ذخیره می‌شود.
-- =============================================================================
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


-- =============================================================================
-- دفاع در عمق: جلوگیری از ارتباط رکوردهای دو Merchant مختلف.
-- =============================================================================
create or replace function enforce_product_category_same_merchant()
returns trigger language plpgsql as $$
declare
  category_merchant uuid;
begin
  if new.category_id is null then return new; end if;
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


-- =============================================================================
-- امنیت Data API / RLS
-- Backend این پروژه با service_role کار می‌کند؛ اپ اندروید و کاربران نهایی
-- نباید مستقیم به جدول‌های Supabase دسترسی داشته باشند. بنابراین RLS روی تمام
-- جدول‌های public روشن است، Grant مستقیم anon/authenticated حذف می‌شود و یک
-- Policy صریح Deny-All نیز به‌عنوان دفاع در عمق ثبت می‌شود.
-- service_role در سمت سرور RLS را bypass می‌کند و هرگز وارد APK نمی‌شود.
-- =============================================================================
alter table merchants enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table cart_items enable row level security;
alter table discount_codes enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table wallet_ledger enable row level security;
alter table cooperators enable row level security;
alter table bot_sessions enable row level security;
alter table app_pairing_codes enable row level security;
alter table app_sessions enable row level security;

revoke all on table merchants, categories, products, customers, cart_items,
  discount_codes, orders, order_items, wallet_ledger, cooperators,
  bot_sessions, app_pairing_codes, app_sessions from anon, authenticated;

grant select, insert, update, delete on table merchants, categories, products,
  customers, cart_items, discount_codes, orders, order_items, wallet_ledger,
  cooperators, bot_sessions, app_pairing_codes, app_sessions to service_role;

drop policy if exists deny_direct_client_access on merchants;
create policy deny_direct_client_access on merchants for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on categories;
create policy deny_direct_client_access on categories for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on products;
create policy deny_direct_client_access on products for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on customers;
create policy deny_direct_client_access on customers for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on cart_items;
create policy deny_direct_client_access on cart_items for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on discount_codes;
create policy deny_direct_client_access on discount_codes for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on orders;
create policy deny_direct_client_access on orders for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on order_items;
create policy deny_direct_client_access on order_items for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on wallet_ledger;
create policy deny_direct_client_access on wallet_ledger for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on cooperators;
create policy deny_direct_client_access on cooperators for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on bot_sessions;
create policy deny_direct_client_access on bot_sessions for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on app_pairing_codes;
create policy deny_direct_client_access on app_pairing_codes for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on app_sessions;
create policy deny_direct_client_access on app_sessions for all to anon, authenticated using (false) with check (false);

-- =============================================================================
-- پایان اسکریپت. این Schema با دیتابیس اختصاصی db_tel_cc همگام است.
-- =============================================================================
