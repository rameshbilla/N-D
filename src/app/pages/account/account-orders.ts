import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, ChevronRight, ExternalLink, MapPin, Truck } from 'lucide';
import { formatIndianPhone } from '../../../shared/phone';
import { ORDER_STATUS_LABEL, ORDER_TIMELINE, orderTimelineIndex } from '../../../shared/status';
import type { Order, OrderItem, OrderStatus } from '../../../shared/types';
import { fmtDate, InrPipe, NdDatePipe, orderTone, StatusBadge, Timeline } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { OrderSummary, RetryPayment } from '../../ui/order';
import { apiResource } from './account-pages';

type OrderRow = Order & { order_items: Pick<OrderItem, 'product_name' | 'variant_label' | 'quantity'>[] };

@Component({
  selector: 'nd-orders',
  imports: [RouterLink, IconComponent, StatusBadge, InrPipe, NdDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="font-sans text-xl font-semibold text-forest">My orders</h2>
    @if (data.value()?.length) {
      <ul class="mt-4 space-y-3">
        @for (o of data.value()!; track o.id) {
          <li>
            <a [routerLink]="['/account/orders', o.id]" class="card flex flex-wrap items-center gap-3 p-5 transition hover:shadow-lift">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2"><span class="font-semibold text-forest">#{{ o.order_number }}</span><nd-badge [tone]="tone(o.status)">{{ label[o.status] }}</nd-badge></div>
                <p class="mt-1 line-clamp-1 text-sm text-muted">{{ summary(o) }}</p>
                <p class="text-xs text-muted">{{ o.created_at | ndDate: true }} · {{ o.payment_method === 'cod' ? 'Cash on delivery' : 'Online payment' }}</p>
              </div>
              <span class="text-lg font-bold text-forest">{{ o.total_paise | inr }}</span>
              <nd-icon [icon]="chevron" class="size-5 text-muted" />
            </a>
          </li>
        }
      </ul>
    } @else if (data.value()) {
      <div class="card mt-4 p-8 text-center"><p class="text-muted">You haven’t placed any orders yet.</p><a routerLink="/shop" class="btn btn-primary mt-4">Start shopping</a></div>
    }
  `,
})
export class OrdersPage {
  data = apiResource<OrderRow[]>(() => '/api/account/orders');
  label = ORDER_STATUS_LABEL;
  tone = orderTone;
  chevron = ChevronRight;
  summary = (o: OrderRow) => o.order_items.map((i) => `${i.product_name} ${i.variant_label} × ${i.quantity}`).join(', ');
}

interface OrderDetail {
  order: Order;
  items: OrderItem[];
  events: { status: OrderStatus; note: string | null; created_at: string }[];
  shipping: { courier: string | null; tracking_number: string | null; tracking_url: string | null; expected_delivery: string | null } | null;
}

@Component({
  selector: 'nd-order-detail',
  imports: [RouterLink, IconComponent, StatusBadge, NdDatePipe, Timeline, OrderSummary, RetryPayment],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/account/orders" class="inline-flex items-center gap-1 text-sm font-semibold text-leaf"><nd-icon [icon]="I.back" class="size-4" /> All orders</a>
    @if (data.value(); as d) {
      @let o = d.order;
      <div class="mt-4 space-y-6">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-2xl font-semibold text-forest">Order #{{ o.order_number }}</h2>
          <nd-badge [tone]="tone(o.status)">{{ label[o.status] }}</nd-badge>
          <span class="text-sm text-muted">Placed {{ o.placed_at ?? o.created_at | ndDate: true }}</span>
        </div>
        @if ((o.status === 'pending_payment' || o.status === 'payment_failed') && o.payment_method === 'razorpay') { <nd-retry-payment [orderId]="o.id" /> }
        @if (o.status === 'payment_review') { <p class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Your payment was received. One or more items went out of stock at the same moment — our team will contact you shortly to fulfil or refund your order.</p> }
        <section class="card p-5">
          <h3 class="mb-5 font-sans font-semibold text-forest">Order tracking</h3>
          <nd-timeline [steps]="steps()" [current]="current()" [events]="events()" [failed]="failed()" />
          @if (d.shipping?.courier || d.shipping?.tracking_number) {
            <div class="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-mint-50 p-4 text-sm">
              <nd-icon [icon]="I.truck" class="size-5 text-leaf" />
              <span><strong>{{ d.shipping!.courier }}</strong>@if (d.shipping!.tracking_number) { · Tracking no. <strong>{{ d.shipping!.tracking_number }}</strong> }</span>
              @if (d.shipping!.expected_delivery) { <span class="text-muted">Expected by {{ d.shipping!.expected_delivery | ndDate }}</span> }
              @if (d.shipping!.tracking_url) { <a [href]="d.shipping!.tracking_url" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm ml-auto">Track shipment <nd-icon [icon]="I.ext" class="size-3.5" /></a> }
            </div>
          }
        </section>
        <div class="grid gap-6 md:grid-cols-[1fr_300px]">
          <nd-order-summary [order]="o" [items]="d.items" />
          <div class="card h-fit p-5 text-sm">
            <h3 class="flex items-center gap-2 font-sans font-semibold text-forest"><nd-icon [icon]="I.pin" class="size-4" /> Delivery address</h3>
            @let a = o.shipping_address;
            <p class="mt-2 font-semibold">{{ a.full_name }}</p>
            <p class="text-muted">{{ a.line1 }}{{ a.line2 ? ', ' + a.line2 : '' }}{{ a.landmark ? ', ' + a.landmark : '' }}<br />{{ a.city }}, {{ a.state }} – {{ a.pincode }}<br />{{ fmt(a.phone) }}</p>
            <p class="mt-4 text-muted">Payment: <strong class="text-forest">{{ o.payment_method === 'cod' ? 'Cash on delivery' : 'Online (Razorpay)' }}</strong></p>
          </div>
        </div>
      </div>
    } @else if (data.error()) {
      <p class="card mt-4 p-8 text-center text-muted">Order not found.</p>
    }
  `,
})
export class OrderDetailPage {
  id = input.required<string>();
  data = apiResource<OrderDetail>(() => `/api/account/orders/${this.id()}`);
  label = ORDER_STATUS_LABEL;
  tone = orderTone;
  fmt = formatIndianPhone;
  I = { back: ArrowLeft, truck: Truck, ext: ExternalLink, pin: MapPin };
  steps = computed(() => {
    const cod = this.data.value()?.order.payment_method === 'cod';
    return ORDER_TIMELINE.filter((s) => !(cod && s.status === 'payment_confirmed')).map((s) => ({ key: s.status as string, label: s.label }));
  });
  current = computed(() => {
    const o = this.data.value()?.order;
    if (!o) return -1;
    const idx = orderTimelineIndex(o.status, o.payment_method);
    return idx < 0 ? -1 : this.steps().findIndex((s) => s.key === ORDER_TIMELINE[idx].status);
  });
  events = computed(() => Object.fromEntries((this.data.value()?.events ?? []).map((e) => [e.status, fmtDate(e.created_at, true)])));
  failed = computed(() => {
    const s = this.data.value()?.order.status;
    return s === 'cancelled' ? 'This order was cancelled.' : s === 'payment_failed' ? 'Payment was not completed for this order.' : null;
  });
}
