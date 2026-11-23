import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { estimateCustomProcessing } from '../../shared/custom-estimate';
import { formatINR } from '../../shared/money';
import { normalizeIndianPhone } from '../../shared/phone';
import type { ProcessingType } from '../../shared/types';
import { requireUser } from '../auth';
import { getServiceRates } from '../catalog';
import { config, isRazorpayConfigured, isSupabaseConfigured } from '../config';
import { HttpError, param, route, userError } from '../http';
import { notifyAdmins, notifyCustomer } from '../notify';
import { createRazorpayOrder } from '../razorpay';
import { clientIp, rateLimit } from '../rate-limit';
import { getSettings } from '../settings';
import { serviceClient, userClient } from '../supabase';
import { removeStorageObjects, signedUrls, uploadImage, UploadError } from '../uploads';

export const customerRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 30 } });
const processing = z.enum(['dehydration_only', 'dehydration_powder', 'grinding_only']);

async function estimate(input: { ingredient: string; processingType: ProcessingType; quantity: number; unit: 'kg' | 'g'; wantsPickup: boolean }) {
  const [rates, { custom_service }] = await Promise.all([getServiceRates(), getSettings()]);
  return estimateCustomProcessing(input, rates, custom_service);
}

customerRouter.post(
  '/custom/estimate',
  route(async (req) => {
    const b = req.body ?? {};
    return estimate({
      ingredient: String(b.ingredient ?? '').slice(0, 120), processingType: processing.parse(b.processingType),
      quantity: z.number().positive().max(100000).parse(b.quantity), unit: z.enum(['kg', 'g']).parse(b.unit), wantsPickup: Boolean(b.wantsPickup),
    });
  }),
);

const requestSchema = z.object({
  customer_name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.string().transform((v, ctx) => {
    const p = normalizeIndianPhone(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
    return p ?? '';
  }),
  ingredient_name: z.string().trim().min(2, 'Enter the ingredient').max(120),
  ingredient_category: z.enum(['fruit', 'vegetable', 'leaf_herb', 'spice', 'grain', 'other']),
  quantity: z.coerce.number().positive('Enter the quantity').max(100000),
  quantity_unit: z.enum(['kg', 'g']),
  processing_type: processing,
  special_instructions: z.string().trim().max(1000).optional().default(''),
  logistics: z.enum(['customer_dropoff', 'pickup_requested', 'courier']),
  return_preference: z.enum(['collect', 'delivery']),
  pickup_address: z.string().trim().max(500).optional().default(''),
});

customerRouter.post(
  '/custom/requests',
  (req, res, next) =>
    upload.array('photos', 5)(req, res, (err: unknown) => {
      if (err) return void res.status(400).json({ ok: false, error: err instanceof multer.MulterError ? 'Up to 5 photos, 5 MB each.' : 'Upload failed.' });
      next();
    }),
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const limit = await rateLimit('custom-request', user.id, 6, 3600);
    if (!limit.allowed) throw new HttpError(429, 'You have submitted several requests recently. Please try again later.');
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) throw userError('Please check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    const d = parsed.data;
    if (d.logistics === 'pickup_requested' && d.pickup_address.length < 10) throw userError('Please enter the pickup address.', { pickup_address: 'Enter the full pickup address' });

    const files = ((req.files as Express.Multer.File[]) ?? []).filter((f) => f.size > 0);
    const uploaded: string[] = [];
    try {
      for (const f of files) uploaded.push((await uploadImage('custom-request-photos', f, user.id, { allowHeic: true })).path);
    } catch (e) {
      await removeStorageObjects('custom-request-photos', uploaded);
      throw userError(e instanceof UploadError ? e.message : 'Photo upload failed.');
    }
    const est = await estimate({ ingredient: d.ingredient_name, processingType: d.processing_type, quantity: d.quantity, unit: d.quantity_unit, wantsPickup: d.logistics === 'pickup_requested' });
    const svc = serviceClient();
    const { data: row, error } = await svc
      .from('custom_service_requests')
      .insert({ ...d, user_id: user.id, special_instructions: d.special_instructions || null, pickup_address: d.pickup_address || null, photo_paths: uploaded, estimated_total_paise: est.available ? est.total_paise : null })
      .select('id, request_number')
      .single();
    if (error || !row) {
      await removeStorageObjects('custom-request-photos', uploaded);
      throw new Error(error?.message ?? 'insert failed');
    }
    await svc.from('processing_stages').insert({ request_id: row.id, status: 'request_received', note: 'Request submitted by customer' });
    await notifyCustomer(user.id, `Request ${row.request_number} received`, 'We will review your request and send you a quotation shortly.', `/account/requests/${row.id}`);
    await notifyAdmins(`New custom request ${row.request_number}`, `${d.ingredient_name}, ${d.quantity} ${d.quantity_unit}`, `/admin/custom-requests/${row.id}`);
    return { id: row.id as string, number: row.request_number as string };
  }, 'Request submitted.'),
);

async function ownedQuotation(quotationId: string, userId: string) {
  const { data: q } = await serviceClient().from('quotations').select('*, request:custom_service_requests(id, user_id, request_number, status)').eq('id', quotationId).maybeSingle();
  if (!q || q.request?.user_id !== userId) throw new HttpError(404, 'Quotation not found.');
  return q as typeof q & { request: { id: string; user_id: string; request_number: string; status: string } };
}

customerRouter.post(
  '/quotations/:id/respond',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const decision = z.enum(['accept', 'reject']).parse(req.body?.decision);
    const q = await ownedQuotation(param(req, 'id'), user.id);
    if (q.status !== 'sent') throw userError('This quotation can no longer be changed.');
    const svc = serviceClient();
    if (new Date(q.valid_until + 'T23:59:59+05:30') < new Date()) {
      await svc.from('quotations').update({ status: 'expired' }).eq('id', q.id);
      throw userError('This quotation has expired. Please contact us for a new one.');
    }
    const now = new Date().toISOString();
    const accept = decision === 'accept';
    await svc.from('quotations').update({ status: accept ? 'accepted' : 'rejected', responded_at: now }).eq('id', q.id);
    await svc.from('custom_service_requests').update({ status: accept ? 'payment_pending' : 'under_review' }).eq('id', q.request.id);
    await svc.from('processing_stages').insert({ request_id: q.request.id, status: accept ? 'payment_pending' : 'under_review', note: accept ? 'Quotation accepted by customer' : 'Quotation declined by customer' });
    await notifyAdmins(`Quotation ${accept ? 'accepted' : 'declined'} — ${q.request.request_number}`, accept ? `Total ${formatINR(q.total_paise)}` : 'The customer declined the quotation.', `/admin/custom-requests/${q.request.id}`);
  }),
);

customerRouter.post(
  '/quotations/:id/pay',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    if (!isRazorpayConfigured()) throw userError('Online payment is not configured yet. Please contact us to pay.');
    const q = await ownedQuotation(param(req, 'id'), user.id);
    if (q.status !== 'accepted') throw userError('Accept the quotation before paying.');
    const svc = serviceClient();
    const { data: profile } = await svc.from('profiles').select('full_name, email, phone').eq('id', user.id).single();
    const rzp = await createRazorpayOrder(q.total_paise, `${q.request.request_number}-Q`, { quotation_id: q.id, purpose: 'quotation' });
    await svc.from('payments').insert({ user_id: user.id, purpose: 'quotation', quotation_id: q.id, method: 'razorpay', status: 'created', amount_paise: q.total_paise, razorpay_order_id: rzp.id });
    return { key: config.razorpay.keyId, razorpayOrderId: rzp.id, amount: q.total_paise, name: profile?.full_name ?? '', contact: profile?.phone ?? '', email: profile?.email ?? '' };
  }),
);

const reviewSchema = z.object({
  productId: z.uuid(),
  rating: z.number().int().min(1, 'Please choose a rating').max(5),
  title: z.string().trim().max(120).optional().default(''),
  body: z.string().trim().max(2000).optional().default(''),
});

customerRouter.post(
  '/reviews',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const r = reviewSchema.parse(req.body);
    const svc = serviceClient();
    // Only verified buyers with a delivered order containing this product may review.
    const { data: bought } = await svc.from('order_items').select('id, order:orders!inner(user_id, status)').eq('product_id', r.productId).eq('order.user_id', user.id).eq('order.status', 'delivered').limit(1);
    if (!bought?.length) throw userError('You can review products from your delivered orders.');
    const { data: profile } = await svc.from('profiles').select('full_name').eq('id', user.id).single();
    const { error } = await svc.from('reviews').upsert(
      { product_id: r.productId, user_id: user.id, reviewer_name: (profile?.full_name ?? 'Customer').split(' ')[0], rating: r.rating, title: r.title || null, body: r.body || null, is_approved: false },
      { onConflict: 'product_id,user_id' },
    );
    if (error) throw new Error(error.message);
  }, 'Thank you! Your review will appear after moderation.'),
);

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.string().trim().max(20).optional().default(''),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional().default(''),
  topic: z.enum(['order', 'product', 'custom', 'bulk', 'other']),
  message: z.string().trim().min(10, 'Please write a little more').max(2000),
  website: z.string().optional().default(''), // honeypot
});

customerRouter.post(
  '/contact',
  route(async (req) => {
    if (!isSupabaseConfigured()) throw new HttpError(503, 'Messaging is not configured yet. Please call or email us.');
    const d = contactSchema.parse(req.body);
    if (d.website) return; // bot
    const phone = d.phone ? normalizeIndianPhone(d.phone) : null;
    if (d.phone && !phone) throw userError('Enter a valid mobile number or leave it blank.');
    if (!phone && !d.email) throw userError('Please share a mobile number or email so we can reply.');
    const limit = await rateLimit('contact', clientIp(req), 5, 3600);
    if (!limit.allowed) throw new HttpError(429, 'Too many messages. Please try again later.');
    await notifyAdmins(`Contact form: ${d.topic}`, `${d.name}${phone ? ` · ${phone}` : ''}${d.email ? ` · ${d.email}` : ''}\n\n${d.message}`, '/admin/dashboard');
  }, 'Thank you! We will get back to you within one working day.'),
);

// ---------- Account (all reads use the user's RLS-scoped client) -------------------------
customerRouter.get(
  '/account/summary',
  route(async (req, res) => {
    await requireUser(req, res);
    const db = userClient(req, res);
    const [{ data: orders }, { data: requests }, { data: notes }] = await Promise.all([
      db.from('orders').select('id, order_number, status, total_paise, created_at, payment_method').neq('status', 'pending_payment').order('created_at', { ascending: false }).limit(5),
      db.from('custom_service_requests').select('id, request_number, ingredient_name, status, created_at').order('created_at', { ascending: false }).limit(5),
      db.from('notifications').select('id, title, body, link, created_at').eq('audience', 'customer').order('created_at', { ascending: false }).limit(6),
    ]);
    return { orders: orders ?? [], requests: requests ?? [], notifications: notes ?? [] };
  }),
);

customerRouter.get(
  '/account/orders',
  route(async (req, res) => {
    await requireUser(req, res);
    const { data } = await userClient(req, res).from('orders').select('id, order_number, status, total_paise, created_at, payment_method, order_items(product_name, variant_label, quantity)').order('created_at', { ascending: false }).limit(100);
    return data ?? [];
  }),
);

customerRouter.get(
  '/account/orders/:id',
  route(async (req, res) => {
    await requireUser(req, res);
    const id = param(req, 'id');
    const db = userClient(req, res);
    const [{ data: order }, { data: items }, { data: events }, { data: shipping }] = await Promise.all([
      db.from('orders').select('*').eq('id', id).maybeSingle(),
      db.from('order_items').select('*').eq('order_id', id),
      db.from('order_status_events').select('status, note, created_at').eq('order_id', id).order('created_at'),
      db.from('shipping_details').select('*').eq('order_id', id).maybeSingle(),
    ]);
    if (!order) throw new HttpError(404, 'Order not found.'); // RLS: customers only ever see their own orders
    return { order, items: items ?? [], events: events ?? [], shipping };
  }),
);

customerRouter.get(
  '/account/requests',
  route(async (req, res) => {
    await requireUser(req, res);
    const { data } = await userClient(req, res).from('custom_service_requests').select('*').order('created_at', { ascending: false });
    return data ?? [];
  }),
);

customerRouter.get(
  '/account/requests/:id',
  route(async (req, res) => {
    await requireUser(req, res);
    const id = param(req, 'id');
    const db = userClient(req, res);
    const { data: request } = await db.from('custom_service_requests').select('*').eq('id', id).maybeSingle();
    if (!request) throw new HttpError(404, 'Request not found.');
    const [{ data: quotations }, { data: stages }, photos] = await Promise.all([
      db.from('quotations').select('*').eq('request_id', id).order('created_at', { ascending: false }),
      db.from('processing_stages').select('status, note, created_at').eq('request_id', id).order('created_at'),
      signedUrls('custom-request-photos', request.photo_paths ?? []),
    ]);
    return { request, quotations: quotations ?? [], stages: stages ?? [], photos };
  }),
);

customerRouter.get(
  '/account/quotations',
  route(async (req, res) => {
    await requireUser(req, res);
    const { data } = await userClient(req, res).from('quotations').select('*, request:custom_service_requests(id, request_number, ingredient_name)').order('created_at', { ascending: false });
    return data ?? [];
  }),
);

customerRouter.get(
  '/account/payments',
  route(async (req, res) => {
    await requireUser(req, res);
    const { data } = await userClient(req, res)
      .from('payments')
      .select('id, purpose, method, status, amount_paise, razorpay_payment_id, created_at, order:orders(order_number), quotation:quotations(request:custom_service_requests(request_number))')
      .order('created_at', { ascending: false })
      .limit(100);
    return data ?? [];
  }),
);

customerRouter.get(
  '/account/wishlist',
  route(async (req, res) => {
    await requireUser(req, res);
    const { data } = await userClient(req, res).from('wishlists').select('product:products(*, product_variants(*))').order('created_at', { ascending: false });
    return (data ?? [])
      .map((r) => r.product as unknown as { status: string; product_variants: { is_active: boolean; weight_grams: number }[] } | null)
      .filter((p) => p && p.status === 'active')
      .map((p) => ({ ...p!, product_variants: p!.product_variants.filter((v) => v.is_active).sort((a, b) => a.weight_grams - b.weight_grams) }));
  }),
);

customerRouter.get(
  '/account/orders/:id/summary',
  route(async (req, res) => {
    // Lightweight order status for the payment result pages.
    await requireUser(req, res);
    const { data } = await userClient(req, res).from('orders').select('id, order_number, status, total_paise').eq('id', param(req, 'id')).maybeSingle();
    if (!data) throw new HttpError(404, 'Order not found.');
    return data;
  }),
);
