import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Banknote, CreditCard, LoaderCircle, Lock, MapPin, Plus, ShieldCheck } from 'lucide';
import type { CartIssue } from '../../../shared/pricing';
import { formatIndianPhone } from '../../../shared/phone';
import type { Address, PaymentMethod } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CartService, cartQuote } from '../../core/cart.service';
import { SeoService } from '../../core/seo.service';
import { InrPipe } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AddressForm, CouponBox, OrderTotals, payWithRazorpay, type CheckoutInfo } from '../../ui/order';
import { ProductThumb } from '../../ui/product-art';

type PlaceResult =
  | { ok: true; kind: 'cod'; orderId: string; orderNumber: string }
  | { ok: true; kind: 'razorpay'; orderId: string; orderNumber: string; checkout: CheckoutInfo }
  | { ok: false; error: string; issues: CartIssue[] };

@Component({
  selector: 'nd-checkout',
  imports: [RouterLink, FormsModule, IconComponent, InrPipe, ProductThumb, AddressForm, CouponBox, OrderTotals],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!cart.ready() || !loaded()) {
      <div class="flex justify-center py-32"><nd-icon [icon]="I.loader" class="size-8 animate-spin text-leaf" /></div>
    } @else {
      @let c = q.cart();
      <section class="container-page py-10">
        <h1 class="text-4xl font-semibold text-forest">Checkout</h1>
        <p class="mt-1 flex items-center gap-1.5 text-sm text-muted"><nd-icon [icon]="I.shield" class="size-4 text-leaf" /> Signed in as {{ phone() }}</p>
        <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
          <div class="space-y-6">
            @if (!auth.user()?.name) {
              <p class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Please <a routerLink="/account/profile" [queryParams]="{ next: '/checkout' }" class="font-semibold underline">add your name</a> to your profile for delivery.</p>
            }
            <section class="card p-6" aria-labelledby="addr-h">
              <div class="flex items-center justify-between">
                <h2 id="addr-h" class="flex items-center gap-2 font-sans text-lg font-semibold text-forest"><nd-icon [icon]="I.pin" class="size-5" /> 1. Delivery address</h2>
                @if (!adding()) { <button type="button" (click)="adding.set(true)" class="btn btn-ghost btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> New</button> }
              </div>
              @if (adding()) {
                <div class="mt-4"><nd-address-form [defaultName]="auth.user()?.name ?? ''" [defaultPhone]="auth.user()?.phone ?? ''" [cancellable]="addresses().length > 0" (saved)="onSaved($event)" (cancelled)="adding.set(false)" /></div>
              } @else {
                <div class="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery address">
                  @for (a of addresses(); track a.id) {
                    <label class="cursor-pointer rounded-2xl border-2 p-4 text-sm transition" [class]="addressId() === a.id ? 'border-leaf bg-mint/40' : 'border-line hover:border-leaf/50'">
                      <input type="radio" name="address" [value]="a.id" [checked]="addressId() === a.id" (change)="addressId.set(a.id)" class="sr-only" />
                      <span class="font-semibold text-forest">{{ a.full_name }}</span>
                      <span class="mt-1 block text-muted">{{ a.line1 }}{{ a.line2 ? ', ' + a.line2 : '' }}, {{ a.city }}, {{ a.state }} – {{ a.pincode }}</span>
                      <span class="block text-muted">{{ fmt(a.phone) }}</span>
                    </label>
                  }
                </div>
              }
            </section>
            <section class="card p-6" aria-labelledby="pay-h">
              <h2 id="pay-h" class="flex items-center gap-2 font-sans text-lg font-semibold text-forest"><nd-icon [icon]="I.card" class="size-5" /> 2. Payment method</h2>
              <div class="mt-4 grid gap-3" role="radiogroup" aria-label="Payment method">
                <label class="flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition" [class]="(method() === 'razorpay' ? 'border-leaf bg-mint/40' : 'border-line') + (!opts().onlineEnabled ? ' cursor-not-allowed opacity-50' : '')">
                  <input type="radio" name="method" [checked]="method() === 'razorpay'" [disabled]="!opts().onlineEnabled" (change)="method.set('razorpay')" class="mt-1 accent-leaf" />
                  <span>
                    <span class="font-semibold text-forest">Pay online — UPI, Cards, Net Banking, Wallets</span>
                    <span class="block text-sm text-muted">{{ opts().onlineEnabled ? 'Google Pay, PhonePe, Paytm, BHIM & all UPI apps · Secured by Razorpay' : 'Online payment is not configured yet.' }}</span>
                  </span>
                </label>
                @if (opts().codEnabled) {
                  <label class="flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition" [class]="(method() === 'cod' ? 'border-leaf bg-mint/40' : 'border-line') + (!codAllowed() ? ' cursor-not-allowed opacity-50' : '')">
                    <input type="radio" name="method" [checked]="method() === 'cod'" [disabled]="!codAllowed()" (change)="method.set('cod')" class="mt-1 accent-leaf" />
                    <span>
                      <span class="flex items-center gap-2 font-semibold text-forest"><nd-icon [icon]="I.cash" class="size-4" /> Cash on delivery</span>
                      <span class="block text-sm text-muted">{{ codAllowed() ? 'Pay when your order arrives. A small COD fee may apply.' : 'Available for orders up to ' + (opts().codMax | inr) + '.' }}</span>
                    </span>
                  </label>
                }
              </div>
              <label class="mt-4 block"><span class="field-label">Order note (optional)</span><textarea name="note" [(ngModel)]="note" maxlength="500" rows="2" class="field" placeholder="Delivery instructions"></textarea></label>
            </section>
          </div>
          <aside class="card h-fit space-y-5 p-6 lg:sticky lg:top-24">
            <h2 class="font-sans text-lg font-semibold text-forest">Order summary</h2>
            <ul class="max-h-64 space-y-3 overflow-y-auto">
              @for (l of c?.lines ?? []; track l.variantId) {
                <li class="flex items-center gap-3 text-sm">
                  <nd-product-thumb [name]="l.productName" [imageUrl]="l.imageUrl" [accent]="l.accentColor" class="size-12 shrink-0 rounded-xl" />
                  <span class="min-w-0 flex-1"><span class="line-clamp-1 font-semibold text-forest">{{ l.productName }}</span><span class="text-muted">{{ l.variantLabel }} × {{ l.quantity }}</span></span>
                  <span class="font-semibold">{{ l.lineMrp - l.lineDiscount | inr }}</span>
                </li>
              }
            </ul>
            @if (c?.issues?.length) {
              <div class="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">@for (i of c!.issues; track i.variantId) { <p>{{ i.message }}</p> }<a routerLink="/cart" class="mt-1 inline-block font-semibold underline">Review cart</a></div>
            }
            <nd-coupon-box [cart]="c" />
            @if (c) { <nd-order-totals [cart]="c" /> }
            @if (error()) { <p class="rounded-2xl bg-red-50 p-3 text-sm text-berry" role="alert">{{ error() }}</p> }
            <button type="button" (click)="submit()" [disabled]="!canPay() || pending() || q.loading()" class="btn btn-accent w-full text-base">
              <nd-icon [icon]="pending() ? I.loader : I.lock" class="size-4" [class.animate-spin]="pending()" />
              {{ pending() ? 'Processing…' : (method() === 'cod' ? 'Place order · ' : 'Proceed to Payment · ') + (c ? (c.total | inr) : '') }}
            </button>
            <p class="text-center text-xs text-muted">Prices, discounts, stock and taxes are verified on our server before payment. We never store card details.</p>
          </aside>
        </div>
      </section>
    }
  `,
})
export class CheckoutPage {
  cart = inject(CartService);
  auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  I = { loader: LoaderCircle, shield: ShieldCheck, pin: MapPin, plus: Plus, card: CreditCard, cash: Banknote, lock: Lock };
  addresses = signal<Address[]>([]);
  addressId = signal('');
  adding = signal(false);
  loaded = signal(false);
  opts = signal({ onlineEnabled: false, codEnabled: false, codMax: 0 });
  method = signal<PaymentMethod>('razorpay');
  note = '';
  pending = signal(false);
  error = signal<string | null>(null);
  q = cartQuote(() => this.method());
  codAllowed = computed(() => this.opts().codEnabled && (!this.q.cart() || this.q.cart()!.total <= this.opts().codMax));
  canPay = computed(() => Boolean(this.q.cart()?.lines.length && this.addressId() && !this.adding() && (this.method() === 'razorpay' ? this.opts().onlineEnabled : this.codAllowed())));
  phone = computed(() => formatIndianPhone(this.auth.user()?.phone));
  fmt = formatIndianPhone;

  constructor() {
    inject(SeoService).set({ title: 'Checkout', noindex: true });
    void this.load();
    effect(() => {
      if (this.cart.ready() && !this.cart.items().length && !this.pending()) void this.router.navigateByUrl('/cart');
    });
  }

  private async load() {
    const [a, o] = await Promise.all([this.api.get<Address[]>('/api/addresses'), this.api.get<{ onlineEnabled: boolean; codEnabled: boolean; codMax: number }>('/api/checkout/options')]);
    if (a.ok) {
      this.addresses.set(a.data);
      this.addressId.set(a.data[0]?.id ?? '');
      this.adding.set(a.data.length === 0);
    }
    if (o.ok) {
      this.opts.set(o.data);
      if (!o.data.onlineEnabled && o.data.codEnabled) this.method.set('cod');
    }
    this.loaded.set(true);
  }

  async onSaved(id: string) {
    const a = await this.api.get<Address[]>('/api/addresses');
    if (a.ok) this.addresses.set(a.data);
    this.addressId.set(id);
    this.adding.set(false);
  }

  async submit() {
    this.pending.set(true);
    this.error.set(null);
    const r = await this.api.post<PlaceResult>('/api/checkout/place', { items: this.cart.items(), couponCode: this.cart.couponCode(), paymentMethod: this.method(), addressId: this.addressId(), note: this.note || undefined });
    if (!r.ok || !r.data.ok) {
      this.pending.set(false);
      return this.error.set(r.ok ? (r.data as { error: string }).error : r.error);
    }
    const res = r.data;
    if (res.kind === 'cod') {
      this.cart.clear();
      return window.location.assign(`/payment/success?order=${res.orderId}`);
    }
    const out = await payWithRazorpay(this.api, res.checkout, `Order ${res.orderNumber}`);
    if (out.result === 'paid' || out.result === 'unverified') this.cart.clear(); // the order exists; status is confirmed server-side or by webhook
    window.location.assign(
      out.result === 'paid' ? `/payment/success?order=${res.orderId}` : `/payment/failure?order=${res.orderId}${out.result === 'unverified' ? '&reason=verify' : out.result === 'cancelled' ? '&reason=cancelled' : ''}`,
    );
  }
}
