import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, LoaderCircle, Lock, Minus, Plus, ShoppingBag, Trash2, Truck } from 'lucide';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CartService, cartQuote } from '../../core/cart.service';
import { SeoService } from '../../core/seo.service';
import { InrPipe } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { CouponBox, OrderTotals } from '../../ui/order';
import { ProductThumb } from '../../ui/product-art';

@Component({
  selector: 'nd-cart-page',
  imports: [RouterLink, IconComponent, InrPipe, ProductThumb, CouponBox, OrderTotals],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!cart.ready()) {
      <div class="flex justify-center py-32"><nd-icon [icon]="I.loader" class="size-8 animate-spin text-leaf" /></div>
    } @else if (!cart.items().length) {
      <section class="container-page flex flex-col items-center py-24 text-center">
        <div class="rounded-full bg-mint p-8"><nd-icon [icon]="I.bag" class="size-12 text-leaf" /></div>
        <h1 class="mt-6 text-4xl font-semibold text-forest">Your cart is empty</h1>
        <p class="mt-2 text-muted">Add some natural goodness to get started.</p>
        <a routerLink="/shop" class="btn btn-primary mt-6">Shop all products</a>
      </section>
    } @else {
      @let c = q.cart();
      <section class="container-page py-10">
        <h1 class="text-4xl font-semibold text-forest">Shopping cart</h1>
        <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div class="space-y-3">
            @if (q.error()) { <p class="rounded-2xl bg-red-50 p-4 text-sm text-berry">{{ q.error() }}</p> }
            @for (i of c?.issues ?? []; track i.variantId) {
              <div class="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
                <span class="flex-1">{{ i.message }}</span>
                @if (i.kind === 'unavailable') { <button type="button" class="btn btn-ghost btn-sm" (click)="cart.remove(i.variantId)">Remove</button> }
                @if (i.kind === 'insufficient_stock' && i.available) { <button type="button" class="btn btn-ghost btn-sm" (click)="cart.setQuantity(i.variantId, i.available!)">Update to {{ i.available }}</button> }
              </div>
            }
            @for (l of c?.lines ?? []; track l.variantId) {
              <article class="card flex gap-4 p-4">
                <a [routerLink]="['/products', l.productSlug]" class="shrink-0"><nd-product-thumb [name]="l.productName" [imageUrl]="l.imageUrl" [accent]="l.accentColor" class="size-24 rounded-2xl sm:size-28" /></a>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <a [routerLink]="['/products', l.productSlug]" class="font-display text-lg font-semibold text-forest">{{ l.productName }}</a>
                      @if (l.discountLabel) { <p class="text-xs font-semibold text-leaf">{{ l.discountLabel }}</p> }
                    </div>
                    <button type="button" (click)="cart.remove(l.variantId)" class="p-1 text-muted hover:text-berry" [attr.aria-label]="'Remove ' + l.productName"><nd-icon [icon]="I.trash" class="size-4" /></button>
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-3">
                    <label class="sr-only" [for]="'size-' + l.variantId">Pack size</label>
                    <select [id]="'size-' + l.variantId" [value]="l.variantId" (change)="cart.replaceVariant(l.variantId, $any($event.target).value)" class="field w-auto py-1.5 text-sm">
                      @for (o of options()[l.productId] ?? [{ id: l.variantId, label: l.variantLabel, stock: l.stock }]; track o.id) {
                        <option [value]="o.id" [disabled]="o.stock <= 0" [selected]="o.id === l.variantId">{{ o.label }}{{ o.stock <= 0 ? ' (sold out)' : '' }}</option>
                      }
                    </select>
                    <div class="flex items-center rounded-full border border-line bg-white">
                      <button type="button" class="p-2" (click)="cart.setQuantity(l.variantId, l.quantity - 1)" aria-label="Decrease quantity"><nd-icon [icon]="I.minus" class="size-3.5" /></button>
                      <span class="w-8 text-center text-sm font-semibold">{{ l.quantity }}</span>
                      <button type="button" class="p-2" (click)="cart.setQuantity(l.variantId, l.quantity + 1)" [disabled]="l.quantity >= l.stock" aria-label="Increase quantity"><nd-icon [icon]="I.plus" class="size-3.5" /></button>
                    </div>
                  </div>
                  <div class="mt-2 flex items-baseline gap-2">
                    <span class="font-bold text-forest">{{ l.lineMrp - l.lineDiscount | inr }}</span>
                    @if (l.lineDiscount > 0) { <span class="text-sm text-muted line-through">{{ l.lineMrp | inr }}</span> }
                    <span class="text-xs text-muted">({{ l.unitPrice | inr }} each)</span>
                  </div>
                </div>
              </article>
            }
            @if (q.loading() && !c) { <div class="flex justify-center py-10"><nd-icon [icon]="I.loader" class="size-6 animate-spin text-leaf" /></div> }
          </div>
          <aside class="card h-fit space-y-5 p-6 lg:sticky lg:top-24">
            <h2 class="font-sans text-lg font-semibold text-forest">Order summary</h2>
            @if (c?.freeDeliveryRemaining) { <p class="flex items-center gap-2 rounded-2xl bg-mint-50 px-3 py-2 text-sm text-forest"><nd-icon [icon]="I.truck" class="size-4" /> Add {{ c!.freeDeliveryRemaining | inr }} more for free delivery</p> }
            <nd-coupon-box [cart]="c" />
            @if (c) { <nd-order-totals [cart]="c" /> } @else { <nd-icon [icon]="I.loader" class="mx-auto block size-5 animate-spin text-leaf" /> }
            <a routerLink="/checkout" class="btn btn-primary w-full" [class.pointer-events-none]="!c?.lines?.length" [class.opacity-50]="!c?.lines?.length">Proceed to Checkout <nd-icon [icon]="I.arrow" class="size-4" /></a>
            <p class="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><nd-icon [icon]="I.lock" class="size-3.5" /> {{ auth.user() ? 'Secure checkout' : 'You’ll verify your mobile number at checkout — your cart is saved.' }}</p>
          </aside>
        </div>
      </section>
    }
  `,
})
export class CartPage {
  cart = inject(CartService);
  auth = inject(AuthService);
  private api = inject(ApiService);
  q = cartQuote();
  options = signal<Record<string, { id: string; label: string; stock: number }[]>>({});
  I = { loader: LoaderCircle, bag: ShoppingBag, trash: Trash2, minus: Minus, plus: Plus, truck: Truck, arrow: ArrowRight, lock: Lock };
  private productKey = computed(() => (this.q.cart()?.lines ?? []).map((l) => l.productId).sort().join(','));

  constructor() {
    inject(SeoService).set({ title: 'Shopping Cart', noindex: true });
    effect(async () => {
      const key = this.productKey();
      if (!key) return;
      const r = await this.api.post<Record<string, { id: string; label: string; stock: number }[]>>('/api/cart/variant-options', { productIds: key.split(',') });
      if (r.ok) this.options.set(r.data);
    });
  }
}
