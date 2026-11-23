-- =====================================================================
-- Row Level Security. Every table has RLS enabled. Tables with no policy
-- for a given operation are only reachable through the service role
-- (server-side code that has already authorised the caller).
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_health_information enable row level security;
alter table public.inventory enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_categories enable row level security;
alter table public.coupons enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlists enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_events enable row level security;
alter table public.shipping_details enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.service_rates enable row level security;
alter table public.custom_service_requests enable row level security;
alter table public.quotations enable row level security;
alter table public.processing_stages enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.banners enable row level security;
alter table public.site_settings enable row level security;
alter table public.rate_limits enable row level security;

-- ---------- Profiles / roles -----------------------------------------
create policy profiles_select_own on public.profiles for select using (id = auth.uid() or public.is_staff());
-- Customers may edit name/email only; phone and block flag are protected by the trigger below.
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update using (public.is_admin());

create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.phone := old.phone;
    new.is_blocked := old.is_blocked;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

create policy allowlist_super_admin_read on public.admin_allowlist for select using (public.is_super_admin());
create policy user_roles_read on public.user_roles for select using (user_id = auth.uid() or public.is_super_admin());

create policy addresses_own on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Catalogue (public read, admin write) ---------------------
create policy categories_read on public.categories for select using (is_active or public.is_staff());
create policy categories_write on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy products_read on public.products for select using (status = 'active' or public.is_staff());
create policy products_write on public.products for all using (public.is_admin()) with check (public.is_admin());

create policy variants_read on public.product_variants for select using (
  public.is_staff() or (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'))
);
create policy variants_write on public.product_variants for all using (public.is_admin()) with check (public.is_admin());

create policy phi_read on public.product_health_information for select using (
  public.is_staff() or (is_approved and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'))
);
create policy phi_write on public.product_health_information for all using (public.is_admin()) with check (public.is_admin());

create policy inventory_read on public.inventory for select using (public.is_staff());

-- ---------- Promotions -----------------------------------------------
create policy promotions_read on public.promotions for select using (
  public.is_staff() or (is_active and now() between starts_at and ends_at)
);
create policy promotions_write on public.promotions for all using (public.is_admin()) with check (public.is_admin());
create policy promo_products_read on public.promotion_products for select using (true);
create policy promo_products_write on public.promotion_products for all using (public.is_admin()) with check (public.is_admin());
create policy promo_categories_read on public.promotion_categories for select using (true);
create policy promo_categories_write on public.promotion_categories for all using (public.is_admin()) with check (public.is_admin());
-- Coupon codes are never listed publicly; they are validated server-side.
create policy coupons_admin on public.coupons for all using (public.is_admin()) with check (public.is_admin());
create policy coupon_redemptions_read on public.coupon_redemptions for select using (public.is_staff());

-- ---------- Cart / wishlist ------------------------------------------
create policy carts_own on public.carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_items_own on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy wishlists_own on public.wishlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Orders (created only server-side) -------------------------
create policy orders_read on public.orders for select using (user_id = auth.uid() or public.is_staff());
create policy order_items_read on public.order_items for select using (
  public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy order_events_read on public.order_status_events for select using (
  public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy shipping_read on public.shipping_details for select using (
  public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy shipping_write on public.shipping_details for all using (public.is_staff()) with check (public.is_staff());

-- ---------- Custom processing ----------------------------------------
create policy service_rates_read on public.service_rates for select using (is_active or public.is_staff());
create policy service_rates_write on public.service_rates for all using (public.is_admin()) with check (public.is_admin());

create policy csr_read on public.custom_service_requests for select using (user_id = auth.uid() or public.is_staff());
create policy csr_staff_update on public.custom_service_requests for update using (public.is_staff()) with check (public.is_staff());

create policy quotations_read on public.quotations for select using (
  public.is_staff() or exists (select 1 from public.custom_service_requests r where r.id = request_id and r.user_id = auth.uid())
);
create policy quotations_staff_write on public.quotations for all using (public.is_admin()) with check (public.is_admin());

create policy stages_read on public.processing_stages for select using (
  public.is_staff() or exists (select 1 from public.custom_service_requests r where r.id = request_id and r.user_id = auth.uid())
);

-- ---------- Payments --------------------------------------------------
create policy payments_read on public.payments for select using (user_id = auth.uid() or public.is_staff());

-- ---------- Reviews ---------------------------------------------------
create policy reviews_read on public.reviews for select using (is_approved or user_id = auth.uid() or public.is_staff());
create policy reviews_insert_own on public.reviews for insert with check (user_id = auth.uid() and is_approved = false);
create policy reviews_delete_own on public.reviews for delete using (user_id = auth.uid() or public.is_admin());
create policy reviews_moderate on public.reviews for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Notifications --------------------------------------------
create policy notifications_read on public.notifications for select using (
  user_id = auth.uid() or (audience = 'admin' and public.is_staff())
);
create policy notifications_mark_read on public.notifications for update using (
  user_id = auth.uid() or (audience = 'admin' and public.is_staff())
);

-- ---------- Banners / settings ---------------------------------------
create policy banners_read on public.banners for select using (
  public.is_staff() or (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
);
create policy banners_write on public.banners for all using (public.is_admin()) with check (public.is_admin());

-- Settings hold business configuration only (never secrets — those live in env vars).
create policy settings_read on public.site_settings for select using (true);
create policy settings_write on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

-- rate_limits: no policies → service role only.

-- ---------- Storage buckets -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('custom-request-photos', 'custom-request-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
-- Uploads go through validated server actions using the service role, so no
-- storage.objects write policies are granted to anon/authenticated users.
-- Public buckets are readable via their public URLs; private photos via short-lived signed URLs.
