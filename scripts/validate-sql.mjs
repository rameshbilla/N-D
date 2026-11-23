// Validates the Supabase migrations + seed against an embedded Postgres (PGlite).
// Supabase-provided objects (auth schema, roles, storage) are stubbed so the SQL can run
// end-to-end, and the key database functions are exercised: profile bootstrap, admin role
// sync, rate limiting, COD confirmation, Razorpay confirmation idempotency and stock guards.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const db = new PGlite();

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), phone text, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
`;

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};
const asUser = (id) => db.exec(`select set_config('request.jwt.sub', '${id ?? ''}', false)`);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

process.on('unhandledRejection', (e) => { console.error('SQL ERROR:', e.message, e.where ?? '', e.position ? 'at position ' + e.position : ''); process.exit(1); });
await db.exec(stub);
const migrations = readdirSync(join(root, 'supabase/migrations')).sort();
for (const f of migrations) {
  await db.exec(readFileSync(join(root, 'supabase/migrations', f), 'utf8'));
  console.log(`applied  ${f}`);
}
await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'));
console.log('applied  seed.sql\n');

// Seed sanity
const counts = await one(`select (select count(*) from products)::int p, (select count(*) from product_variants)::int v,
  (select count(*) from product_health_information)::int h, (select count(*) from categories)::int c`);
check(`seed: ${counts.p} products, ${counts.v} variants, ${counts.h} info rows, ${counts.c} categories`, counts.p === 15 && counts.v === 75);
const abc = await one(`select price_paise, sale_price_paise from product_variants v join products p on p.id=v.product_id where p.slug='abc-powder' and weight_grams=250`);
check(`seed pricing: ABC 250 g = ${abc.price_paise} paise, sale ${abc.sale_price_paise}`, abc.price_paise === 42900 && abc.sale_price_paise === 38900);

// Profile bootstrap from auth.users (Supabase stores phones without '+')
const admin = await one(`insert into auth.users (phone) values ('919014325025') returning id`);
const cust = await one(`insert into auth.users (phone) values ('919876543210') returning id`);
const p = await one(`select phone from profiles where id = $1`, [admin.id]);
check('profile created with normalised +91 phone', p.phone === '+919014325025');

// Admin role sync: only allow-listed phone receives a role
const r1 = await one(`select sync_admin_role($1) r`, [admin.id]);
const r2 = await one(`select sync_admin_role($1) r`, [cust.id]);
check('allow-listed phone becomes super_admin', r1.r === 'super_admin');
check('regular customer gets no admin role', r2.r === null);
await asUser(admin.id);
check('is_super_admin() true for owner', (await one(`select is_super_admin() v`)).v === true);
await asUser(cust.id);
check('is_staff() false for customer', (await one(`select is_staff() v`)).v === false);
await db.exec(`update admin_allowlist set is_active = false where phone = '+919014325025'`);
await asUser(admin.id);
check('deactivating allowlist entry revokes access immediately', (await one(`select is_admin() v`)).v === false);
await db.exec(`update admin_allowlist set is_active = true where phone = '+919014325025'`);
await asUser(null);

// Rate limiter: min interval + window max
const rl = [];
for (let i = 0; i < 3; i++) rl.push((await one(`select check_rate_limit('t:1', 2, 3600, 0) v`)).v.allowed);
check('rate limit allows 2 then blocks', JSON.stringify(rl) === '[true,true,false]');
await one(`select check_rate_limit('t:2', 10, 3600, 60) v`);
const cool = (await one(`select check_rate_limit('t:2', 10, 3600, 60) v`)).v;
check(`resend cooldown enforced (retry_after=${cool.retry_after}s)`, cool.allowed === false && cool.retry_after > 0);

// Orders: COD confirm decrements stock atomically
const v = await one(`select v.id, v.stock from product_variants v join products p on p.id=v.product_id where p.slug='amla-powder' and weight_grams=100`);
const mkOrder = async (method, qty) => {
  const o = await one(`insert into orders (user_id, payment_method, subtotal_mrp_paise, total_paise, shipping_address)
    values ($1, $2, 14900, 14900, '{}'::jsonb) returning id, order_number`, [cust.id, method]);
  await db.query(`insert into order_items (order_id, product_id, variant_id, product_name, variant_label, unit_mrp_paise, unit_price_paise, quantity, line_total_paise)
    values ($1, null, $2, 'Amla Powder', '100 g', 14900, 14900, $3, 14900)`, [o.id, v.id, qty]);
  return o;
};
const cod = await mkOrder('cod', 2);
check(`order number generated (${cod.order_number})`, /^ND\d{4}\d{6}$/.test(cod.order_number));
await db.query(`select confirm_cod_order($1)`, [cod.id]);
const after = await one(`select stock from product_variants where id=$1`, [v.id]);
check('COD confirmation decrements stock', after.stock === v.stock - 2);
check('inventory ledger written', (await one(`select count(*)::int c from inventory where reference=$1`, [cod.id])).c === 1);

const big = await mkOrder('cod', 9999);
let blocked = false;
try { await db.query(`select confirm_cod_order($1)`, [big.id]); } catch (e) { blocked = /INSUFFICIENT_STOCK/.test(e.message); }
check('insufficient stock blocks COD order', blocked);
check('stock unchanged after failed confirmation', (await one(`select stock from product_variants where id=$1`, [v.id])).stock === v.stock - 2);

// Razorpay confirmation: amount check, idempotency
const online = await mkOrder('razorpay', 1);
await db.query(`insert into payments (user_id, purpose, order_id, method, status, amount_paise, razorpay_order_id)
  values ($1, 'order', $2, 'razorpay', 'created', 14900, 'order_TEST1')`, [cust.id, online.id]);
let mismatch = false;
try { await db.query(`select confirm_razorpay_payment('order_TEST1', 'pay_X', 100)`); } catch (e) { mismatch = /AMOUNT_MISMATCH/.test(e.message); }
check('amount mismatch rejected', mismatch);
await db.exec(`update payments set status='created', failure_reason=null where razorpay_order_id='order_TEST1'`);
const c1 = (await one(`select confirm_razorpay_payment('order_TEST1', 'pay_1', 14900) v`)).v;
const c2 = (await one(`select confirm_razorpay_payment('order_TEST1', 'pay_1', 14900) v`)).v;
const os = await one(`select status from orders where id=$1`, [online.id]);
check('payment confirms order', c1.status === 'payment_confirmed' && os.status === 'payment_confirmed');
check('confirmation is idempotent (no double stock deduction)', c2.already === true &&
  (await one(`select stock from product_variants where id=$1`, [v.id])).stock === v.stock - 3);

// Admin status change: cancel restores stock; non-staff forbidden
await asUser(cust.id);
let forbidden = false;
try { await db.query(`select admin_set_order_status($1, 'cancelled')`, [cod.id]); } catch (e) { forbidden = /FORBIDDEN/.test(e.message); }
check('customer cannot change order status', forbidden);
await asUser(admin.id);
await db.query(`select admin_set_order_status($1, 'cancelled', 'test')`, [cod.id]);
check('cancelling restores stock', (await one(`select stock from product_variants where id=$1`, [v.id])).stock === v.stock - 1);
await asUser(null);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll SQL checks passed');
process.exit(failures ? 1 : 0);
