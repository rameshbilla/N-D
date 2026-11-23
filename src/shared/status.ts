import type { CustomRequestStatus, OrderStatus, ProcessingType } from './types';

export const ORDER_TIMELINE: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Order Placed' },
  { status: 'payment_confirmed', label: 'Payment Confirmed' },
  { status: 'processing', label: 'Processing' },
  { status: 'packed', label: 'Packed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'out_for_delivery', label: 'Out for Delivery' },
  { status: 'delivered', label: 'Delivered' },
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting Payment',
  placed: 'Order Placed',
  payment_confirmed: 'Payment Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  payment_failed: 'Payment Failed',
  payment_review: 'Under Review',
};

/** Statuses an admin may move an order to (from the order detail screen). */
export const ADMIN_ORDER_STATUSES: OrderStatus[] = [
  'placed', 'payment_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled',
];

export function orderTimelineIndex(status: OrderStatus, paymentMethod: 'razorpay' | 'cod'): number {
  const idx = ORDER_TIMELINE.findIndex((s) => s.status === status);
  if (idx >= 0) return idx;
  if (status === 'payment_review') return 1;
  return paymentMethod === 'cod' ? 0 : -1;
}

export const REQUEST_TIMELINE: { status: CustomRequestStatus; label: string }[] = [
  { status: 'request_received', label: 'Request Received' },
  { status: 'under_review', label: 'Under Review' },
  { status: 'quotation_sent', label: 'Quotation Sent' },
  { status: 'payment_pending', label: 'Payment Pending' },
  { status: 'payment_completed', label: 'Payment Completed' },
  { status: 'raw_material_received', label: 'Raw Material Received' },
  { status: 'processing_started', label: 'Processing Started' },
  { status: 'dehydration_completed', label: 'Dehydration Completed' },
  { status: 'powder_completed', label: 'Powder Preparation Completed' },
  { status: 'packaging_completed', label: 'Packaging Completed' },
  { status: 'ready_for_dispatch', label: 'Ready for Dispatch' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
];

export const REQUEST_STATUS_LABEL: Record<CustomRequestStatus, string> = {
  ...(Object.fromEntries(REQUEST_TIMELINE.map((s) => [s.status, s.label])) as Record<CustomRequestStatus, string>),
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const PROCESSING_LABEL: Record<ProcessingType, string> = {
  dehydration_only: 'Dehydration Only',
  dehydration_powder: 'Dehydration + Powder Making',
  grinding_only: 'Grinding Only',
};

export const INGREDIENT_CATEGORIES = [
  { value: 'fruit', label: 'Fruit' },
  { value: 'vegetable', label: 'Vegetable' },
  { value: 'leaf_herb', label: 'Leaf / Herb' },
  { value: 'spice', label: 'Spice' },
  { value: 'grain', label: 'Grain / Pulse' },
  { value: 'other', label: 'Other' },
] as const;

export const LOGISTICS_LABEL = {
  customer_dropoff: 'I will drop off the raw material',
  pickup_requested: 'Please pick up from my address',
  courier: 'I will send it by courier',
} as const;
