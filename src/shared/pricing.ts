/**
 * Pricing engine — a pure function shared by the cart preview and the checkout server.
 * The server ALWAYS re-runs it with fresh database rows before creating an order.
 *
 * Rules (no invalid stacking):
 *  1. Each line gets exactly ONE item-level discount: the best of
 *     sale price · product discount % · any eligible automatic offer.
 *  2. A coupon is applied afterwards on the discounted subtotal. Unless the coupon's
 *     promotion is marked "combinable", it only applies to lines without another discount.
 *  3. Only one coupon per order.
 *  4. Delivery fee is waived above the free-delivery threshold. COD fee applies to COD orders.
 *  5. All maths is in integer paise.
 */
import type { CommerceSettings, OfferRule, PaymentMethod } from './types';

export interface PricingProduct {
  id: string;
  name: string;
  category_id: string | null;
  discount_percent: number;
  status: string;
  image_url?: string | null;
  slug?: string;
  accent_color?: string;
}

export interface PricingVariant {
  id: string;
  product_id: string;
  label: string;
  sku: string | null;
  price_paise: number;
  sale_price_paise: number | null;
  stock: number;
  is_active: boolean;
}

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface CouponInput {
  code: string;
  rule: OfferRule | null; // null = code not found
  userRedemptions: number;
}

export interface PricedLine {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  imageUrl: string | null;
  productSlug: string;
  accentColor: string;
  quantity: number;
  stock: number;
  unitMrp: number;
  unitPrice: number; // after item-level discount (before coupon)
  lineMrp: number;
  lineDiscount: number;
  discountLabel: string | null;
  discountPromotionId: string | null;
  couponShare: number;
  lineTotal: number; // lineMrp - lineDiscount - couponShare
}

export interface CartIssue {
  variantId: string;
  kind: 'unavailable' | 'insufficient_stock' | 'quantity_limited';
  message: string;
  available?: number;
}

export interface PricedCart {
  lines: PricedLine[];
  issues: CartIssue[];
  subtotalMrp: number;
  itemDiscount: number;
  subtotal: number; // after item discounts
  coupon: { code: string; applied: boolean; discount: number; message: string; promotionId: string | null } | null;
  couponDiscount: number;
  deliveryFee: number;
  codFee: number;
  taxRatePercent: number;
  taxIncluded: boolean;
  tax: number;
  total: number;
  freeDeliveryRemaining: number;
  appliedOffers: { promotionId: string | null; label: string; amount: number; kind: 'sale' | 'offer' | 'coupon' }[];
  itemCount: number;
}

export interface PriceCartInput {
  items: CartLineInput[];
  variants: Map<string, PricingVariant>;
  products: Map<string, PricingProduct>;
  offers: OfferRule[]; // automatic offers (requires_coupon = false)
  coupon?: CouponInput | null;
  settings: CommerceSettings;
  paymentMethod?: PaymentMethod | null;
  now?: Date;
}

export function isRuleLive(rule: OfferRule, now: Date): boolean {
  if (!rule.is_active) return false;
  const start = new Date(rule.starts_at).getTime();
  const end = new Date(rule.ends_at).getTime();
  const t = now.getTime();
  if (t < start || t >= end) return false;
  if (rule.usage_limit !== null && rule.used_count >= rule.usage_limit) return false;
  return true;
}

export function ruleMatchesProduct(rule: OfferRule, product: Pick<PricingProduct, 'id' | 'category_id'>): boolean {
  if (rule.scope === 'all') return true;
  if (rule.scope === 'products') return rule.product_ids.includes(product.id);
  return product.category_id !== null && rule.category_ids.includes(product.category_id);
}

/** Base unit price after the product's own sale price / discount % (best of the two). */
export function baseUnitPrice(variant: Pick<PricingVariant, 'price_paise' | 'sale_price_paise'>, product: Pick<PricingProduct, 'discount_percent'>) {
  const mrp = variant.price_paise;
  const candidates = [mrp];
  if (variant.sale_price_paise && variant.sale_price_paise < mrp) candidates.push(variant.sale_price_paise);
  if (product.discount_percent > 0) candidates.push(Math.round(mrp * (1 - product.discount_percent / 100)));
  return Math.min(...candidates);
}

/** Distributes `total` across `weights` proportionally, exactly (largest remainder). */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}

function ruleDiscountForLines(rule: OfferRule, lineMrps: number[]): number[] {
  if (rule.discount_type === 'percentage') {
    let d = lineMrps.map((m) => Math.round((m * rule.discount_value) / 100));
    const sum = d.reduce((a, b) => a + b, 0);
    if (rule.max_discount_paise && sum > rule.max_discount_paise) d = distribute(rule.max_discount_paise, d);
    return d;
  }
  const totalMrp = lineMrps.reduce((a, b) => a + b, 0);
  let amount = Math.min(rule.discount_value, totalMrp);
  if (rule.max_discount_paise) amount = Math.min(amount, rule.max_discount_paise);
  return distribute(amount, lineMrps);
}

export function priceCart(input: PriceCartInput): PricedCart {
  const now = input.now ?? new Date();
  const { settings } = input;
  const issues: CartIssue[] = [];
  const merged = new Map<string, number>();
  for (const it of input.items) {
    if (!it.variantId || !Number.isFinite(it.quantity)) continue;
    merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + Math.floor(it.quantity));
  }

  // 1. Resolve lines
  type Work = PricedLine & { product: PricingProduct; baseDiscount: number };
  const work: Work[] = [];
  for (const [variantId, qtyRaw] of merged) {
    const variant = input.variants.get(variantId);
    const product = variant ? input.products.get(variant.product_id) : undefined;
    if (!variant || !product || !variant.is_active || product.status !== 'active') {
      issues.push({ variantId, kind: 'unavailable', message: 'This item is no longer available.' });
      continue;
    }
    let quantity = Math.max(1, qtyRaw);
    if (quantity > settings.max_qty_per_item) {
      quantity = settings.max_qty_per_item;
      issues.push({ variantId, kind: 'quantity_limited', message: `Maximum ${settings.max_qty_per_item} per item.` });
    }
    if (variant.stock <= 0) {
      issues.push({ variantId, kind: 'unavailable', message: `${product.name} (${variant.label}) is out of stock.`, available: 0 });
      continue;
    }
    if (quantity > variant.stock) {
      issues.push({
        variantId,
        kind: 'insufficient_stock',
        message: `Only ${variant.stock} left of ${product.name} (${variant.label}).`,
        available: variant.stock,
      });
      quantity = variant.stock;
    }
    const unitMrp = variant.price_paise;
    const base = baseUnitPrice(variant, product);
    const lineMrp = unitMrp * quantity;
    const baseDiscount = (unitMrp - base) * quantity;
    work.push({
      variantId, productId: product.id, productName: product.name, variantLabel: variant.label, sku: variant.sku,
      imageUrl: product.image_url ?? null, productSlug: product.slug ?? '', accentColor: product.accent_color ?? '#126B35', quantity, stock: variant.stock, unitMrp, unitPrice: base, lineMrp,
      lineDiscount: baseDiscount, discountLabel: baseDiscount > 0 ? 'Sale price' : null, discountPromotionId: null,
      couponShare: 0, lineTotal: lineMrp - baseDiscount, product, baseDiscount,
    });
  }

  // 2. Automatic offers — best single discount per line
  const baseSubtotal = work.reduce((a, l) => a + l.lineMrp - l.baseDiscount, 0);
  const liveOffers = input.offers
    .filter((r) => !r.requires_coupon && isRuleLive(r, now) && baseSubtotal >= r.min_order_paise)
    .sort((a, b) => b.priority - a.priority);
  for (const rule of liveOffers) {
    const idx = work.map((l, i) => (ruleMatchesProduct(rule, l.product) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const discounts = ruleDiscountForLines(rule, idx.map((i) => work[i].lineMrp));
    idx.forEach((i, k) => {
      const d = Math.min(discounts[k], work[i].lineMrp);
      if (d > work[i].lineDiscount) {
        work[i].lineDiscount = d;
        work[i].discountLabel = rule.title;
        work[i].discountPromotionId = rule.id;
      }
    });
  }
  for (const l of work) {
    l.unitPrice = Math.round((l.lineMrp - l.lineDiscount) / l.quantity);
    l.lineTotal = l.lineMrp - l.lineDiscount;
  }

  const subtotalMrp = work.reduce((a, l) => a + l.lineMrp, 0);
  const itemDiscount = work.reduce((a, l) => a + l.lineDiscount, 0);
  const subtotal = subtotalMrp - itemDiscount;

  // 3. Coupon
  let coupon: PricedCart['coupon'] = null;
  let couponDiscount = 0;
  if (input.coupon && input.coupon.code) {
    const code = input.coupon.code.toUpperCase();
    const rule = input.coupon.rule;
    const fail = (message: string) => ({ code, applied: false, discount: 0, message, promotionId: rule?.id ?? null });
    if (!rule || !rule.requires_coupon) coupon = fail('This coupon code is not valid.');
    else if (!isRuleLive(rule, now)) coupon = fail('This coupon has expired or is no longer available.');
    else if (rule.per_user_limit !== null && input.coupon.userRedemptions >= rule.per_user_limit)
      coupon = fail('You have already used this coupon.');
    else if (subtotal < rule.min_order_paise)
      coupon = fail(`Add items worth ₹${Math.ceil((rule.min_order_paise - subtotal) / 100)} more to use this coupon.`);
    else {
      const idx = work
        .map((l, i) => (ruleMatchesProduct(rule, l.product) && (rule.combinable_with_offers || l.lineDiscount === 0) ? i : -1))
        .filter((i) => i >= 0);
      if (!idx.length) {
        coupon = fail(
          rule.combinable_with_offers
            ? 'This coupon does not apply to the items in your cart.'
            : 'This coupon cannot be combined with items that are already discounted.',
        );
      } else {
        const nets = idx.map((i) => work[i].lineTotal);
        const eligible = nets.reduce((a, b) => a + b, 0);
        let amount = rule.discount_type === 'percentage' ? Math.round((eligible * rule.discount_value) / 100) : rule.discount_value;
        if (rule.max_discount_paise) amount = Math.min(amount, rule.max_discount_paise);
        amount = Math.min(amount, eligible);
        const shares = distribute(amount, nets);
        idx.forEach((i, k) => {
          work[i].couponShare = shares[k];
          work[i].lineTotal -= shares[k];
        });
        couponDiscount = amount;
        coupon = { code, applied: true, discount: amount, message: `${rule.title} applied.`, promotionId: rule.id };
      }
    }
  }

  const goods = subtotal - couponDiscount;
  const hasItems = work.length > 0;
  const freeDelivery = goods >= settings.free_delivery_threshold_paise;
  const deliveryFee = hasItems && !freeDelivery ? settings.delivery_fee_paise : 0;
  const codFee = hasItems && input.paymentMethod === 'cod' ? settings.cod_fee_paise : 0;
  const rate = settings.gst_percent;
  const tax = settings.prices_include_tax
    ? Math.round((goods * rate) / (100 + rate))
    : Math.round((goods * rate) / 100);
  const total = goods + deliveryFee + codFee + (settings.prices_include_tax ? 0 : tax);

  const appliedOffers: PricedCart['appliedOffers'] = [];
  const byLabel = new Map<string, { promotionId: string | null; amount: number }>();
  for (const l of work) {
    if (l.lineDiscount <= 0 || !l.discountLabel) continue;
    const cur = byLabel.get(l.discountLabel) ?? { promotionId: l.discountPromotionId, amount: 0 };
    cur.amount += l.lineDiscount;
    byLabel.set(l.discountLabel, cur);
  }
  for (const [label, v] of byLabel) appliedOffers.push({ ...v, label, kind: v.promotionId ? 'offer' : 'sale' });
  if (coupon?.applied) appliedOffers.push({ promotionId: coupon.promotionId, label: `Coupon ${coupon.code}`, amount: couponDiscount, kind: 'coupon' });

  return {
    lines: work.map(({ product: _p, baseDiscount: _b, ...l }) => l),
    issues,
    subtotalMrp,
    itemDiscount,
    subtotal,
    coupon,
    couponDiscount,
    deliveryFee,
    codFee,
    taxRatePercent: rate,
    taxIncluded: settings.prices_include_tax,
    tax,
    total,
    freeDeliveryRemaining: hasItems && !freeDelivery ? settings.free_delivery_threshold_paise - goods : 0,
    appliedOffers,
    itemCount: work.reduce((a, l) => a + l.quantity, 0),
  };
}

/** Display price for product cards: sale/product discount vs automatic % offers without a minimum. */
export function displayPrice(
  variant: Pick<PricingVariant, 'price_paise' | 'sale_price_paise'>,
  product: Pick<PricingProduct, 'id' | 'category_id' | 'discount_percent'>,
  offers: OfferRule[],
  now = new Date(),
): { mrp: number; price: number; percent: number; label: string | null } {
  const mrp = variant.price_paise;
  let price = baseUnitPrice(variant, product);
  let label: string | null = price < mrp ? 'Sale' : null;
  for (const r of offers) {
    if (r.requires_coupon || r.discount_type !== 'percentage' || r.min_order_paise > 0) continue;
    if (!isRuleLive(r, now) || !ruleMatchesProduct(r, product)) continue;
    const p = mrp - Math.round((mrp * r.discount_value) / 100);
    if (p < price) {
      price = p;
      label = r.festival_name || r.name;
    }
  }
  return { mrp, price, percent: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0, label };
}
