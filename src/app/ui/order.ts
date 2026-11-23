import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, CreditCard, LoaderCircle, Tag, X } from 'lucide';
import type { PricedCart } from '../../shared/pricing';
import type { Address, Order, OrderItem, Quotation } from '../../shared/types';
import { ApiService } from '../core/api.service';
import { CartService } from '../core/cart.service';
import { openRazorpay } from '../core/razorpay';
import { InrPipe, NdDatePipe, StatusBadge } from './common';
import { IconComponent } from './icon';
import { ProductThumb } from './product-art';

export type CheckoutInfo = { key: string; razorpayOrderId: string; amount: number; name: string; contact: string; email: string };

/** Opens Razorpay, then verifies server-side. Returns 'paid' | 'failed' | 'cancelled' | 'unverified'. */
export async function payWithRazorpay(api: ApiService, c: CheckoutInfo, description: string): Promise<{ result: 'paid' | 'failed' | 'cancelled' | 'unverified'; message?: string }> {
  const outcome = await openRazorpay({ key: c.key, razorpayOrderId: c.razorpayOrderId, amount: c.amount, description, prefill: { name: c.name, contact: c.contact, email: c.email } });
  if (outcome.kind === 'success') {
    const v = await api.post('/api/payments/verify', outcome.response);
    return v.ok ? { result: 'paid' } : { result: 'unverified', message: v.error };
  }
  if (outcome.kind === 'failed') {
    await api.post('/api/payments/failure', { razorpayOrderId: c.razorpayOrderId, reason: outcome.reason });
    return { result: 'failed', message: outcome.reason };
  }
  return { result: 'cancelled' };
}

@Component({
  selector: 'nd-order-totals',
  imports: [InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = cart();
    <dl class="space-y-2 text-sm">
      <div class="flex justify-between text-muted"><dt>Subtotal (MRP)</dt><dd>{{ c.subtotalMrp | inr }}</dd></div>
      @for (o of offers(); track o.label) { <div class="flex justify-between text-leaf"><dt>{{ o.label }}</dt><dd>−{{ o.amount | inr }}</dd></div> }
      @if (c.couponDiscount > 0) { <div class="flex justify-between text-leaf"><dt>Coupon {{ c.coupon?.code }}</dt><dd>−{{ c.couponDiscount | inr }}</dd></div> }
      <div class="flex justify-between text-muted"><dt>Delivery</dt><dd>{{ c.deliveryFee ? (c.deliveryFee | inr) : 'Free' }}</dd></div>
      @if (c.codFee > 0) { <div class="flex justify-between text-muted"><dt>Cash on delivery fee</dt><dd>{{ c.codFee | inr }}</dd></div> }
      @if (!c.taxIncluded) { <div class="flex justify-between text-muted"><dt>GST ({{ c.taxRatePercent }}%)</dt><dd>{{ c.tax | inr }}</dd></div> }
      <div class="flex justify-between border-t border-line pt-3 text-lg font-bold text-forest"><dt>Total</dt><dd>{{ c.total | inr }}</dd></div>
      @if (c.taxIncluded) { <p class="text-xs text-muted">Inclusive of GST ({{ c.taxRatePercent }}%): {{ c.tax | inr }}</p> }
      @if (c.itemDiscount + c.couponDiscount > 0) { <p class="rounded-xl bg-mint px-3 py-2 text-center text-sm font-semibold text-forest">You save {{ c.itemDiscount + c.couponDiscount | inr }} on this order</p> }
    </dl>
  `,
})
export class OrderTotals {
  cart = input.required<PricedCart>();
  offers = computed(() => this.cart().appliedOffers.filter((o) => o.kind !== 'coupon'));
}

@Component({
  selector: 'nd-coupon-box',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.couponCode()) {
      <div class="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm" [class]="cart()?.coupon?.applied ? 'bg-mint text-forest' : 'bg-red-50 text-berry'">
        <nd-icon [icon]="I.tag" class="size-4" />
        <span class="flex-1"><strong>{{ store.couponCode() }}</strong> — {{ cart()?.coupon ? cart()!.coupon!.message : 'Checking…' }}</span>
        <button type="button" (click)="store.couponCode.set(null)" aria-label="Remove coupon"><nd-icon [icon]="I.x" class="size-4" /></button>
      </div>
    } @else {
      <form class="flex gap-2" (ngSubmit)="apply()">
        <label for="coupon" class="sr-only">Coupon code</label>
        <input id="coupon" name="coupon" [(ngModel)]="code" maxlength="30" placeholder="Coupon code" class="field py-2.5 uppercase" />
        <button class="btn btn-outline">Apply</button>
      </form>
    }
  `,
})
export class CouponBox {
  store = inject(CartService);
  cart = input<PricedCart | null>(null);
  code = '';
  I = { tag: Tag, x: X };
  apply() {
    const c = this.code.trim().toUpperCase();
    if (c) this.store.couponCode.set(c);
    this.code = '';
  }
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

@Component({
  selector: 'nd-address-form',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
      @for (f of fields; track f.key) {
        <div [class.sm:col-span-2]="f.wide">
          <label class="field-label" [for]="'addr-' + f.key">{{ f.label }}</label>
          <input [id]="'addr-' + f.key" [name]="f.key" [(ngModel)]="form[f.key]" class="field" [attr.aria-invalid]="!!errors()[f.key]" [attr.autocomplete]="f.auto" [attr.inputmode]="f.numeric ? 'numeric' : null" />
          @if (errors()[f.key]) { <p class="field-error">{{ errors()[f.key] }}</p> }
        </div>
      }
      <div>
        <label class="field-label" for="addr-state">State *</label>
        <select id="addr-state" name="state" [(ngModel)]="form.state" class="field" autocomplete="address-level1">
          @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>
      <div>
        <label class="field-label" for="addr-pincode">PIN code *</label>
        <input id="addr-pincode" name="pincode" [(ngModel)]="form.pincode" class="field" inputmode="numeric" maxlength="6" autocomplete="postal-code" [attr.aria-invalid]="!!errors()['pincode']" />
        @if (errors()['pincode']) { <p class="field-error">{{ errors()['pincode'] }}</p> }
      </div>
      <label class="flex items-center gap-2 self-end pb-3 text-sm sm:col-span-2"><input type="checkbox" name="is_default" [(ngModel)]="form.is_default" class="size-4 accent-leaf" /> Make this my default address</label>
      @if (error()) { <p class="field-error sm:col-span-2" role="alert">{{ error() }}</p> }
      <div class="flex gap-2 sm:col-span-2">
        <button class="btn btn-primary" [disabled]="pending()">@if (pending()) { <nd-icon [icon]="loader" class="size-4 animate-spin" /> } Save address</button>
        @if (cancellable()) { <button type="button" (click)="cancelled.emit()" class="btn btn-ghost">Cancel</button> }
      </div>
    </form>
  `,
})
export class AddressForm {
  private api = inject(ApiService);
  initial = input<Address | null>(null);
  defaultName = input('');
  defaultPhone = input('');
  cancellable = input(false);
  saved = output<string>();
  cancelled = output<void>();
  states = INDIAN_STATES;
  loader = LoaderCircle;
  errors = signal<Record<string, string>>({});
  error = signal<string | null>(null);
  pending = signal(false);
  fields: { key: 'full_name' | 'phone' | 'line1' | 'line2' | 'landmark' | 'city'; label: string; auto?: string; wide?: boolean; numeric?: boolean }[] = [
    { key: 'full_name', label: 'Full name *', auto: 'name' },
    { key: 'phone', label: 'Mobile number *', auto: 'tel-national', numeric: true },
    { key: 'line1', label: 'House no., building, street *', auto: 'address-line1', wide: true },
    { key: 'line2', label: 'Area / locality', auto: 'address-line2' },
    { key: 'landmark', label: 'Landmark' },
    { key: 'city', label: 'City *', auto: 'address-level2' },
  ];
  form = { full_name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: 'Telangana', pincode: '', is_default: false };

  ngOnInit() {
    const a = this.initial();
    this.form = {
      full_name: a?.full_name ?? this.defaultName(), phone: (a?.phone ?? this.defaultPhone()).replace(/^\+91/, ''), line1: a?.line1 ?? '', line2: a?.line2 ?? '',
      landmark: a?.landmark ?? '', city: a?.city ?? '', state: a?.state ?? 'Telangana', pincode: a?.pincode ?? '', is_default: a?.is_default ?? false,
    };
  }
  async save() {
    this.pending.set(true);
    const r = await this.api.post<{ id: string }>('/api/addresses', { ...this.form, id: this.initial()?.id });
    this.pending.set(false);
    if (r.ok) this.saved.emit(r.data.id);
    else {
      this.errors.set(r.fieldErrors ?? {});
      this.error.set(r.error);
    }
  }
}

/** Renders an order from its immutable price snapshot (never from current prices). */
@Component({
  selector: 'nd-order-summary',
  imports: [ProductThumb, InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let o = order();
    <div class="card p-5">
      <ul class="divide-y divide-line">
        @for (it of items(); track it.id) {
          <li class="flex items-center gap-3 py-3">
            <nd-product-thumb [name]="it.product_name" [imageUrl]="it.image_url" class="size-14 shrink-0 rounded-xl" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-forest">{{ it.product_name }}</p>
              <p class="text-xs text-muted">{{ it.variant_label }} · {{ it.unit_price_paise | inr }} × {{ it.quantity }}{{ it.discount_label ? ' · ' + it.discount_label : '' }}</p>
            </div>
            <div class="text-right">
              <p class="font-semibold">{{ it.line_total_paise | inr }}</p>
              @if (it.unit_mrp_paise > it.unit_price_paise) { <p class="text-xs text-muted line-through">{{ it.unit_mrp_paise * it.quantity | inr }}</p> }
            </div>
          </li>
        }
      </ul>
      <dl class="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
        <div class="flex justify-between text-muted"><dt>Subtotal (MRP)</dt><dd>{{ o.subtotal_mrp_paise | inr }}</dd></div>
        @if (o.item_discount_paise) { <div class="flex justify-between text-leaf"><dt>Item discounts</dt><dd>−{{ o.item_discount_paise | inr }}</dd></div> }
        @if (o.coupon_discount_paise) { <div class="flex justify-between text-leaf"><dt>Coupon {{ o.coupon_code }}</dt><dd>−{{ o.coupon_discount_paise | inr }}</dd></div> }
        <div class="flex justify-between text-muted"><dt>Delivery</dt><dd>{{ o.delivery_fee_paise ? (o.delivery_fee_paise | inr) : 'Free' }}</dd></div>
        @if (o.cod_fee_paise) { <div class="flex justify-between text-muted"><dt>COD fee</dt><dd>{{ o.cod_fee_paise | inr }}</dd></div> }
        @if (!o.tax_inclusive) { <div class="flex justify-between text-muted"><dt>GST</dt><dd>{{ o.tax_paise | inr }}</dd></div> }
        <div class="flex justify-between border-t border-line pt-2 text-base font-bold text-forest"><dt>Total</dt><dd>{{ o.total_paise | inr }}</dd></div>
        @if (o.tax_inclusive) { <p class="text-xs text-muted">Includes GST of {{ o.tax_paise | inr }}</p> }
      </dl>
    </div>
  `,
})
export class OrderSummary {
  order = input.required<Order>();
  items = input.required<OrderItem[]>();
}

const QUOTE_TONE = { sent: 'amber', accepted: 'blue', paid: 'green', rejected: 'red', expired: 'gray', withdrawn: 'gray' } as const;

@Component({
  selector: 'nd-quotation-card',
  imports: [IconComponent, StatusBadge, InrPipe, NdDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let q = quotation();
    <div class="card p-5">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="font-sans text-lg font-semibold text-forest">Quotation</h3>
        <nd-badge [tone]="tone()">{{ q.status === 'sent' && expired() ? 'expired' : q.status }}</nd-badge>
        <span class="ml-auto text-xs text-muted">Valid until {{ q.valid_until | ndDate }}</span>
      </div>
      <dl class="mt-4 space-y-2 text-sm">
        @for (l of q.line_items; track $index) { <div class="flex justify-between gap-4"><dt class="text-muted">{{ l.label }}</dt><dd>{{ l.amount_paise | inr }}</dd></div> }
        <div class="flex justify-between border-t border-line pt-2 text-base font-bold text-forest"><dt>Total</dt><dd>{{ q.total_paise | inr }}</dd></div>
      </dl>
      @if (q.notes) { <p class="mt-3 rounded-2xl bg-mint-50 p-3 text-sm text-muted">{{ q.notes }}</p> }
      @if (error()) { <p class="mt-3 text-sm text-berry" role="alert">{{ error() }}</p> }
      <div class="mt-4 flex flex-wrap gap-2">
        @if (q.status === 'sent' && !expired()) {
          <button type="button" class="btn btn-primary btn-sm" [disabled]="pending()" (click)="respond('accept')"><nd-icon [icon]="pending() ? I.loader : I.check" class="size-4" /> Accept quotation</button>
          <button type="button" class="btn btn-outline btn-sm" [disabled]="pending()" (click)="respond('reject')"><nd-icon [icon]="I.x" class="size-4" /> Decline</button>
        }
        @if (q.status === 'accepted') {
          <button type="button" class="btn btn-accent btn-sm" [disabled]="pending()" (click)="pay()"><nd-icon [icon]="pending() ? I.loader : I.card" class="size-4" /> Pay {{ q.total_paise | inr }}</button>
        }
      </div>
    </div>
  `,
})
export class QuotationCard {
  private api = inject(ApiService);
  quotation = input.required<Quotation>();
  requestNumber = input('');
  changed = output<void>();
  pending = signal(false);
  error = signal<string | null>(null);
  I = { check: Check, x: X, card: CreditCard, loader: LoaderCircle };
  expired = computed(() => new Date(`${this.quotation().valid_until}T23:59:59+05:30`) < new Date());
  tone = computed(() => QUOTE_TONE[this.quotation().status]);

  async respond(decision: 'accept' | 'reject') {
    if (decision === 'reject' && !confirm('Decline this quotation?')) return;
    this.pending.set(true);
    const r = await this.api.post(`/api/quotations/${this.quotation().id}/respond`, { decision });
    this.pending.set(false);
    if (r.ok) this.changed.emit();
    else this.error.set(r.error);
  }
  async pay() {
    this.pending.set(true);
    this.error.set(null);
    const r = await this.api.post<CheckoutInfo>(`/api/quotations/${this.quotation().id}/pay`);
    if (!r.ok) {
      this.pending.set(false);
      return this.error.set(r.error);
    }
    const out = await payWithRazorpay(this.api, r.data, `Custom processing ${this.requestNumber()}`);
    this.pending.set(false);
    if (out.result === 'paid') this.changed.emit();
    else if (out.message) this.error.set(out.message);
  }
}

@Component({
  selector: 'nd-retry-payment',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4">
      <p class="flex-1 text-sm text-amber-900">This order is awaiting payment. Prices are locked to your original order.</p>
      <button type="button" class="btn btn-accent btn-sm" [disabled]="pending()" (click)="retry()"><nd-icon [icon]="pending() ? I.loader : I.card" class="size-4" [class.animate-spin]="pending()" /> Pay now</button>
      @if (error()) { <p class="w-full text-sm text-berry" role="alert">{{ error() }}</p> }
    </div>
  `,
})
export class RetryPayment {
  private api = inject(ApiService);
  orderId = input.required<string>();
  pending = signal(false);
  error = signal<string | null>(null);
  I = { card: CreditCard, loader: LoaderCircle };
  async retry() {
    this.pending.set(true);
    this.error.set(null);
    const r = await this.api.post<{ orderNumber: string; checkout: CheckoutInfo }>(`/api/orders/${this.orderId()}/retry-payment`);
    if (!r.ok) {
      this.pending.set(false);
      return this.error.set(r.error);
    }
    const out = await payWithRazorpay(this.api, r.data.checkout, `Order ${r.data.orderNumber}`);
    this.pending.set(false);
    if (out.result === 'paid') window.location.assign(`/payment/success?order=${this.orderId()}`);
    else if (out.result === 'unverified') window.location.assign(`/payment/failure?order=${this.orderId()}&reason=verify`);
    else if (out.message) this.error.set(out.message);
  }
}
