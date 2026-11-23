import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import { filter } from 'rxjs';
import { Heart, Mail, MapPin, Menu, Minus, Phone, Plus, Search, ShoppingBag, Sparkles, Trash2, Truck, User, X } from 'lucide';
import type { AllSettings } from '../../server/settings';
import type { OfferRule } from '../../shared/types';
import type { ApiResult } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CartService, cartQuote } from '../core/cart.service';
import { InrPipe, Logo } from '../ui/common';
import { IconComponent } from '../ui/icon';
import { ProductThumb } from '../ui/product-art';
import { safeResource } from '../core/safe-resource';

export type StoreInfo = AllSettings & { configured: boolean; ribbon: OfferRule | null };

const NAV = [
  { href: '/shop', label: 'Shop' },
  { href: '/categories', label: 'Categories' },
  { href: '/custom-processing', label: 'Custom Processing' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

@Component({
  selector: 'nd-cart-drawer',
  imports: [RouterLink, IconComponent, ProductThumb, InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cart.drawerOpen()) {
      <div class="fixed inset-0 z-[60] bg-forest/40 backdrop-blur-sm animate-fade-up" (click)="close()"></div>
      <aside role="dialog" aria-modal="true" aria-label="Shopping cart" class="fixed inset-y-0 right-0 z-[61] flex w-full max-w-md flex-col bg-cream shadow-lift nd-slide-in">
        <div class="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 class="flex items-center gap-2 text-xl font-semibold text-forest"><nd-icon [icon]="I.bag" class="size-5" /> Your Cart</h2>
          <button type="button" (click)="close()" class="rounded-full p-2 hover:bg-mint" aria-label="Close cart"><nd-icon [icon]="I.x" class="size-5" /></button>
        </div>
        @if (!cart.items().length) {
          <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div class="rounded-full bg-mint p-6"><nd-icon [icon]="I.bag" class="size-10 text-leaf" /></div>
            <p class="text-lg font-semibold text-forest">Your cart is empty</p>
            <p class="text-sm text-muted">Discover our naturally dehydrated powders.</p>
            <a routerLink="/shop" (click)="close()" class="btn btn-primary">Shop Products</a>
          </div>
        } @else {
          @let c = q.cart();
          <div class="flex-1 space-y-3 overflow-y-auto p-5">
            @if (c) {
              <p class="flex items-center gap-2 rounded-2xl bg-mint px-4 py-3 text-sm text-forest">
                <nd-icon [icon]="I.truck" class="size-4" />
                @if (c.freeDeliveryRemaining) { Add {{ c.freeDeliveryRemaining | inr }} more for free delivery } @else { <strong>You get free delivery!</strong> }
              </p>
              @for (i of c.issues; track i.variantId) { <p class="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{{ i.message }}</p> }
            }
            @if (q.error()) { <p class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-berry">{{ q.error() }}</p> }
            @for (l of c?.lines ?? []; track l.variantId) {
              <div class="flex gap-3 rounded-2xl bg-white p-3 shadow-soft">
                <nd-product-thumb [name]="l.productName" [imageUrl]="l.imageUrl" [accent]="l.accentColor" class="size-20 shrink-0 rounded-xl" />
                <div class="min-w-0 flex-1">
                  <a [routerLink]="['/products', l.productSlug]" (click)="close()" class="line-clamp-1 font-semibold text-forest">{{ l.productName }}</a>
                  <p class="text-xs text-muted">{{ l.variantLabel }}</p>
                  <div class="mt-1 flex items-baseline gap-2 text-sm">
                    <span class="font-bold text-forest">{{ l.unitPrice | inr }}</span>
                    @if (l.unitPrice < l.unitMrp) { <span class="text-xs text-muted line-through">{{ l.unitMrp | inr }}</span> }
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <div class="flex items-center rounded-full border border-line">
                      <button type="button" class="p-1.5" (click)="cart.setQuantity(l.variantId, l.quantity - 1)" aria-label="Decrease quantity"><nd-icon [icon]="I.minus" class="size-3.5" /></button>
                      <span class="w-7 text-center text-sm font-semibold">{{ l.quantity }}</span>
                      <button type="button" class="p-1.5" (click)="cart.setQuantity(l.variantId, l.quantity + 1)" [disabled]="l.quantity >= l.stock" aria-label="Increase quantity"><nd-icon [icon]="I.plus" class="size-3.5" /></button>
                    </div>
                    <button type="button" (click)="cart.remove(l.variantId)" class="p-1.5 text-muted hover:text-berry" [attr.aria-label]="'Remove ' + l.productName"><nd-icon [icon]="I.trash" class="size-4" /></button>
                  </div>
                </div>
              </div>
            }
          </div>
          <div class="border-t border-line bg-white p-5">
            <div class="flex justify-between text-sm text-muted"><span>Subtotal</span><span>{{ c ? (c.subtotal | inr) : '—' }}</span></div>
            @if (c && c.itemDiscount > 0) { <div class="mt-1 flex justify-between text-sm text-leaf"><span>You save</span><span>−{{ c.itemDiscount | inr }}</span></div> }
            <p class="mt-1 text-xs text-muted">Coupons, delivery and taxes are calculated in the cart.</p>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <a routerLink="/cart" (click)="close()" class="btn btn-outline">View Cart</a>
              <a routerLink="/checkout" (click)="close()" class="btn btn-primary">Checkout</a>
            </div>
          </div>
        }
      </aside>
    }
  `,
})
export class CartDrawer {
  cart = inject(CartService);
  q = cartQuote();
  I = { bag: ShoppingBag, x: X, truck: Truck, minus: Minus, plus: Plus, trash: Trash2 };
  close() {
    this.cart.drawerOpen.set(false);
  }
  @HostListener('document:keydown.escape') onEsc() {
    this.close();
  }
}

@Component({
  selector: 'nd-store-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, Logo, CartDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.value(); as s) {
      @if (!s.data.configured) {
        <div role="status" class="fixed bottom-4 left-4 z-[70] max-w-xs rounded-2xl bg-berry px-4 py-3 text-xs font-medium text-white shadow-lift">
          Setup required: connect Supabase in <code>.env</code> to load products, login and checkout. See README.
        </div>
      }
    }
    <header class="fixed inset-x-0 top-0 z-50 transition-all duration-300" [class]="scrolled() || !isHome() ? 'glass shadow-soft' : 'bg-transparent'">
      <div class="container-page flex h-[68px] items-center gap-2 sm:gap-4">
        <button type="button" class="-ml-2 rounded-full p-2 lg:hidden" (click)="menuOpen.set(true)" aria-label="Open menu"><nd-icon [icon]="I.menu" class="size-6 text-forest" /></button>
        <a routerLink="/" aria-label="N&D Nature Healthy Food — home" class="min-w-0 shrink"><nd-logo /></a>
        <nav aria-label="Main" class="ml-6 hidden items-center gap-1 lg:flex">
          @for (n of nav; track n.href) {
            <a [routerLink]="n.href" routerLinkActive="!bg-mint !text-forest" class="rounded-full px-3.5 py-2 text-sm font-semibold text-forest/80 transition-colors hover:bg-mint/60 hover:text-forest">{{ n.label }}</a>
          }
        </nav>
        <div class="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button type="button" (click)="searchOpen.set(!searchOpen())" class="rounded-full p-2.5 text-forest hover:bg-mint/60" aria-label="Search products"><nd-icon [icon]="I.search" class="size-5" /></button>
          <a routerLink="/account/wishlist" class="relative hidden rounded-full p-2.5 text-forest hover:bg-mint/60 sm:block" aria-label="Wishlist">
            <nd-icon [icon]="I.heart" class="size-5" />
            @if (cart.wishlist().size > 0) { <span class="absolute right-1 top-1 size-2 rounded-full bg-berry"></span> }
          </a>
          <a [routerLink]="auth.user() ? '/account' : '/login'" class="hidden items-center gap-2 rounded-full p-2.5 text-sm font-semibold text-forest hover:bg-mint/60 sm:flex" [attr.aria-label]="auth.user() ? 'My account' : 'Sign in'">
            <nd-icon [icon]="I.user" class="size-5" />
            <span class="hidden max-w-[8rem] truncate xl:inline">{{ auth.user() ? firstName() : 'Sign in' }}</span>
          </a>
          @if (auth.role()) { <a routerLink="/admin/dashboard" class="btn btn-outline btn-sm hidden xl:inline-flex">Admin</a> }
          <button type="button" (click)="cart.drawerOpen.set(true)" class="relative rounded-full bg-leaf p-2.5 text-white shadow-glow transition hover:bg-forest" [attr.aria-label]="'Open cart, ' + cart.count() + ' items'">
            <nd-icon [icon]="I.bag" class="size-5" />
            @if (cart.count() > 0) { <span class="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-berry px-1 text-[11px] font-bold leading-5 text-white">{{ cart.count() }}</span> }
          </button>
        </div>
      </div>
      @if (searchOpen()) {
        <form (ngSubmit)="search()" class="border-t border-line bg-cream/95" role="search">
          <div class="container-page flex gap-2 py-3">
            <input name="q" [(ngModel)]="q" class="field" placeholder="Search ABC powder, amla, moringa…" aria-label="Search products" autofocus />
            <button class="btn btn-primary">Search</button>
          </div>
        </form>
      }
      @if (store.value()?.data?.ribbon; as r) {
        <a routerLink="/shop" class="block bg-berry text-white">
          <span class="container-page flex items-center justify-center gap-2 py-1.5 text-center text-xs font-semibold sm:text-sm">
            <nd-icon [icon]="I.sparkles" class="size-4" /> {{ r.title }} — offer ends {{ endDate(r.ends_at) }}
          </span>
        </a>
      }
    </header>

    @if (menuOpen()) {
      <div class="fixed inset-0 z-50 bg-forest/40 backdrop-blur-sm" (click)="menuOpen.set(false)"></div>
      <nav aria-label="Mobile" class="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-sm flex-col bg-cream p-5 shadow-lift nd-slide-in-left">
        <div class="flex items-center justify-between">
          <nd-logo />
          <button type="button" (click)="menuOpen.set(false)" class="rounded-full p-2 hover:bg-mint" aria-label="Close menu"><nd-icon [icon]="I.x" class="size-6" /></button>
        </div>
        <ul class="mt-8 space-y-1">
          @for (n of mobileNav; track n.href) {
            <li><a [routerLink]="n.href" routerLinkActive="bg-mint" [routerLinkActiveOptions]="{ exact: n.href === '/' }" class="block rounded-2xl px-4 py-3 text-lg font-semibold text-forest/85">{{ n.label }}</a></li>
          }
        </ul>
        <div class="mt-auto grid gap-2">
          <a [routerLink]="auth.user() ? '/account' : '/login'" class="btn btn-primary"><nd-icon [icon]="I.user" class="size-4" /> {{ auth.user() ? 'My Account' : 'Sign in with mobile' }}</a>
          <a routerLink="/account/wishlist" class="btn btn-outline"><nd-icon [icon]="I.heart" class="size-4" /> Wishlist</a>
          @if (auth.role()) { <a routerLink="/admin/dashboard" class="btn btn-ghost">Admin dashboard</a> }
        </div>
      </nav>
    }

    <main id="main" [class]="isHome() ? '' : ribbon() ? 'pt-[100px]' : 'pt-[68px]'">
      <router-outlet />
    </main>

    <footer class="relative mt-24 overflow-hidden bg-forest text-mint/85">
      <svg class="absolute -top-px left-0 w-full text-cream" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h1440v20c-240 40-480 40-720 20S240 0 0 30z" fill="currentColor" /></svg>
      <div class="container-page grid gap-10 pb-10 pt-20 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <nd-logo [light]="true" />
          @let info = store.value()?.data?.store;
          <p class="mt-4 max-w-xs text-sm leading-relaxed">{{ info?.tagline || 'Pure dehydrated fruit, vegetable & herbal powders' }}. Made in small batches with careful dehydration and precision milling.</p>
          <ul class="mt-6 space-y-2.5 text-sm">
            @if (info?.phone) { <li class="flex items-center gap-2"><nd-icon [icon]="I.phone" class="size-4 text-mint" /><a [href]="'tel:' + info!.phone.replaceAll(' ', '')">{{ info!.phone }}</a></li> }
            @if (info?.email) { <li class="flex items-center gap-2"><nd-icon [icon]="I.mail" class="size-4 text-mint" /><a [href]="'mailto:' + info!.email">{{ info!.email }}</a></li> }
            @if (info?.address) { <li class="flex items-start gap-2"><nd-icon [icon]="I.pin" class="mt-0.5 size-4 text-mint" />{{ info!.address }}</li> }
          </ul>
        </div>
        @for (col of footer; track col.title) {
          <div>
            <h3 class="font-sans text-sm font-bold uppercase tracking-widest text-white">{{ col.title }}</h3>
            <ul class="mt-4 space-y-2.5 text-sm">
              @for (l of col.links; track l.href) { <li><a [routerLink]="l.href" class="transition hover:text-white">{{ l.label }}</a></li> }
            </ul>
          </div>
        }
      </div>
      <div class="border-t border-white/10">
        <div class="container-page flex flex-col gap-2 py-5 text-xs text-mint/60 sm:flex-row sm:justify-between">
          <p>© {{ year }} N&amp;D Nature Healthy Food. All rights reserved.{{ store.value()?.data?.store?.fssai ? ' · FSSAI Lic. ' + store.value()!.data.store.fssai : '' }}</p>
          <p>Secure payments by Razorpay · UPI · Cards · Net Banking</p>
        </div>
      </div>
    </footer>
    <nd-cart-drawer />
  `,
})
export class StoreLayout {
  auth = inject(AuthService);
  cart = inject(CartService);
  private router = inject(Router);
  store = safeResource(httpResource<ApiResult<StoreInfo> & { ok: true; data: StoreInfo }>(() => '/api/store'));
  I = { menu: Menu, search: Search, heart: Heart, user: User, bag: ShoppingBag, x: X, sparkles: Sparkles, phone: Phone, mail: Mail, pin: MapPin };
  nav = NAV;
  mobileNav = [{ href: '/', label: 'Home' }, ...NAV, { href: '/faqs', label: 'FAQs' }];
  footer = [
    { title: 'Shop', links: [{ href: '/shop', label: 'All Products' }, { href: '/categories/fruit-powders', label: 'Fruit Powders' }, { href: '/categories/vegetable-powders', label: 'Vegetable Powders' }, { href: '/categories/herbal-leaf-powders', label: 'Herbal & Leaf Powders' }, { href: '/categories/mixed-powders', label: 'Mixed Powders' }] },
    { title: 'Services', links: [{ href: '/custom-processing', label: 'Custom Powder Making' }, { href: '/request-quotation', label: 'Request a Quotation' }, { href: '/how-it-works', label: 'How It Works' }, { href: '/account/orders', label: 'Track Your Order' }] },
    { title: 'Company', links: [{ href: '/about', label: 'About Us' }, { href: '/contact', label: 'Contact Us' }, { href: '/faqs', label: 'FAQs' }, { href: '/privacy-policy', label: 'Privacy Policy' }, { href: '/terms', label: 'Terms & Conditions' }, { href: '/shipping-returns', label: 'Shipping & Returns' }] },
  ];
  year = new Date().getFullYear();
  scrolled = signal(false);
  menuOpen = signal(false);
  searchOpen = signal(false);
  url = signal(this.router.url);
  q = '';
  isHome = computed(() => this.url().split(/[?#]/)[0] === '/');
  ribbon = computed(() => Boolean(this.store.value()?.data?.ribbon));
  firstName = computed(() => (this.auth.user()?.name ?? 'Account').split(' ')[0]);

  constructor() {
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.menuOpen.set(false);
      this.searchOpen.set(false);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    afterNextRender(() => {
      void this.auth.ensureLoaded();
      this.onScroll();
    });
    effect(() => {
      // Lock page scroll while an overlay is open.
      const locked = this.cart.drawerOpen() || this.menuOpen();
      if (typeof document !== 'undefined') document.body.style.overflow = locked ? 'hidden' : '';
    });
  }

  @HostListener('window:scroll') onScroll() {
    this.scrolled.set(window.scrollY > 12);
  }
  search() {
    void this.router.navigate(['/shop'], { queryParams: { q: this.q.trim() || null } });
  }
  endDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  }
}
