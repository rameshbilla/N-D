import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TriangleAlert } from 'lucide';
import { formatINR } from '../../../shared/money';
import { ORDER_STATUS_LABEL } from '../../../shared/status';
import type { OrderStatus } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { InrPipe, NdDatePipe, orderTone, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AdminHeader, adminRunner, apiResource, BarChart, StatCard } from './admin-ui';

interface Dashboard {
  orders: { total_paise: number; status: OrderStatus; created_at: string }[];
  recent: { id: string; order_number: string; status: OrderStatus; total_paise: number; created_at: string; shipping_address: { full_name?: string } }[];
  products: number;
  customers: number;
  pendingRequests: number;
  openQuotations: number;
  lowStock: { id: string; label: string; stock: number; product: { id: string; name: string } | null }[];
  notifications: { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }[];
}
const REVENUE: OrderStatus[] = ['placed', 'payment_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const PENDING: OrderStatus[] = ['placed', 'payment_confirmed', 'processing', 'packed', 'payment_review'];
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

@Component({
  selector: 'nd-admin-dashboard',
  imports: [RouterLink, IconComponent, StatusBadge, InrPipe, NdDatePipe, AdminHeader, StatCard, BarChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Dashboard" description="Store performance at a glance."><a routerLink="/admin/products/new" class="btn btn-primary btn-sm">Add product</a></nd-admin-header>
    @if (data.value(); as d) {
      <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <nd-stat label="Total revenue" [value]="inr(stats().revenue)" [hint]="inr(stats().last30) + ' in the last 30 days'" href="/admin/reports" />
        <nd-stat label="Total orders" [value]="d.orders.length" href="/admin/orders" />
        <nd-stat label="Pending orders" [value]="stats().pending" href="/admin/orders" [alert]="stats().review > 0" [hint]="stats().review ? stats().review + ' need review' : undefined" />
        <nd-stat label="Completed orders" [value]="stats().counts['delivered'] ?? 0" />
        <nd-stat label="Products" [value]="d.products" href="/admin/products" />
        <nd-stat label="Customers" [value]="d.customers" href="/admin/customers" />
        <nd-stat label="Pending custom requests" [value]="d.pendingRequests" href="/admin/custom-requests" />
        <nd-stat label="Open quotations" [value]="d.openQuotations" href="/admin/quotations" />
      </div>
      <div class="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section class="card p-5">
          <h2 class="font-sans text-base font-semibold text-forest">Daily revenue — last 30 days</h2>
          <p class="text-xs text-muted">Confirmed orders (online payments and COD), India time</p>
          <div class="mt-4"><nd-bar-chart [data]="series()" [format]="inrFmt" label="Revenue" /></div>
        </section>
        <section class="card p-5">
          <h2 class="font-sans text-base font-semibold text-forest">Orders by status</h2>
          <ul class="mt-4 space-y-3">
            @for (s of statusRows(); track s.status) {
              <li>
                <div class="flex justify-between text-sm"><span>{{ label[s.status] }}</span><span class="font-semibold text-forest">{{ s.n }}</span></div>
                <div class="mt-1 h-2 rounded-full bg-mint-50"><div class="h-2 rounded-full bg-leaf" [style.width.%]="(s.n / stats().maxStatus) * 100"></div></div>
              </li>
            } @empty { <li class="text-sm text-muted">No orders yet.</li> }
          </ul>
        </section>
      </div>
      <div class="mt-6 grid gap-6 xl:grid-cols-2">
        <section class="card overflow-x-auto p-5">
          <div class="flex items-center justify-between"><h2 class="font-sans text-base font-semibold text-forest">Recent orders</h2><a routerLink="/admin/orders" class="text-sm font-semibold text-leaf">All orders</a></div>
          <table class="table-nd mt-3 min-w-[480px]"><tbody>
            @for (o of d.recent; track o.id) {
              <tr>
                <td><a [routerLink]="['/admin/orders', o.id]" class="font-semibold text-leaf">#{{ o.order_number }}</a><span class="block text-xs text-muted">{{ o.shipping_address.full_name }}</span></td>
                <td><nd-badge [tone]="tone(o.status)">{{ label[o.status] }}</nd-badge></td>
                <td class="text-xs text-muted">{{ o.created_at | ndDate: true }}</td>
                <td class="text-right font-semibold">{{ o.total_paise | inr }}</td>
              </tr>
            }
          </tbody></table>
          @if (!d.recent.length) { <p class="mt-3 text-sm text-muted">No orders yet.</p> }
        </section>
        <section class="card p-5">
          <div class="flex items-center justify-between"><h2 class="flex items-center gap-2 font-sans text-base font-semibold text-forest"><nd-icon [icon]="warn" class="size-4 text-amber-600" /> Low stock</h2><a routerLink="/admin/inventory" class="text-sm font-semibold text-leaf">Inventory</a></div>
          <ul class="mt-3 divide-y divide-line text-sm">
            @for (v of d.lowStock; track v.id) {
              <li class="flex items-center justify-between py-2"><a [routerLink]="['/admin/products', v.product?.id]" class="text-forest">{{ v.product?.name }} · {{ v.label }}</a><span [class]="v.stock === 0 ? 'font-bold text-berry' : 'font-semibold text-amber-700'">{{ v.stock === 0 ? 'Out of stock' : v.stock + ' left' }}</span></li>
            } @empty { <li class="py-2 text-muted">All pack sizes are well stocked.</li> }
          </ul>
        </section>
      </div>
      <section id="notifications" class="card mt-6 p-5">
        <div class="flex items-center justify-between"><h2 class="font-sans text-base font-semibold text-forest">Notifications</h2><button type="button" class="btn btn-ghost btn-sm" [disabled]="r.pending()" (click)="markRead()">Mark all read</button></div>
        <ul class="mt-3 space-y-2">
          @for (n of d.notifications; track n.id) {
            <li class="rounded-2xl p-3 text-sm" [class]="n.read_at ? 'bg-white' : 'bg-mint-50'">
              <p class="font-semibold text-forest">@if (n.link) { <a [routerLink]="n.link">{{ n.title }}</a> } @else { {{ n.title }} }</p>
              @if (n.body) { <p class="whitespace-pre-line text-muted">{{ n.body }}</p> }
              <p class="mt-1 text-xs text-muted">{{ n.created_at | ndDate: true }}</p>
            </li>
          } @empty { <li class="text-sm text-muted">No notifications.</li> }
        </ul>
      </section>
    }
  `,
})
export class DashboardPage {
  private api = inject(ApiService);
  data = apiResource<Dashboard>(() => '/api/admin/dashboard');
  r = adminRunner();
  label = ORDER_STATUS_LABEL;
  tone = orderTone;
  warn = TriangleAlert;
  inr = formatINR;
  inrFmt = (v: number) => formatINR(Math.round(v));

  stats = computed(() => {
    const rows = this.data.value()?.orders ?? [];
    const rev = rows.filter((o) => REVENUE.includes(o.status));
    const counts: Record<string, number> = {};
    for (const o of rows) counts[o.status] = (counts[o.status] ?? 0) + 1;
    const since = Date.now() - 30 * 86400000;
    return {
      revenue: rev.reduce((a, o) => a + o.total_paise, 0),
      last30: rev.filter((o) => new Date(o.created_at).getTime() >= since).reduce((a, o) => a + o.total_paise, 0),
      pending: PENDING.reduce((a, s) => a + (counts[s] ?? 0), 0),
      review: counts['payment_review'] ?? 0,
      counts,
      maxStatus: Math.max(1, ...Object.values(counts)),
    };
  });
  statusRows = computed(() => Object.entries(this.stats().counts).sort((a, b) => b[1] - a[1]).map(([status, n]) => ({ status: status as OrderStatus, n })));
  series = computed(() => {
    const byDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) byDay.set(dayKey(new Date(Date.now() - i * 86400000)), 0);
    for (const o of this.data.value()?.orders ?? []) {
      if (!REVENUE.includes(o.status)) continue;
      const k = dayKey(new Date(o.created_at));
      if (byDay.has(k)) byDay.set(k, byDay.get(k)! + o.total_paise);
    }
    return [...byDay].map(([key, value]) => ({ key, value, label: new Date(`${key}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }));
  });

  markRead() {
    void this.r.run(this.api.post('/api/admin/notifications/read'), () => this.data.reload());
  }
}
