import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowRight, FlaskConical, Package, Pencil, Plus, Trash2 } from 'lucide';
import { formatIndianPhone } from '../../../shared/phone';
import { ORDER_STATUS_LABEL, REQUEST_STATUS_LABEL } from '../../../shared/status';
import type { Address, CustomRequestStatus, OfferRule, OrderStatus } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { safeResource } from '../../core/safe-resource';
import { AuthService } from '../../core/auth.service';
import { InrPipe, NdDatePipe, orderTone, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AddressForm } from '../../ui/order';
import { ProductCard, type CardProduct } from '../../ui/product-card';

/** Loads `/api/...` data for a page (account pages render in the browser with the session cookie). */
export function apiResource<T>(url: () => string | undefined) {
  const api = inject(ApiService);
  return safeResource<T>(resource({
    params: url,
    loader: async ({ params }) => {
      const r = await api.get<T>(params);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  }));
}

interface Summary {
  orders: { id: string; order_number: string; status: OrderStatus; total_paise: number; created_at: string }[];
  requests: { id: string; request_number: string; ingredient_name: string; status: CustomRequestStatus; created_at: string }[];
  notifications: { id: string; title: string; body: string | null; link: string | null; created_at: string }[];
}

@Component({
  selector: 'nd-account-dashboard',
  imports: [RouterLink, IconComponent, StatusBadge, InrPipe, NdDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = data.value();
    <div class="space-y-8">
      <div class="grid gap-4 sm:grid-cols-2">
        <a routerLink="/shop" class="card flex items-center gap-4 p-5 transition hover:shadow-lift"><span class="rounded-2xl bg-mint p-3 text-leaf"><nd-icon [icon]="I.pkg" class="size-6" /></span><span><span class="block font-semibold text-forest">Shop powders</span><span class="text-sm text-muted">Browse our full range</span></span><nd-icon [icon]="I.arrow" class="ml-auto size-5 text-leaf" /></a>
        <a routerLink="/custom-processing" class="card flex items-center gap-4 p-5 transition hover:shadow-lift"><span class="rounded-2xl bg-mint p-3 text-leaf"><nd-icon [icon]="I.flask" class="size-6" /></span><span><span class="block font-semibold text-forest">Custom processing</span><span class="text-sm text-muted">Turn your produce into powder</span></span><nd-icon [icon]="I.arrow" class="ml-auto size-5 text-leaf" /></a>
      </div>
      <section class="card p-5">
        <div class="flex items-center justify-between"><h2 class="font-sans text-lg font-semibold text-forest">Recent orders</h2><a routerLink="/account/orders" class="text-sm font-semibold text-leaf">View all</a></div>
        <ul class="mt-3 divide-y divide-line">
          @for (o of s?.orders ?? []; track o.id) {
            <li><a [routerLink]="['/account/orders', o.id]" class="flex flex-wrap items-center gap-3 py-3"><span class="font-semibold text-forest">#{{ o.order_number }}</span><nd-badge [tone]="tone(o.status)">{{ orderLabel[o.status] }}</nd-badge><span class="ml-auto text-sm text-muted">{{ o.created_at | ndDate }}</span><span class="font-semibold">{{ o.total_paise | inr }}</span></a></li>
          } @empty { <li class="py-3 text-sm text-muted">No orders yet.</li> }
        </ul>
      </section>
      <section class="card p-5">
        <div class="flex items-center justify-between"><h2 class="font-sans text-lg font-semibold text-forest">Custom processing requests</h2><a routerLink="/account/requests" class="text-sm font-semibold text-leaf">View all</a></div>
        <ul class="mt-3 divide-y divide-line">
          @for (r of s?.requests ?? []; track r.id) {
            <li><a [routerLink]="['/account/requests', r.id]" class="flex flex-wrap items-center gap-3 py-3"><span class="font-semibold text-forest">#{{ r.request_number }}</span><span class="text-sm text-muted">{{ r.ingredient_name }}</span><nd-badge [tone]="tone(r.status)">{{ requestLabel[r.status] }}</nd-badge><span class="ml-auto text-sm text-muted">{{ r.created_at | ndDate }}</span></a></li>
          } @empty { <li class="py-3 text-sm text-muted">No requests yet.</li> }
        </ul>
      </section>
      @if (s?.notifications?.length) {
        <section class="card p-5">
          <h2 class="font-sans text-lg font-semibold text-forest">Notifications</h2>
          <ul class="mt-3 space-y-3">
            @for (n of s!.notifications; track n.id) {
              <li class="rounded-2xl bg-mint-50 p-3 text-sm">
                <p class="font-semibold text-forest">@if (n.link) { <a [routerLink]="n.link">{{ n.title }}</a> } @else { {{ n.title }} }</p>
                @if (n.body) { <p class="text-muted">{{ n.body }}</p> }
                <p class="mt-1 text-xs text-muted">{{ n.created_at | ndDate: true }}</p>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class AccountDashboard {
  data = apiResource<Summary>(() => '/api/account/summary');
  I = { pkg: Package, flask: FlaskConical, arrow: ArrowRight };
  orderLabel = ORDER_STATUS_LABEL;
  requestLabel = REQUEST_STATUS_LABEL;
  tone = orderTone;
}

@Component({
  selector: 'nd-profile',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card max-w-xl p-6">
      <h2 class="font-sans text-xl font-semibold text-forest">{{ welcome() ? 'Welcome! Complete your registration' : 'My profile' }}</h2>
      <p class="mt-1 text-sm text-muted">{{ welcome() ? 'Tell us your name so we can address your orders correctly.' : 'Your mobile number is verified and used to sign in.' }}</p>
      <form class="mt-6 space-y-4" (ngSubmit)="save()">
        <div><label class="field-label" for="name">Full name *</label><input id="name" name="name" [(ngModel)]="name" class="field" autocomplete="name" /></div>
        <div><label class="field-label" for="mobile">Mobile number</label><input id="mobile" [value]="phone()" disabled class="field bg-mint-50" /></div>
        <div><label class="field-label" for="email">Email (optional)</label><input id="email" name="email" type="email" [(ngModel)]="email" class="field" autocomplete="email" placeholder="For order receipts" /></div>
        @if (msg(); as m) { <p [class]="m.ok ? 'text-sm text-leaf' : 'field-error'" role="status">{{ m.text }}</p> }
        <button class="btn btn-primary" [disabled]="pending()">{{ pending() ? 'Saving…' : next() ? 'Save & continue' : 'Save profile' }}</button>
      </form>
    </div>
  `,
})
export class ProfilePage {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  welcome = input<string>();
  next = input<string>();
  name = this.auth.user()?.name ?? '';
  email = this.auth.user()?.email ?? '';
  phone = () => formatIndianPhone(this.auth.user()?.phone);
  msg = signal<{ ok: boolean; text: string } | null>(null);
  pending = signal(false);
  async save() {
    this.pending.set(true);
    const r = await this.api.put('/api/auth/profile', { fullName: this.name, email: this.email });
    this.pending.set(false);
    if (!r.ok) return this.msg.set({ ok: false, text: r.error });
    await this.auth.refresh();
    const n = this.next();
    if (n && n.startsWith('/') && !n.startsWith('//')) return void window.location.assign(n);
    this.msg.set({ ok: true, text: 'Profile saved.' });
  }
}

@Component({
  selector: 'nd-addresses',
  imports: [IconComponent, AddressForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between">
      <h2 class="font-sans text-xl font-semibold text-forest">My addresses</h2>
      @if (!editing()) { <button type="button" (click)="editing.set('new')" class="btn btn-primary btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> Add address</button> }
    </div>
    @if (editing(); as e) {
      <div class="card mt-4 p-5"><nd-address-form [initial]="e === 'new' ? null : e" [cancellable]="true" (saved)="done()" (cancelled)="editing.set(null)" /></div>
    }
    <ul class="mt-4 grid gap-3 md:grid-cols-2">
      @for (a of data.value() ?? []; track a.id) {
        <li class="card p-5 text-sm">
          <p class="font-semibold text-forest">{{ a.full_name }} @if (a.is_default) { <span class="ml-2 rounded-full bg-mint px-2 py-0.5 text-xs">Default</span> }</p>
          <p class="mt-1 text-muted">{{ a.line1 }}{{ a.line2 ? ', ' + a.line2 : '' }}{{ a.landmark ? ', ' + a.landmark : '' }}<br />{{ a.city }}, {{ a.state }} – {{ a.pincode }}<br />{{ fmt(a.phone) }}</p>
          <div class="mt-3 flex gap-2">
            <button type="button" (click)="editing.set(a)" class="btn btn-outline btn-sm"><nd-icon [icon]="I.pencil" class="size-3.5" /> Edit</button>
            <button type="button" (click)="remove(a.id)" class="btn btn-ghost btn-sm text-berry"><nd-icon [icon]="I.trash" class="size-3.5" /> Delete</button>
          </div>
        </li>
      }
    </ul>
    @if (data.value()?.length === 0 && !editing()) { <p class="card mt-4 p-8 text-center text-muted">No saved addresses yet.</p> }
  `,
})
export class AddressesPage {
  private api = inject(ApiService);
  data = apiResource<Address[]>(() => '/api/addresses');
  editing = signal<Address | 'new' | null>(null);
  I = { plus: Plus, pencil: Pencil, trash: Trash2 };
  fmt = formatIndianPhone;
  done() {
    this.editing.set(null);
    this.data.reload();
  }
  async remove(id: string) {
    if (!confirm('Delete this address?')) return;
    await this.api.delete(`/api/addresses/${id}`);
    this.data.reload();
  }
}

@Component({
  selector: 'nd-wishlist',
  imports: [RouterLink, ProductCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="font-sans text-xl font-semibold text-forest">Wishlist</h2>
    @if (data.value()?.length) {
      <div class="mt-4 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">@for (p of data.value()!; track p.id; let i = $index) { <nd-product-card [product]="p" [offers]="offers()" [index]="i" /> }</div>
    } @else if (data.value()) {
      <div class="card mt-4 p-8 text-center"><p class="text-muted">Your wishlist is empty. Tap the heart on any product to save it here.</p><a routerLink="/shop" class="btn btn-primary mt-4">Browse products</a></div>
    }
  `,
})
export class WishlistPage {
  data = apiResource<CardProduct[]>(() => '/api/account/wishlist');
  offers = signal<OfferRule[]>([]);
  constructor() {
    // Live festival offers (for discounted price display) come with the home payload.
    void inject(ApiService).get<{ offers: OfferRule[] }>('/api/home').then((r) => r.ok && this.offers.set(r.data.offers));
  }
}

interface PaymentRow {
  id: string; purpose: string; method: string; status: string; amount_paise: number; razorpay_payment_id: string | null; created_at: string;
  order: { order_number: string } | null; quotation: { request: { request_number: string } | null } | null;
}
const PAY_LABEL: Record<string, string> = { captured: 'Paid', cod_collected: 'Paid (COD)', cod_pending: 'Due on delivery', created: 'Not completed', authorized: 'Processing', failed: 'Failed', refunded: 'Refunded' };

@Component({
  selector: 'nd-payments',
  imports: [StatusBadge, InrPipe, NdDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="font-sans text-xl font-semibold text-forest">Payment history</h2>
    <p class="mt-1 text-sm text-muted">We never store your card details. Payments are processed securely by Razorpay.</p>
    @if (data.value()?.length) {
      <div class="card mt-4 overflow-x-auto">
        <table class="table-nd min-w-[600px]">
          <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Status</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            @for (p of data.value()!; track p.id) {
              <tr>
                <td>{{ p.created_at | ndDate: true }}</td>
                <td>{{ p.order ? 'Order #' + p.order.order_number : 'Request #' + (p.quotation?.request?.request_number ?? '') }}</td>
                <td>{{ p.method === 'cod' ? 'Cash on delivery' : 'Razorpay' }}@if (p.razorpay_payment_id) { <span class="block text-xs text-muted">{{ p.razorpay_payment_id }}</span> }</td>
                <td><nd-badge [tone]="tone(p.status)">{{ label[p.status] ?? p.status }}</nd-badge></td>
                <td class="text-right font-semibold">{{ p.amount_paise | inr }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (data.value()) {
      <p class="card mt-4 p-8 text-center text-muted">No payments yet.</p>
    }
  `,
})
export class PaymentsPage {
  data = apiResource<PaymentRow[]>(() => '/api/account/payments');
  label = PAY_LABEL;
  tone = orderTone;
}
