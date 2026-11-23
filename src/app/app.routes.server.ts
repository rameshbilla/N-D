import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Public, SEO-relevant pages are server-rendered on every request (live prices & offers).
 * Signed-in areas (account, checkout, admin) render in the browser only — they never need SSR
 * and their data is fetched with the user's session cookie directly from the API.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'account/**', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'cart', renderMode: RenderMode.Client },
  { path: 'login/**', renderMode: RenderMode.Client },
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'payment/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
