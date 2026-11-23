import { Router, type Request } from 'express';
import type { OrderStatus } from '../../shared/types';
import { requireStaff } from '../auth';
import { config, isRazorpayConfigured } from '../config';
import { HttpError, param, qs, route } from '../http';
import { getSettings } from '../settings';
import { serviceClient, userClient } from '../supabase';
import { signedUrls } from '../uploads';

/** Read endpoints for the admin screens. All require a staff role; data access is RLS-scoped. */
export const adminReadRouter = Router();
const page = (req: Request) => Math.max(1, Number.parseInt(qs(req, 'page') || '1', 10) || 1);
const like = (s: string) => s.replace(/[%_,()]/g, ' ').trim();
const REVENUE: OrderStatus[] = ['placed', 'payment_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

adminReadRouter.get(
  '/me',
  route(async (req, res) => {
    const { user, role } = await requireStaff(req, res);
    const db = userClient(req, res);
    const [{ data: profile }, { count }] = await Promise.all([
      db.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
      db.from('notifications').select('id', { count: 'exact', head: true }).eq('audience', 'admin').is('read_at', null),
    ]);
    return { role, name: profile?.full_name ?? profile?.phone ?? 'Admin', unread: count ?? 0 };
  }),
);

adminReadRouter.get(
  '/dashboard',
  route(async (req, res) => {
    await requireStaff(req, res);
    const db = userClient(req, res);
    const [orders, recent, products, customers, pendingReq, pendingQuote, lowStock, notes] = await Promise.all([
      db.from('orders').select('total_paise, status, created_at').in('status', [...REVENUE, 'payment_review', 'cancelled']).limit(10000),
      db.from('orders').select('id, order_number, status, total_paise, created_at, shipping_address').neq('status', 'pending_payment').order('created_at', { ascending: false }).limit(8),
      db.from('products').select('id', { count: 'exact', head: true }),
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db.from('custom_service_requests').select('id', { count: 'exact', head: true }).in('status', ['request_received', 'under_review']),
      db.from('quotations').select('id', { count: 'exact', head: true }).in('status', ['sent', 'accepted']),
      db.from('product_variants').select('id, label, stock, low_stock_threshold, product:products(id, name)').eq('is_active', true).lte('stock', 25).order('stock').limit(20),
      db.from('notifications').select('id, title, body, link, created_at, read_at').eq('audience', 'admin').order('created_at', { ascending: false }).limit(10),
    ]);
    return {
      orders: orders.data ?? [],
      recent: recent.data ?? [],
      products: products.count ?? 0,
      customers: customers.count ?? 0,
      pendingRequests: pendingReq.count ?? 0,
      openQuotations: pendingQuote.count ?? 0,
      lowStock: (lowStock.data ?? []).filter((v) => v.stock <= v.low_stock_threshold),
      notifications: notes.data ?? [],
    };
  }),
);

adminReadRouter.get(
  '/products',
  route(async (req, res) => {
    await requireStaff(req, res);
    const db = userClient(req, res);
    let q = db.from('products').select('*, product_variants(id, price_paise, sale_price_paise, stock, is_active), category:categories(name)').order('sort_order').order('name');
    if (qs(req, 'status')) q = q.eq('status', qs(req, 'status'));
    if (qs(req, 'category')) q = q.eq('category_id', qs(req, 'category'));
    if (qs(req, 'q')) q = q.ilike('name', `%${like(qs(req, 'q'))}%`);
    const [{ data }, { data: categories }] = await Promise.all([q, db.from('categories').select('id, name').order('sort_order')]);
    return { products: data ?? [], categories: categories ?? [] };
  }),
);

adminReadRouter.get(
  '/products/:id',
  route(async (req, res) => {
    const { role } = await requireStaff(req, res);
    const id = param(req, 'id');
    const db = userClient(req, res);
    const [{ data: product }, { data: variants }, { data: info }, { data: categories }] = await Promise.all([
      db.from('products').select('*').eq('id', id).maybeSingle(),
      db.from('product_variants').select('*').eq('product_id', id).order('sort_order').order('weight_grams'),
      db.from('product_health_information').select('*').eq('product_id', id).order('section').order('sort_order'),
      db.from('categories').select('*').order('sort_order'),
    ]);
    if (!product) throw new HttpError(404, 'Product not found.');
    return { product, variants: variants ?? [], info: info ?? [], categories: categories ?? [], readOnly: role === 'staff' };
  }),
);

adminReadRouter.get(
  '/categories',
  route(async (req, res) => {
    await requireStaff(req, res);
    const db = userClient(req, res);
    const [{ data }, { data: prods }] = await Promise.all([db.from('categories').select('*').order('sort_order'), db.from('products').select('category_id')]);
    const counts: Record<string, number> = {};
    for (const p of prods ?? []) if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
    return { categories: data ?? [], counts };
  }),
);

adminReadRouter.get(
  '/health-info',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    const db = userClient(req, res);
    const [{ data: products }, { data: items }] = await Promise.all([
      db.from('products').select('id, name, status').order('name'),
      db.from('product_health_information').select('product_id, is_approved, claim_type, source_reference, section'),
    ]);
    return (products ?? []).map((p) => {
      const mine = (items ?? []).filter((i) => i.product_id === p.id);
      return {
        ...p,
        total: mine.length,
        pending: mine.filter((i) => !i.is_approved).length,
        sections: new Set(mine.map((i) => i.section)).size,
        noSource: mine.filter((i) => i.claim_type === 'research_supported' && !i.source_reference).length,
      };
    });
  }),
);

adminReadRouter.get(
  '/inventory',
  route(async (req, res) => {
    const { role } = await requireStaff(req, res);
    const db = userClient(req, res);
    const [{ data }, { data: ledger }] = await Promise.all([
      db.from('product_variants').select('id, label, sku, price_paise, sale_price_paise, stock, low_stock_threshold, is_active, weight_grams, product:products(id, name, status)').order('weight_grams'),
      db.from('inventory').select('id, change, stock_after, reason, reference, created_at, variant:product_variants(label, product:products(name))').order('created_at', { ascending: false }).limit(25),
    ]);
    return { rows: data ?? [], ledger: ledger ?? [], canEditPrice: role !== 'staff' };
  }),
);

adminReadRouter.get(
  '/orders',
  route(async (req, res) => {
    await requireStaff(req, res);
    const db = userClient(req, res);
    const p = page(req);
    let q = db.from('orders').select('id, order_number, status, payment_method, total_paise, created_at, shipping_address', { count: 'exact' }).order('created_at', { ascending: false });
    const status = qs(req, 'status');
    if (status === 'open') q = q.in('status', ['placed', 'payment_confirmed', 'processing', 'packed', 'payment_review']);
    else if (status) q = q.eq('status', status);
    else q = q.neq('status', 'pending_payment');
    if (qs(req, 'q')) q = q.ilike('order_number', `%${qs(req, 'q').replace(/[^A-Za-z0-9]/g, '')}%`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(qs(req, 'from'))) q = q.gte('created_at', `${qs(req, 'from')}T00:00:00+05:30`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(qs(req, 'to'))) q = q.lte('created_at', `${qs(req, 'to')}T23:59:59+05:30`);
    const { data, count } = await q.range((p - 1) * 25, p * 25 - 1);
    return { rows: data ?? [], total: count ?? 0, page: p, pageSize: 25 };
  }),
);

adminReadRouter.get(
  '/orders/:id',
  route(async (req, res) => {
    await requireStaff(req, res);
    const id = param(req, 'id');
    const db = userClient(req, res);
    const [{ data: order }, { data: items }, { data: events }, { data: shipping }, { data: payments }] = await Promise.all([
      db.from('orders').select('*').eq('id', id).maybeSingle(),
      db.from('order_items').select('*').eq('order_id', id),
      db.from('order_status_events').select('status, note, created_at').eq('order_id', id).order('created_at'),
      db.from('shipping_details').select('*').eq('order_id', id).maybeSingle(),
      db.from('payments').select('id, method, status, amount_paise, razorpay_order_id, razorpay_payment_id, failure_reason, created_at').eq('order_id', id).order('created_at'),
    ]);
    if (!order) throw new HttpError(404, 'Order not found.');
    const { data: customer } = await db.from('profiles').select('full_name, phone, email').eq('id', order.user_id).maybeSingle();
    return { order, items: items ?? [], events: events ?? [], shipping, payments: payments ?? [], customer };
  }),
);

adminReadRouter.get(
  '/customers',
  route(async (req, res) => {
    const { role } = await requireStaff(req, res);
    const db = userClient(req, res);
    const p = page(req);
    let q = db.from('profiles').select('id, full_name, phone, email, is_blocked, created_at', { count: 'exact' }).order('created_at', { ascending: false });
    const term = like(qs(req, 'q'));
    if (term) q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term.replace(/\D/g, '') || term}%,email.ilike.%${term}%`);
    const { data, count } = await q.range((p - 1) * 30, p * 30 - 1);
    const ids = (data ?? []).map((c) => c.id);
    const { data: orders } = ids.length ? await db.from('orders').select('user_id, total_paise').in('user_id', ids).in('status', REVENUE) : { data: [] };
    const agg: Record<string, { n: number; total: number }> = {};
    for (const o of orders ?? []) {
      const a = (agg[o.user_id] ??= { n: 0, total: 0 });
      a.n++;
      a.total += o.total_paise;
    }
    return { rows: (data ?? []).map((c) => ({ ...c, orders: agg[c.id]?.n ?? 0, spent: agg[c.id]?.total ?? 0 })), total: count ?? 0, page: p, pageSize: 30, canBlock: role !== 'staff' };
  }),
);

adminReadRouter.get(
  '/custom-requests',
  route(async (req, res) => {
    await requireStaff(req, res);
    const db = userClient(req, res);
    const p = page(req);
    let q = db.from('custom_service_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    const status = qs(req, 'status');
    if (status === 'open') q = q.in('status', ['request_received', 'under_review']);
    else if (status) q = q.eq('status', status);
    const { data, count } = await q.range((p - 1) * 25, p * 25 - 1);
    return { rows: data ?? [], total: count ?? 0, page: p, pageSize: 25 };
  }),
);

adminReadRouter.get(
  '/custom-requests/:id',
  route(async (req, res) => {
    const { role } = await requireStaff(req, res);
    const id = param(req, 'id');
    const db = userClient(req, res);
    const { data: request } = await db.from('custom_service_requests').select('*').eq('id', id).maybeSingle();
    if (!request) throw new HttpError(404, 'Request not found.');
    const [{ data: quotations }, { data: stages }, photos] = await Promise.all([
      db.from('quotations').select('*').eq('request_id', id).order('created_at', { ascending: false }),
      db.from('processing_stages').select('status, note, created_at').eq('request_id', id).order('created_at'),
      signedUrls('custom-request-photos', request.photo_paths ?? []),
    ]);
    return { request, quotations: quotations ?? [], stages: stages ?? [], photos, canQuote: role !== 'staff' };
  }),
);

adminReadRouter.get(
  '/quotations',
  route(async (req, res) => {
    await requireStaff(req, res);
    let q = userClient(req, res).from('quotations').select('*, request:custom_service_requests(id, request_number, customer_name, ingredient_name)').order('created_at', { ascending: false }).limit(200);
    if (qs(req, 'status')) q = q.eq('status', qs(req, 'status'));
    return (await q).data ?? [];
  }),
);

adminReadRouter.get(
  '/payments',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    const p = page(req);
    let q = userClient(req, res)
      .from('payments')
      .select('id, purpose, method, status, amount_paise, razorpay_order_id, razorpay_payment_id, failure_reason, created_at, order:orders(id, order_number), quotation:quotations(request_id)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (qs(req, 'status')) q = q.eq('status', qs(req, 'status'));
    const { data, count } = await q.range((p - 1) * 30, p * 30 - 1);
    return { rows: data ?? [], total: count ?? 0, page: p, pageSize: 30, razorpayConfigured: isRazorpayConfigured() };
  }),
);

adminReadRouter.get(
  '/reviews',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    let q = userClient(req, res).from('reviews').select('*, product:products(name)').order('created_at', { ascending: false }).limit(200);
    if (qs(req, 'show') !== 'all') q = q.eq('is_approved', false);
    return (await q).data ?? [];
  }),
);

adminReadRouter.get(
  '/offers',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    return (await userClient(req, res).from('promotions').select('*, coupons(code)').order('starts_at', { ascending: false })).data ?? [];
  }),
);

adminReadRouter.get(
  '/offer-options',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    const db = userClient(req, res);
    const [{ data: products }, { data: categories }] = await Promise.all([db.from('products').select('id, name').order('name'), db.from('categories').select('id, name').order('sort_order')]);
    return { products: products ?? [], categories: categories ?? [] };
  }),
);

adminReadRouter.get(
  '/offers/:id',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    const { data } = await userClient(req, res).from('promotions').select('*, promotion_products(product_id), promotion_categories(category_id), coupons(code)').eq('id', param(req, 'id')).maybeSingle();
    if (!data) throw new HttpError(404, 'Offer not found.');
    return data;
  }),
);

adminReadRouter.get(
  '/banners',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    return (await userClient(req, res).from('banners').select('*').order('sort_order')).data ?? [];
  }),
);

adminReadRouter.get(
  '/reports/summary',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    const from = /^\d{4}-\d{2}-\d{2}$/.test(qs(req, 'from')) ? qs(req, 'from') : new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const to = /^\d{4}-\d{2}-\d{2}$/.test(qs(req, 'to')) ? qs(req, 'to') : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data } = await userClient(req, res)
      .from('orders')
      .select('total_paise, item_discount_paise, coupon_discount_paise, tax_paise, order_items(product_name, quantity, line_total_paise)')
      .in('status', REVENUE)
      .gte('created_at', `${from}T00:00:00+05:30`)
      .lte('created_at', `${to}T23:59:59+05:30`)
      .limit(20000);
    const list = data ?? [];
    const products: Record<string, { qty: number; revenue: number }> = {};
    for (const o of list) for (const i of o.order_items as { product_name: string; quantity: number; line_total_paise: number }[]) {
      const p = (products[i.product_name] ??= { qty: 0, revenue: 0 });
      p.qty += i.quantity;
      p.revenue += i.line_total_paise;
    }
    return {
      from, to,
      revenue: list.reduce((a, o) => a + o.total_paise, 0),
      orders: list.length,
      discounts: list.reduce((a, o) => a + o.item_discount_paise + o.coupon_discount_paise, 0),
      tax: list.reduce((a, o) => a + o.tax_paise, 0),
      top: Object.entries(products).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10).map(([name, v]) => ({ name, ...v })),
    };
  }),
);

adminReadRouter.get(
  '/settings',
  route(async (req, res) => {
    await requireStaff(req, res, 'admin');
    const [settings, { data: rates }] = await Promise.all([getSettings(), userClient(req, res).from('service_rates').select('*').order('processing_type')]);
    const integrations = [
      { name: 'Supabase (database, auth, storage)', ok: true as boolean | null, note: '' },
      { name: 'SMS OTP provider', ok: null, note: 'Configured in Supabase → Authentication → Providers → Phone' },
      { name: 'Razorpay online payments', ok: isRazorpayConfigured(), note: '' },
      { name: 'Razorpay webhook secret', ok: Boolean(config.razorpay.webhookSecret), note: '' },
      { name: 'Email notifications (Resend)', ok: Boolean(config.email.resendApiKey && config.email.from), note: '' },
      { name: 'WhatsApp notifications', ok: Boolean(config.whatsapp.token && config.whatsapp.template), note: '' },
    ];
    return { settings, rates: rates ?? [], integrations };
  }),
);

adminReadRouter.get(
  '/admins',
  route(async (req, res) => {
    const { user } = await requireStaff(req, res, 'super_admin');
    const svc = serviceClient();
    const [{ data: list }, { data: me }] = await Promise.all([
      svc.from('admin_allowlist').select('phone, role, display_name, is_active, created_at').order('created_at'),
      svc.from('profiles').select('phone').eq('id', user.id).single(),
    ]);
    return { users: list ?? [], myPhone: me?.phone ?? '' };
  }),
);
