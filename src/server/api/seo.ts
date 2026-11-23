import type { Request, Response } from 'express';
import { getCategories, getProducts } from '../catalog';
import { config } from '../config';

const XML_ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]);

export function robots(_req: Request, res: Response) {
  const disallow = ['/admin', '/account', '/checkout', '/cart', '/login', '/payment', '/api'].map((p) => `Disallow: ${p}`);
  res.type('text/plain').send(['User-agent: *', 'Allow: /', ...disallow, '', `Sitemap: ${config.siteUrl}/sitemap.xml`, ''].join('\n'));
}

export async function sitemap(_req: Request, res: Response) {
  const base = config.siteUrl;
  const [products, categories] = await Promise.all([getProducts().catch(() => []), getCategories().catch(() => [])]);
  const statics = ['', '/shop', '/categories', '/custom-processing', '/request-quotation', '/how-it-works', '/about', '/contact', '/faqs', '/privacy-policy', '/terms', '/shipping-returns'];
  const url = (loc: string, priority: string, lastmod?: string) =>
    `<url><loc>${xml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
  const urls = [
    ...statics.map((p) => url(base + p, p === '' ? '1.0' : '0.6')),
    ...categories.map((c) => url(`${base}/categories/${c.slug}`, '0.7')),
    ...products.map((p) => url(`${base}/products/${p.slug}`, '0.8', p.updated_at)),
  ];
  res
    .set('Cache-Control', 'public, max-age=3600')
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
}
