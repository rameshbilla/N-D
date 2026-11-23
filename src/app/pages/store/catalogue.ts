import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Search, SlidersHorizontal } from 'lucide';
import type { Category, OfferRule } from '../../../shared/types';
import { SeoService } from '../../core/seo.service';
import { PageHero } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { ProductCard, type CardProduct } from '../../ui/product-card';
import { safeResource } from '../../core/safe-resource';

interface CatalogueData {
  categories: Category[];
  category: Category | null;
  offers: OfferRule[];
  sort: string;
  products: CardProduct[];
}

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
];

/** /shop and /categories/:slug — server-rendered for SEO, query-param driven search/sort/filter. */
@Component({
  selector: 'nd-catalogue',
  imports: [RouterLink, FormsModule, IconComponent, PageHero, ProductCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data.value()?.data;
    <nd-page-hero eyebrow="Shop" [heading]="d?.category?.name ?? 'All Natural Powders'"
      [description]="d?.category?.description ?? 'Single-ingredient and blended powders, dehydrated and milled in small batches. Choose 100 g to 1 kg packs.'"
      [crumbs]="d?.category ? [{ href: '/shop', label: 'Shop' }, { href: '/categories/' + d!.category!.slug, label: d!.category!.name }] : [{ href: '/shop', label: 'Shop' }]">
      <form class="mt-6 flex max-w-xl gap-2" role="search" (ngSubmit)="go({ q: qText })">
        <label class="relative flex-1">
          <span class="sr-only">Search products</span>
          <nd-icon [icon]="I.search" class="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input name="q" [(ngModel)]="qText" placeholder="Search powders…" class="field pl-10" />
        </label>
        <button class="btn btn-primary">Search</button>
      </form>
    </nd-page-hero>

    <section class="container-page mt-8">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Categories" class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <a routerLink="/shop" [queryParams]="{ q: q() || null, sort: sort() || null }" class="shrink-0 rounded-full px-4 py-2 text-sm font-semibold" [class]="!slug() ? 'bg-leaf text-white' : 'bg-white text-forest shadow-soft hover:bg-mint'">All</a>
          @for (c of d?.categories ?? []; track c.id) {
            <a [routerLink]="['/categories', c.slug]" [queryParams]="{ q: q() || null, sort: sort() || null }" class="shrink-0 rounded-full px-4 py-2 text-sm font-semibold" [class]="slug() === c.slug ? 'bg-leaf text-white' : 'bg-white text-forest shadow-soft hover:bg-mint'">{{ c.name }}</a>
          }
        </nav>
        <div class="flex items-center gap-2">
          <nd-icon [icon]="I.sliders" class="size-4 text-muted" />
          <label for="sort" class="sr-only">Sort by</label>
          <select id="sort" [ngModel]="sort() || 'featured'" (ngModelChange)="go({ sort: $event })" class="field w-auto py-2 text-sm">
            @for (s of sorts; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
          </select>
        </div>
      </div>
      @if (d) {
        <p class="mt-6 text-sm text-muted" aria-live="polite">{{ d.products.length }} product{{ d.products.length === 1 ? '' : 's' }}@if (q()) { for “<strong class="text-forest">{{ q() }}</strong>” }</p>
        @if (d.products.length) {
          <div class="mt-4 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            @for (p of d.products; track p.id; let i = $index) { <nd-product-card [product]="p" [offers]="d.offers" [index]="i" /> }
          </div>
        } @else {
          <div class="card mt-4 p-10 text-center">
            <p class="text-lg font-semibold text-forest">No products found</p>
            <p class="mt-1 text-muted">Try a different search or browse all products.</p>
            <a routerLink="/shop" class="btn btn-primary mt-5">View all products</a>
          </div>
        }
      } @else if (data.error()) {
        <div class="card mt-6 p-10 text-center text-muted">This category could not be found. <a routerLink="/shop" class="font-semibold text-leaf">Browse all products</a>.</div>
      } @else {
        <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">@for (n of [1, 2, 3, 4]; track n) { <div class="card aspect-[3/4] animate-pulse bg-mint-50"></div> }</div>
      }
    </section>
  `,
})
export class CataloguePage {
  private router = inject(Router);
  private seo = inject(SeoService);
  slug = input<string>(); // route param (categories/:slug)
  q = input<string>(); // query params
  sort = input<string>();
  sorts = SORTS;
  qText = '';
  I = { search: Search, sliders: SlidersHorizontal };
  data = safeResource(httpResource<{ data: CatalogueData }>(() => ({ url: '/api/catalogue', params: { category: this.slug() ?? '', q: this.q() ?? '', sort: this.sort() ?? '' } })));
  path = computed(() => (this.slug() ? `/categories/${this.slug()}` : '/shop'));

  constructor() {
    effect(() => {
      this.qText = this.q() ?? '';
      const c = this.data.value()?.data?.category;
      if (this.data.error() && this.slug()) return this.seo.notFound();
      this.seo.set({
        title: c ? c.name : 'Shop All Powders',
        description: c?.description ?? 'Shop dehydrated fruit, vegetable, herbal and mixed powders — ABC, amla, beetroot, carrot, moringa and more in 100 g to 1 kg packs.',
        path: this.path(),
      });
    });
  }
  go(change: { q?: string; sort?: string }) {
    const q = change.q !== undefined ? change.q.trim() : this.q();
    const sort = change.sort !== undefined ? change.sort : this.sort();
    void this.router.navigate([this.path()], { queryParams: { q: q || null, sort: sort && sort !== 'featured' ? sort : null } });
  }
}
