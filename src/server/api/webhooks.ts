import type { Request, Response } from 'express';
import { finalizeRazorpayPayment } from '../payments';
import { verifyWebhookSignature } from '../razorpay';
import { serviceClient } from '../supabase';

/**
 * Razorpay webhook (Dashboard → Webhooks → events: payment.captured, payment.failed, order.paid).
 * Mounted with express.raw() so the signature is checked against the exact raw body.
 * Guarantees orders are confirmed even if the customer closes the browser after paying.
 */
export async function razorpayWebhook(req: Request, res: Response) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifyWebhookSignature(raw, String(req.headers['x-razorpay-signature'] ?? ''))) {
    return void res.status(401).json({ error: 'invalid signature' });
  }
  let event: { event: string; payload: { payment?: { entity: { id: string; order_id: string; error_description?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return void res.status(400).json({ error: 'bad payload' });
  }
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return void res.json({ ok: true, ignored: true });
  try {
    if (['payment.captured', 'order.paid', 'payment.authorized'].includes(event.event)) {
      await finalizeRazorpayPayment(payment.order_id, payment.id);
    } else if (event.event === 'payment.failed') {
      await serviceClient().rpc('mark_razorpay_payment_failed', { p_razorpay_order_id: payment.order_id, p_reason: payment.error_description ?? 'Payment failed' });
    }
  } catch (e) {
    const msg = (e as Error).message;
    // Unknown orders (e.g. from another integration) are acknowledged so Razorpay stops retrying.
    if (msg === 'PAYMENT_NOT_FOUND') return void res.json({ ok: true, ignored: true });
    console.error('razorpay webhook', event.event, msg);
    return void res.status(500).json({ error: 'processing failed' });
  }
  res.json({ ok: true });
}
