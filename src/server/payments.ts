import { formatINR } from '../shared/money';
import { captureRazorpayPayment, fetchRazorpayPayment } from './razorpay';
import { notifyAdmins, notifyCustomer } from './notify';
import { serviceClient as createServiceClient } from './supabase';

export interface FinalizeResult {
  purpose: 'order' | 'quotation';
  id: string;
  status: string;
  already: boolean;
}

/**
 * Confirms a Razorpay payment after its authenticity has been verified (checkout signature
 * or webhook signature). Re-fetches the payment from Razorpay so the amount and state are
 * taken from the gateway — never from the browser. Idempotent.
 */
export async function finalizeRazorpayPayment(razorpayOrderId: string, razorpayPaymentId: string): Promise<FinalizeResult> {
  const svc = createServiceClient();
  const { data: pay } = await svc
    .from('payments')
    .select('id, user_id, amount_paise, status, purpose, order_id, quotation_id')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();
  if (!pay) throw new Error('PAYMENT_NOT_FOUND');
  if (pay.status === 'captured') {
    return { purpose: pay.purpose, id: pay.order_id ?? pay.quotation_id, status: 'already', already: true };
  }

  let gateway = await fetchRazorpayPayment(razorpayPaymentId);
  if (gateway.order_id !== razorpayOrderId) throw new Error('ORDER_MISMATCH');
  if (gateway.status === 'authorized') gateway = await captureRazorpayPayment(razorpayPaymentId, gateway.amount);
  if (gateway.status !== 'captured') throw new Error(`PAYMENT_NOT_CAPTURED:${gateway.status}`);
  if (gateway.amount !== pay.amount_paise || gateway.currency !== 'INR') throw new Error('AMOUNT_MISMATCH');

  const { data, error } = await svc.rpc('confirm_razorpay_payment', {
    p_razorpay_order_id: razorpayOrderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_paise: gateway.amount,
    p_raw: { id: gateway.id, method: gateway.method, status: gateway.status },
  });
  if (error) throw new Error(error.message);
  const result = data as FinalizeResult;

  if (!result.already) {
    if (result.purpose === 'order') {
      const { data: order } = await svc.from('orders').select('order_number, total_paise, status').eq('id', result.id).single();
      await notifyCustomer(pay.user_id, `Order ${order?.order_number} confirmed`, `We have received your payment of ${formatINR(order?.total_paise)}. We will notify you when it ships.`, `/account/orders/${result.id}`);
      await notifyAdmins(
        order?.status === 'payment_review' ? `Paid order ${order?.order_number} needs review` : `New paid order ${order?.order_number}`,
        order?.status === 'payment_review' ? 'Payment captured but stock was insufficient. Fulfil or refund.' : `Amount ${formatINR(order?.total_paise)}`,
        `/admin/orders/${result.id}`,
      );
    } else {
      await notifyCustomer(pay.user_id, 'Quotation payment received', 'Thank you! Your custom processing request will now be scheduled.', '/account/requests');
      await notifyAdmins('Quotation paid', `A customer paid ${formatINR(pay.amount_paise)} for a custom processing quotation.`, '/admin/custom-requests');
    }
  }
  return result;
}
