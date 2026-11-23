import { describe, expect, it } from 'vitest';
import { displayPrice, distribute, priceCart, type PricingProduct, type PricingVariant } from '../src/shared/pricing';
import type { CommerceSettings, OfferRule } from '../src/shared/types';

const settings: CommerceSettings = {
  gst_percent: 5,
  prices_include_tax: true,
  delivery_fee_paise: 6000,
  free_delivery_threshold_paise: 99900,
  cod_enabled: true,
  cod_fee_paise: 3000,
  cod_max_order_paise: 500000,
  max_qty_per_item: 20,
};

const products = new Map<string, PricingProduct>([
  ['abc', { id: 'abc', name: 'ABC Powder', category_id: 'mixed', discount_percent: 0, status: 'active' }],
  ['amla', { id: 'amla', name: 'Amla Powder', category_id: 'fruit', discount_percent: 10, status: 'active' }],
  ['off', { id: 'off', name: 'Hidden', category_id: 'fruit', discount_percent: 0, status: 'inactive' }],
]);
const variants = new Map<string, PricingVariant>([
  ['abc-100', { id: 'abc-100', product_id: 'abc', label: '100 g', sku: null, price_paise: 18900, sale_price_paise: null, stock: 10, is_active: true }],
  ['abc-250', { id: 'abc-250', product_id: 'abc', label: '250 g', sku: null, price_paise: 42900, sale_price_paise: 38900, stock: 3, is_active: true }],
  ['amla-100', { id: 'amla-100', product_id: 'amla', label: '100 g', sku: null, price_paise: 14900, sale_price_paise: null, stock: 50, is_active: true }],
  ['off-100', { id: 'off-100', product_id: 'off', label: '100 g', sku: null, price_paise: 10000, sale_price_paise: null, stock: 50, is_active: true }],
]);

const now = new Date('2026-11-01T10:00:00Z');
const rule = (over: Partial<OfferRule>): OfferRule => ({
  id: 'r1', name: 'Diwali', festival_name: 'Diwali', title: 'Diwali 15% off', description: null, banner_image_url: null,
  show_banner: true, discount_type: 'percentage', discount_value: 15, scope: 'all', requires_coupon: false,
  combinable_with_offers: false, min_order_paise: 0, max_discount_paise: null, starts_at: '2026-10-01T00:00:00Z',
  ends_at: '2026-12-01T00:00:00Z', usage_limit: null, per_user_limit: null, used_count: 0, is_active: true, priority: 0,
  product_ids: [], category_ids: [], ...over,
});

describe('priceCart', () => {
  it('prices a simple cart with delivery fee and inclusive GST', () => {
    const r = priceCart({ items: [{ variantId: 'abc-100', quantity: 2 }], variants, products, offers: [], settings, now });
    expect(r.subtotalMrp).toBe(37800);
    expect(r.itemDiscount).toBe(0);
    expect(r.deliveryFee).toBe(6000);
    expect(r.total).toBe(43800);
    expect(r.tax).toBe(Math.round((37800 * 5) / 105));
  });

  it('uses the best of sale price and product discount %, never both', () => {
    const r = priceCart({ items: [{ variantId: 'abc-250', quantity: 1 }, { variantId: 'amla-100', quantity: 1 }], variants, products, offers: [], settings, now });
    const abc = r.lines.find((l) => l.variantId === 'abc-250')!;
    const amla = r.lines.find((l) => l.variantId === 'amla-100')!;
    expect(abc.unitPrice).toBe(38900);
    expect(amla.unitPrice).toBe(13410); // 10% product discount
  });

  it('applies a festival offer only where it beats the existing discount (no stacking)', () => {
    const r = priceCart({ items: [{ variantId: 'abc-250', quantity: 1 }, { variantId: 'abc-100', quantity: 1 }], variants, products, offers: [rule({})], settings, now });
    const big = r.lines.find((l) => l.variantId === 'abc-250')!;
    const small = r.lines.find((l) => l.variantId === 'abc-100')!;
    // 15% of 42900 = 6435 > sale discount 4000
    expect(big.lineDiscount).toBe(6435);
    expect(big.discountLabel).toBe('Diwali 15% off');
    expect(small.lineDiscount).toBe(2835);
  });

  it('ignores expired, inactive and exhausted offers', () => {
    const offers = [
      rule({ id: 'a', ends_at: '2026-10-15T00:00:00Z' }),
      rule({ id: 'b', is_active: false }),
      rule({ id: 'c', usage_limit: 5, used_count: 5 }),
    ];
    const r = priceCart({ items: [{ variantId: 'abc-100', quantity: 1 }], variants, products, offers, settings, now });
    expect(r.itemDiscount).toBe(0);
  });

  it('respects category scope and minimum order value', () => {
    const fruitOnly = rule({ scope: 'categories', category_ids: ['fruit'], discount_value: 20 });
    const r = priceCart({ items: [{ variantId: 'abc-100', quantity: 1 }, { variantId: 'amla-100', quantity: 1 }], variants, products, offers: [fruitOnly], settings, now });
    expect(r.lines.find((l) => l.variantId === 'abc-100')!.lineDiscount).toBe(0);
    expect(r.lines.find((l) => l.variantId === 'amla-100')!.lineDiscount).toBe(2980);
    const minOrder = rule({ min_order_paise: 1_000_000 });
    const r2 = priceCart({ items: [{ variantId: 'abc-100', quantity: 1 }], variants, products, offers: [minOrder], settings, now });
    expect(r2.itemDiscount).toBe(0);
  });

  it('applies a non-combinable coupon only to undiscounted items and caps it', () => {
    const coupon = rule({ id: 'cpn', requires_coupon: true, discount_value: 50, max_discount_paise: 5000, title: 'WELCOME' });
    const r = priceCart({
      items: [{ variantId: 'abc-100', quantity: 2 }, { variantId: 'abc-250', quantity: 1 }],
      variants, products, offers: [], settings, now,
      coupon: { code: 'welcome', rule: coupon, userRedemptions: 0 },
    });
    expect(r.coupon?.applied).toBe(true);
    expect(r.couponDiscount).toBe(5000); // capped
    expect(r.lines.find((l) => l.variantId === 'abc-250')!.couponShare).toBe(0);
    expect(r.lines.reduce((a, l) => a + l.couponShare, 0)).toBe(5000);
  });

  it('rejects coupons that are unknown, used up for the user, or below minimum', () => {
    const coupon = rule({ id: 'cpn', requires_coupon: true, per_user_limit: 1, min_order_paise: 50000 });
    const base = { items: [{ variantId: 'abc-100', quantity: 1 }], variants, products, offers: [], settings, now };
    expect(priceCart({ ...base, coupon: { code: 'X', rule: null, userRedemptions: 0 } }).coupon?.applied).toBe(false);
    expect(priceCart({ ...base, coupon: { code: 'X', rule: coupon, userRedemptions: 1 } }).coupon?.message).toMatch(/already used/);
    expect(priceCart({ ...base, coupon: { code: 'X', rule: coupon, userRedemptions: 0 } }).coupon?.message).toMatch(/more to use/);
  });

  it('waives delivery above the threshold and adds COD fee', () => {
    const r = priceCart({ items: [{ variantId: 'abc-100', quantity: 6 }], variants, products, offers: [], settings, now, paymentMethod: 'cod' });
    expect(r.deliveryFee).toBe(0);
    expect(r.codFee).toBe(3000);
    expect(r.total).toBe(18900 * 6 + 3000);
  });

  it('flags unavailable and insufficient stock lines', () => {
    const r = priceCart({ items: [{ variantId: 'off-100', quantity: 1 }, { variantId: 'abc-250', quantity: 9 }, { variantId: 'nope', quantity: 1 }], variants, products, offers: [], settings, now });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].quantity).toBe(3);
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['insufficient_stock', 'unavailable', 'unavailable']);
  });

  it('adds tax on top when prices exclude GST', () => {
    const r = priceCart({ items: [{ variantId: 'abc-100', quantity: 1 }], variants, products, offers: [], settings: { ...settings, prices_include_tax: false }, now });
    expect(r.tax).toBe(945);
    expect(r.total).toBe(18900 + 945 + 6000);
  });
});

describe('helpers', () => {
  it('distribute splits exactly', () => {
    const parts = distribute(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('displayPrice shows festival percentage', () => {
    const d = displayPrice(variants.get('abc-100')!, products.get('abc')!, [rule({})], now);
    expect(d.price).toBe(18900 - 2835);
    expect(d.percent).toBe(15);
    expect(d.label).toBe('Diwali');
  });
});
