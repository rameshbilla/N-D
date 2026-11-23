import { DOCUMENT, inject, Injectable, RESPONSE_INIT } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { BRAND } from '../../shared/brand';

/** Per-page SEO: title, description, canonical, Open Graph, robots and JSON-LD. Works during SSR. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);
  private responseInit = inject(RESPONSE_INIT, { optional: true });

  set(opts: { title: string; description?: string | null; path?: string; image?: string | null; noindex?: boolean; jsonLd?: object | object[] | null }) {
    const full = opts.title.includes(BRAND.name) ? opts.title : `${opts.title} | ${BRAND.name}`;
    this.title.setTitle(full);
    this.meta.updateTag({ property: 'og:title', content: full });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: BRAND.name });
    if (opts.description) {
      this.meta.updateTag({ name: 'description', content: opts.description });
      this.meta.updateTag({ property: 'og:description', content: opts.description });
    }
    if (opts.image) this.meta.updateTag({ property: 'og:image', content: opts.image });
    this.meta.updateTag({ name: 'robots', content: opts.noindex ? 'noindex, nofollow' : 'index, follow' });

    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (opts.path) {
      if (!link) {
        link = this.doc.createElement('link');
        link.rel = 'canonical';
        this.doc.head.appendChild(link);
      }
      link.href = new URL(opts.path, this.doc.location?.href ?? 'http://localhost').toString();
    } else link?.remove();

    this.doc.head.querySelectorAll('script[data-nd-jsonld]').forEach((s) => s.remove());
    for (const data of opts.jsonLd ? (Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd]) : []) {
      const s = this.doc.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute('data-nd-jsonld', '');
      s.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
      this.doc.head.appendChild(s);
    }
  }

  /** Marks the server-rendered response as 404 (for missing products / pages). */
  notFound() {
    if (this.responseInit) this.responseInit.status = 404;
    this.set({ title: 'Page not found', noindex: true });
  }
}
