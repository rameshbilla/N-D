import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ArrowRight, BadgeCheck, Factory, FlaskConical, Leaf, PackageCheck, ShieldCheck, Sparkles, Truck } from 'lucide';
import type { Banner, Category, OfferRule } from '../../../shared/types';
import { SeoService } from '../../core/seo.service';
import { RevealDirective } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { ProductCard, type CardProduct } from '../../ui/product-card';
import { ProductionStory } from './story/production-story';
import { safeResource } from '../../core/safe-resource';

interface HomeData {
  featured: CardProduct[];
  categories: Category[];
  offers: OfferRule[];
  banners: Banner[];
}

const CATEGORY_STYLE: Record<string, { from: string; emoji: string }> = {
  'fruit-powders': { from: 'from-amber-100', emoji: '🥭' },
  'vegetable-powders': { from: 'from-orange-100', emoji: '🥕' },
  'herbal-leaf-powders': { from: 'from-lime-100', emoji: '🌿' },
  'mixed-powders': { from: 'from-rose-100', emoji: '🫐' },
};

@Component({
  selector: 'nd-home',
  imports: [RouterLink, IconComponent, ProductCard, ProductionStory, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-production-story />
    @let d = home.value()?.data;
    @if (d && (festival(d.offers).length || d.banners.length)) {
      <section class="container-page mt-16 grid gap-5 md:grid-cols-2" aria-label="Offers">
        @for (o of festival(d.offers); track o.id) {
          <a ndReveal routerLink="/shop" class="group relative flex min-h-48 overflow-hidden rounded-4xl bg-gradient-to-br from-berry to-[#7d0f1b] p-8 text-white shadow-lift">
            @if (o.banner_image_url) { <img [src]="o.banner_image_url" alt="" class="absolute inset-0 size-full object-cover opacity-30 transition duration-700 group-hover:scale-105" loading="lazy" /> }
            <div class="relative">
              <p class="eyebrow text-white/80"><nd-icon [icon]="I.sparkles" class="size-4" /> {{ o.festival_name || 'Special offer' }}</p>
              <h2 class="mt-2 text-3xl font-semibold">{{ o.title }}</h2>
              @if (o.description) { <p class="mt-2 max-w-md text-white/85">{{ o.description }}</p> }
              <p class="mt-4 inline-flex items-center gap-2 font-semibold">Shop the offer <nd-icon [icon]="I.arrow" class="size-4 transition group-hover:translate-x-1" /></p>
            </div>
          </a>
        }
        @for (b of d.banners; track b.id) {
          <a ndReveal [routerLink]="b.link_url?.startsWith('/') ? b.link_url : null" [attr.href]="b.link_url?.startsWith('https://') ? b.link_url : null" class="group relative flex min-h-48 overflow-hidden rounded-4xl bg-forest p-8 text-white shadow-lift">
            @if (b.image_url) { <img [src]="b.image_url" alt="" class="absolute inset-0 size-full object-cover opacity-40 transition duration-700 group-hover:scale-105" loading="lazy" /> }
            <div class="relative">
              <h2 class="text-3xl font-semibold">{{ b.title }}</h2>
              @if (b.subtitle) { <p class="mt-2 max-w-md text-mint">{{ b.subtitle }}</p> }
              <p class="mt-4 inline-flex items-center gap-2 font-semibold">{{ b.link_label || 'Explore' }} <nd-icon [icon]="I.arrow" class="size-4" /></p>
            </div>
          </a>
        }
      </section>
    }

    <section class="container-page mt-24" aria-labelledby="featured-heading">
      <div ndReveal class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p class="eyebrow"><nd-icon [icon]="I.leaf" class="size-4" /> Bestsellers</p>
          <h2 id="featured-heading" class="mt-2 text-4xl font-semibold text-forest md:text-5xl">Featured Powders</h2>
          <p class="mt-2 max-w-xl text-muted">Our most-loved powders, each made from a single, carefully dehydrated ingredient — or our signature ABC blend.</p>
        </div>
        <a routerLink="/shop" class="btn btn-outline">View all products <nd-icon [icon]="I.arrow" class="size-4" /></a>
      </div>
      @if (d?.featured?.length) {
        <div class="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          @for (p of d!.featured; track p.id; let i = $index) { <nd-product-card [product]="p" [offers]="d!.offers" [index]="i" /> }
        </div>
      } @else {
        <p class="card mt-10 p-8 text-center text-muted">Products will appear here once the store database is connected and products are published.</p>
      }
    </section>

    @if (d?.categories?.length) {
      <section class="container-page mt-24" aria-labelledby="cat-heading">
        <div ndReveal>
          <p class="eyebrow">Browse</p>
          <h2 id="cat-heading" class="mt-2 text-4xl font-semibold text-forest md:text-5xl">Shop by Category</h2>
        </div>
        <div class="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          @for (c of d!.categories; track c.id; let i = $index) {
            <a [ndReveal]="i * 0.06" [routerLink]="['/categories', c.slug]" class="group flex h-full flex-col justify-between rounded-4xl bg-gradient-to-br to-white p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lift" [class]="style(c.slug).from">
              <span class="text-4xl" aria-hidden="true">{{ style(c.slug).emoji }}</span>
              <div class="mt-8">
                <h3 class="text-xl font-semibold text-forest">{{ c.name }}</h3>
                @if (c.description) { <p class="mt-1 line-clamp-2 text-sm text-muted">{{ c.description }}</p> }
                <span class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-leaf">Explore <nd-icon [icon]="I.arrow" class="size-4 transition group-hover:translate-x-1" /></span>
              </div>
            </a>
          }
        </div>
      </section>
    }

    <section class="container-page mt-24">
      <div class="relative overflow-hidden rounded-[2.5rem] bg-forest px-6 py-14 text-white md:px-14">
        <div class="absolute -right-24 -top-24 size-96 rounded-full bg-leaf/40 blur-3xl"></div>
        <div class="absolute -bottom-24 left-10 size-72 rounded-full bg-berry/30 blur-3xl"></div>
        <div class="relative grid items-center gap-10 md:grid-cols-2">
          <div ndReveal>
            <p class="eyebrow text-mint"><nd-icon [icon]="I.flask" class="size-4" /> Custom processing</p>
            <h2 class="mt-3 text-4xl font-semibold md:text-5xl">Your harvest. Our process.</h2>
            <p class="mt-4 max-w-lg text-mint/90">Bring your own fruits, vegetables, leaves or spices. We dehydrate, grind and pack them for you — with transparent per-kg pricing and stage-by-stage tracking.</p>
            <div class="mt-8 flex flex-wrap gap-3">
              <a routerLink="/custom-processing" class="btn btn-accent">Order Your Custom Powder <nd-icon [icon]="I.arrow" class="size-4" /></a>
              <a routerLink="/how-it-works" class="btn btn-light">How it works</a>
            </div>
          </div>
          <ol class="grid gap-3 sm:grid-cols-2">
            @for (s of steps; track s.t; let i = $index) {
              <li [ndReveal]="i * 0.08" class="h-full rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <span class="flex size-9 items-center justify-center rounded-full bg-mint font-bold text-forest">{{ i + 1 }}</span>
                <h3 class="mt-3 font-sans text-lg font-semibold">{{ s.t }}</h3>
                <p class="mt-1 text-sm text-mint/80">{{ s.d }}</p>
              </li>
            }
          </ol>
        </div>
      </div>
    </section>

    <section class="container-page mt-24" aria-labelledby="why-heading">
      <div ndReveal class="text-center">
        <p class="eyebrow justify-center">Why N&amp;D</p>
        <h2 id="why-heading" class="mt-2 text-4xl font-semibold text-forest md:text-5xl">Made the careful way</h2>
      </div>
      <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @for (f of features; track f.t; let i = $index) {
          <div [ndReveal]="(i % 4) * 0.06" class="card h-full p-6">
            <span class="flex size-11 items-center justify-center rounded-2xl bg-mint text-leaf"><nd-icon [icon]="f.icon" class="size-5" /></span>
            <h3 class="mt-4 font-sans text-lg font-semibold text-forest">{{ f.t }}</h3>
            <p class="mt-1 text-sm text-muted">{{ f.d }}</p>
          </div>
        }
      </div>
    </section>
  `,
})
export class HomePage {
  home = safeResource(httpResource<{ data: HomeData }>(() => '/api/home'));
  I = { arrow: ArrowRight, sparkles: Sparkles, leaf: Leaf, flask: FlaskConical };
  steps = [
    { t: 'Submit a request', d: 'Tell us the ingredient, quantity and processing type. Add photos.' },
    { t: 'Get a quotation', d: 'See an instant estimate, then a confirmed quotation from our team.' },
    { t: 'Pay securely', d: 'Accept and pay online with UPI, cards or net banking.' },
    { t: 'Track every stage', d: 'From raw material received to dispatch — live in your account.' },
  ];
  features = [
    { icon: Leaf, t: 'Real ingredients', d: 'Each pack lists exactly what is inside — the ingredient itself, nothing hidden.' },
    { icon: Factory, t: 'Controlled dehydration', d: 'Warm, circulating air at controlled temperatures for even drying.' },
    { icon: BadgeCheck, t: 'Batch quality checks', d: 'Texture, colour and aroma are inspected before every batch is packed.' },
    { icon: PackageCheck, t: 'Food-grade packaging', d: 'Resealable pouches and jars, heat-sealed for freshness.' },
    { icon: ShieldCheck, t: 'Secure payments', d: 'UPI, cards and net banking through Razorpay. We never store card details.' },
    { icon: Truck, t: 'Delivered across India', d: 'Tracked shipping with status updates at every step.' },
    { icon: FlaskConical, t: 'Custom processing', d: 'Turn your own produce into powder with clear per-kg pricing.' },
    { icon: Sparkles, t: 'Honest information', d: 'Clear uses, storage and precautions for every product — no miracle claims.' },
  ];

  constructor() {
    inject(SeoService).set({
      title: 'N&D Nature Healthy Food — Natural Dehydrated Powders',
      description: 'Premium dehydrated fruit, vegetable and herbal powders — ABC Powder, Amla, Beetroot, Carrot, Moringa and more. Custom dehydration and powder-making services in India.',
      path: '/',
      jsonLd: { '@context': 'https://schema.org', '@type': 'Organization', name: 'N&D Nature Healthy Food', url: '/' },
    });
  }
  festival = (offers: OfferRule[]) => offers.filter((o) => o.show_banner && !o.requires_coupon);
  style = (slug: string) => CATEGORY_STYLE[slug] ?? { from: 'from-mint', emoji: '🌱' };
}
