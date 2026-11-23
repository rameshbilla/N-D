-- =====================================================================
-- Functions: role helpers, profile bootstrap, rate limiting, atomic
-- order / payment confirmation and stock management.
-- =====================================================================

-- ---------- Role helpers (used by RLS) -------------------------------
create or replace function public.has_role(roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    join public.admin_allowlist a on a.phone = p.phone and a.is_active
    where ur.user_id = auth.uid() and ur.role = any (roles)
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.has_role(array['super_admin', 'admin', 'staff']::public.app_role[]) $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.has_role(array['super_admin', 'admin']::public.app_role[]) $$;

create or replace function public.is_super_admin() returns boolean
language sql stable as $$ select public.has_role(array['super_admin']::public.app_role[]) $$;

-- ---------- Profile bootstrap on sign-up -----------------------------
-- Supabase stores phone numbers without the leading '+'.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := case
    when new.phone is null or new.phone = '' then null
    when left(new.phone, 1) = '+' then new.phone
    else '+' || new.phone
  end;
begin
  if v_phone is not null and v_phone !~ '^\+91[6-9][0-9]{9}$' then
    v_phone := null;
  end if;
  insert into public.profiles (id, phone, email)
  values (new.id, v_phone, nullif(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Grants roles to a freshly authenticated user if (and only if) their verified phone
-- is on the active admin allowlist. Called server-side after OTP verification.
create or replace function public.sync_admin_role(p_user_id uuid) returns public.app_role
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role;
begin
  select a.role into v_role
  from public.profiles p
  join public.admin_allowlist a on a.phone = p.phone and a.is_active
  where p.id = p_user_id;

  delete from public.user_roles where user_id = p_user_id and (v_role is null or role <> v_role);
  if v_role is not null then
    insert into public.user_roles (user_id, role) values (p_user_id, v_role)
    on conflict do nothing;
  end if;
  return v_role;
end $$;

-- ---------- Rate limiting --------------------------------------------
-- Returns {"allowed": bool, "retry_after": seconds}
create or replace function public.check_rate_limit(
  p_key text, p_max int, p_window_seconds int, p_min_interval_seconds int default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rate_limits;
  v_now timestamptz := clock_timestamp();
begin
  select * into r from public.rate_limits where key = p_key for update;
  if not found then
    insert into public.rate_limits (key, window_start, hits, last_hit) values (p_key, v_now, 1, v_now)
    on conflict (key) do update set hits = public.rate_limits.hits + 1, last_hit = v_now;
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  if p_min_interval_seconds > 0 and r.last_hit > v_now - make_interval(secs => p_min_interval_seconds) then
    return jsonb_build_object('allowed', false,
      'retry_after', ceil(extract(epoch from (r.last_hit + make_interval(secs => p_min_interval_seconds) - v_now))));
  end if;

  if r.window_start < v_now - make_interval(secs => p_window_seconds) then
    update public.rate_limits set window_start = v_now, hits = 1, last_hit = v_now where key = p_key;
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  if r.hits >= p_max then
    return jsonb_build_object('allowed', false,
      'retry_after', ceil(extract(epoch from (r.window_start + make_interval(secs => p_window_seconds) - v_now))));
  end if;

  update public.rate_limits set hits = hits + 1, last_hit = v_now where key = p_key;
  return jsonb_build_object('allowed', true, 'retry_after', 0);
end $$;

create or replace function public.reset_rate_limit(p_key text) returns void
language sql security definer set search_path = public as $$
  delete from public.rate_limits where key = p_key;
$$;

-- ---------- Stock --------------------------------------------------------
-- Decrements stock for every item of an order. Raises INSUFFICIENT_STOCK if any variant is short.
create or replace function public.commit_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  it record;
  v_after int;
begin
  if (select stock_committed from public.orders where id = p_order_id) then
    return;
  end if;
  for it in select variant_id, quantity, product_name, variant_label from public.order_items where order_id = p_order_id loop
    update public.product_variants set stock = stock - it.quantity
    where id = it.variant_id and stock >= it.quantity
    returning stock into v_after;
    if not found then
      raise exception 'INSUFFICIENT_STOCK: % (%)', it.product_name, it.variant_label using errcode = 'P0001';
    end if;
    insert into public.inventory (variant_id, change, stock_after, reason, reference)
    values (it.variant_id, -it.quantity, v_after, 'order', p_order_id::text);
  end loop;
  update public.orders set stock_committed = true where id = p_order_id;
end $$;

create or replace function public.release_order_stock(p_order_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  it record;
  v_after int;
begin
  if not (select stock_committed from public.orders where id = p_order_id) then
    return;
  end if;
  for it in select variant_id, quantity from public.order_items where order_id = p_order_id and variant_id is not null loop
    update public.product_variants set stock = stock + it.quantity where id = it.variant_id returning stock into v_after;
    if found then
      insert into public.inventory (variant_id, change, stock_after, reason, reference, created_by)
      values (it.variant_id, it.quantity, v_after, 'order_cancelled', p_order_id::text, p_actor);
    end if;
  end loop;
  update public.orders set stock_committed = false where id = p_order_id;
end $$;

-- Records promotion usage for an order (auto offers + coupon) exactly once.
create or replace function public.record_promotion_usage(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  update public.promotions p set used_count = used_count + 1
  where p.id in (
    select distinct (e ->> 'promotion_id')::uuid
    from jsonb_array_elements(o.discount_snapshot) e
    where e ->> 'promotion_id' is not null
  );
  if o.coupon_promotion_id is not null then
    insert into public.coupon_redemptions (promotion_id, user_id, order_id)
    values (o.coupon_promotion_id, o.user_id, o.id)
    on conflict (order_id) do nothing;
  end if;
end $$;

-- ---------- Order confirmation --------------------------------------
-- Cash on delivery: commit stock (fails atomically if short) and mark the order placed.
create or replace function public.confirm_cod_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.payment_method <> 'cod' or o.status <> 'pending_payment' then
    raise exception 'ORDER_NOT_CONFIRMABLE' using errcode = 'P0001';
  end if;
  perform public.commit_order_stock(p_order_id);
  update public.orders set status = 'placed', placed_at = now() where id = p_order_id;
  insert into public.order_status_events (order_id, status, note) values (p_order_id, 'placed', 'Cash on delivery order placed');
  insert into public.payments (user_id, purpose, order_id, method, status, amount_paise)
  values (o.user_id, 'order', o.id, 'cod', 'cod_pending', o.total_paise);
  perform public.record_promotion_usage(p_order_id);
end $$;

-- Online payment captured (called only after server-side signature verification or a verified webhook).
-- Idempotent. Returns {"purpose": "...", "id": uuid, "status": text, "already": bool}
create or replace function public.confirm_razorpay_payment(
  p_razorpay_order_id text, p_razorpay_payment_id text, p_amount_paise int, p_raw jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  o public.orders;
  v_status public.order_status := 'payment_confirmed';
begin
  select * into pay from public.payments where razorpay_order_id = p_razorpay_order_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if pay.status = 'captured' then
    return jsonb_build_object('purpose', pay.purpose, 'id', coalesce(pay.order_id, pay.quotation_id), 'already', true);
  end if;
  if pay.amount_paise <> p_amount_paise then
    update public.payments set status = 'failed', failure_reason = 'Amount mismatch', raw_event = p_raw where id = pay.id;
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'captured', razorpay_payment_id = p_razorpay_payment_id, raw_event = coalesce(p_raw, raw_event)
  where id = pay.id;

  if pay.purpose = 'order' then
    select * into o from public.orders where id = pay.order_id for update;
    begin
      perform public.commit_order_stock(o.id);
    exception when sqlstate 'P0001' then
      -- Paid but stock ran out between checkout and capture: flag for manual refund / fulfilment.
      v_status := 'payment_review';
    end;
    update public.orders set status = v_status, paid_at = now(), placed_at = coalesce(placed_at, now()) where id = o.id;
    insert into public.order_status_events (order_id, status, note) values
      (o.id, 'placed', 'Order placed'),
      (o.id, v_status, case when v_status = 'payment_review' then 'Paid, but stock was insufficient — admin review required' else 'Payment received via Razorpay' end);
    perform public.record_promotion_usage(o.id);
    return jsonb_build_object('purpose', 'order', 'id', o.id, 'status', v_status, 'already', false);
  else
    update public.quotations set status = 'paid', paid_at = now() where id = pay.quotation_id;
    update public.custom_service_requests r set status = 'payment_completed'
    from public.quotations q where q.id = pay.quotation_id and r.id = q.request_id;
    insert into public.processing_stages (request_id, status, note)
    select q.request_id, 'payment_completed', 'Payment received via Razorpay' from public.quotations q where q.id = pay.quotation_id;
    return jsonb_build_object('purpose', 'quotation', 'id', pay.quotation_id, 'status', 'paid', 'already', false);
  end if;
end $$;

create or replace function public.mark_razorpay_payment_failed(p_razorpay_order_id text, p_reason text, p_raw jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where razorpay_order_id = p_razorpay_order_id for update;
  if not found or pay.status = 'captured' then
    return;
  end if;
  update public.payments set status = 'failed', failure_reason = left(p_reason, 300), raw_event = coalesce(p_raw, raw_event) where id = pay.id;
  if pay.purpose = 'order' then
    update public.orders set status = 'payment_failed' where id = pay.order_id and status = 'pending_payment';
  end if;
end $$;

-- ---------- Staff operations (RLS-aware: they check the caller's role) ---
create or replace function public.admin_set_stock(p_variant_id uuid, p_new_stock int, p_reason text, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_new_stock < 0 or p_new_stock > 1000000 then
    raise exception 'INVALID_STOCK' using errcode = 'P0001';
  end if;
  select stock into v_old from public.product_variants where id = p_variant_id for update;
  if not found then
    raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.product_variants set stock = p_new_stock where id = p_variant_id;
  if p_new_stock <> v_old then
    insert into public.inventory (variant_id, change, stock_after, reason, reference, created_by)
    values (p_variant_id, p_new_stock - v_old, p_new_stock,
            case when p_reason in ('restock', 'adjustment', 'initial', 'return') then p_reason else 'adjustment' end,
            p_note, auth.uid());
  end if;
  return p_new_stock;
end $$;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if o.status in ('delivered', 'cancelled') and p_status <> o.status then
    raise exception 'ORDER_CLOSED' using errcode = 'P0001';
  end if;
  if p_status = 'cancelled' then
    perform public.release_order_stock(p_order_id, auth.uid());
  elsif p_status in ('processing', 'packed', 'shipped', 'out_for_delivery', 'delivered') and not o.stock_committed then
    perform public.commit_order_stock(p_order_id);
  end if;
  update public.orders set
    status = p_status,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id;
  if p_status = 'delivered' and o.payment_method = 'cod' then
    update public.payments set status = 'cod_collected' where order_id = p_order_id and status = 'cod_pending';
  end if;
  insert into public.order_status_events (order_id, status, note, created_by) values (p_order_id, p_status, p_note, auth.uid());
end $$;

create or replace function public.admin_set_request_status(p_request_id uuid, p_status public.custom_request_status, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.custom_service_requests set status = p_status where id = p_request_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.processing_stages (request_id, status, note, created_by) values (p_request_id, p_status, p_note, auth.uid());
end $$;

-- Average ratings for product cards / structured data.
create or replace view public.product_ratings with (security_invoker = true) as
  select product_id, round(avg(rating)::numeric, 1) as average, count(*)::int as count
  from public.reviews where is_approved
  group by product_id;

-- ---------- Execution privileges -------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_role(public.app_role[]) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.touch_updated_at() to anon, authenticated;
grant execute on function public.admin_set_stock(uuid, int, text, text) to authenticated;
grant execute on function public.admin_set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.admin_set_request_status(uuid, public.custom_request_status, text) to authenticated;
-- Everything else (confirm_*, commit_*, check_rate_limit, sync_admin_role ...) is service-role only.
grant execute on all functions in schema public to service_role;
