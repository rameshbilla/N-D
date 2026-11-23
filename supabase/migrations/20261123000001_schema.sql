-- =====================================================================
-- N&D Nature Healthy Food — core schema
-- All money values are stored as INTEGER PAISE (₹1 = 100 paise).
-- =====================================================================


-- ---------- Enums ----------------------------------------------------
create type public.app_role as enum ('super_admin', 'admin', 'staff');
create type public.product_status as enum ('draft', 'active', 'inactive');
create type public.order_status as enum (
  'pending_payment', 'placed', 'payment_confirmed', 'processing', 'packed',
  'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'payment_failed', 'payment_review'
);
create type public.payment_method as enum ('razorpay', 'cod');
create type public.payment_status as enum ('created', 'authorized', 'captured', 'failed', 'refunded', 'cod_pending', 'cod_collected');
create type public.payment_purpose as enum ('order', 'quotation');
create type public.discount_type as enum ('percentage', 'fixed');
create type public.promotion_scope as enum ('all', 'categories', 'products');
create type public.processing_type as enum ('dehydration_only', 'dehydration_powder', 'grinding_only');
create type public.custom_request_status as enum (
  'request_received', 'under_review', 'quotation_sent', 'payment_pending', 'payment_completed',
  'raw_material_received', 'processing_started', 'dehydration_completed', 'powder_completed',
  'packaging_completed', 'ready_for_dispatch', 'shipped', 'delivered', 'rejected', 'cancelled'
);
create type public.quotation_status as enum ('sent', 'accepted', 'rejected', 'expired', 'paid', 'withdrawn');
create type public.health_section as enum (
  'ingredients', 'nutritional_info', 'health_uses', 'potential_benefits', 'common_uses',
  'how_to_consume', 'preparation', 'serving', 'storage', 'precautions', 'allergens'
);
create type public.claim_type as enum ('general', 'traditional', 'research_supported');

-- ---------- Shared trigger: updated_at -------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profiles & roles -----------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Phones authorised to use /admin. Managed only by super admins (server-side, service role).
create table public.admin_allowlist (
  phone text primary key check (phone ~ '^\+91[6-9][0-9]{9}$'),
  role public.app_role not null,
  display_name text,
  is_active boolean not null default true,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  line1 text not null check (char_length(line1) between 3 and 200),
  line2 text check (char_length(line2) <= 200),
  landmark text check (char_length(landmark) <= 120),
  city text not null check (char_length(city) between 2 and 80),
  state text not null check (char_length(state) between 2 and 80),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create trigger addresses_touch before update on public.addresses
  for each row execute function public.touch_updated_at();

-- ---------- Catalogue -------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sku text unique,
  tagline text check (char_length(tagline) <= 160),
  description text,
  -- images: [{ "url": text, "path": text|null, "alt": text }]
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  -- videos: [{ "url": text, "title": text }]
  videos jsonb not null default '[]'::jsonb check (jsonb_typeof(videos) = 'array'),
  -- nutrition_facts: [{ "nutrient": text, "amount": text, "unit": text }]
  nutrition_facts jsonb not null default '[]'::jsonb check (jsonb_typeof(nutrition_facts) = 'array'),
  nutrition_basis text default 'Per 100 g (approximate)',
  discount_percent int not null default 0 check (discount_percent between 0 and 90),
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  accent_color text not null default '#126B35' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_status_idx on public.products (status, is_featured);
create index products_name_search_idx on public.products using gin (to_tsvector('simple', name || ' ' || coalesce(tagline, '')));
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  weight_grams int not null check (weight_grams > 0),
  sku text unique,
  price_paise int not null check (price_paise > 0),
  sale_price_paise int check (sale_price_paise is null or sale_price_paise > 0),
  stock int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 10 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_below_price check (sale_price_paise is null or sale_price_paise < price_paise),
  unique (product_id, weight_grams)
);
create index product_variants_product_idx on public.product_variants (product_id);
create trigger product_variants_touch before update on public.product_variants
  for each row execute function public.touch_updated_at();

-- Health / usage information: one row per paragraph or bullet, orderable, individually approved.
create table public.product_health_information (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  section public.health_section not null,
  kind text not null default 'bullet' check (kind in ('bullet', 'paragraph')),
  body text not null check (char_length(body) between 1 and 2000),
  claim_type public.claim_type not null default 'general',
  source_reference text check (char_length(source_reference) <= 500),
  sort_order int not null default 0,
  is_approved boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index phi_product_section_idx on public.product_health_information (product_id, section, sort_order);
create trigger phi_touch before update on public.product_health_information
  for each row execute function public.touch_updated_at();

-- Inventory ledger. product_variants.stock holds the current level; every change is recorded here.
create table public.inventory (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  change int not null,
  stock_after int not null,
  reason text not null check (reason in ('initial', 'restock', 'adjustment', 'order', 'order_cancelled', 'return')),
  reference text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_variant_idx on public.inventory (variant_id, created_at desc);

-- ---------- Promotions ------------------------------------------------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  festival_name text,
  title text not null check (char_length(title) between 2 and 160),
  description text,
  banner_image_url text,
  show_banner boolean not null default true,
  discount_type public.discount_type not null,
  discount_value int not null check (discount_value > 0), -- percent (1-90) or paise
  scope public.promotion_scope not null default 'all',
  requires_coupon boolean not null default false,
  combinable_with_offers boolean not null default false,
  min_order_paise int not null default 0 check (min_order_paise >= 0),
  max_discount_paise int check (max_discount_paise is null or max_discount_paise > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  usage_limit int check (usage_limit is null or usage_limit > 0),
  per_user_limit int check (per_user_limit is null or per_user_limit > 0),
  used_count int not null default 0,
  is_active boolean not null default true,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_dates check (ends_at > starts_at),
  constraint promo_percent check (discount_type <> 'percentage' or discount_value between 1 and 90)
);
create index promotions_active_idx on public.promotions (is_active, starts_at, ends_at);
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

create table public.promotion_products (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promotion_id, product_id)
);
create table public.promotion_categories (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (promotion_id, category_id)
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  created_at timestamptz not null default now()
);
create index coupons_promotion_idx on public.coupons (promotion_id);

-- ---------- Carts & wishlists ----------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  coupon_code text,
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null check (quantity between 1 and 50),
  added_at timestamptz not null default now(),
  primary key (cart_id, variant_id)
);

create table public.wishlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------- Orders ----------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('ND' || to_char(now(), 'YYMM') || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  user_id uuid not null references auth.users (id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  payment_method public.payment_method not null,
  subtotal_mrp_paise int not null check (subtotal_mrp_paise >= 0),
  item_discount_paise int not null default 0 check (item_discount_paise >= 0),
  coupon_discount_paise int not null default 0 check (coupon_discount_paise >= 0),
  delivery_fee_paise int not null default 0 check (delivery_fee_paise >= 0),
  cod_fee_paise int not null default 0 check (cod_fee_paise >= 0),
  tax_paise int not null default 0 check (tax_paise >= 0),
  tax_inclusive boolean not null default true,
  total_paise int not null check (total_paise >= 0),
  coupon_code text,
  coupon_promotion_id uuid references public.promotions (id) on delete set null,
  -- Snapshots (immutable record of what the customer saw and paid)
  discount_snapshot jsonb not null default '[]'::jsonb,
  shipping_address jsonb not null,
  customer_note text check (char_length(customer_note) <= 500),
  stock_committed boolean not null default false,
  placed_at timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  variant_label text not null,
  sku text,
  unit_mrp_paise int not null check (unit_mrp_paise >= 0),
  unit_price_paise int not null check (unit_price_paise >= 0),
  quantity int not null check (quantity > 0),
  line_discount_paise int not null default 0,
  coupon_share_paise int not null default 0,
  line_total_paise int not null check (line_total_paise >= 0),
  discount_label text,
  image_url text
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_events_order_idx on public.order_status_events (order_id, created_at);

create table public.shipping_details (
  order_id uuid primary key references public.orders (id) on delete cascade,
  courier text,
  tracking_number text,
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  shipped_at timestamptz,
  expected_delivery date,
  updated_at timestamptz not null default now()
);

create table public.coupon_redemptions (
  id bigint generated always as identity primary key,
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_user_idx on public.coupon_redemptions (promotion_id, user_id);

-- ---------- Custom processing ----------------------------------------
create table public.service_rates (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text, -- null = default rate for the processing type
  processing_type public.processing_type not null,
  rate_per_kg_paise int not null check (rate_per_kg_paise >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index service_rates_unique on public.service_rates (coalesce(lower(ingredient_name), ''), processing_type);

create sequence public.custom_request_seq start 501;

create table public.custom_service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('CP' || to_char(now(), 'YYMM') || lpad(nextval('public.custom_request_seq')::text, 5, '0')),
  user_id uuid not null references auth.users (id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  ingredient_name text not null check (char_length(ingredient_name) between 2 and 120),
  ingredient_category text not null check (ingredient_category in ('fruit', 'vegetable', 'leaf_herb', 'spice', 'grain', 'other')),
  quantity numeric(10, 2) not null check (quantity > 0),
  quantity_unit text not null check (quantity_unit in ('kg', 'g')),
  processing_type public.processing_type not null,
  photo_paths text[] not null default '{}',
  special_instructions text check (char_length(special_instructions) <= 1000),
  logistics text not null check (logistics in ('customer_dropoff', 'pickup_requested', 'courier')),
  return_preference text not null default 'delivery' check (return_preference in ('collect', 'delivery')),
  pickup_address text check (char_length(pickup_address) <= 500),
  estimated_total_paise int,
  status public.custom_request_status not null default 'request_received',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index csr_user_idx on public.custom_service_requests (user_id, created_at desc);
create index csr_status_idx on public.custom_service_requests (status, created_at desc);
create trigger csr_touch before update on public.custom_service_requests
  for each row execute function public.touch_updated_at();

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_service_requests (id) on delete cascade,
  -- line_items: [{ "label": text, "amount_paise": int }]
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array'),
  total_paise int not null check (total_paise > 0),
  notes text,
  valid_until date not null,
  status public.quotation_status not null default 'sent',
  created_by uuid references auth.users (id) on delete set null,
  responded_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index quotations_request_idx on public.quotations (request_id, created_at desc);
create unique index quotations_one_open on public.quotations (request_id) where status in ('sent', 'accepted');

create table public.processing_stages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.custom_service_requests (id) on delete cascade,
  status public.custom_request_status not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index processing_stages_request_idx on public.processing_stages (request_id, created_at);

-- ---------- Payments --------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  purpose public.payment_purpose not null,
  order_id uuid references public.orders (id) on delete restrict,
  quotation_id uuid references public.quotations (id) on delete restrict,
  method public.payment_method not null,
  status public.payment_status not null,
  amount_paise int not null check (amount_paise >= 0),
  currency text not null default 'INR',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  failure_reason text,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_target check (
    (purpose = 'order' and order_id is not null) or (purpose = 'quotation' and quotation_id is not null)
  )
);
create index payments_order_idx on public.payments (order_id);
create index payments_quotation_idx on public.payments (quotation_id);
create index payments_user_idx on public.payments (user_id, created_at desc);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------- Reviews, notifications, banners, settings ----------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reviewer_name text not null,
  rating int not null check (rating between 1 and 5),
  title text check (char_length(title) <= 120),
  body text check (char_length(body) <= 2000),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_idx on public.reviews (product_id, is_approved, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = admin inbox
  audience text not null check (audience in ('customer', 'admin')),
  title text not null,
  body text,
  link text,
  channel_status jsonb not null default '{}'::jsonb, -- {"email":"sent"|"skipped"|"failed", "whatsapp": ...}
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_admin_idx on public.notifications (audience, created_at desc);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  link_url text check (link_url is null or link_url ~ '^(/|https://)'),
  link_label text,
  placement text not null default 'home_strip' check (placement in ('home_strip', 'shop_top')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Fixed-window rate limiter (used server-side through the service role only).
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null,
  last_hit timestamptz not null
);
