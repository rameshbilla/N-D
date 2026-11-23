import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  AlertTriangle, Archive, ChartColumn, ChefHat, ChevronDown, ChevronRight, CookingPot, GlassWater, Heart, HeartPulse, Info, Minus, Plus, Scale, ShieldAlert,
  ShieldCheck, ShoppingBag, Sparkles, Sprout, Star, Truck, Zap, type IconNode,
} from 'lucide';
import { HEALTH_DISCLAIMER } from '../../../shared/brand';
import { CLAIM_LABEL, HEALTH_SECTIONS } from '../../../shared/health';
import { displayPrice } from '../../../shared/pricing';
import type { HealthInfoItem, OfferRule, Review } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { SeoService } from '../../core/seo.service';
import { ToastService } from '../../core/toast.service';
import { InrPipe } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { productArtSvg } from '../../ui/product-art';
import { ProductCard, type CardProduct } from '../../ui/product-card';
import type { ProductWithVariants } from '../../../server/catalog';
import { safeResource } from '../../core/safe-resource';

interface ProductData {
  product: ProductWithVariants;
  info: HealthInfoItem[];
  reviews: Review[];
  offers: OfferRule[];
  related: CardProduct[];
  rating: { average: number; count: number } | null;
  freeDeliveryThreshold: number;
  loggedIn: boolean;
}

const SECTION_ICONS: Record<string, IconNode> = { Sprout, BarChart3: ChartColumn, HeartPulse, Sparkles, ChefHat, GlassWater, CookingPot, Scale, Archive, ShieldAlert, AlertTriangle };

@Component({
  selector: 'nd-product',
  imports: [RouterLink, FormsModule, IconComponent, InrPipe, ProductCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value()?.data; as d) {
      @let p = d.product;
      <article class="container-page pt-8">
        <nav aria-label="Breadcrumb">
          <ol class="flex flex-wrap items-center gap-1 text-xs font-medium text-muted">
            <li><a routerLink="/" class="hover:text-leaf">Home</a></li>
            <li class="flex items-center gap-1"><nd-icon [icon]="I.chevron" class="size-3" /><a routerLink="/shop" class="hover:text-leaf">Shop</a></li>
            @if (p.category) { <li class="flex items-center gap-1"><nd-icon [icon]="I.chevron" class="size-3" /><a [routerLink]="['/categories', p.category.slug]" class="hover:text-leaf">{{ p.category.name }}</a></li> }
            <li class="flex items-center gap-1" aria-current="page"><nd-icon [icon]="I.chevron" class="size-3" />{{ p.name }}</li>
          </ol>
        </nav>

        <div class="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <!-- Gallery -->
          <div>
            <div class="relative aspect-square overflow-hidden rounded-4xl bg-mint-50 shadow-soft">
              @if (p.images[activeImage()]; as img) {
                <img [src]="img.url" [alt]="img.alt || p.name" class="absolute inset-0 size-full object-cover" fetchpriority="high" />
              } @else {
                <div class="size-full" [innerHTML]="art()"></div>
              }
            </div>
            @if (p.images.length > 1) {
              <div class="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                @for (img of p.images; track img.url; let i = $index) {
                  <button type="button" (click)="activeImage.set(i)" class="relative size-20 shrink-0 overflow-hidden rounded-2xl border-2" [class]="i === activeImage() ? 'border-leaf' : 'border-transparent'" [attr.aria-label]="'Show image ' + (i + 1)">
                    <img [src]="img.url" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
                  </button>
                }
              </div>
            }
            @for (v of p.videos; track v.url) {
              <div class="mt-4 overflow-hidden rounded-3xl bg-black shadow-soft">
                @if (youtube(v.url); as yt) {
                  <iframe [src]="yt" [title]="v.title || p.name + ' video'" class="aspect-video w-full" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                } @else {
                  <video [src]="v.url" controls preload="none" class="aspect-video w-full" [title]="v.title || ''"></video>
                }
              </div>
            }
          </div>

          <!-- Purchase -->
          <div class="lg:sticky lg:top-24 lg:self-start">
            @if (p.category) { <p class="eyebrow">{{ p.category.name }}</p> }
            <h1 class="mt-2 text-4xl font-semibold text-forest md:text-5xl">{{ p.name }}</h1>
            @if (d.rating) { <a href="#reviews" class="mt-2 inline-flex items-center gap-1 text-sm text-muted"><nd-icon [icon]="I.star" class="size-4 fill-saffron text-saffron" /> {{ d.rating.average }} · {{ d.rating.count }} review{{ d.rating.count > 1 ? 's' : '' }}</a> }
            @if (p.tagline) { <p class="mt-3 text-lg text-muted">{{ p.tagline }}</p> }
            @if (ingredients().length) { <p class="mt-3 text-sm text-forest"><span class="font-semibold">Ingredients:</span> {{ ingredients().join(', ') }}</p> }

            @if (variant(); as v) {
              <div class="mt-6">
                <div class="flex flex-wrap items-end gap-3">
                  <p class="text-4xl font-bold text-forest">{{ price().price | inr }}</p>
                  @if (price().price < price().mrp) {
                    <p class="pb-1 text-lg text-muted line-through">{{ price().mrp | inr }}</p>
                    <p class="mb-1 rounded-full bg-berry px-2.5 py-0.5 text-sm font-bold text-white">{{ price().percent }}% OFF</p>
                  }
                </div>
                <p class="mt-1 text-xs text-muted">MRP inclusive of all taxes · {{ perHundred() | inr }} / 100 g{{ price().label && price().label !== 'Sale' ? ' · ' + price().label + ' offer' : '' }}</p>
                <fieldset class="mt-6">
                  <legend class="text-sm font-semibold text-forest">Pack size</legend>
                  <div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    @for (o of p.product_variants; track o.id) {
                      <label class="relative cursor-pointer rounded-2xl border-2 p-2.5 text-center transition" [class]="(o.id === v.id ? 'border-leaf bg-mint/50' : 'border-line bg-white hover:border-leaf/50') + (o.stock <= 0 ? ' cursor-not-allowed opacity-45' : '')">
                        <input type="radio" name="variant" [value]="o.id" [checked]="o.id === v.id" (change)="variantId.set(o.id); qty.set(1)" [disabled]="o.stock <= 0" class="sr-only" />
                        <span class="block text-sm font-bold text-forest">{{ o.label }}</span>
                        <span class="block text-xs text-muted">{{ o.stock > 0 ? (priceOf(o).price | inr) : 'Sold out' }}</span>
                      </label>
                    }
                  </div>
                </fieldset>
                <p class="mt-4 text-sm font-semibold" [class]="v.stock <= 0 ? 'text-berry' : v.stock <= v.low_stock_threshold ? 'text-amber-700' : 'text-leaf'" aria-live="polite">
                  {{ v.stock <= 0 ? 'Out of stock' : v.stock <= v.low_stock_threshold ? 'Only ' + v.stock + ' left in stock' : 'In stock — ready to ship' }}
                </p>
                <div class="mt-5 flex flex-wrap items-center gap-3">
                  <div class="flex items-center rounded-full border-2 border-line bg-white">
                    <button type="button" class="p-3" (click)="qty.set(qty() > 1 ? qty() - 1 : 1)" aria-label="Decrease quantity"><nd-icon [icon]="I.minus" class="size-4" /></button>
                    <span class="w-8 text-center font-bold" aria-live="polite">{{ qty() }}</span>
                    <button type="button" class="p-3" (click)="qty.set(qty() + 1)" [disabled]="qty() >= v.stock || qty() >= 20" aria-label="Increase quantity"><nd-icon [icon]="I.plus" class="size-4" /></button>
                  </div>
                  <button type="button" (click)="addToCart(false)" [disabled]="v.stock <= 0" class="btn btn-primary flex-1"><nd-icon [icon]="I.bag" class="size-4" /> Add to Cart</button>
                  <button type="button" (click)="addToCart(true)" [disabled]="v.stock <= 0" class="btn btn-accent flex-1"><nd-icon [icon]="I.zap" class="size-4" /> Buy Now</button>
                  <button type="button" (click)="cart.toggleWishlist(p.id)" class="btn btn-outline px-3" [attr.aria-pressed]="wished()" [attr.aria-label]="wished() ? 'Remove from wishlist' : 'Add to wishlist'">
                    <nd-icon [icon]="I.heart" class="size-5" [class]="wished() ? 'fill-berry text-berry' : ''" />
                  </button>
                </div>
                <ul class="mt-6 grid gap-2 text-sm text-muted sm:grid-cols-2">
                  <li class="flex items-center gap-2"><nd-icon [icon]="I.truck" class="size-4 text-leaf" /> Free delivery over {{ d.freeDeliveryThreshold | inr }}</li>
                  <li class="flex items-center gap-2"><nd-icon [icon]="I.shield" class="size-4 text-leaf" /> Secure UPI, card &amp; net banking</li>
                </ul>
              </div>
            }
            @if (p.description) {
              <div class="mt-8 border-t border-line pt-6">
                <h2 class="font-sans text-lg font-semibold text-forest">About this product</h2>
                <p class="mt-2 whitespace-pre-line leading-relaxed text-muted">{{ p.description }}</p>
              </div>
            }
          </div>
        </div>

        <!-- Health & usage information (admin-approved items only) -->
        @if (sections().length) {
          <section aria-labelledby="info-heading" class="mt-16">
            <p class="eyebrow">Know your powder</p>
            <h2 id="info-heading" class="mt-2 text-3xl font-semibold text-forest md:text-4xl">Uses, nutrition &amp; care</h2>
            <div class="mt-6 grid gap-3 lg:grid-cols-2">
              @for (s of sections(); track s.key; let idx = $index) {
                <details [attr.open]="idx < 4 ? '' : null" class="group card overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                  <summary class="flex cursor-pointer list-none items-center gap-3 p-5">
                    <span class="flex size-10 items-center justify-center rounded-2xl bg-mint text-leaf"><nd-icon [icon]="sectionIcon(s.icon)" class="size-5" /></span>
                    <h3 class="flex-1 font-sans text-lg font-semibold text-forest">{{ s.label }}</h3>
                    <nd-icon [icon]="I.down" class="size-5 text-muted transition group-open:rotate-180" />
                  </summary>
                  <div class="space-y-3 px-5 pb-5">
                    @if (s.key === 'nutritional_info' && p.nutrition_facts.length) {
                      <table class="w-full text-sm">
                        <caption class="pb-2 text-left text-xs text-muted">{{ p.nutrition_basis || 'Per 100 g (approximate)' }}</caption>
                        <tbody>
                          @for (n of p.nutrition_facts; track n.nutrient) { <tr class="border-b border-line last:border-0"><th scope="row" class="py-2 text-left font-medium text-forest">{{ n.nutrient }}</th><td class="py-2 text-right text-muted">{{ n.amount }} {{ n.unit }}</td></tr> }
                        </tbody>
                      </table>
                    }
                    <ul class="space-y-2">
                      @for (it of s.items; track it.id) {
                        <li class="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink/85" [class.block]="it.kind === 'paragraph'">
                          @if (it.kind === 'bullet') { <span class="mt-2 size-1.5 shrink-0 rounded-full bg-leaf"></span> }
                          <span>
                            {{ it.body }}
                            @if (it.claim_type !== 'general') {
                              <span [title]="claim[it.claim_type].description" class="ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[0.68rem] font-semibold" [class]="it.claim_type === 'traditional' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'">{{ claim[it.claim_type].label }}</span>
                            }
                            @if (it.source_reference) {
                              <span class="mt-1 block text-xs text-muted">Source:
                                @if (it.source_reference.startsWith('https://')) { <a [href]="it.source_reference" target="_blank" rel="noopener noreferrer nofollow" class="underline">{{ host(it.source_reference) }}</a> } @else { {{ it.source_reference }} }
                              </span>
                            }
                          </span>
                        </li>
                      }
                    </ul>
                  </div>
                </details>
              }
            </div>
            <p class="mt-6 flex gap-3 rounded-3xl border border-line bg-white p-5 text-sm leading-relaxed text-muted">
              <nd-icon [icon]="I.info" class="mt-0.5 size-5 shrink-0 text-leaf" /><span><strong class="text-forest">Disclaimer:</strong> {{ disclaimer }}</span>
            </p>
          </section>
        }

        <!-- Reviews -->
        <section id="reviews" aria-labelledby="reviews-heading" class="mt-16 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 id="reviews-heading" class="text-3xl font-semibold text-forest">Customer reviews</h2>
            @for (r of d.reviews; track r.id) {
              <div class="card mt-4 p-5">
                <div class="flex items-center gap-1" [attr.aria-label]="r.rating + ' out of 5 stars'">@for (n of stars; track n) { <nd-icon [icon]="I.star" class="size-4" [class]="n <= r.rating ? 'fill-saffron text-saffron' : 'text-line'" /> }</div>
                @if (r.title) { <p class="mt-2 font-semibold text-forest">{{ r.title }}</p> }
                @if (r.body) { <p class="mt-1 text-muted">{{ r.body }}</p> }
                <p class="mt-2 text-xs text-muted">{{ r.reviewer_name }} · Verified buyer · {{ day(r.created_at) }}</p>
              </div>
            } @empty {
              <p class="mt-4 text-muted">No reviews yet. Bought this product? Share your experience.</p>
            }
          </div>
          @if (!d.loggedIn) {
            <p class="text-sm text-muted"><a routerLink="/login" [queryParams]="{ next: '/products/' + p.slug }" class="font-semibold text-leaf underline">Sign in</a> to review products from your delivered orders.</p>
          } @else {
            <form class="card h-fit space-y-3 p-5" (ngSubmit)="submitReview(p.id)">
              <h3 class="font-sans text-lg font-semibold text-forest">Write a review</h3>
              <div class="flex gap-1" role="radiogroup" aria-label="Rating">
                @for (n of stars; track n) { <button type="button" role="radio" [attr.aria-checked]="rating() === n" [attr.aria-label]="n + ' stars'" (click)="rating.set(n)"><nd-icon [icon]="I.star" class="size-7" [class]="n <= rating() ? 'fill-saffron text-saffron' : 'text-line'" /></button> }
              </div>
              <input name="title" [(ngModel)]="reviewTitle" maxlength="120" placeholder="Title (optional)" class="field" aria-label="Review title" />
              <textarea name="body" [(ngModel)]="reviewBody" maxlength="2000" rows="3" placeholder="How did you use it?" class="field" aria-label="Review"></textarea>
              @if (reviewMsg(); as m) { <p class="text-sm" [class]="m.ok ? 'text-leaf' : 'text-berry'" role="status">{{ m.text }}</p> }
              <button class="btn btn-primary" [disabled]="rating() === 0">Submit review</button>
            </form>
          }
        </section>

        @if (d.related.length) {
          <section aria-labelledby="related-heading" class="mt-16">
            <h2 id="related-heading" class="text-3xl font-semibold text-forest">You may also like</h2>
            <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              @for (r of d.related; track r.id; let i = $index) { <nd-product-card [product]="r" [offers]="d.offers" [index]="i" /> }
            </div>
          </section>
        }
      </article>
    } @else if (data.error()) {
      <section class="container-page py-24 text-center">
        <h1 class="text-4xl font-semibold text-forest">Product not found</h1>
        <p class="mt-3 text-muted">This product is unavailable or no longer sold.</p>
        <a routerLink="/shop" class="btn btn-primary mt-6">Browse products</a>
      </section>
    } @else {
      <div class="container-page grid gap-10 pt-14 lg:grid-cols-2"><div class="aspect-square animate-pulse rounded-4xl bg-mint-50"></div><div class="h-80 animate-pulse rounded-4xl bg-mint-50"></div></div>
    }
  `,
})
export class ProductPage {
  cart = inject(CartService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private seo = inject(SeoService);
  private sanitizer = inject(DomSanitizer);
  slug = input.required<string>();
  data = safeResource(httpResource<{ data: ProductData }>(() => `/api/products/${encodeURIComponent(this.slug())}`));
  I = { chevron: ChevronRight, star: Star, minus: Minus, plus: Plus, bag: ShoppingBag, zap: Zap, heart: Heart, truck: Truck, shield: ShieldCheck, down: ChevronDown, info: Info };
  claim = CLAIM_LABEL;
  disclaimer = HEALTH_DISCLAIMER;
  stars = [1, 2, 3, 4, 5];
  activeImage = signal(0);
  qty = signal(1);
  rating = signal(0);
  reviewTitle = '';
  reviewBody = '';
  reviewMsg = signal<{ ok: boolean; text: string } | null>(null);

  private product = computed(() => this.data.value()?.data?.product);
  variantId = linkedSignal(() => {
    const vs = this.product()?.product_variants ?? [];
    return (vs.find((v) => v.stock > 0) ?? vs[0])?.id;
  });
  variant = computed(() => this.product()?.product_variants.find((v) => v.id === this.variantId()));
  price = computed(() => displayPrice(this.variant()!, this.product()!, this.data.value()!.data.offers));
  perHundred = computed(() => Math.round((this.price().price / (this.variant()?.weight_grams || 100)) * 100));
  wished = computed(() => this.cart.wishlist().has(this.product()?.id ?? ''));
  art = computed(() => {
    const p = this.product();
    return p ? this.sanitizer.bypassSecurityTrustHtml(productArtSvg(p.name, p.accent_color, p.tagline)) : '';
  });
  ingredients = computed(() => (this.data.value()?.data?.info ?? []).filter((i) => i.section === 'ingredients').map((i) => i.body));
  sections = computed(() => {
    const d = this.data.value()?.data;
    if (!d) return [];
    return HEALTH_SECTIONS.map((s) => ({ ...s, items: d.info.filter((i) => i.section === s.key).sort((a, b) => a.sort_order - b.sort_order) })).filter(
      (s) => s.items.length || (s.key === 'nutritional_info' && d.product.nutrition_facts.length),
    );
  });

  constructor() {
    effect(() => {
      if (this.data.error()) return this.seo.notFound();
      const d = this.data.value()?.data;
      if (!d) return;
      const p = d.product;
      const prices = p.product_variants.map((v) => displayPrice(v, p, d.offers).price);
      this.seo.set({
        title: p.seo_title || p.name,
        description: p.seo_description || p.tagline || p.description?.slice(0, 160),
        path: `/products/${p.slug}`,
        image: p.images[0]?.url,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          description: p.description ?? p.tagline ?? undefined,
          sku: p.sku ?? undefined,
          brand: { '@type': 'Brand', name: 'N&D Nature Healthy Food' },
          image: p.images.map((i) => i.url),
          category: p.category?.name,
          offers: prices.length
            ? {
                '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2),
                offerCount: p.product_variants.length, availability: p.product_variants.some((v) => v.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              }
            : undefined,
          ...(d.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: d.rating.average, reviewCount: d.rating.count } } : {}),
        },
      });
    });
  }

  priceOf = (v: ProductWithVariants['product_variants'][number]) => displayPrice(v, this.product()!, this.data.value()!.data.offers);
  sectionIcon = (name: string) => SECTION_ICONS[name] ?? Info;
  host = (u: string) => new URL(u).hostname;
  day = (d: string) => new Date(d).toLocaleDateString('en-IN');
  youtube(url: string) {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    return m ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${m[1]}`) : null;
  }

  addToCart(buyNow: boolean) {
    const v = this.variant()!;
    this.cart.add(v.id, this.qty());
    if (buyNow) void this.router.navigate(['/checkout']);
    else {
      this.toast.show(`${this.product()!.name} (${v.label}) × ${this.qty()} added to cart`);
      this.cart.drawerOpen.set(true);
    }
  }
  async submitReview(productId: string) {
    const r = await this.api.post('/api/reviews', { productId, rating: this.rating(), title: this.reviewTitle, body: this.reviewBody });
    this.reviewMsg.set(r.ok ? { ok: true, text: r.message ?? 'Thank you!' } : { ok: false, text: r.error });
    if (r.ok) this.reviewTitle = this.reviewBody = '';
  }
}
