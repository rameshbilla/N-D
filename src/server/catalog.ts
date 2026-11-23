import { isSupabaseConfigured } from './config';
import { anonClient as createPublicClient } from './supabase';
import type { Banner, Category, HealthInfoItem, OfferRule, Product, Promotion, Review, Variant } from '../shared/types';

export type ProductWithVariants = Product & { product_variants: Variant[]; category: Pick<Category, 'id' | 'name' | 'slug'> | null };
export type ProductRating = { average: number; count: number };

const PRODUCT_SELECT = '*, product_variants(*), category:categories(id, name, slug)';

const sortVariants = <T extends { product_variants: Variant[] }>(p: T): T => ({
  ...p,
  product_variants: [...(p.product_variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.weight_grams - b.weight_grams),
});

export const getCategories = async (): Promise<Category[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from('categories').select('*').eq('is_active', true).order('sort_order');
  return (data as Category[]) ?? [];
};

export const getCategoryBySlug = async (slug: string): Promise<Category | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data } = await createPublicClient().from('categories').select('*').eq('slug', slug).eq('is_active', true).maybeSingle();
  return (data as Category) ?? null;
};

export interface ProductQuery {
  categoryId?: string;
  q?: string;
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'name';
  featuredOnly?: boolean;
  limit?: number;
  excludeId?: string;
}

export async function getProducts(query: ProductQuery = {}): Promise<ProductWithVariants[]> {
  if (!isSupabaseConfigured()) return [];
  let req = createPublicClient().from('products').select(PRODUCT_SELECT).eq('status', 'active');
  if (query.categoryId) req = req.eq('category_id', query.categoryId);
  if (query.featuredOnly) req = req.eq('is_featured', true);
  if (query.excludeId) req = req.neq('id', query.excludeId);
  if (query.q) {
    const term = query.q.replace(/[%_,()]/g, ' ').trim().slice(0, 60);
    if (term) req = req.or(`name.ilike.%${term}%,tagline.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (query.sort === 'newest') req = req.order('created_at', { ascending: false });
  else if (query.sort === 'name') req = req.order('name');
  else req = req.order('is_featured', { ascending: false }).order('sort_order');
  if (query.limit) req = req.limit(query.limit);
  const { data, error } = await req;
  if (error) {
    console.error('getProducts', error.message);
    return [];
  }
  let list = ((data as ProductWithVariants[]) ?? []).map(sortVariants).filter((p) => p.product_variants.length > 0);
  if (query.sort === 'price_asc' || query.sort === 'price_desc') {
    const min = (p: ProductWithVariants) => Math.min(...p.product_variants.map((v) => v.sale_price_paise ?? v.price_paise));
    list = list.sort((a, b) => (query.sort === 'price_asc' ? min(a) - min(b) : min(b) - min(a)));
  }
  return list;
}

export const getProductBySlug = async (slug: string): Promise<ProductWithVariants | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data } = await createPublicClient().from('products').select(PRODUCT_SELECT).eq('slug', slug).eq('status', 'active').maybeSingle();
  return data ? sortVariants(data as ProductWithVariants) : null;
};

export async function getHealthInfo(productId: string): Promise<HealthInfoItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient()
    .from('product_health_information')
    .select('*')
    .eq('product_id', productId)
    .eq('is_approved', true)
    .order('section')
    .order('sort_order');
  return (data as HealthInfoItem[]) ?? [];
}

export async function getReviews(productId: string): Promise<Review[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient()
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data as Review[]) ?? [];
}

export async function getRatings(productIds: string[]): Promise<Record<string, ProductRating>> {
  if (!isSupabaseConfigured() || !productIds.length) return {};
  const { data } = await createPublicClient().from('product_ratings').select('*').in('product_id', productIds);
  return Object.fromEntries((data ?? []).map((r) => [r.product_id, { average: Number(r.average), count: r.count }]));
}

/** Automatic (non-coupon) offers that are live now, with their targets. */
export const getLiveOffers = async (): Promise<OfferRule[]> => {
  if (!isSupabaseConfigured()) return [];
  const nowIso = new Date().toISOString();
  const { data } = await createPublicClient()
    .from('promotions')
    .select('*, promotion_products(product_id), promotion_categories(category_id)')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso)
    .order('priority', { ascending: false });
  return (data ?? []).map(toOfferRule);
};

export function toOfferRule(row: Promotion & { promotion_products?: { product_id: string }[]; promotion_categories?: { category_id: string }[] }): OfferRule {
  const { promotion_products, promotion_categories, ...rest } = row;
  return {
    ...rest,
    product_ids: (promotion_products ?? []).map((p) => p.product_id),
    category_ids: (promotion_categories ?? []).map((c) => c.category_id),
  };
}

export const getBanners = async (placement: Banner['placement']): Promise<Banner[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from('banners').select('*').eq('placement', placement).order('sort_order');
  return (data as Banner[]) ?? [];
};

export async function getServiceRates() {
  if (!isSupabaseConfigured()) return [];
  const { data } = await createPublicClient().from('service_rates').select('*').eq('is_active', true);
  return (data ?? []) as { id: string; ingredient_name: string | null; processing_type: string; rate_per_kg_paise: number }[];
}
