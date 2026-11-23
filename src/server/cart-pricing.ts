import { serviceClient as createServiceClient } from './supabase';
import { getSettings } from './settings';
import { toOfferRule } from './catalog';
import { priceCart, type CartLineInput, type PricedCart, type PricingProduct, type PricingVariant } from '../shared/pricing';
import type { PaymentMethod } from '../shared/types';

/**
 * Prices a cart using fresh database rows. This is the single source of truth for every
 * amount a customer is charged — frontend totals are display-only.
 */
export async function priceCartFromDb(opts: {
  items: CartLineInput[];
  couponCode?: string | null;
  paymentMethod?: PaymentMethod | null;
  userId?: string | null;
}): Promise<PricedCart> {
  const svc = createServiceClient();
  const ids = [...new Set(opts.items.map((i) => i.variantId).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 60);
  const { commerce } = await getSettings();

  const { data: variantRows } = ids.length
    ? await svc
        .from('product_variants')
        .select('id, product_id, label, sku, price_paise, sale_price_paise, stock, is_active, product:products(id, name, slug, category_id, discount_percent, status, images, accent_color)')
        .in('id', ids)
    : { data: [] as never[] };

  const variants = new Map<string, PricingVariant>();
  const products = new Map<string, PricingProduct>();
  for (const row of (variantRows ?? []) as unknown as (PricingVariant & {
    product: PricingProduct & { images: { url: string }[]; slug: string; accent_color: string };
  })[]) {
    const { product, ...v } = row;
    variants.set(v.id, v);
    if (product) products.set(product.id, { ...product, image_url: product.images?.[0]?.url ?? null });
  }

  const nowIso = new Date().toISOString();
  const { data: promoRows } = await svc
    .from('promotions')
    .select('*, promotion_products(product_id), promotion_categories(category_id)')
    .eq('is_active', true)
    .eq('requires_coupon', false)
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso);

  let coupon = null;
  const code = opts.couponCode?.trim().toUpperCase();
  if (code && /^[A-Z0-9_-]{3,30}$/.test(code)) {
    const { data: c } = await svc
      .from('coupons')
      .select('code, promotion:promotions(*, promotion_products(product_id), promotion_categories(category_id))')
      .eq('code', code)
      .maybeSingle();
    let redemptions = 0;
    const promo = (c?.promotion ?? null) as never;
    if (promo && opts.userId) {
      const { count } = await svc
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promotion_id', (promo as { id: string }).id)
        .eq('user_id', opts.userId);
      redemptions = count ?? 0;
    }
    coupon = { code, rule: promo ? toOfferRule(promo) : null, userRedemptions: redemptions };
  } else if (code) {
    coupon = { code, rule: null, userRedemptions: 0 };
  }

  return priceCart({
    items: opts.items,
    variants,
    products,
    offers: (promoRows ?? []).map(toOfferRule),
    coupon,
    settings: commerce,
    paymentMethod: opts.paymentMethod ?? null,
  });
}
