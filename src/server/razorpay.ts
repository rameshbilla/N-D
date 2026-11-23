import { createHmac, timingSafeEqual } from 'node:crypto';
import { config as serverConfig, isRazorpayConfigured } from './config';

const API = 'https://api.razorpay.com/v1';

function authHeader() {
  const { keyId, keySecret } = serverConfig.razorpay;
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret = serverConfig.razorpay.keySecret): boolean {
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw_body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = serverConfig.razorpay.webhookSecret): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) throw new Error('Online payments are not configured.');
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Razorpay order create failed', res.status, body.slice(0, 300));
    throw new Error('Could not start the payment. Please try again.');
  }
  return res.json();
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string;
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Razorpay payment lookup failed (${res.status})`);
  return res.json();
}

/** Captures an authorized payment (needed only if auto-capture is disabled on the account). */
export async function captureRazorpayPayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR' }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Razorpay capture failed (${res.status})`);
  return res.json();
}
