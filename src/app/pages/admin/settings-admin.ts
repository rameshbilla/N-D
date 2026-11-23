import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Download, Plus, Save, Trash2, UserPlus } from 'lucide';
import type { AllSettings } from '../../../server/settings';
import { formatINR, paiseToRupees } from '../../../shared/money';
import { formatIndianPhone } from '../../../shared/phone';
import { PROCESSING_LABEL } from '../../../shared/status';
import type { ProcessingType } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { InrPipe, NdDatePipe, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AdminHeader, adminRunner, apiResource, StatCard } from './admin-ui';

// ============================ Reports ============================
interface ReportSummary { from: string; to: string; revenue: number; orders: number; discounts: number; tax: number; top: { name: string; qty: number; revenue: number }[] }

@Component({
  selector: 'nd-reports-admin',
  imports: [FormsModule, IconComponent, InrPipe, AdminHeader, StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Sales reports" description="Confirmed orders in the selected period (India time). Exports open in Excel or Google Sheets." />
    <form class="card mb-6 flex flex-wrap items-end gap-3 p-4" (ngSubmit)="range.set({ from: from, to: to })">
      <label class="text-sm">From<input type="date" name="from" [(ngModel)]="from" class="field mt-1" /></label>
      <label class="text-sm">To<input type="date" name="to" [(ngModel)]="to" class="field mt-1" /></label>
      <button class="btn btn-primary btn-sm">Update</button>
    </form>
    @if (data.value(); as d) {
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <nd-stat label="Revenue" [value]="inr(d.revenue)" />
        <nd-stat label="Orders" [value]="d.orders" [hint]="'Avg ' + inr(d.orders ? round(d.revenue / d.orders) : 0)" />
        <nd-stat label="Discounts given" [value]="inr(d.discounts)" />
        <nd-stat label="GST collected" [value]="inr(d.tax)" />
      </div>
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="card overflow-x-auto p-5">
          <h2 class="font-sans font-semibold text-forest">Top products</h2>
          <table class="table-nd mt-3 min-w-[420px]">
            <thead><tr><th>Product</th><th class="text-right">Units</th><th class="text-right">Revenue</th></tr></thead>
            <tbody>@for (t of d.top; track t.name) { <tr><td>{{ t.name }}</td><td class="text-right">{{ t.qty }}</td><td class="text-right">{{ t.revenue | inr }}</td></tr> } @empty { <tr><td colspan="3" class="text-muted">No sales in this period.</td></tr> }</tbody>
          </table>
        </section>
        <section class="card p-5">
          <h2 class="font-sans font-semibold text-forest">Download CSV</h2>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            @for (x of exports; track x[0]) { <a [href]="'/api/admin/reports.csv?type=' + x[0] + '&from=' + d.from + '&to=' + d.to" class="btn btn-outline justify-start"><nd-icon [icon]="dl" class="size-4" /> {{ x[1] }}</a> }
          </div>
        </section>
      </div>
    }
  `,
})
export class ReportsAdminPage {
  from = '';
  to = '';
  range = signal({ from: '', to: '' });
  data = apiResource<ReportSummary>(() => `/api/admin/reports/summary?from=${this.range().from}&to=${this.range().to}`);
  exports = [['orders', 'Orders'], ['products', 'Product sales'], ['payments', 'Payments'], ['customers', 'Customers'], ['inventory', 'Inventory (current)'], ['custom', 'Custom requests']];
  dl = Download;
  inr = formatINR;
  round = Math.round;
  constructor() {
    effect(() => {
      const d = this.data.value();
      if (d && !this.from) {
        this.from = d.from;
        this.to = d.to;
      }
    });
  }
}

// ============================ Settings ============================
type Rate = { id: string; ingredient_name: string | null; processing_type: string; rate_per_kg_paise: number; is_active: boolean };
interface SettingsData { settings: AllSettings; rates: Rate[]; integrations: { name: string; ok: boolean | null; note: string }[] }

@Component({
  selector: 'nd-settings-admin',
  imports: [FormsModule, IconComponent, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Website settings" description="Store details, delivery & tax, payment options and custom processing rates." />
    @if (data.value(); as d) {
      <section class="card mb-6 p-5">
        <h2 class="font-sans font-semibold text-forest">Integrations</h2>
        <ul class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          @for (i of d.integrations; track i.name) {
            <li class="flex items-center gap-2"><span class="size-2.5 rounded-full" [class]="i.ok === null ? 'bg-sky-500' : i.ok ? 'bg-leaf' : 'bg-amber-500'"></span>{{ i.name }}: <strong>{{ i.ok === null ? 'external' : i.ok ? 'configured' : 'not configured' }}</strong>@if (i.note) { <span class="text-xs text-muted">({{ i.note }})</span> }</li>
          }
        </ul>
        <p class="mt-2 text-xs text-muted">API keys are environment variables on the server and are never shown or stored here.</p>
      </section>
      <div class="grid gap-6 xl:grid-cols-2">
        <form class="card space-y-3 p-6" (ngSubmit)="save('store', store)">
          <h2 class="font-sans font-semibold text-forest">Store details</h2>
          <label class="block"><span class="field-label">Store name</span><input name="sn" [(ngModel)]="store.name" class="field" /></label>
          <label class="block"><span class="field-label">Tagline</span><input name="st" [(ngModel)]="store.tagline" class="field" /></label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block"><span class="field-label">Phone</span><input name="sp" [(ngModel)]="store.phone" class="field" /></label>
            <label class="block"><span class="field-label">WhatsApp (with 91)</span><input name="sw" [(ngModel)]="store.whatsapp" class="field" /></label>
            <label class="block"><span class="field-label">Email</span><input name="se" [(ngModel)]="store.email" class="field" /></label>
            <label class="block"><span class="field-label">FSSAI licence no.</span><input name="sf" [(ngModel)]="store.fssai" class="field" /></label>
          </div>
          <label class="block"><span class="field-label">Address</span><textarea name="sa" [(ngModel)]="store.address" rows="2" class="field"></textarea></label>
          <button class="btn btn-primary" [disabled]="r.pending()"><nd-icon [icon]="I.save" class="size-4" /> Save store details</button>
        </form>
        <form class="card space-y-3 p-6" (ngSubmit)="save('commerce', commerce)">
          <h2 class="font-sans font-semibold text-forest">Delivery, tax &amp; payments</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block"><span class="field-label">GST %</span><input name="cg" [(ngModel)]="commerce.gst_percent" inputmode="decimal" class="field" /></label>
            <label class="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="ci" [(ngModel)]="commerce.prices_include_tax" class="size-4 accent-leaf" /> Prices include GST</label>
            <label class="block"><span class="field-label">Delivery fee ₹</span><input name="cd" [(ngModel)]="commerce.delivery_fee" inputmode="decimal" class="field" /></label>
            <label class="block"><span class="field-label">Free delivery from ₹</span><input name="cf" [(ngModel)]="commerce.free_delivery_threshold" inputmode="decimal" class="field" /></label>
            <label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="cc" [(ngModel)]="commerce.cod_enabled" class="size-4 accent-leaf" /> Enable Cash on Delivery</label>
            <label class="block"><span class="field-label">COD fee ₹</span><input name="cof" [(ngModel)]="commerce.cod_fee" inputmode="decimal" class="field" /></label>
            <label class="block"><span class="field-label">COD max order ₹</span><input name="com" [(ngModel)]="commerce.cod_max_order" inputmode="decimal" class="field" /></label>
            <label class="block"><span class="field-label">Max quantity per item</span><input name="cq" [(ngModel)]="commerce.max_qty_per_item" inputmode="numeric" class="field" /></label>
          </div>
          <button class="btn btn-primary" [disabled]="r.pending()"><nd-icon [icon]="I.save" class="size-4" /> Save</button>
        </form>
        <form class="card space-y-3 p-6" (ngSubmit)="save('custom_service', custom)">
          <h2 class="font-sans font-semibold text-forest">Custom processing charges</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block"><span class="field-label">Packaging ₹ per kg</span><input name="xp" [(ngModel)]="custom.packaging_charge_per_kg" inputmode="decimal" class="field" /></label>
            <label class="block"><span class="field-label">Transport / pickup ₹ per trip</span><input name="xt" [(ngModel)]="custom.transport_charge" inputmode="decimal" class="field" /></label>
            <label class="block"><span class="field-label">Minimum quantity (kg)</span><input name="xm" [(ngModel)]="custom.min_quantity_kg" inputmode="decimal" class="field" /></label>
            <label class="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="xe" [(ngModel)]="custom.estimates_enabled" class="size-4 accent-leaf" /> Show instant estimates</label>
          </div>
          <label class="block"><span class="field-label">Note shown with rates</span><input name="xn" [(ngModel)]="custom.notes" class="field" /></label>
          <button class="btn btn-primary" [disabled]="r.pending()"><nd-icon [icon]="I.save" class="size-4" /> Save</button>
        </form>
        <section class="card space-y-3 p-6">
          <h2 class="font-sans font-semibold text-forest">Processing rates (per kg of raw material)</h2>
          <p class="text-xs text-muted">Leave ingredient blank for the default rate of a processing type. Ingredient-specific rates override the default.</p>
          <ul class="divide-y divide-line text-sm">
            @for (rate of d.rates; track rate.id) {
              <li class="flex items-center gap-2 py-2">
                <span class="flex-1">@if (rate.ingredient_name) { {{ rate.ingredient_name }} } @else { <em class="text-muted">Default</em> } · {{ procLabel(rate.processing_type) }}</span>
                <strong>{{ inr(rate.rate_per_kg_paise) }}/kg</strong>
                <button type="button" [disabled]="r.pending()" (click)="deleteRate(rate.id)" class="p-1 text-berry" aria-label="Delete rate"><nd-icon [icon]="I.trash" class="size-4" /></button>
              </li>
            }
          </ul>
          <form class="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]" (ngSubmit)="addRate()">
            <input name="ri" [(ngModel)]="newRate.ingredient_name" placeholder="Ingredient (optional)" class="field py-2" aria-label="Ingredient" />
            <select name="rt" [(ngModel)]="newRate.processing_type" class="field py-2" aria-label="Processing type">@for (k of processingTypes; track k) { <option [value]="k">{{ processing[k] }}</option> }</select>
            <input name="rr" [(ngModel)]="newRate.rate" placeholder="₹/kg" inputmode="decimal" class="field py-2" aria-label="Rate per kg" />
            <button class="btn btn-outline btn-sm" [disabled]="r.pending() || !newRate.rate"><nd-icon [icon]="I.plus" class="size-4" /> Add</button>
          </form>
        </section>
      </div>
    }
  `,
})
export class SettingsAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  data = apiResource<SettingsData>(() => '/api/admin/settings');
  I = { save: Save, trash: Trash2, plus: Plus };
  processing = PROCESSING_LABEL;
  processingTypes = Object.keys(PROCESSING_LABEL) as ProcessingType[];
  inr = formatINR;
  procLabel = (t: string) => PROCESSING_LABEL[t as ProcessingType] ?? t;
  store = { name: '', tagline: '', phone: '', whatsapp: '', email: '', address: '', fssai: '' };
  commerce = { gst_percent: '5', prices_include_tax: true, delivery_fee: '', free_delivery_threshold: '', cod_enabled: false, cod_fee: '', cod_max_order: '', max_qty_per_item: '20' };
  custom = { packaging_charge_per_kg: '', transport_charge: '', min_quantity_kg: '1', estimates_enabled: true, notes: '' };
  newRate = { ingredient_name: '', processing_type: 'dehydration_powder' as ProcessingType, rate: '', is_active: true };

  constructor() {
    effect(() => {
      const s = this.data.value()?.settings;
      if (!s) return;
      this.store = { ...s.store };
      const c = s.commerce;
      this.commerce = {
        gst_percent: String(c.gst_percent), prices_include_tax: c.prices_include_tax, delivery_fee: paiseToRupees(c.delivery_fee_paise), free_delivery_threshold: paiseToRupees(c.free_delivery_threshold_paise),
        cod_enabled: c.cod_enabled, cod_fee: paiseToRupees(c.cod_fee_paise), cod_max_order: paiseToRupees(c.cod_max_order_paise), max_qty_per_item: String(c.max_qty_per_item),
      };
      const x = s.custom_service;
      this.custom = { packaging_charge_per_kg: paiseToRupees(x.packaging_charge_per_kg_paise), transport_charge: paiseToRupees(x.transport_charge_paise), min_quantity_kg: String(x.min_quantity_kg), estimates_enabled: x.estimates_enabled, notes: x.notes };
    });
  }
  save(key: 'store' | 'commerce' | 'custom_service', body: object) {
    void this.r.run(this.api.put(`/api/admin/settings/${key}`, body));
  }
  addRate() {
    void this.r.run(this.api.post('/api/admin/service-rates', { ...this.newRate, rate: String(this.newRate.rate) }), () => {
      this.newRate = { ...this.newRate, ingredient_name: '', rate: '' };
      this.data.reload();
    });
  }
  deleteRate(id: string) {
    void this.r.run(this.api.delete(`/api/admin/service-rates/${id}`), () => this.data.reload());
  }
}

// ============================ Admin users (Super Admin) ============================
type AdminRow = { phone: string; role: string; display_name: string | null; is_active: boolean; created_at: string };

@Component({
  selector: 'nd-admin-users',
  imports: [FormsModule, IconComponent, StatusBadge, NdDatePipe, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Admin & staff accounts" description="Only numbers on this list can receive an admin sign-in code. Roles: Super Admin (everything), Admin (catalogue, offers, orders, settings), Staff (orders, custom requests, stock)." />
    <div class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[560px]">
          <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Added</th><th>Access</th><th></th></tr></thead>
          <tbody>
            @for (u of data.value()?.users ?? []; track u.phone) {
              @let me = u.phone === data.value()!.myPhone;
              <tr>
                <td class="font-semibold text-forest">{{ u.display_name ?? '—' }}@if (me) { <span class="ml-1 text-xs text-muted">(you)</span> }</td>
                <td>{{ fmt(u.phone) }}</td><td class="capitalize">{{ u.role.replace('_', ' ') }}</td><td class="text-xs">{{ u.created_at | ndDate }}</td>
                <td><nd-badge [tone]="u.is_active ? 'green' : 'gray'">{{ u.is_active ? 'Active' : 'Revoked' }}</nd-badge></td>
                <td>@if (!me) { <button type="button" [disabled]="r.pending()" (click)="toggle(u)" class="btn btn-sm" [class]="u.is_active ? 'btn-ghost text-berry' : 'btn-outline'">{{ u.is_active ? 'Revoke' : 'Restore' }}</button> }</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <form class="card h-fit space-y-3 p-5" (ngSubmit)="add()">
        <h2 class="font-sans font-semibold text-forest">Authorise a number</h2>
        <input name="name" [(ngModel)]="form.name" placeholder="Name" class="field" aria-label="Name" />
        <input name="phone" [(ngModel)]="form.phone" placeholder="10-digit mobile" inputmode="numeric" class="field" aria-label="Mobile number" />
        <select name="role" [(ngModel)]="form.role" class="field" aria-label="Role"><option value="staff">Staff</option><option value="admin">Admin</option></select>
        <button class="btn btn-primary w-full" [disabled]="r.pending()"><nd-icon [icon]="add_" class="size-4" /> Grant access</button>
        <p class="text-xs text-muted">They sign in at /admin/login with an OTP sent to this number. A mobile number alone never grants access.</p>
      </form>
    </div>
  `,
})
export class AdminUsersPage {
  private api = inject(ApiService);
  r = adminRunner();
  data = apiResource<{ users: AdminRow[]; myPhone: string }>(() => '/api/admin/admins');
  form = { phone: '', role: 'staff', name: '' };
  fmt = formatIndianPhone;
  add_ = UserPlus;
  add() {
    void this.r.run(this.api.post('/api/admin/admins', this.form), () => {
      this.form = { phone: '', role: 'staff', name: '' };
      this.data.reload();
    });
  }
  toggle(u: AdminRow) {
    if (!confirm(u.is_active ? 'Revoke admin access for this number?' : 'Restore access?')) return;
    void this.r.run(this.api.put(`/api/admin/admins/${encodeURIComponent(u.phone)}`, { active: !u.is_active }), () => this.data.reload());
  }
}
