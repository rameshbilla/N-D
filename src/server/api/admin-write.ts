import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { formatINR, rupeesToPaise } from '../../shared/money';
import { normalizeIndianPhone } from '../../shared/phone';
import { ORDER_STATUS_LABEL, REQUEST_STATUS_LABEL } from '../../shared/status';
import type { AppRole, ProductImage } from '../../shared/types';
import { requireStaff } from '../auth';
import { must, param, route, userError } from '../http';
import { notifyCustomer } from '../notify';
import { serviceClient, userClient, type Db } from '../supabase';
import { removeStorageObjects, uploadImage, UploadError, type UploadFile } from '../uploads';

/** Admin mutations. Role is verified server-side, then the caller's own RLS-scoped client is used. */
export const adminWriteRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 10 } });
const withFiles = (field: string, max: number) => (req: Request, res: Response, next: () => void) =>
  upload.array(field, max)(req, res, (err: unknown) => (err ? void res.status(400).json({ ok: false, error: 'Images must be 5 MB or smaller (max 10).' }) : next()));

type Ctx = { user: User; role: AppRole; db: Db; req: Request; res: Response };
const adm = <T>(min: AppRole, fn: (ctx: Ctx) => Promise<T>, msg = 'Saved.') =>
  route(async (req, res) => {
    const { user, role } = await requireStaff(req, res, min);
    return fn({ user, role, db: userClient(req, res), req, res });
  }, msg);

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80);
/** <input type="datetime-local"> values are interpreted as India time. */
const istToIso = (v: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}${v.length === 16 ? ':00' : ''}+05:30`).toISOString();

// ============================ Products ============================
const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter the product name').max(120),
  slug: z.string().trim().max(80).optional().default(''),
  sku: z.string().trim().max(40).optional().default(''),
  category_id: z.union([z.uuid(), z.literal('')]).optional().default(''),
  tagline: z.string().trim().max(160).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  status: z.enum(['draft', 'active', 'inactive']),
  is_featured: z.boolean(),
  discount_percent: z.number().int().min(0).max(90),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Pick a colour'),
  seo_title: z.string().trim().max(70).optional().default(''),
  seo_description: z.string().trim().max(170).optional().default(''),
  nutrition_basis: z.string().trim().max(80).optional().default(''),
  nutrition_facts: z.array(z.object({ nutrient: z.string().trim().min(1).max(60), amount: z.string().trim().max(20), unit: z.string().trim().max(12) })).max(30),
  videos: z.array(z.object({ url: z.url().refine((u) => u.startsWith('https://'), 'Video links must use https'), title: z.string().trim().max(100).optional().default('') })).max(5),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

const productRow = (p: z.infer<typeof productSchema>) => ({
  name: p.name, slug: slugify(p.slug || p.name), sku: p.sku || null, category_id: p.category_id || null, tagline: p.tagline || null,
  description: p.description || null, status: p.status, is_featured: p.is_featured, discount_percent: p.discount_percent, accent_color: p.accent_color,
  seo_title: p.seo_title || null, seo_description: p.seo_description || null, nutrition_basis: p.nutrition_basis || null,
  nutrition_facts: p.nutrition_facts, videos: p.videos, sort_order: p.sort_order,
});

adminWriteRouter.post('/products', adm('admin', async ({ db, req }) => {
  const row = productRow(productSchema.parse(req.body));
  if (!row.slug) throw userError('Enter a valid URL slug.');
  return { id: must(await db.from('products').insert(row).select('id').single()).id as string };
}, 'Product created.'));

adminWriteRouter.put('/products/:id', adm('admin', async ({ db, req }) => {
  const row = productRow(productSchema.parse(req.body));
  if (!row.slug) throw userError('Enter a valid URL slug.');
  must(await db.from('products').update(row).eq('id', param(req, 'id')));
}, 'Product saved.'));

adminWriteRouter.delete('/products/:id', adm('admin', async ({ db, req }) => {
  const id = param(req, 'id');
  const prod = must(await db.from('products').select('images').eq('id', id).single());
  must(await db.from('products').delete().eq('id', id));
  await removeStorageObjects('product-images', ((prod.images ?? []) as ProductImage[]).map((i) => i.path).filter((x): x is string => Boolean(x)));
}, 'Product deleted. Past orders keep their original details.'));

const variantSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(40),
  weight_grams: z.number().int().positive().max(100000),
  sku: z.string().trim().max(40).optional().default(''),
  price: z.string(),
  sale_price: z.string().optional().default(''),
  stock: z.number().int().min(0).max(1000000),
  low_stock_threshold: z.number().int().min(0).max(100000).default(10),
  is_active: z.boolean(),
  sort_order: z.number().int().default(0),
});

adminWriteRouter.put('/products/:id/variants', adm('admin', async ({ db, req }) => {
  const productId = param(req, 'id');
  const list = z.array(variantSchema).max(20).parse(req.body?.variants ?? []);
  const removedIds = z.array(z.uuid()).max(20).parse(req.body?.removedIds ?? []);
  const seen = new Set<number>();
  for (const v of list) {
    if (seen.has(v.weight_grams)) throw userError(`Duplicate pack size: ${v.label}`);
    seen.add(v.weight_grams);
    const price = rupeesToPaise(v.price);
    const sale = v.sale_price ? rupeesToPaise(v.sale_price) : null;
    if (!price || price <= 0) throw userError(`${v.label}: enter a valid regular price.`);
    if (sale !== null && (sale <= 0 || sale >= price)) throw userError(`${v.label}: sale price must be lower than the regular price.`);
    const row = { product_id: productId, label: v.label, weight_grams: v.weight_grams, sku: v.sku || null, price_paise: price, sale_price_paise: sale, low_stock_threshold: v.low_stock_threshold, is_active: v.is_active, sort_order: v.sort_order };
    if (v.id) {
      must(await db.from('product_variants').update(row).eq('id', v.id).eq('product_id', productId));
      must(await db.rpc('admin_set_stock', { p_variant_id: v.id, p_new_stock: v.stock, p_reason: 'adjustment', p_note: 'Product editor' }));
    } else {
      const created = must(await db.from('product_variants').insert({ ...row, stock: 0 }).select('id').single());
      if (v.stock > 0) must(await db.rpc('admin_set_stock', { p_variant_id: created.id, p_new_stock: v.stock, p_reason: 'initial', p_note: 'New pack size' }));
    }
  }
  for (const id of removedIds) {
    // Deactivate rather than delete if the pack size was ever ordered (keeps history intact).
    const { count } = await db.from('order_items').select('id', { count: 'exact', head: true }).eq('variant_id', id);
    if (count) must(await db.from('product_variants').update({ is_active: false }).eq('id', id));
    else must(await db.from('product_variants').delete().eq('id', id));
  }
}, 'Pack sizes, prices and stock saved. Existing orders keep their original prices.'));

adminWriteRouter.post('/products/:id/images', withFiles('images', 10), adm('admin', async ({ db, req }) => {
  const productId = param(req, 'id');
  const files = ((req.files as UploadFile[]) ?? []).filter((f) => f.size > 0);
  if (!files.length) throw userError('Choose at least one image.');
  const prod = must(await db.from('products').select('images, name').eq('id', productId).single());
  const current = (prod.images ?? []) as ProductImage[];
  if (current.length + files.length > 10) throw userError('A product can have up to 10 images.');
  const added: ProductImage[] = [];
  try {
    for (const f of files) {
      const up = await uploadImage('product-images', f, productId);
      added.push({ url: up.publicUrl!, path: up.path, alt: prod.name });
    }
  } catch (e) {
    await removeStorageObjects('product-images', added.map((a) => a.path!));
    throw e instanceof UploadError ? userError(e.message) : e;
  }
  const images = [...current, ...added];
  must(await db.from('products').update({ images }).eq('id', productId));
  return { images };
}, 'Images uploaded.'));

adminWriteRouter.put('/products/:id/images', adm('admin', async ({ db, req }) => {
  const productId = param(req, 'id');
  const images = z.array(z.object({ url: z.string(), alt: z.string().max(120).optional() })).max(10).parse(req.body?.images ?? []);
  const prod = must(await db.from('products').select('images').eq('id', productId).single());
  const current = (prod.images ?? []) as ProductImage[];
  // Only re-ordering / removing / alt text of existing images — never arbitrary URLs.
  const next = images.filter((i) => current.some((c) => c.url === i.url)).map((i) => ({ ...current.find((c) => c.url === i.url)!, alt: i.alt ?? '' }));
  must(await db.from('products').update({ images: next }).eq('id', productId));
  const keep = new Set(next.map((i) => i.url));
  await removeStorageObjects('product-images', current.filter((c) => !keep.has(c.url) && c.path).map((c) => c.path!));
}, 'Images updated.'));

// ============================ Health information ============================
const healthSchema = z.object({
  id: z.uuid().optional(),
  section: z.enum(['ingredients', 'nutritional_info', 'health_uses', 'potential_benefits', 'common_uses', 'how_to_consume', 'preparation', 'serving', 'storage', 'precautions', 'allergens']),
  kind: z.enum(['bullet', 'paragraph']),
  body: z.string().trim().min(1, 'Text cannot be empty').max(2000),
  claim_type: z.enum(['general', 'traditional', 'research_supported']),
  source_reference: z.string().trim().max(500).optional().default(''),
  sort_order: z.number().int().min(0).max(999),
  approve: z.boolean().default(false),
});

/** Any edit un-publishes the item unless the editor explicitly approves it. */
adminWriteRouter.post('/products/:id/health', adm('admin', async ({ db, req, user }) => {
  const pid = param(req, 'id');
  const i = healthSchema.parse(req.body);
  if (i.claim_type === 'research_supported' && !i.source_reference) throw userError('Add a source reference (study, guideline or URL) for research-supported statements.');
  const row = {
    product_id: pid, section: i.section, kind: i.kind, body: i.body, claim_type: i.claim_type, source_reference: i.source_reference || null, sort_order: i.sort_order,
    is_approved: i.approve, approved_by: i.approve ? user.id : null, approved_at: i.approve ? new Date().toISOString() : null,
  };
  const item = i.id
    ? must(await db.from('product_health_information').update(row).eq('id', i.id).eq('product_id', pid).select('*').single())
    : must(await db.from('product_health_information').insert(row).select('*').single());
  return { item };
}));

adminWriteRouter.delete('/products/:id/health/:itemId', adm('admin', async ({ db, req }) => {
  must(await db.from('product_health_information').delete().eq('id', param(req, 'itemId')).eq('product_id', param(req, 'id')));
}, 'Deleted.'));

adminWriteRouter.put('/products/:id/health-order', adm('admin', async ({ db, req }) => {
  const pid = param(req, 'id');
  const ids = z.array(z.uuid()).max(200).parse(req.body?.ids ?? []);
  for (let k = 0; k < ids.length; k++) must(await db.from('product_health_information').update({ sort_order: k + 1 }).eq('id', ids[k]).eq('product_id', pid));
}, 'Order updated.'));

adminWriteRouter.put('/products/:id/health-approval', adm('admin', async ({ db, req, user }) => {
  const ids = z.array(z.uuid()).max(500).parse(req.body?.ids ?? []);
  const approved = z.boolean().parse(req.body?.approved);
  if (!ids.length) return;
  must(
    await db.from('product_health_information')
      .update({ is_approved: approved, approved_by: approved ? user.id : null, approved_at: approved ? new Date().toISOString() : null })
      .in('id', ids)
      .eq('product_id', param(req, 'id')),
  );
}, 'Approval updated.'));

// ============================ Categories & inventory ============================
const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().max(80).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
  sort_order: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean(),
});
const catRow = (c: z.infer<typeof categorySchema>) => ({ name: c.name, slug: slugify(c.slug || c.name), description: c.description || null, sort_order: c.sort_order, is_active: c.is_active });
adminWriteRouter.post('/categories', adm('admin', async ({ db, req }) => void must(await db.from('categories').insert(catRow(categorySchema.parse(req.body)))), 'Category saved.'));
adminWriteRouter.put('/categories/:id', adm('admin', async ({ db, req }) => void must(await db.from('categories').update(catRow(categorySchema.parse(req.body))).eq('id', param(req, 'id'))), 'Category saved.'));
adminWriteRouter.delete('/categories/:id', adm('admin', async ({ db, req }) => {
  const id = param(req, 'id');
  const { count } = await db.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if (count) throw userError(`Move or delete the ${count} product(s) in this category first.`);
  must(await db.from('categories').delete().eq('id', id));
}, 'Category deleted.'));

/** Quick price/stock edit from the inventory grid. Staff may change stock only. */
adminWriteRouter.put('/variants/:id', adm('staff', async ({ db, req, role }) => {
  const id = param(req, 'id');
  const b = z.object({ price: z.string(), sale_price: z.string(), stock: z.number().int().min(0), reason: z.enum(['restock', 'adjustment']), note: z.string().max(200).optional() }).parse(req.body);
  const current = must(await db.from('product_variants').select('price_paise, sale_price_paise').eq('id', id).single());
  const price = rupeesToPaise(b.price);
  const sale = b.sale_price ? rupeesToPaise(b.sale_price) : null;
  if (price !== current.price_paise || sale !== current.sale_price_paise) {
    if (role === 'staff') throw userError('Only admins can change prices. Stock can be updated.');
    if (!price || price <= 0) throw userError('Enter a valid price.');
    if (sale !== null && (sale <= 0 || sale >= price)) throw userError('Sale price must be lower than the regular price.');
    must(await db.from('product_variants').update({ price_paise: price, sale_price_paise: sale }).eq('id', id));
  }
  must(await db.rpc('admin_set_stock', { p_variant_id: id, p_new_stock: b.stock, p_reason: b.reason, p_note: b.note ?? null }));
}, 'Updated.'));

// ============================ Orders & customers ============================
const ORDER_STATUSES = ['placed', 'payment_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'] as const;

adminWriteRouter.put('/orders/:id/status', adm('staff', async ({ db, req }) => {
  const id = param(req, 'id');
  const s = z.enum(ORDER_STATUSES).parse(req.body?.status);
  const note = z.string().max(300).parse(req.body?.note ?? '');
  const { error } = await db.rpc('admin_set_order_status', { p_order_id: id, p_status: s, p_note: note || null });
  if (error) {
    if (/INSUFFICIENT_STOCK/.test(error.message)) throw userError('Not enough stock to progress this order. Restock first.');
    if (/ORDER_CLOSED/.test(error.message)) throw userError('Delivered or cancelled orders cannot be changed.');
    throw new Error(error.message);
  }
  const o = must(await db.from('orders').select('user_id, order_number, payment_method, total_paise').eq('id', id).single());
  await notifyCustomer(o.user_id, `Order ${o.order_number}: ${ORDER_STATUS_LABEL[s]}`, note || `Your order status is now “${ORDER_STATUS_LABEL[s]}”.${s === 'cancelled' && o.payment_method === 'razorpay' ? ` A refund of ${formatINR(o.total_paise)} will be processed to your original payment method.` : ''}`, `/account/orders/${id}`);
}, 'Order status updated and customer notified.'));

adminWriteRouter.put('/orders/:id/shipping', adm('staff', async ({ db, req }) => {
  const s = z.object({
    courier: z.string().trim().max(60).optional().default(''),
    tracking_number: z.string().trim().max(60).optional().default(''),
    tracking_url: z.union([z.literal(''), z.url().refine((u) => u.startsWith('https://'), 'Tracking link must start with https://')]).optional().default(''),
    expected_delivery: z.union([z.literal(''), z.iso.date()]).optional().default(''),
  }).parse(req.body);
  must(await db.from('shipping_details').upsert({
    order_id: param(req, 'id'), courier: s.courier || null, tracking_number: s.tracking_number || null, tracking_url: s.tracking_url || null,
    expected_delivery: s.expected_delivery || null, shipped_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
}, 'Shipping details saved.'));

adminWriteRouter.put('/customers/:id/blocked', adm('admin', async ({ db, req, user }) => {
  const id = param(req, 'id');
  if (id === user.id) throw userError('You cannot block your own account.');
  must(await db.from('profiles').update({ is_blocked: z.boolean().parse(req.body?.blocked) }).eq('id', id));
}, 'Customer updated.'));

// ============================ Custom requests & quotations ============================
const REQUEST_STATUSES = [
  'request_received', 'under_review', 'quotation_sent', 'payment_pending', 'payment_completed', 'raw_material_received', 'processing_started',
  'dehydration_completed', 'powder_completed', 'packaging_completed', 'ready_for_dispatch', 'shipped', 'delivered', 'rejected', 'cancelled',
] as const;

adminWriteRouter.put('/custom-requests/:id/status', adm('staff', async ({ db, req }) => {
  const id = param(req, 'id');
  const s = z.enum(REQUEST_STATUSES).parse(req.body?.status);
  const note = z.string().max(500).parse(req.body?.note ?? '');
  must(await db.rpc('admin_set_request_status', { p_request_id: id, p_status: s, p_note: note || null }));
  const r = must(await db.from('custom_service_requests').select('user_id, request_number').eq('id', id).single());
  await notifyCustomer(r.user_id, `Request ${r.request_number}: ${REQUEST_STATUS_LABEL[s]}`, note || `Your custom processing request is now “${REQUEST_STATUS_LABEL[s]}”.`, `/account/requests/${id}`);
}, 'Status updated and customer notified.'));

adminWriteRouter.put('/custom-requests/:id/notes', adm('staff', async ({ db, req }) => {
  must(await db.from('custom_service_requests').update({ admin_notes: z.string().max(2000).parse(req.body?.notes ?? '') || null }).eq('id', param(req, 'id')));
}, 'Notes saved.'));

adminWriteRouter.post('/custom-requests/:id/quotation', adm('admin', async ({ db, req, user }) => {
  const id = param(req, 'id');
  const q = z.object({
    line_items: z.array(z.object({ label: z.string().trim().min(1).max(120), amount: z.string() })).min(1).max(15),
    notes: z.string().trim().max(1000).optional().default(''),
    valid_until: z.iso.date(),
  }).parse(req.body);
  const items = q.line_items.map((l) => {
    const n = Number.parseFloat(l.amount);
    if (!Number.isFinite(n) || n < 0) throw userError(`Enter a valid amount for “${l.label}”.`);
    return { label: l.label, amount_paise: Math.round(n * 100) };
  });
  const total = items.reduce((a, l) => a + l.amount_paise, 0);
  if (total <= 0) throw userError('Quotation total must be greater than zero.');
  if (new Date(q.valid_until) < new Date(new Date().toDateString())) throw userError('Validity date must be today or later.');
  const r = must(await db.from('custom_service_requests').select('user_id, request_number, status').eq('id', id).single());
  if (['payment_completed', 'delivered', 'cancelled'].includes(r.status)) throw userError('This request can no longer be quoted.');
  must(await db.from('quotations').update({ status: 'withdrawn' }).eq('request_id', id).in('status', ['sent', 'accepted']));
  must(await db.from('quotations').insert({ request_id: id, line_items: items, total_paise: total, notes: q.notes || null, valid_until: q.valid_until, created_by: user.id }));
  must(await db.rpc('admin_set_request_status', { p_request_id: id, p_status: 'quotation_sent', p_note: `Quotation of ${formatINR(total)} sent` }));
  await notifyCustomer(r.user_id, `Quotation for request ${r.request_number}`, `Your quotation total is ${formatINR(total)}, valid until ${q.valid_until}. Review and accept it in your account.`, `/account/requests/${id}`);
}, 'Quotation sent to the customer.'));

adminWriteRouter.post('/quotations/:id/withdraw', adm('admin', async ({ db, req }) => {
  must(await db.from('quotations').update({ status: 'withdrawn' }).eq('id', param(req, 'id')).in('status', ['sent', 'accepted']));
}, 'Quotation withdrawn.'));

/** Records an offline (cash / bank transfer) payment for an open quotation. */
adminWriteRouter.post('/quotations/:id/offline-payment', adm('admin', async ({ db, req, user }) => {
  const id = param(req, 'id');
  const reference = String(req.body?.reference ?? '').slice(0, 120);
  const q = must(await db.from('quotations').select('id, status, total_paise, request:custom_service_requests(id, user_id, request_number)').eq('id', id).single());
  if (q.status !== 'accepted' && q.status !== 'sent') throw userError('Only open quotations can be marked as paid.');
  const r = q.request as unknown as { id: string; user_id: string };
  must(await serviceClient().from('payments').insert({ user_id: r.user_id, purpose: 'quotation', quotation_id: id, method: 'cod', status: 'cod_collected', amount_paise: q.total_paise, raw_event: { offline_reference: reference, recorded_by: user.id } }));
  must(await db.from('quotations').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id));
  must(await db.rpc('admin_set_request_status', { p_request_id: r.id, p_status: 'payment_completed', p_note: `Offline payment recorded${reference ? ` (${reference.slice(0, 60)})` : ''}` }));
}, 'Payment recorded.'));

const rateSchema = z.object({ ingredient_name: z.string().trim().max(80).optional().default(''), processing_type: z.enum(['dehydration_only', 'dehydration_powder', 'grinding_only']), rate: z.string(), is_active: z.boolean() });
adminWriteRouter.post('/service-rates', adm('admin', async ({ db, req }) => {
  const r = rateSchema.parse(req.body);
  const paise = Math.round(Number.parseFloat(r.rate) * 100);
  if (!Number.isFinite(paise) || paise < 0) throw userError('Enter a valid rate per kg.');
  must(await db.from('service_rates').insert({ ingredient_name: r.ingredient_name || null, processing_type: r.processing_type, rate_per_kg_paise: paise, is_active: r.is_active }));
}, 'Rate saved.'));
adminWriteRouter.delete('/service-rates/:id', adm('admin', async ({ db, req }) => void must(await db.from('service_rates').delete().eq('id', param(req, 'id'))), 'Rate deleted.'));

// ============================ Reviews & notifications ============================
adminWriteRouter.put('/reviews/:id', adm('admin', async ({ db, req }) => {
  const id = param(req, 'id');
  const action = z.enum(['approve', 'hide', 'delete']).parse(req.body?.action);
  if (action === 'delete') must(await db.from('reviews').delete().eq('id', id));
  else must(await db.from('reviews').update({ is_approved: action === 'approve' }).eq('id', id));
}, 'Review updated.'));

adminWriteRouter.post('/notifications/read', adm('staff', async ({ db }) => {
  must(await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('audience', 'admin').is('read_at', null));
}, 'Marked as read.'));

// ============================ Offers / promotions ============================
const promoSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter an offer name').max(120),
    festival_name: z.string().trim().max(60).optional().default(''),
    title: z.string().trim().min(2, 'Enter an offer title').max(160),
    description: z.string().trim().max(500).optional().default(''),
    banner_image_url: z.string().max(500).optional().default(''),
    show_banner: z.boolean(),
    discount_type: z.enum(['percentage', 'fixed']),
    discount_value: z.string(),
    scope: z.enum(['all', 'categories', 'products']),
    product_ids: z.array(z.uuid()).max(500),
    category_ids: z.array(z.uuid()).max(100),
    requires_coupon: z.boolean(),
    coupon_code: z.string().trim().toUpperCase().max(30).optional().default(''),
    combinable_with_offers: z.boolean(),
    min_order: z.string().optional().default(''),
    max_discount: z.string().optional().default(''),
    starts_at: z.string().min(1, 'Choose a start date'),
    ends_at: z.string().min(1, 'Choose an end date'),
    usage_limit: z.string().optional().default(''),
    per_user_limit: z.string().optional().default(''),
    is_active: z.boolean(),
    priority: z.number().int().min(0).max(100).default(0),
  })
  .superRefine((p, ctx) => {
    if (p.requires_coupon && !/^[A-Z0-9_-]{3,30}$/.test(p.coupon_code)) ctx.addIssue({ code: 'custom', path: ['coupon_code'], message: 'Coupon code: 3–30 letters, numbers, - or _' });
    if (p.scope === 'products' && !p.product_ids.length) ctx.addIssue({ code: 'custom', path: ['product_ids'], message: 'Select at least one product' });
    if (p.scope === 'categories' && !p.category_ids.length) ctx.addIssue({ code: 'custom', path: ['category_ids'], message: 'Select at least one category' });
    if (p.banner_image_url && !/^https:\/\//.test(p.banner_image_url)) ctx.addIssue({ code: 'custom', path: ['banner_image_url'], message: 'Invalid image' });
  });
const toPaise = (v: string) => (v.trim() === '' ? null : Math.round(Number.parseFloat(v) * 100));
const toInt = (v: string) => (v.trim() === '' ? null : Number.parseInt(v, 10));

async function savePromotion(db: Db, body: unknown, id?: string) {
  const p = promoSchema.parse(body);
  const value = p.discount_type === 'percentage' ? Number.parseInt(p.discount_value, 10) : toPaise(p.discount_value);
  if (!value || value <= 0) throw userError('Enter a valid discount value.');
  if (p.discount_type === 'percentage' && value > 90) throw userError('Percentage discounts can be at most 90%.');
  const starts = istToIso(p.starts_at);
  const ends = istToIso(p.ends_at);
  if (new Date(ends) <= new Date(starts)) throw userError('End date must be after the start date.');
  const row = {
    name: p.name, festival_name: p.festival_name || null, title: p.title, description: p.description || null, banner_image_url: p.banner_image_url || null,
    show_banner: p.show_banner, discount_type: p.discount_type, discount_value: value, scope: p.scope, requires_coupon: p.requires_coupon,
    combinable_with_offers: p.combinable_with_offers, min_order_paise: toPaise(p.min_order) ?? 0, max_discount_paise: toPaise(p.max_discount),
    starts_at: starts, ends_at: ends, usage_limit: toInt(p.usage_limit), per_user_limit: toInt(p.per_user_limit), is_active: p.is_active, priority: p.priority,
  };
  const saved = id ? must(await db.from('promotions').update(row).eq('id', id).select('id').single()) : must(await db.from('promotions').insert(row).select('id').single());
  const pid = saved.id as string;
  must(await db.from('promotion_products').delete().eq('promotion_id', pid));
  must(await db.from('promotion_categories').delete().eq('promotion_id', pid));
  if (p.scope === 'products') must(await db.from('promotion_products').insert(p.product_ids.map((product_id) => ({ promotion_id: pid, product_id }))));
  if (p.scope === 'categories') must(await db.from('promotion_categories').insert(p.category_ids.map((category_id) => ({ promotion_id: pid, category_id }))));
  must(await db.from('coupons').delete().eq('promotion_id', pid));
  if (p.requires_coupon) must(await db.from('coupons').insert({ promotion_id: pid, code: p.coupon_code }));
  return { id: pid };
}
const OFFER_SAVED = 'Offer saved. Prices on the website update immediately.';
adminWriteRouter.post('/offers', adm('admin', ({ db, req }) => savePromotion(db, req.body), OFFER_SAVED));
adminWriteRouter.put('/offers/:id', adm('admin', ({ db, req }) => savePromotion(db, req.body, param(req, 'id')), OFFER_SAVED));
adminWriteRouter.put('/offers/:id/active', adm('admin', async ({ db, req }) => void must(await db.from('promotions').update({ is_active: z.boolean().parse(req.body?.active) }).eq('id', param(req, 'id'))), 'Offer updated.'));
adminWriteRouter.delete('/offers/:id', adm('admin', async ({ db, req }) => void must(await db.from('promotions').delete().eq('id', param(req, 'id'))), 'Offer deleted. Past orders keep their discount snapshot.'));

// ============================ Banners ============================
adminWriteRouter.post('/banner-image', withFiles('image', 1), adm('admin', async ({ req }) => {
  const file = (req.files as UploadFile[] | undefined)?.[0];
  if (!file) throw userError('Choose an image.');
  try {
    return { url: (await uploadImage('banners', file, 'banners')).publicUrl! };
  } catch (e) {
    throw e instanceof UploadError ? userError(e.message) : e;
  }
}, 'Image uploaded.'));

const bannerSchema = z.object({
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(240).optional().default(''),
  image_url: z.string().max(500).refine((v) => v === '' || v.startsWith('https://'), 'Invalid image').optional().default(''),
  link_url: z.string().trim().max(300).refine((v) => v === '' || /^(\/|https:\/\/)/.test(v), 'Link must start with / or https://').optional().default(''),
  link_label: z.string().trim().max(40).optional().default(''),
  placement: z.enum(['home_strip', 'shop_top']),
  starts_at: z.string().optional().default(''),
  ends_at: z.string().optional().default(''),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(999).default(0),
});
const bannerRow = (b: z.infer<typeof bannerSchema>) => ({
  title: b.title, subtitle: b.subtitle || null, image_url: b.image_url || null, link_url: b.link_url || null, link_label: b.link_label || null, placement: b.placement,
  starts_at: b.starts_at ? istToIso(b.starts_at) : null, ends_at: b.ends_at ? istToIso(b.ends_at) : null, is_active: b.is_active, sort_order: b.sort_order,
});
adminWriteRouter.post('/banners', adm('admin', async ({ db, req }) => void must(await db.from('banners').insert(bannerRow(bannerSchema.parse(req.body)))), 'Banner saved.'));
adminWriteRouter.put('/banners/:id', adm('admin', async ({ db, req }) => void must(await db.from('banners').update(bannerRow(bannerSchema.parse(req.body))).eq('id', param(req, 'id'))), 'Banner saved.'));
adminWriteRouter.delete('/banners/:id', adm('admin', async ({ db, req }) => {
  const id = param(req, 'id');
  const b = must(await db.from('banners').select('image_url').eq('id', id).single());
  must(await db.from('banners').delete().eq('id', id));
  const path = b.image_url?.split('/storage/v1/object/public/banners/')[1];
  if (path) await removeStorageObjects('banners', [path]);
}, 'Banner deleted.'));

// ============================ Settings ============================
const rp = (v: unknown) => {
  const n = Math.round(Number.parseFloat(String(v)) * 100);
  if (!Number.isFinite(n) || n < 0) throw userError('Enter valid rupee amounts.');
  return n;
};
adminWriteRouter.put('/settings/:key', adm('admin', async ({ db, req, user }) => {
  const key = z.enum(['store', 'commerce', 'custom_service']).parse(req.params['key']);
  let value: Record<string, unknown>;
  if (key === 'store') {
    value = z.object({
      name: z.string().trim().min(2).max(120), tagline: z.string().trim().max(200), phone: z.string().trim().max(30),
      whatsapp: z.string().trim().regex(/^\d{0,15}$/, 'WhatsApp: digits only, with country code (e.g. 919014325025)'),
      email: z.union([z.literal(''), z.email()]), address: z.string().trim().max(300), fssai: z.string().trim().max(30),
    }).parse(req.body);
  } else if (key === 'commerce') {
    const c = z.object({
      gst_percent: z.coerce.number().min(0).max(28), prices_include_tax: z.boolean(), delivery_fee: z.string(), free_delivery_threshold: z.string(),
      cod_enabled: z.boolean(), cod_fee: z.string(), cod_max_order: z.string(), max_qty_per_item: z.coerce.number().int().min(1).max(50),
    }).parse(req.body);
    value = {
      gst_percent: c.gst_percent, prices_include_tax: c.prices_include_tax, delivery_fee_paise: rp(c.delivery_fee), free_delivery_threshold_paise: rp(c.free_delivery_threshold),
      cod_enabled: c.cod_enabled, cod_fee_paise: rp(c.cod_fee), cod_max_order_paise: rp(c.cod_max_order), max_qty_per_item: c.max_qty_per_item,
    };
  } else {
    const c = z.object({ packaging_charge_per_kg: z.string(), transport_charge: z.string(), min_quantity_kg: z.coerce.number().min(0).max(10000), estimates_enabled: z.boolean(), notes: z.string().trim().max(300) }).parse(req.body);
    value = { packaging_charge_per_kg_paise: rp(c.packaging_charge_per_kg), transport_charge_paise: rp(c.transport_charge), min_quantity_kg: c.min_quantity_kg, estimates_enabled: c.estimates_enabled, notes: c.notes };
  }
  must(await db.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user.id }));
}, 'Settings saved.'));

// ============================ Admin users (Super Admin only) ============================
adminWriteRouter.post('/admins', adm('super_admin', async ({ req, user }) => {
  const phone = normalizeIndianPhone(req.body?.phone);
  if (!phone) throw userError('Enter a valid Indian mobile number.');
  const role = z.enum(['admin', 'staff']).parse(req.body?.role);
  const svc = serviceClient();
  const existing = (await svc.from('admin_allowlist').select('role').eq('phone', phone).maybeSingle()).data;
  if (existing?.role === 'super_admin') throw userError('This number is a Super Admin.');
  must(await svc.from('admin_allowlist').upsert({ phone, role, display_name: String(req.body?.name ?? '').trim().slice(0, 80) || null, is_active: true, added_by: user.id }));
  const prof = (await svc.from('profiles').select('id').eq('phone', phone).maybeSingle()).data;
  if (prof) await svc.rpc('sync_admin_role', { p_user_id: prof.id });
}, 'Access granted. They can now sign in at /admin/login with OTP.'));

adminWriteRouter.put('/admins/:phone', adm('super_admin', async ({ req, user }) => {
  const p = normalizeIndianPhone(req.params['phone'] as string);
  if (!p) throw userError('Invalid number.');
  const active = z.boolean().parse(req.body?.active);
  const svc = serviceClient();
  const me = must(await svc.from('profiles').select('phone').eq('id', user.id).single());
  if (me.phone === p) throw userError('You cannot change your own access.');
  const row = must(await svc.from('admin_allowlist').select('role').eq('phone', p).single());
  if (row.role === 'super_admin' && !active) {
    const { count } = await svc.from('admin_allowlist').select('phone', { count: 'exact', head: true }).eq('role', 'super_admin').eq('is_active', true);
    if ((count ?? 0) <= 1) throw userError('At least one active Super Admin is required.');
  }
  must(await svc.from('admin_allowlist').update({ is_active: active }).eq('phone', p));
  const prof = (await svc.from('profiles').select('id').eq('phone', p).maybeSingle()).data;
  if (prof) await svc.rpc('sync_admin_role', { p_user_id: prof.id });
}, 'Access updated.'));
