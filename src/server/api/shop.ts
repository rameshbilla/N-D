import { Router } from 'express';
import { z } from 'zod';
import { formatINR } from '../../shared/money';
import { normalizeIndianPhone } from '../../shared/phone';
import type { PaymentMethod } from '../../shared/types';
import { getUser, requireUser } from '../auth';
import { priceCartFromDb } from '../cart-pricing';
import { config, isRazorpayConfigured, isSupabaseConfigured } from '../config';
import { HttpError, must, param, route, userError } from '../http';
import { notifyAdmins, notifyCustomer } from '../notify';
import { finalizeRazorpayPayment } from '../payments';
import { createRazorpayOrder, verifyPaymentSignature } from '../razorpay';
import { rateLimit } from '../rate-limit';
import { getSettings } from '../settings';
import { anonClient, serviceClient, userClient, type Db } from '../supabase';

export const shopRouter = Router();

const itemsSchema = z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(50) })).max(60);
type Items = z.infer<typeof itemsSchema>;

// ---------- Cart (guest-friendly pricing) --------------------------------------
shopRouter.post(
  '/cart/quote',
  route(async (req, res) => {
    if (!isSupabaseConfigured()) throw new HttpError(503, 'Store database is not configured.');
    const items = itemsSchema.parse(req.body?.items ?? []);
    const user = await getUser(req, res);
    const method = z.enum(['razorpay', 'cod']).nullable().optional().parse(req.body?.paymentMethod ?? null);
    return priceCartFromDb({ items, couponCode: typeof req.body?.couponCode === 'string' ? req.body.couponCode : null, paymentMethod: method ?? null, userId: user?.id ?? null });
  }),
);

shopRouter.post(
  '/cart/variant-options',
  route(async (req) => {
    const ids = z.array(z.uuid()).max(60).parse(req.body?.productIds ?? []);
    if (!ids.length || !isSupabaseConfigured()) return {};
    const { data } = await anonClient().from('product_variants').select('id, product_id, label, stock, weight_grams').in('product_id', ids).eq('is_active', true).order('weight_grams');
    const out: Record<string, { id: string; label: string; stock: number }[]> = {};
    for (const v of data ?? []) (out[v.product_id] ??= []).push({ id: v.id, label: v.label, stock: v.stock });
    return out;
  }),
);

async function ensureCart(db: Db, userId: string) {
  const { data: existing } = await db.from('carts').select('id, coupon_code').eq('user_id', userId).maybeSingle();
  if (existing) return existing;
  return must(await db.from('carts').insert({ user_id: userId }).select('id, coupon_code').single());
}
async function persistCart(db: Db, cartId: string, items: Items, couponCode: string | null) {
  await db.from('cart_items').delete().eq('cart_id', cartId);
  if (items.length) {
    const rows = items.map((i) => ({ cart_id: cartId, variant_id: i.variantId, quantity: i.quantity }));
    const { error } = await db.from('cart_items').insert(rows);
    // A deleted variant fails the FK for the whole batch — fall back to row-by-row and skip it.
    if (error) for (const row of rows) await db.from('cart_items').insert(row);
  }
  await db.from('carts').update({ coupon_code: couponCode, updated_at: new Date().toISOString() }).eq('id', cartId);
}

/** After login: merge the guest cart into the account cart (larger quantity wins; never doubles). */
shopRouter.post(
  '/cart/sync',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const items = itemsSchema.parse(req.body?.items ?? []);
    const db = userClient(req, res);
    const cart = await ensureCart(db, user.id);
    const { data: rows } = await db.from('cart_items').select('variant_id, quantity').eq('cart_id', cart.id);
    const merged = new Map<string, number>((rows ?? []).map((r) => [r.variant_id, r.quantity]));
    for (const it of items) merged.set(it.variantId, Math.min(50, Math.max(merged.get(it.variantId) ?? 0, it.quantity)));
    const out = [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
    const couponCode = (typeof req.body?.couponCode === 'string' && req.body.couponCode) || cart.coupon_code || null;
    await persistCart(db, cart.id, out, couponCode);
    return { items: out, couponCode };
  }),
);

shopRouter.put(
  '/cart',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const items = itemsSchema.parse(req.body?.items ?? []);
    const db = userClient(req, res);
    const cart = await ensureCart(db, user.id);
    await persistCart(db, cart.id, items, typeof req.body?.couponCode === 'string' ? req.body.couponCode : null);
  }),
);

shopRouter.post(
  '/wishlist/sync',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const ids = z.array(z.uuid()).max(200).parse(req.body?.ids ?? []);
    const db = userClient(req, res);
    if (ids.length) await db.from('wishlists').upsert(ids.map((product_id) => ({ user_id: user.id, product_id })), { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    const { data } = await db.from('wishlists').select('product_id').eq('user_id', user.id);
    return { ids: (data ?? []).map((r) => r.product_id) };
  }),
);

shopRouter.put(
  '/wishlist/:productId',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const productId = param(req, 'productId');
    const db = userClient(req, res);
    if (req.body?.on) await db.from('wishlists').upsert({ user_id: user.id, product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    else await db.from('wishlists').delete().eq('user_id', user.id).eq('product_id', productId);
  }),
);

// ---------- Addresses ----------------------------------------------------------------
const addressSchema = z.object({
  id: z.uuid().optional(),
  full_name: z.string().trim().min(2, 'Enter the recipient name').max(120),
  phone: z.string().transform((v, ctx) => {
    const p = normalizeIndianPhone(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
    return p ?? '';
  }),
  line1: z.string().trim().min(3, 'Enter house / street').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  landmark: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2, 'Enter city').max(80),
  state: z.string().trim().min(2, 'Select state').max(80),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  is_default: z.boolean().optional().default(false),
});

shopRouter.get(
  '/addresses',
  route(async (req, res) => {
    await requireUser(req, res);
    const { data } = await userClient(req, res).from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false });
    return data ?? [];
  }),
);

shopRouter.post(
  '/addresses',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) throw userError('Please check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    const db = userClient(req, res);
    const { id, ...row } = parsed.data;
    const record = { ...row, line2: row.line2 || null, landmark: row.landmark || null, user_id: user.id };
    if (record.is_default) await db.from('addresses').update({ is_default: false }).eq('user_id', user.id);
    const saved = id
      ? must(await db.from('addresses').update(record).eq('id', id).eq('user_id', user.id).select('id').single())
      : must(await db.from('addresses').insert(record).select('id').single());
    return { id: saved.id as string };
  }, 'Address saved.'),
);

shopRouter.delete(
  '/addresses/:id',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    await userClient(req, res).from('addresses').delete().eq('id', param(req, 'id')).eq('user_id', user.id);
  }),
);

// ---------- Checkout ---------------------------------------------------------------------
const placeSchema = z.object({
  items: itemsSchema.min(1),
  couponCode: z.string().trim().max(30).nullable().optional(),
  paymentMethod: z.enum(['razorpay', 'cod']),
  addressId: z.uuid(),
  note: z.string().trim().max(500).optional(),
});

shopRouter.get(
  '/checkout/options',
  route(async () => {
    const { commerce } = await getSettings();
    return { onlineEnabled: isRazorpayConfigured(), codEnabled: commerce.cod_enabled, codMax: commerce.cod_max_order_paise };
  }),
);

shopRouter.post(
  '/checkout/place',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const { items, couponCode, paymentMethod, addressId, note } = placeSchema.parse(req.body);
    const limit = await rateLimit('place-order', user.id, 12, 600);
    if (!limit.allowed) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');

    const svc = serviceClient();
    const [{ data: profile }, { data: address }, { commerce }] = await Promise.all([
      svc.from('profiles').select('full_name, email, phone, is_blocked').eq('id', user.id).single(),
      userClient(req, res).from('addresses').select('*').eq('id', addressId).eq('user_id', user.id).maybeSingle(),
      getSettings(),
    ]);
    if (!profile || profile.is_blocked) throw new HttpError(403, 'Your account cannot place orders. Please contact support.');
    if (!address) throw userError('Please select a delivery address.');

    // Server-side recalculation — prices, discounts, stock, tax and delivery. Browser totals are ignored.
    const priced = await priceCartFromDb({ items, couponCode, paymentMethod, userId: user.id });
    const blocking = priced.issues.filter((i) => i.kind !== 'quantity_limited');
    if (blocking.length) return { ok: false as const, error: 'Some items in your cart have changed. Please review your cart.', issues: blocking };
    if (!priced.lines.length) throw userError('Your cart is empty.');
    if (couponCode && priced.coupon && !priced.coupon.applied) throw userError(priced.coupon.message);
    if (paymentMethod === 'cod') {
      if (!commerce.cod_enabled) throw userError('Cash on delivery is not available.');
      if (priced.total > commerce.cod_max_order_paise) throw userError(`Cash on delivery is available for orders up to ${formatINR(commerce.cod_max_order_paise)}.`);
    } else if (!isRazorpayConfigured()) {
      throw userError('Online payment is not configured yet. Please choose another payment method.');
    }

    const { id: _i, user_id: _u, is_default: _d, created_at: _c, updated_at: _up, ...shipping } = address;
    const order = must(
      await svc
        .from('orders')
        .insert({
          user_id: user.id, status: 'pending_payment', payment_method: paymentMethod as PaymentMethod,
          subtotal_mrp_paise: priced.subtotalMrp, item_discount_paise: priced.itemDiscount, coupon_discount_paise: priced.couponDiscount,
          delivery_fee_paise: priced.deliveryFee, cod_fee_paise: priced.codFee, tax_paise: priced.tax, tax_inclusive: priced.taxIncluded, total_paise: priced.total,
          coupon_code: priced.coupon?.applied ? priced.coupon.code : null, coupon_promotion_id: priced.coupon?.applied ? priced.coupon.promotionId : null,
          discount_snapshot: priced.appliedOffers.map((o) => ({ promotion_id: o.promotionId, label: o.label, amount_paise: o.amount, kind: o.kind })),
          shipping_address: shipping, customer_note: note || null,
        })
        .select('id, order_number')
        .single(),
    );
    const { error: itemsErr } = await svc.from('order_items').insert(
      priced.lines.map((l) => ({
        order_id: order.id, product_id: l.productId, variant_id: l.variantId, product_name: l.productName, variant_label: l.variantLabel, sku: l.sku,
        unit_mrp_paise: l.unitMrp, unit_price_paise: l.unitPrice, quantity: l.quantity, line_discount_paise: l.lineDiscount,
        coupon_share_paise: l.couponShare, line_total_paise: l.lineTotal, discount_label: l.discountLabel, image_url: l.imageUrl,
      })),
    );
    if (itemsErr) {
      await svc.from('orders').delete().eq('id', order.id);
      throw new Error(itemsErr.message);
    }

    if (paymentMethod === 'cod') {
      const { error } = await svc.rpc('confirm_cod_order', { p_order_id: order.id });
      if (error) {
        await svc.from('orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', order.id);
        throw userError(/INSUFFICIENT_STOCK/.test(error.message) ? 'An item just went out of stock. Please review your cart.' : 'Could not confirm your order.');
      }
      await notifyCustomer(user.id, `Order ${order.order_number} placed`, `Thank you! Please keep ${formatINR(priced.total)} ready on delivery.`, `/account/orders/${order.id}`);
      await notifyAdmins(`New COD order ${order.order_number}`, `Amount ${formatINR(priced.total)}`, `/admin/orders/${order.id}`);
      return { ok: true as const, kind: 'cod' as const, orderId: order.id, orderNumber: order.order_number };
    }

    try {
      const rzp = await createRazorpayOrder(priced.total, order.order_number, { order_id: order.id, purpose: 'order' });
      await svc.from('payments').insert({ user_id: user.id, purpose: 'order', order_id: order.id, method: 'razorpay', status: 'created', amount_paise: priced.total, razorpay_order_id: rzp.id });
      return {
        ok: true as const, kind: 'razorpay' as const, orderId: order.id, orderNumber: order.order_number,
        checkout: { key: config.razorpay.keyId, razorpayOrderId: rzp.id, amount: priced.total, name: profile.full_name ?? '', contact: profile.phone ?? '', email: profile.email ?? '' },
      };
    } catch (e) {
      await svc.from('orders').update({ status: 'payment_failed' }).eq('id', order.id);
      throw userError((e as Error).message);
    }
  }),
);

const verifySchema = z.object({
  razorpay_order_id: z.string().min(5).max(60),
  razorpay_payment_id: z.string().min(5).max(60),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Called by the browser after Razorpay Checkout succeeds. Trusts nothing from the browser except the IDs + signature. */
shopRouter.post(
  '/payments/verify',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const p = verifySchema.parse(req.body);
    if (!verifyPaymentSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)) {
      throw userError('Payment verification failed. If money was deducted it will be refunded automatically.');
    }
    const { data: pay } = await serviceClient().from('payments').select('user_id').eq('razorpay_order_id', p.razorpay_order_id).maybeSingle();
    if (!pay || pay.user_id !== user.id) throw new HttpError(404, 'Payment not found.');
    try {
      const result = await finalizeRazorpayPayment(p.razorpay_order_id, p.razorpay_payment_id);
      return { purpose: result.purpose, id: result.id };
    } catch (e) {
      console.error('verifyPayment', (e as Error).message);
      throw new HttpError(502, 'We could not confirm the payment yet. If money was deducted, your order will update automatically within a few minutes.');
    }
  }),
);

shopRouter.post(
  '/payments/failure',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const razorpayOrderId = z.string().min(5).max(60).parse(req.body?.razorpayOrderId);
    const svc = serviceClient();
    const { data: pay } = await svc.from('payments').select('user_id').eq('razorpay_order_id', razorpayOrderId).maybeSingle();
    if (!pay || pay.user_id !== user.id) throw new HttpError(404, 'Not found');
    await svc.rpc('mark_razorpay_payment_failed', { p_razorpay_order_id: razorpayOrderId, p_reason: String(req.body?.reason ?? 'Payment cancelled or failed').slice(0, 300) });
  }),
);

/** New Razorpay attempt for an unpaid order (prices stay locked to the order snapshot). */
shopRouter.post(
  '/orders/:id/retry-payment',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    if (!isRazorpayConfigured()) throw userError('Online payment is not configured.');
    const svc = serviceClient();
    const { data: order } = await svc.from('orders').select('id, order_number, user_id, status, total_paise, payment_method').eq('id', param(req, 'id')).maybeSingle();
    if (!order || order.user_id !== user.id) throw new HttpError(404, 'Order not found.');
    if (!['pending_payment', 'payment_failed'].includes(order.status) || order.payment_method !== 'razorpay') throw userError('This order does not need payment.');
    const { data: profile } = await svc.from('profiles').select('full_name, email, phone').eq('id', user.id).single();
    const rzp = await createRazorpayOrder(order.total_paise, `${order.order_number}-R${Date.now() % 10000}`, { order_id: order.id, purpose: 'order' });
    await svc.from('payments').insert({ user_id: user.id, purpose: 'order', order_id: order.id, method: 'razorpay', status: 'created', amount_paise: order.total_paise, razorpay_order_id: rzp.id });
    await svc.from('orders').update({ status: 'pending_payment' }).eq('id', order.id);
    return {
      ok: true as const, kind: 'razorpay' as const, orderId: order.id, orderNumber: order.order_number,
      checkout: { key: config.razorpay.keyId, razorpayOrderId: rzp.id, amount: order.total_paise, name: profile?.full_name ?? '', contact: profile?.phone ?? '', email: profile?.email ?? '' },
    };
  }),
);
