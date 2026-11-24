import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { apiRouter } from './server/api';
import { robots, sitemap } from './server/api/seo';

// Load .env for local development (hosting platforms inject environment variables directly).
for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
// SSRF protection: only render for known hosts (localhost via angular.json, production via SITE_URL / NG_ALLOWED_HOSTS).
const hostOf = (v: string) => {
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname;
  } catch {
    return '';
  }
};
const siteHost = [
  hostOf(process.env['SITE_URL']?.trim() ?? ''),
  // Set automatically by Render (e.g. nd-powders.onrender.com).
  process.env['RENDER_EXTERNAL_HOSTNAME'] ?? '',
  ...(process.env['NG_ALLOWED_HOSTS'] ?? '').split(','),
]
  .map((h) => h.trim())
  .filter(Boolean);
const angularApp = new AngularNodeAppEngine({ allowedHosts: siteHost });

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
});

/** REST API (auth, cart, checkout, payments, custom service, admin). All secrets stay on this server. */
app.use('/api', apiRouter());
app.get('/robots.txt', robots);
app.get('/sitemap.xml', (req, res) => void sitemap(req, res));

/** Static files from /browser */
app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

/** Everything else is rendered by Angular (SSR for public pages, client-side for account/admin). */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) throw error;
    console.log(`N&D server listening on http://localhost:${port}`);
  });
}

/** Request handler used by the Angular CLI (dev-server and build). */
export const reqHandler = createNodeRequestHandler(app);
