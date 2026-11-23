import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Download, Star } from 'lucide';
import { formatIndianPhone } from '../../../shared/phone';
import { ADMIN_ORDER_STATUSES, ORDER_STATUS_LABEL } from '../../../shared/status';
import type { Order, OrderItem, OrderStatus } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { InrPipe, NdDatePipe, orderTone, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { OrderSummary } from '../../ui/order';
import { AdminHeader, adminRunner, apiResource, Pager } from './admin-ui';

type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number };
const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, String(v)])).toString();

// ============================ Orders ============================
type OrderRow = Pick<Order, 'id' | 'order_number' | 'status' | 'payment_method' | 'total_paise' | 'created_at'> & { shipping_address: { full_name: string; city: string } };

@Component({
  selector: 'nd-orders-admin',
  imports: [RouterLink, FormsModule, IconComponent, StatusBadge, InrPipe, NdDatePipe, AdminHeader, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Orders" description="Manage order status, shipping and payments.">
      @if (auth.role() !== 'staff') { <a [href]="'/api/admin/reports.csv?type=orders&from=' + f.from + '&to=' + f.to" class="btn btn-outline btn-sm"><nd-icon [icon]="dl" class="size-4" /> Export CSV</a> }
    </nd-admin-header>
    <form class="card mb-4 flex flex-wrap gap-2 p-3" (ngSubmit)="apply(1)">
      <input name="q" [(ngModel)]="f.q" placeholder="Order number" class="field max-w-[180px] py-2" />
      <select name="status" [(ngModel)]="f.status" class="field w-auto py-2"><option value="">All (excl. unpaid)</option><option value="open">Open / to fulfil</option>@for (s of statuses; track s) { <option [value]="s">{{ label[s] }}</option> }</select>
      <label class="flex items-center gap-1 text-sm">From <input type="date" name="from" [(ngModel)]="f.from" class="field w-auto py-2" /></label>
      <label class="flex items-center gap-1 text-sm">To <input type="date" name="to" [(ngModel)]="f.to" class="field w-auto py-2" /></label>
      <button class="btn btn-outline btn-sm">Filter</button>
    </form>
    @if (data.value(); as d) {
      @if (d.rows.length) {
        <div class="card overflow-x-auto">
          <table class="table-nd min-w-[760px]">
            <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Payment</th><th>Status</th><th class="text-right">Total</th></tr></thead>
            <tbody>
              @for (o of d.rows; track o.id) {
                <tr>
                  <td><a [routerLink]="['/admin/orders', o.id]" class="font-semibold text-leaf">#{{ o.order_number }}</a></td>
                  <td>{{ o.shipping_address.full_name }}<span class="block text-xs text-muted">{{ o.shipping_address.city }}</span></td>
                  <td class="text-sm">{{ o.created_at | ndDate: true }}</td>
                  <td class="text-sm">{{ o.payment_method === 'cod' ? 'COD' : 'Online' }}</td>
                  <td><nd-badge [tone]="tone(o.status)">{{ label[o.status] }}</nd-badge></td>
                  <td class="text-right font-semibold">{{ o.total_paise | inr }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else { <div class="card p-10 text-center text-muted">No orders found.</div> }
      <nd-pager [page]="d.page" [total]="d.total" [pageSize]="d.pageSize" [change]="pageFn" />
    }
  `,
})
export class OrdersAdminPage {
  auth = inject(AuthService);
  f = { q: '', status: '', from: '', to: '' };
  query = signal('');
  data = apiResource<Paged<OrderRow>>(() => `/api/admin/orders?${this.query()}`);
  statuses = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
  label = ORDER_STATUS_LABEL;
  tone = orderTone;
  dl = Download;
  pageFn = (p: number) => this.apply(p);
  apply(page: number) {
    this.query.set(qs({ ...this.f, page }));
  }
}

interface OrderAdminData {
  order: Order;
  items: OrderItem[];
  events: { status: OrderStatus; note: string | null; created_at: string }[];
  shipping: { courier: string | null; tracking_number: string | null; tracking_url: string | null; expected_delivery: string | null } | null;
  payments: { id: string; method: string; status: string; amount_paise: number; razorpay_order_id: string | null; razorpay_payment_id: string | null; failure_reason: string | null; created_at: string }[];
  customer: { full_name: string | null; phone: string | null; email: string | null } | null;
}

@Component({
  selector: 'nd-order-admin',
  imports: [FormsModule, StatusBadge, InrPipe, NdDatePipe, AdminHeader, OrderSummary],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as d) {
      @let o = d.order;
      <nd-admin-header [heading]="'Order #' + o.order_number" backHref="/admin/orders" backLabel="Orders" [description]="'Placed ' + date(o.placed_at ?? o.created_at)">
        <nd-badge [tone]="tone(o.status)">{{ label[o.status] }}</nd-badge>
      </nd-admin-header>
      @if (o.status === 'payment_review') { <p class="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-berry">Payment was captured but stock was insufficient. Restock and move the order to Processing, or cancel it and refund {{ o.total_paise | inr }} from the Razorpay dashboard.</p> }
      <div class="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div class="space-y-6">
          <nd-order-summary [order]="o" [items]="d.items" />
          @if (o.discount_snapshot.length) {
            <div class="card p-5 text-sm">
              <h3 class="font-sans font-semibold text-forest">Discounts applied (snapshot)</h3>
              <ul class="mt-2 space-y-1">@for (x of o.discount_snapshot; track $index) { <li class="flex justify-between"><span>{{ x.label }} <span class="text-xs text-muted">({{ x.kind }})</span></span><span>−{{ x.amount_paise | inr }}</span></li> }</ul>
            </div>
          }
          <div class="card overflow-x-auto p-5">
            <h3 class="font-sans font-semibold text-forest">Payments</h3>
            <table class="table-nd mt-2 min-w-[520px]">
              <thead><tr><th>Date</th><th>Method</th><th>Status</th><th>Reference</th><th class="text-right">Amount</th></tr></thead>
              <tbody>@for (p of d.payments; track p.id) { <tr><td class="text-xs">{{ p.created_at | ndDate: true }}</td><td>{{ p.method }}</td><td>{{ p.status }}@if (p.failure_reason) { <span class="block text-xs text-berry">{{ p.failure_reason }}</span> }</td><td class="text-xs">{{ p.razorpay_payment_id ?? p.razorpay_order_id ?? '—' }}</td><td class="text-right">{{ p.amount_paise | inr }}</td></tr> }</tbody>
            </table>
          </div>
          <div class="card p-5">
            <h3 class="font-sans font-semibold text-forest">History</h3>
            <ol class="mt-3 space-y-2 text-sm">@for (e of d.events; track $index) { <li><span class="text-xs text-muted">{{ e.created_at | ndDate: true }}</span> — <strong>{{ label[e.status] }}</strong>{{ e.note ? ': ' + e.note : '' }}</li> }</ol>
          </div>
        </div>
        <div class="space-y-6">
          <form class="card space-y-3 p-5" (ngSubmit)="setStatus()">
            <h3 class="font-sans font-semibold text-forest">Update status</h3>
            @if (o.status === 'delivered' || o.status === 'cancelled') {
              <p class="text-sm text-muted">This order is {{ label[o.status].toLowerCase() }} and can no longer change.</p>
            } @else {
              <select name="next" [(ngModel)]="next" class="field" aria-label="New status">@for (s of adminStatuses; track s) { <option [value]="s">{{ label[s] }}</option> }</select>
              <textarea name="note" [(ngModel)]="note" rows="2" maxlength="300" placeholder="Note to customer (optional)" class="field"></textarea>
              <button class="btn btn-primary w-full" [disabled]="r.pending() || next === o.status">Update &amp; notify customer</button>
            }
          </form>
          <form class="card space-y-3 p-5" (ngSubmit)="saveShipping()">
            <h3 class="font-sans font-semibold text-forest">Shipping details</h3>
            <input name="courier" [(ngModel)]="ship.courier" placeholder="Courier (e.g. India Post, Delhivery)" class="field" aria-label="Courier" />
            <input name="tn" [(ngModel)]="ship.tracking_number" placeholder="Tracking number" class="field" aria-label="Tracking number" />
            <input name="tu" [(ngModel)]="ship.tracking_url" placeholder="https:// tracking link" class="field" aria-label="Tracking link" />
            <label class="block text-sm">Expected delivery<input type="date" name="ed" [(ngModel)]="ship.expected_delivery" class="field mt-1" /></label>
            <button class="btn btn-outline w-full" [disabled]="r.pending()">Save shipping</button>
          </form>
          <div class="card p-5 text-sm">
            <h3 class="font-sans font-semibold text-forest">Customer</h3>
            <p class="mt-2">{{ d.customer?.full_name ?? '—' }}<br />{{ fmt(d.customer?.phone) }}<br />{{ d.customer?.email }}</p>
            @let a = o.shipping_address;
            <h3 class="mt-4 font-sans font-semibold text-forest">Ship to</h3>
            <p class="mt-2">{{ a.full_name }}<br />{{ a.line1 }}{{ a.line2 ? ', ' + a.line2 : '' }}{{ a.landmark ? ', ' + a.landmark : '' }}<br />{{ a.city }}, {{ a.state }} – {{ a.pincode }}<br />{{ fmt(a.phone) }}</p>
            @if (o.customer_note) { <p class="mt-3 rounded-xl bg-amber-50 p-3">Note: {{ o.customer_note }}</p> }
          </div>
        </div>
      </div>
    }
  `,
})
export class OrderAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  id = input.required<string>();
  data = apiResource<OrderAdminData>(() => `/api/admin/orders/${this.id()}`);
  label = ORDER_STATUS_LABEL;
  adminStatuses = ADMIN_ORDER_STATUSES;
  tone = orderTone;
  fmt = formatIndianPhone;
  next: OrderStatus = 'placed';
  note = '';
  ship = { courier: '', tracking_number: '', tracking_url: '', expected_delivery: '' };
  date = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  constructor() {
    // Initialise the editable fields whenever the order (re)loads.
    effect(() => {
      const d = this.data.value();
      if (!d) return;
      this.next = d.order.status;
      this.ship = { courier: d.shipping?.courier ?? '', tracking_number: d.shipping?.tracking_number ?? '', tracking_url: d.shipping?.tracking_url ?? '', expected_delivery: d.shipping?.expected_delivery ?? '' };
    });
  }
  setStatus() {
    if (this.next === 'cancelled' && !confirm('Cancel this order? Stock will be returned to inventory. Refund online payments from the Razorpay dashboard.')) return;
    void this.r.run(this.api.put(`/api/admin/orders/${this.id()}/status`, { status: this.next, note: this.note }), () => {
      this.note = '';
      this.data.reload();
    });
  }
  saveShipping() {
    void this.r.run(this.api.put(`/api/admin/orders/${this.id()}/shipping`, this.ship), () => this.data.reload());
  }
}

// ============================ Customers ============================
type CustomerRow = { id: string; full_name: string | null; phone: string | null; email: string | null; is_blocked: boolean; created_at: string; orders: number; spent: number };

@Component({
  selector: 'nd-customers-admin',
  imports: [FormsModule, IconComponent, InrPipe, NdDatePipe, AdminHeader, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Customers" description="Registered customers (verified by mobile OTP).">
      @if (data.value()?.canBlock) { <a href="/api/admin/reports.csv?type=customers" class="btn btn-outline btn-sm"><nd-icon [icon]="dl" class="size-4" /> Export CSV</a> }
    </nd-admin-header>
    <form class="card mb-4 flex gap-2 p-3" (ngSubmit)="query.set(qs({ q: q, page: 1 }))">
      <input name="q" [(ngModel)]="q" placeholder="Name, mobile or email" class="field max-w-sm py-2" />
      <button class="btn btn-outline btn-sm">Search</button>
    </form>
    @if (data.value(); as d) {
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[720px]">
          <thead><tr><th>Customer</th><th>Mobile</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Status</th></tr></thead>
          <tbody>
            @for (c of d.rows; track c.id) {
              <tr>
                <td class="font-semibold text-forest">{{ c.full_name ?? '(no name)' }}<span class="block text-xs font-normal text-muted">{{ c.email }}</span></td>
                <td>{{ fmt(c.phone) }}</td><td class="text-sm">{{ c.created_at | ndDate }}</td><td>{{ c.orders }}</td><td>{{ c.spent | inr }}</td>
                <td>
                  @if (d.canBlock) { <button type="button" [disabled]="r.pending()" (click)="toggle(c)" class="btn btn-sm" [class]="c.is_blocked ? 'btn-outline' : 'btn-ghost text-berry'">{{ c.is_blocked ? 'Unblock' : 'Block' }}</button> }
                  @else { {{ c.is_blocked ? 'Blocked' : 'Active' }} }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="p-8 text-center text-muted">No customers found.</td></tr> }
          </tbody>
        </table>
      </div>
      <nd-pager [page]="d.page" [total]="d.total" [pageSize]="d.pageSize" [change]="pageFn" />
    }
  `,
})
export class CustomersAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  q = '';
  qs = qs;
  query = signal('');
  data = apiResource<Paged<CustomerRow> & { canBlock: boolean }>(() => `/api/admin/customers?${this.query()}`);
  fmt = formatIndianPhone;
  dl = Download;
  pageFn = (p: number) => this.query.set(qs({ q: this.q, page: p }));
  toggle(c: CustomerRow) {
    if (!confirm(c.is_blocked ? 'Unblock this customer?' : 'Block this customer? They will not be able to sign in or order.')) return;
    void this.r.run(this.api.put(`/api/admin/customers/${c.id}/blocked`, { blocked: !c.is_blocked }), () => this.data.reload());
  }
}

// ============================ Payments ============================
type PaymentRow = { id: string; method: string; status: string; amount_paise: number; razorpay_order_id: string | null; razorpay_payment_id: string | null; failure_reason: string | null; created_at: string; order: { id: string; order_number: string } | null; quotation: { request_id: string } | null };

@Component({
  selector: 'nd-payments-admin',
  imports: [RouterLink, FormsModule, IconComponent, StatusBadge, InrPipe, NdDatePipe, AdminHeader, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Payments" description="Every payment attempt. Card details are never stored — refunds are issued from the Razorpay dashboard.">
      <a href="/api/admin/reports.csv?type=payments" class="btn btn-outline btn-sm"><nd-icon [icon]="dl" class="size-4" /> Export CSV</a>
    </nd-admin-header>
    @if (data.value(); as d) {
      @if (!d.razorpayConfigured) { <p class="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Razorpay keys are not configured — online payments are disabled. Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (see README).</p> }
      <div class="card mb-4 flex gap-2 p-3">
        <select [ngModel]="status()" (ngModelChange)="status.set($event)" name="status" class="field w-auto py-2"><option value="">All</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select>
      </div>
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[860px]">
          <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Status</th><th>Razorpay IDs</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            @for (p of d.rows; track p.id) {
              <tr>
                <td class="text-xs">{{ p.created_at | ndDate: true }}</td>
                <td>@if (p.order) { <a [routerLink]="['/admin/orders', p.order.id]" class="text-leaf">Order #{{ p.order.order_number }}</a> } @else if (p.quotation) { <a [routerLink]="['/admin/custom-requests', p.quotation.request_id]" class="text-leaf">Quotation</a> } @else { — }</td>
                <td>{{ p.method === 'cod' ? 'COD / offline' : 'Razorpay' }}</td>
                <td><nd-badge [tone]="tone(p.status)">{{ p.status }}</nd-badge>@if (p.failure_reason) { <span class="block text-xs text-berry">{{ p.failure_reason }}</span> }</td>
                <td class="text-xs">{{ p.razorpay_order_id }}<br />{{ p.razorpay_payment_id }}</td>
                <td class="text-right font-semibold">{{ p.amount_paise | inr }}</td>
              </tr>
            } @empty { <tr><td colspan="6" class="p-8 text-center text-muted">No payments yet.</td></tr> }
          </tbody>
        </table>
      </div>
      <nd-pager [page]="d.page" [total]="d.total" [pageSize]="d.pageSize" [change]="pageFn" />
    }
  `,
})
export class PaymentsAdminPage {
  status = signal('');
  page = signal(1);
  data = apiResource<Paged<PaymentRow> & { razorpayConfigured: boolean }>(() => `/api/admin/payments?${qs({ status: this.status(), page: this.page() })}`);
  statuses = ['captured', 'created', 'failed', 'cod_pending', 'cod_collected', 'refunded'];
  tone = orderTone;
  dl = Download;
  pageFn = (p: number) => this.page.set(p);
}

// ============================ Reviews ============================
type ReviewRow = { id: string; rating: number; title: string | null; body: string | null; reviewer_name: string; is_approved: boolean; created_at: string; product: { name: string } | null };

@Component({
  selector: 'nd-reviews-admin',
  imports: [FormsModule, IconComponent, StatusBadge, NdDatePipe, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Reviews" description="Only verified buyers can review. Reviews appear after approval." />
    <div class="card mb-4 flex gap-2 p-3">
      <select [ngModel]="show()" (ngModelChange)="show.set($event)" name="show" class="field w-auto py-2"><option value="">Pending approval</option><option value="all">All reviews</option></select>
    </div>
    <ul class="space-y-3">
      @for (rv of data.value() ?? []; track rv.id) {
        <li class="card flex flex-wrap items-start gap-4 p-5">
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-semibold text-forest">
              {{ rv.product?.name }}
              <span class="flex">@for (n of stars; track n) { <nd-icon [icon]="star" class="size-4" [class]="n <= rv.rating ? 'fill-saffron text-saffron' : 'text-line'" /> }</span>
              <nd-badge [tone]="rv.is_approved ? 'green' : 'amber'">{{ rv.is_approved ? 'Published' : 'Pending' }}</nd-badge>
            </p>
            @if (rv.title) { <p class="mt-1 font-semibold">{{ rv.title }}</p> }
            @if (rv.body) { <p class="text-sm text-muted">{{ rv.body }}</p> }
            <p class="mt-1 text-xs text-muted">{{ rv.reviewer_name }} · {{ rv.created_at | ndDate }}</p>
          </div>
          <div class="flex gap-2">
            @if (rv.is_approved) { <button type="button" [disabled]="r.pending()" (click)="act(rv.id, 'hide')" class="btn btn-outline btn-sm">Hide</button> }
            @else { <button type="button" [disabled]="r.pending()" (click)="act(rv.id, 'approve')" class="btn btn-primary btn-sm">Approve</button> }
            <button type="button" [disabled]="r.pending()" (click)="act(rv.id, 'delete')" class="btn btn-ghost btn-sm text-berry">Delete</button>
          </div>
        </li>
      } @empty { <li class="card p-10 text-center text-muted">No reviews to show.</li> }
    </ul>
  `,
})
export class ReviewsAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  show = signal('');
  data = apiResource<ReviewRow[]>(() => `/api/admin/reviews?show=${this.show()}`);
  stars = [1, 2, 3, 4, 5];
  star = Star;
  act(id: string, action: 'approve' | 'hide' | 'delete') {
    if (action === 'delete' && !confirm('Delete this review?')) return;
    void this.r.run(this.api.put(`/api/admin/reviews/${id}`, { action }), () => this.data.reload());
  }
}
