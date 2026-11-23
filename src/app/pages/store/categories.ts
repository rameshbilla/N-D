import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ArrowRight } from 'lucide';
import type { Category } from '../../../shared/types';
import { SeoService } from '../../core/seo.service';
import { PageHero, RevealDirective } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import type { CardProduct } from '../../ui/product-card';
import { safeResource } from '../../core/safe-resource';

@Component({
  selector: 'nd-categories',
  imports: [RouterLink, IconComponent, PageHero, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Browse" heading="Product Categories" description="Fruit, vegetable, herbal and blended powders — find the right one for your kitchen." [crumbs]="[{ href: '/categories', label: 'Categories' }]" />
    @let d = data.value()?.data;
    <section class="container-page mt-10 grid gap-5 md:grid-cols-2">
      @for (c of d?.categories ?? []; track c.id; let i = $index) {
        <a [ndReveal]="(i % 2) * 0.08" [routerLink]="['/categories', c.slug]" class="group card flex h-full flex-col p-7 transition hover:-translate-y-1 hover:shadow-lift">
          <h2 class="text-3xl font-semibold text-forest">{{ c.name }}</h2>
          @if (c.description) { <p class="mt-2 text-muted">{{ c.description }}</p> }
          <div class="mt-5 flex flex-wrap gap-2">
            @for (p of inCategory(d!.products, c.id).slice(0, 6); track p.id) {
              <span class="rounded-full px-3 py-1 text-xs font-semibold text-white" [style.background]="p.accent_color">{{ p.name }}</span>
            }
          </div>
          <span class="mt-auto inline-flex items-center gap-1 pt-6 font-semibold text-leaf">{{ inCategory(d!.products, c.id).length }} products <nd-icon [icon]="arrow" class="size-4 transition group-hover:translate-x-1" /></span>
        </a>
      } @empty {
        <p class="card p-8 text-muted">Categories will appear once the store database is connected.</p>
      }
    </section>
  `,
})
export class CategoriesPage {
  data = safeResource(httpResource<{ data: { categories: Category[]; products: CardProduct[] } }>(() => '/api/catalogue'));
  arrow = ArrowRight;
  inCategory = (products: CardProduct[], id: string) => products.filter((p) => p.category_id === id);
  constructor() {
    inject(SeoService).set({ title: 'Product Categories', description: 'Fruit, vegetable, herbal and mixed powders by N&D Nature Healthy Food.', path: '/categories' });
  }
}
