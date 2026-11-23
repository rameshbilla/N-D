import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Heart, Plus, Star } from 'lucide';
import { displayPrice } from '../../shared/pricing';
import type { OfferRule, Product, Variant } from '../../shared/types';
import { CartService } from '../core/cart.service';
import { ToastService } from '../core/toast.service';
import { InrPipe, RevealDirective } from './common';
import { IconComponent } from './icon';
import { ProductThumb } from './product-art';

export type CardProduct = Pick<Product, 'id' | 'name' | 'slug' | 'tagline' | 'images' | 'accent_color' | 'category_id' | 'discount_percent'> & {
  product_variants: Pick<Variant, 'id' | 'label' | 'price_paise' | 'sale_price_paise' | 'stock'>[];
  rating?: { average: number; count: number } | null;
};

@Component({
  selector: 'nd-product-card',
  imports: [RouterLink, IconComponent, ProductThumb, InrPipe, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = product();
    @if (variant(); as v) {
      <article [ndReveal]="(index() % 4) * 0.06" class="group card flex h-full flex-col overflow-hidden transition-shadow duration-300 hover:shadow-lift">
        <div class="relative">
          <a [routerLink]="['/products', p.slug]" [attr.aria-label]="p.name">
            <nd-product-thumb [name]="p.name" [imageUrl]="p.images[0]?.url" [accent]="p.accent_color" class="transition-transform duration-500 group-hover:scale-[1.04]" />
          </a>
          @if (price().percent > 0) {
            <span class="absolute left-3 top-3 rounded-full bg-berry px-2.5 py-1 text-xs font-bold text-white shadow-soft">
              {{ price().percent }}% OFF{{ price().label && price().label !== 'Sale' ? ' · ' + price().label : '' }}
            </span>
          }
          <button type="button" (click)="cart.toggleWishlist(p.id)" class="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-soft backdrop-blur transition hover:scale-110"
            [attr.aria-label]="(wished() ? 'Remove ' : 'Add ') + p.name + (wished() ? ' from wishlist' : ' to wishlist')" [attr.aria-pressed]="wished()">
            <nd-icon [icon]="heart" class="size-4" [class]="wished() ? 'fill-berry text-berry' : 'text-forest'" />
          </button>
        </div>
        <div class="flex flex-1 flex-col p-4">
          <a [routerLink]="['/products', p.slug]" class="font-display text-lg font-semibold leading-tight text-forest hover:text-leaf">{{ p.name }}</a>
          @if (p.tagline) { <p class="mt-1 line-clamp-2 text-sm text-muted">{{ p.tagline }}</p> }
          @if (p.rating?.count) {
            <p class="mt-1.5 flex items-center gap-1 text-xs text-muted"><nd-icon [icon]="star" class="size-3.5 fill-saffron text-saffron" /> {{ p.rating!.average }} ({{ p.rating!.count }})</p>
          }
          <div class="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pack size">
            @for (o of p.product_variants; track o.id) {
              <button type="button" role="radio" [attr.aria-checked]="o.id === v.id" [disabled]="o.stock <= 0" (click)="variantId.set(o.id)"
                class="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
                [class]="(o.id === v.id ? 'border-leaf bg-leaf text-white' : 'border-line text-forest hover:border-leaf') + (o.stock <= 0 ? ' cursor-not-allowed line-through opacity-40' : '')">
                {{ o.label }}
              </button>
            }
          </div>
          <div class="mt-auto flex items-end justify-between pt-4">
            <div>
              <p class="text-xl font-bold text-forest">{{ price().price | inr }}</p>
              @if (price().price < price().mrp) { <p class="text-xs text-muted"><span class="line-through">{{ price().mrp | inr }}</span> MRP</p> }
            </div>
            <button type="button" [disabled]="v.stock <= 0" (click)="add()" class="btn btn-primary btn-sm">
              @if (v.stock > 0) { <nd-icon [icon]="plus" class="size-4" /> Add } @else { Sold out }
            </button>
          </div>
        </div>
      </article>
    }
  `,
})
export class ProductCard {
  cart = inject(CartService);
  private toast = inject(ToastService);
  product = input.required<CardProduct>();
  offers = input<OfferRule[]>([]);
  index = input(0);
  heart = Heart;
  plus = Plus;
  star = Star;

  variantId = linkedSignal(() => (this.product().product_variants.find((v) => v.stock > 0) ?? this.product().product_variants[0])?.id);
  variant = computed(() => this.product().product_variants.find((v) => v.id === this.variantId()) ?? this.product().product_variants[0]);
  price = computed(() => displayPrice(this.variant()!, this.product(), this.offers()));
  wished = computed(() => this.cart.wishlist().has(this.product().id));

  add() {
    const v = this.variant()!;
    this.cart.add(v.id, 1);
    this.toast.show(`${this.product().name} (${v.label}) added to cart`);
    this.cart.drawerOpen.set(true);
  }
}
