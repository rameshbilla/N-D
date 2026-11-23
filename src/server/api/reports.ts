import type { Request, Response } from 'express';
import { requireStaff } from '../auth';
import { userClient } from '../supabase';

/** CSV exports (open directly in Excel / Google Sheets). Admin role required. */
const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const rupees = (p: number | null | undefined) => ((p ?? 0) / 100).toFixed(2);
const ist = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');

export async function reportsCsv(req: Request, res: Response) {
  try {
    await requireStaff(req, res, 'admin');
  } catch {
    return void res.status(403).json({ error: 'Forbidden' });
  }
  const url = new URL(req.originalUrl, 'http://local');
  const type = url.searchParams.get('type') ?? 'orders';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const db = userClient(req, res);
  let header: string[] = [];
  let rows: unknown[][] = [];

  const range = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T) => {
    let r = q;
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) r = r.gte('created_at', `${from}T00:00:00+05:30`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) r = r.lte('created_at', `${to}T23:59:59+05:30`);
    return r;
  };

  if (type === 'orders') {
    const { data } = await range(db.from('orders').select('order_number, created_at, status, payment_method, subtotal_mrp_paise, item_discount_paise, coupon_discount_paise, coupon_code, delivery_fee_paise, cod_fee_paise, tax_paise, total_paise, shipping_address').order('created_at', { ascending: false }).limit(20000));
    header = ['Order', 'Date (IST)', 'Status', 'Payment', 'Subtotal MRP', 'Item discounts', 'Coupon discount', 'Coupon', 'Delivery', 'COD fee', 'GST', 'Total', 'Customer', 'City', 'State', 'PIN'];
    rows = (data ?? []).map((o) => {
      const a = o.shipping_address as { full_name: string; city: string; state: string; pincode: string };
      return [o.order_number, ist(o.created_at), o.status, o.payment_method, rupees(o.subtotal_mrp_paise), rupees(o.item_discount_paise), rupees(o.coupon_discount_paise), o.coupon_code, rupees(o.delivery_fee_paise), rupees(o.cod_fee_paise), rupees(o.tax_paise), rupees(o.total_paise), a?.full_name, a?.city, a?.state, a?.pincode];
    });
  } else if (type === 'products') {
    const { data } = await range(db.from('order_items').select('product_name, variant_label, quantity, line_total_paise, order:orders!inner(status, created_at)').in('order.status', ['placed', 'payment_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered']).limit(50000) as never);
    const agg = new Map<string, { qty: number; revenue: number }>();
    for (const r of (data ?? []) as { product_name: string; variant_label: string; quantity: number; line_total_paise: number }[]) {
      const k = `${r.product_name}|${r.variant_label}`;
      const a = agg.get(k) ?? { qty: 0, revenue: 0 };
      a.qty += r.quantity;
      a.revenue += r.line_total_paise;
      agg.set(k, a);
    }
    header = ['Product', 'Pack', 'Units sold', 'Revenue'];
    rows = [...agg].sort((a, b) => b[1].revenue - a[1].revenue).map(([k, v]) => [...k.split('|'), v.qty, rupees(v.revenue)]);
  } else if (type === 'payments') {
    const { data } = await range(db.from('payments').select('created_at, purpose, method, status, amount_paise, razorpay_order_id, razorpay_payment_id, failure_reason').order('created_at', { ascending: false }).limit(20000));
    header = ['Date (IST)', 'Purpose', 'Method', 'Status', 'Amount', 'Razorpay order', 'Razorpay payment', 'Failure reason'];
    rows = (data ?? []).map((p) => [ist(p.created_at), p.purpose, p.method, p.status, rupees(p.amount_paise), p.razorpay_order_id, p.razorpay_payment_id, p.failure_reason]);
  } else if (type === 'customers') {
    const { data } = await range(db.from('profiles').select('full_name, phone, email, created_at, is_blocked').order('created_at', { ascending: false }).limit(50000));
    header = ['Name', 'Mobile', 'Email', 'Joined (IST)', 'Blocked'];
    rows = (data ?? []).map((c) => [c.full_name, c.phone, c.email, ist(c.created_at), c.is_blocked ? 'yes' : 'no']);
  } else if (type === 'inventory') {
    const { data } = await db.from('product_variants').select('label, sku, price_paise, sale_price_paise, stock, is_active, product:products(name, status)').limit(5000);
    header = ['Product', 'Pack', 'SKU', 'Price', 'Sale price', 'Stock', 'Active'];
    rows = (data ?? []).map((v) => [(v.product as unknown as { name: string } | null)?.name, v.label, v.sku, rupees(v.price_paise), v.sale_price_paise ? rupees(v.sale_price_paise) : '', v.stock, v.is_active ? 'yes' : 'no']);
  } else if (type === 'custom') {
    const { data } = await range(db.from('custom_service_requests').select('request_number, created_at, customer_name, phone, ingredient_name, quantity, quantity_unit, processing_type, status, estimated_total_paise').order('created_at', { ascending: false }).limit(20000));
    header = ['Request', 'Date (IST)', 'Customer', 'Mobile', 'Ingredient', 'Quantity', 'Unit', 'Processing', 'Status', 'Estimate'];
    rows = (data ?? []).map((r) => [r.request_number, ist(r.created_at), r.customer_name, r.phone, r.ingredient_name, r.quantity, r.quantity_unit, r.processing_type, r.status, r.estimated_total_paise ? rupees(r.estimated_total_paise) : '']);
  } else {
    return void res.status(400).json({ error: 'Unknown report' });
  }

  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nd-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
  });
  res.send(csv);
}
