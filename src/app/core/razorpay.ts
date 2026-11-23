
/* Thin wrapper around Razorpay Standard Checkout (https://checkout.razorpay.com/v1/checkout.js).
   The browser only collects payment; confirmation happens server-side after signature verification. */

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (resp: { error: { description?: string; reason?: string } }) => void) => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return loader;
}

export type CheckoutOutcome = { kind: 'success'; response: RazorpaySuccess } | { kind: 'failed'; reason: string } | { kind: 'dismissed' };

export async function openRazorpay(opts: {
  key: string;
  razorpayOrderId: string;
  amount: number;
  description: string;
  prefill: { name: string; contact: string; email: string };
}): Promise<CheckoutOutcome> {
  await loadRazorpay();
  return new Promise((resolve) => {
    let settled = false;
    const done = (o: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    const rzp = new window.Razorpay!({
      key: opts.key,
      order_id: opts.razorpayOrderId,
      amount: opts.amount,
      currency: 'INR',
      name: 'N&D Nature Healthy Food',
      description: opts.description,
      prefill: opts.prefill,
      theme: { color: '#126B35' },
      handler: (response: RazorpaySuccess) => done({ kind: 'success', response }),
      modal: { ondismiss: () => done({ kind: 'dismissed' }), confirm_close: true },
    });
    rzp.on('payment.failed', (resp) => done({ kind: 'failed', reason: resp.error?.description || resp.error?.reason || 'Payment failed' }));
    rzp.open();
  });
}
