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

  -- آیدی عددی تلگرام صاحب فروشگاه (مالک اصلی و کامل ربات)
  owner_telegram_id   bigint not null,

  -- فیلد bot_token فقط برای سازگاری موقت با نسخه‌ی قدیمی نگه داشته شده است.
  -- در نصب جدید باید NULL بماند؛ توکن واقعی با AES-GCM در سه فیلد بعدی ذخیره می‌شود.
  bot_token             text unique,
  bot_token_hash        text unique,
  bot_token_ciphertext  text,
  bot_token_iv          text,

  -- نام‌کاربری و آیدی عددی خودِ ربات (بعد از فراخوانی getMe از تلگرام پر می‌شود)
  -- ذخیره‌شان می‌کنیم تا لازم نباشد هر بار دوباره از تلگرام بپرسیم (سریع‌تر می‌شود)
  bot_username        text,
  bot_id              bigint,
  bot_first_name      text,

  -- نام دلخواه فروشگاه (برای نمایش در پیام‌ها)
  store_name          text,

  -- متن و عکسی که هنگام /start برای مشتری‌های فروشگاه نمایش داده می‌شود
  start_text          text default 'به فروشگاه ما خوش آمدید! 🛍',
  start_image_file_id text,

  -- کانالی که عضویت اجباری در آن شرط استفاده از ربات است (مثلا @MyChannel)
  -- اگر خالی باشد یعنی هیچ قفلی فعال نیست
  mandatory_channel   text,

  -- کانالی که گزارش سفارش‌های جدید برای ادمین به آن ارسال می‌شود
  report_channel      text,

  -- لینک پشتیبانی که هنگام زدن دکمه «پشتیبانی» نشان داده می‌شود
  support_link        text,

  -- admin_pin خام فقط برای مهاجرت نسخه‌ی قدیمی است؛ نسخه‌ی جدید فقط HMAC را ذخیره می‌کند.
  admin_pin           text,
  admin_pin_hash      text,

  -- درصد پورسانتی که به معرف (زیرمجموعه‌گیر) از خرید افرادی که دعوت کرده
  -- تعلق می‌گیرد؛ عدد صفر یعنی سیستم همکاری در فروش غیرفعال است
  referral_percent    numeric(5,2) not null default 0,

  -- اطلاعات شماره کارت برای پرداخت کارت‌به‌کارت
  card_number         text,
  card_holder_name    text,

  -- رشته‌ی مخفی که برای تایید امنیتی وب‌هوک این فروشگاه استفاده می‌شود
  -- (تلگرام این مقدار را در هدر X-Telegram-Bot-Api-Secret-Token برمی‌گرداند
  -- و ما مطمئن می‌شویم درخواست واقعا از تلگرام آمده، نه یک منبع مخرب)
  webhook_secret       text not null,

  created_at          timestamptz not null default now(),

  -- حداقل یک روش برای بازیابی توکن باید موجود باشد؛ در نسخه‌ی جدید ciphertext+iv الزامی است.
  constraint merchants_bot_token_present check (
    bot_token is not null or (bot_token_ciphertext is not null and bot_token_iv is not null)
  )
);

-- جست‌وجوی سریع بر اساس آیدی تلگرام مالک (مثلا برای «فروشگاه‌های من»)
create index if not exists idx_merchants_owner on merchants (owner_telegram_id);
-- bot_id شناسه‌ی یکتای خود تلگرام است و برای جلوگیری از ثبت دوباره‌ی یک ربات استفاده می‌شود.
create unique index if not exists idx_merchants_bot_id_unique on merchants (bot_id) where bot_id is not null;


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

  -- اگر دسته‌بندی حذف شود، محصول حذف نمی‌شود؛ فقط دسته‌اش خالی می‌شود
  category_id   uuid references categories(id) on delete set null,

  name_fa       text not null,
  name_en       text,
  description   text,
  price         numeric(14,0) not null default 0,  -- قیمت به تومان (عدد صحیح)

  -- شناسه‌ی فایل عکسِ محصول که تلگرام بعد از آپلود برمی‌گرداند (file_id)
  -- به‌جای ذخیره‌ی خودِ فایل، همین شناسه را نگه می‌داریم؛ سرورهای تلگرام
  -- عکس را برای ما میزبانی می‌کنند و این کار رایگان و بسیار سریع‌تر است
  image_file_id text,

  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_products_merchant on products (merchant_id);
create index if not exists idx_products_category on products (category_id);


-- =============================================================================
-- جدول customers (مشتری‌های هر فروشگاه — کاربران نهایی که خرید می‌کنند)
-- توجه: یک نفر می‌تواند مشتریِ چند فروشگاه مختلف باشد، پس هر مشتری همیشه
-- در جفتِ (merchant_id + telegram_id) یکتاست، نه فقط بر اساس telegram_id
-- =============================================================================
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references merchants(id) on delete cascade,
  telegram_id    bigint not null,
  first_name     text,
  username       text,
  phone          text,
  address        text,

  -- اگر این مشتری از طریق لینک دعوتِ مشتری دیگری وارد شده، آیدی معرف اینجاست
  referred_by    uuid references customers(id) on delete set null,

  -- موجودی کیف‌پول (حاصل از پورسانت همکاری در فروش)
  wallet_balance numeric(14,0) not null default 0,

  created_at     timestamptz not null default now(),

  unique (merchant_id, telegram_id)
);

create index if not exists idx_customers_merchant on customers (merchant_id);


-- =============================================================================
-- جدول cart_items (سبد خرید فعلیِ هر مشتری)
-- هر ردیف یعنی «این مشتری، این تعداد از این محصول را در سبدش دارد»
-- =============================================================================
create table if not exists cart_items (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  quantity    integer not null default 1,
  created_at  timestamptz not null default now(),

  unique (customer_id, product_id)
);


-- =============================================================================
-- جدول discount_codes (کدهای تخفیف هر فروشگاه)
-- =============================================================================
create table if not exists discount_codes (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  code          text not null,

  -- نوع تخفیف: 'percent' یعنی درصدی، 'fixed' یعنی مبلغ ثابت تومانی
  type          text not null check (type in ('percent', 'fixed')),
  value         numeric(14,2) not null,

  -- سقف تعداد دفعات استفاده؛ NULL یعنی نامحدود
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

  -- وضعیت سفارش در طول زمان تغییر می‌کند:
  -- pending (در انتظار بررسی) → paid (پرداخت‌شده) → shipped (ارسال‌شده)
  -- یا cancelled (لغوشده)
  status            text not null default 'pending'
                      check (status in ('pending', 'paid', 'shipped', 'cancelled')),

  subtotal_amount   numeric(14,0) not null,        -- جمع قیمت محصولات قبل از تخفیف
  discount_code_id  uuid references discount_codes(id) on delete set null,
  discount_amount   numeric(14,0) not null default 0,
  total_amount      numeric(14,0) not null,         -- مبلغ نهایی قابل‌پرداخت

  delivery_method   text,                            -- روش ارسال انتخابی مشتری
  phone             text,
  address            text,

  created_at        timestamptz not null default now()
);

create index if not exists idx_orders_merchant on orders (merchant_id);
create index if not exists idx_orders_customer on orders (customer_id);
create index if not exists idx_orders_status on orders (merchant_id, status);


-- =============================================================================
-- جدول order_items (ریز اقلام هر سفارش)
-- قیمت و نام محصول را همان لحظه‌ی خرید هم اینجا کپی نگه می‌داریم، چون
-- ممکن است بعدا قیمت یا نام محصول در جدول products تغییر کند و نباید
-- سفارش‌های قدیمی عوض شوند (این یک اصل مهم در طراحی فروشگاه‌هاست)
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


-- =============================================================================
-- جدول wallet_ledger (دفتر تراکنش‌های کیف‌پول — عمدتاً پورسانت معرفی)
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


-- =============================================================================
-- جدول cooperators (همکاران فروش / ادمین‌های کمکی هر فروشگاه)
-- افرادی که مالک فروشگاه به آن‌ها اجازه‌ی دسترسی به پنل مدیریت را داده
-- =============================================================================
create table if not exists cooperators (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  telegram_id  bigint not null,
  added_at     timestamptz not null default now(),

  unique (merchant_id, telegram_id)
);


-- =============================================================================
-- جدول bot_sessions (وضعیت مکالمه‌ی چندمرحله‌ای هر کاربر)
-- چون Cloudflare Workers بین درخواست‌ها هیچ حافظه‌ای نگه نمی‌دارد (Stateless)،
-- برای مراحلی مثل «افزودن محصول» (که چند پیام پشت‌سرهم از کاربر می‌گیریم)
-- باید بدانیم «کاربر الان در چه مرحله‌ای است». این اطلاعات را همین‌جا،
-- روی خودِ دیتابیس، ذخیره می‌کنیم.
-- session_key معمولا به شکل زیر ساخته می‌شود:
--   برای ربات فروشگاهی: "<merchant_id>:<telegram_id>"
--   برای ربات اصلی (ربات‌ساز):  "master:<telegram_id>"
-- =============================================================================
create table if not exists bot_sessions (
  session_key text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);



-- =============================================================================
-- جدول app_pairing_codes
-- کد اتصال یک‌بارمصرفی که مالک از داخل ربات می‌گیرد و در اپ وارد می‌کند.
-- مقدار خام کد هرگز ذخیره نمی‌شود؛ فقط SHA-256 آن در code_hash قرار می‌گیرد.
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
-- جدول app_sessions
-- نشست‌های اپ اندروید. فقط hash توکن Bearer ذخیره می‌شود و مقدار خام فقط یک‌بار
-- در زمان Pairing به دستگاه داده می‌شود.
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
-- دفاع در عمق در سطح دیتابیس برای جلوگیری از مخلوط شدن داده‌ی دو Merchant.
-- حتی اگر در یک Handler برنامه‌نویسی اشتباه شود، Trigger اجازه‌ی ثبت ارتباط
-- بین رکوردهای دو فروشگاه مختلف را نمی‌دهد.
-- =============================================================================
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

-- =============================================================================
-- پایان اسکریپت. اگر بدون خطا اجرا شود، تمام جدول‌های موردنیاز پروژه
-- آماده‌اند و می‌توانید ربات را روی Cloudflare Workers منتشر (deploy) کنید.
-- =============================================================================
