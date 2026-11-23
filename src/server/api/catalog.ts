import { Router } from 'express';
import { getUser } from '../auth';
import { isSupabaseConfigured } from '../config';
import { HttpError, qs, route } from '../http';
import {
  getBanners, getCategories, getCategoryBySlug, getHealthInfo, getLiveOffers, getProductBySlug, getProducts, getRatings, getReviews,
  getServiceRates, type ProductQuery,
} from '../catalog';
import { getSettings } from '../settings';

export const catalogRouter = Router();
const SORTS = ['featured', 'price_asc', 'price_desc', 'newest', 'name'] as const;

/** Public store configuration (no secrets). */
catalogRouter.get(
  '/store',
  route(async () => {
    const [settings, offers] = await Promise.all([getSettings(), getLiveOffers()]);
    return { configured: isSupabaseConfigured(), ...settings, ribbon: offers.find((o) => o.show_banner && !o.requires_coupon) ?? null };
  }),
);

catalogRouter.get(
  '/home',
  route(async () => {
    const [featured, categories, offers, banners] = await Promise.all([getProducts({ featuredOnly: true, limit: 8 }), getCategories(), getLiveOffers(), getBanners('home_strip')]);
    const ratings = await getRatings(featured.map((p) => p.id));
    return { featured: featured.map((p) => ({ ...p, rating: ratings[p.id] ?? null })), categories, offers, banners };
  }),
);

catalogRouter.get('/categories', route(() => getCategories()));

catalogRouter.get(
  '/catalogue',
  route(async (req) => {
    const slug = qs(req, 'category');
    const [categories, offers, category] = await Promise.all([getCategories(), getLiveOffers(), slug ? getCategoryBySlug(slug) : null]);
    if (slug && !category && isSupabaseConfigured()) throw new HttpError(404, 'Category not found.');
    const sortParam = qs(req, 'sort') as ProductQuery['sort'];
    const sort = SORTS.includes(sortParam as (typeof SORTS)[number]) ? sortParam : 'featured';
    const products = await getProducts({ q: qs(req, 'q') || undefined, sort, categoryId: category?.id });
    const ratings = await getRatings(products.map((p) => p.id));
    return { categories, category, offers, sort, products: products.map((p) => ({ ...p, rating: ratings[p.id] ?? null })) };
  }),
);

catalogRouter.get(
  '/products/:slug',
  route(async (req, res) => {
    const product = await getProductBySlug(String(req.params['slug']));
    if (!product) throw new HttpError(404, 'Product not found.');
    const [info, reviews, offers, related, ratings, settings, user] = await Promise.all([
      getHealthInfo(product.id),
      getReviews(product.id),
      getLiveOffers(),
      getProducts({ categoryId: product.category_id ?? undefined, excludeId: product.id, limit: 4 }),
      getRatings([product.id]),
      getSettings(),
      getUser(req, res),
    ]);
    return { product, info, reviews, offers, related, rating: ratings[product.id] ?? null, freeDeliveryThreshold: settings.commerce.free_delivery_threshold_paise, loggedIn: Boolean(user) };
  }),
);

catalogRouter.get(
  '/custom-service',
  route(async () => {
    const [rates, settings] = await Promise.all([getServiceRates(), getSettings()]);
    return { rates, settings: settings.custom_service };
  }),
);
