import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Deterministic id (same on server and browser) so hydration matches. */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const color = (c: string | null | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#126B35');

/** Builds the illustrated brand pack. All dynamic values are escaped / validated before insertion. */
export function productArtSvg(name: string, accentInput?: string | null, subtitle?: string | null): string {
  const id = `pa${hash(`${name}|${accentInput}|${subtitle}`)}`;
  const accent = color(accentInput);
  const short = esc(name.replace(/\s*Powder$/i, ''));
  const sub = subtitle ? esc(subtitle.slice(0, 34)) : '';
  return `<svg viewBox="0 0 300 300" class="size-full" role="img" aria-label="${esc(name)} pack">
  <defs>
    <radialGradient id="bg${id}" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#EEF7E3"/></radialGradient>
    <linearGradient id="band${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="#064421"/></linearGradient>
    <radialGradient id="pw${id}" cx="40%" cy="30%" r="80%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="100%" stop-color="#000000" stop-opacity="0.15"/></radialGradient>
  </defs>
  <rect width="300" height="300" fill="url(#bg${id})"/>
  <circle cx="232" cy="70" r="46" fill="${accent}" opacity="0.1"/>
  <circle cx="60" cy="236" r="34" fill="#126B35" opacity="0.08"/>
  <ellipse cx="226" cy="252" rx="52" ry="10" fill="#06301a" opacity="0.12"/>
  <path d="M178 252 Q200 214 226 212 Q252 214 274 252 Z" fill="${accent}"/>
  <path d="M178 252 Q200 214 226 212 Q252 214 274 252 Z" fill="url(#pw${id})"/>
  <ellipse cx="138" cy="262" rx="78" ry="10" fill="#06301a" opacity="0.16"/>
  <path d="M66 50 L210 50 L216 250 Q138 268 60 250 Z" fill="#FFFDF4" stroke="#E5E9D9" stroke-width="2"/>
  <path d="M66 50 L210 50 L211 84 L65 84 Z" fill="url(#band${id})"/>
  <rect x="80" y="98" width="116" height="80" rx="14" fill="#064421"/>
  <text x="138" y="122" text-anchor="middle" fill="#DDF5C9" font-size="12" font-weight="700" letter-spacing="3" font-family="var(--font-jakarta), sans-serif">N&amp;D</text>
  <text x="138" y="146" text-anchor="middle" fill="#fff" font-size="${short.length > 11 ? 15 : 19}" font-weight="700" font-family="var(--font-fraunces), serif">${short}</text>
  <text x="138" y="166" text-anchor="middle" fill="#DDF5C9" font-size="9" letter-spacing="2" font-family="var(--font-jakarta), sans-serif">POWDER</text>
  <path d="M78 196 Q138 184 198 196 L202 238 Q138 252 74 238 Z" fill="${accent}" opacity="0.9"/>
  ${sub ? `<text x="138" y="222" text-anchor="middle" fill="#fff" font-size="8.5" font-family="var(--font-jakarta), sans-serif">${sub}</text>` : ''}
  <path d="M72 88 L68 244" stroke="#fff" stroke-opacity="0.6" stroke-width="7" stroke-linecap="round"/>
  <path d="M228 150 q28 -30 52 -10 q-26 30 -52 10z" fill="#3E9B3A"/>
  <path d="M232 148 q20 -8 44 -8" stroke="#C9F0B1" stroke-width="1.5" fill="none"/>
</svg>`;
}

/** Uploaded product photo if available, otherwise the illustrated brand pack. */
@Component({
  selector: 'nd-product-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block aspect-square overflow-hidden bg-mint-50' },
  template: `
    @if (imageUrl()) {
      <img [src]="imageUrl()" [alt]="name()" class="absolute inset-0 size-full object-cover" [attr.loading]="priority() ? 'eager' : 'lazy'" [attr.fetchpriority]="priority() ? 'high' : null" decoding="async" />
    } @else {
      <div class="size-full" [innerHTML]="art()"></div>
    }
  `,
})
export class ProductThumb {
  private sanitizer = inject(DomSanitizer);
  name = input.required<string>();
  imageUrl = input<string | null | undefined>(null);
  accent = input<string | null | undefined>('#126B35');
  subtitle = input<string | null | undefined>(null);
  priority = input(false);
  art = computed(() => this.sanitizer.bypassSecurityTrustHtml(productArtSvg(this.name(), this.accent(), this.subtitle())));
}
