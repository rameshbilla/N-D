import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Pencil, Plus, Save, Trash2 } from 'lucide';
import { paiseToRupees } from '../../../shared/money';
import type { Category } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { NdDatePipe, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AdminHeader, adminRunner, apiResource } from './admin-ui';

// ============================ Health information review queue ============================
type HealthRow = { id: string; name: string; status: string; total: number; pending: number; sections: number; noSource: number };

@Component({
  selector: 'nd-health-admin',
  imports: [RouterLink, StatusBadge, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Health information" [description]="'Review and approve product uses, nutrition notes and precautions before they are published. ' + totalPending() + ' item(s) awaiting review.'" />
    <div class="card overflow-x-auto">
      <table class="table-nd min-w-[720px]">
        <thead><tr><th>Product</th><th>Items</th><th>Sections covered</th><th>Review</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr>
              <td class="font-semibold text-forest">{{ r.name }}@if (r.status !== 'active') { <span class="ml-2 text-xs text-muted">({{ r.status }})</span> }</td>
              <td>{{ r.total }}</td>
              <td>{{ r.sections }} / 11</td>
              <td class="space-x-1">
                @if (r.pending) { <nd-badge tone="amber">{{ r.pending }} pending</nd-badge> } @else { <nd-badge tone="green">All published</nd-badge> }
                @if (r.noSource) { <nd-badge tone="red">{{ r.noSource }} missing source</nd-badge> }
              </td>
              <td><a [routerLink]="['/admin/products', r.id]" [queryParams]="{ tab: 'health' }" class="btn btn-outline btn-sm">Edit &amp; review</a></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class HealthInfoAdminPage {
  data = apiResource<HealthRow[]>(() => '/api/admin/health-info');
  rows = computed(() => [...(this.data.value() ?? [])].sort((a, b) => b.pending - a.pending));
  totalPending = computed(() => this.rows().reduce((a, r) => a + r.pending, 0));
}

// ============================ Categories ============================
type CatForm = { id?: string; name: string; slug: string; description: string; sort_order: number; is_active: boolean };

@Component({
  selector: 'nd-categories-admin',
  imports: [FormsModule, IconComponent, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Categories" description="Create unlimited categories. Inactive categories are hidden from the website." />
    <div class="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[560px]">
          <thead><tr><th>Name</th><th>Slug</th><th>Products</th><th>Order</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (c of data.value()?.categories ?? []; track c.id) {
              <tr>
                <td class="font-semibold text-forest">{{ c.name }}</td><td class="text-sm text-muted">/{{ c.slug }}</td><td>{{ data.value()!.counts[c.id] ?? 0 }}</td><td>{{ c.sort_order }}</td><td>{{ c.is_active ? 'Active' : 'Hidden' }}</td>
                <td class="whitespace-nowrap">
                  <button type="button" class="p-1.5" [attr.aria-label]="'Edit ' + c.name" (click)="edit(c)"><nd-icon [icon]="I.pencil" class="size-4" /></button>
                  <button type="button" class="p-1.5 text-berry" [attr.aria-label]="'Delete ' + c.name" [disabled]="r.pending()" (click)="remove(c)"><nd-icon [icon]="I.trash" class="size-4" /></button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card h-fit p-5">
        @if (form(); as f) {
          <form class="space-y-3" (ngSubmit)="save(f)">
            <h2 class="font-sans font-semibold text-forest">{{ f.id ? 'Edit category' : 'New category' }}</h2>
            <div><label class="field-label" for="cat-name">Name *</label><input id="cat-name" name="name" [(ngModel)]="f.name" class="field" /></div>
            <div><label class="field-label" for="cat-slug">Slug</label><input id="cat-slug" name="slug" [(ngModel)]="f.slug" class="field" placeholder="auto from name" /></div>
            <div><label class="field-label" for="cat-desc">Description</label><textarea id="cat-desc" name="desc" [(ngModel)]="f.description" rows="3" class="field"></textarea></div>
            <div><label class="field-label" for="cat-order">Display order</label><input id="cat-order" name="order" type="number" [(ngModel)]="f.sort_order" class="field" /></div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" [(ngModel)]="f.is_active" class="size-4 accent-leaf" /> Active</label>
            <div class="flex gap-2"><button class="btn btn-primary" [disabled]="r.pending()">Save</button><button type="button" class="btn btn-ghost" (click)="form.set(null)">Cancel</button></div>
          </form>
        } @else {
          <button type="button" (click)="form.set({ name: '', slug: '', description: '', sort_order: 0, is_active: true })" class="btn btn-primary w-full"><nd-icon [icon]="I.plus" class="size-4" /> Add category</button>
        }
      </div>
    </div>
  `,
})
export class CategoriesAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  data = apiResource<{ categories: Category[]; counts: Record<string, number> }>(() => '/api/admin/categories');
  form = signal<CatForm | null>(null);
  I = { pencil: Pencil, trash: Trash2, plus: Plus };
  edit(c: Category) {
    this.form.set({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? '', sort_order: c.sort_order, is_active: c.is_active });
  }
  save(f: CatForm) {
    const { id, ...body } = { ...f, sort_order: Number(f.sort_order) };
    void this.r.run(id ? this.api.put(`/api/admin/categories/${id}`, body) : this.api.post('/api/admin/categories', body), () => {
      this.form.set(null);
      this.data.reload();
    });
  }
  remove(c: Category) {
    if (confirm(`Delete category “${c.name}”?`)) void this.r.run(this.api.delete(`/api/admin/categories/${c.id}`), () => this.data.reload());
  }
}

// ============================ Pricing & inventory grid ============================
interface InvRow {
  id: string; label: string; sku: string | null; price_paise: number; sale_price_paise: number | null; stock: number; low_stock_threshold: number; is_active: boolean; weight_grams: number;
  product: { id: string; name: string; status: string } | null;
  edit?: { price: string; sale: string; stock: number; reason: 'restock' | 'adjustment' };
}
interface InventoryData {
  rows: InvRow[];
  ledger: { id: number; change: number; stock_after: number; reason: string; reference: string | null; created_at: string; variant: { label: string; product: { name: string } | null } | null }[];
  canEditPrice: boolean;
}

@Component({
  selector: 'nd-inventory-admin',
  imports: [FormsModule, RouterLink, IconComponent, NdDatePipe, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Pricing & Inventory" description="Update prices, sale prices and stock for every pack size in one place. Every stock change is logged." />
    <div class="card mb-4 flex flex-wrap gap-2 p-3">
      <input [(ngModel)]="q" name="q" placeholder="Search product" class="field max-w-xs py-2" (ngModelChange)="qSig.set($event)" />
      <select [(ngModel)]="low" name="low" class="field w-auto py-2" (ngModelChange)="lowSig.set($event)"><option [ngValue]="false">All pack sizes</option><option [ngValue]="true">Low / out of stock</option></select>
    </div>
    <div class="card overflow-x-auto">
      <table class="table-nd min-w-[760px]">
        <thead><tr><th>Product / pack</th><th>Regular ₹</th><th>Sale ₹</th><th>Stock</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          @for (v of rows(); track v.id) {
            @let e = v.edit!;
            <tr [class.opacity-50]="!v.is_active">
              <td><a [routerLink]="['/admin/products', v.product?.id]" [queryParams]="{ tab: 'pricing' }" class="font-semibold text-forest">{{ v.product?.name }}</a><span class="block text-xs text-muted">{{ v.label }}{{ v.sku ? ' · ' + v.sku : '' }}</span></td>
              <td><input [(ngModel)]="e.price" [name]="'p' + v.id" [disabled]="!data.value()?.canEditPrice" inputmode="decimal" class="field w-24 py-1.5" aria-label="Regular price" /></td>
              <td><input [(ngModel)]="e.sale" [name]="'s' + v.id" [disabled]="!data.value()?.canEditPrice" inputmode="decimal" class="field w-24 py-1.5" placeholder="—" aria-label="Sale price" /></td>
              <td><input type="number" min="0" [(ngModel)]="e.stock" [name]="'st' + v.id" class="field w-24 py-1.5" [class.border-amber-400]="v.stock <= v.low_stock_threshold" aria-label="Stock" />@if (v.stock === 0) { <span class="block text-xs font-semibold text-berry">Out of stock</span> }</td>
              <td><select [(ngModel)]="e.reason" [name]="'r' + v.id" class="field w-auto py-1.5 text-xs" aria-label="Reason"><option value="restock">Restock</option><option value="adjustment">Adjustment</option></select></td>
              <td><button type="button" [disabled]="r.pending()" (click)="save(v)" class="btn btn-primary btn-sm"><nd-icon [icon]="saveIcon" class="size-3.5" /> Save</button></td>
            </tr>
          }
        </tbody>
      </table>
      @if (!rows().length) { <p class="p-8 text-center text-muted">No pack sizes match.</p> }
    </div>
    <section class="card mt-6 overflow-x-auto p-5">
      <h2 class="font-sans font-semibold text-forest">Recent stock movements</h2>
      <table class="table-nd mt-3 min-w-[600px]">
        <thead><tr><th>When</th><th>Item</th><th>Change</th><th>Stock after</th><th>Reason</th></tr></thead>
        <tbody>
          @for (l of data.value()?.ledger ?? []; track l.id) {
            <tr><td class="text-xs">{{ l.created_at | ndDate: true }}</td><td>{{ l.variant?.product?.name }} · {{ l.variant?.label }}</td><td [class]="l.change < 0 ? 'text-berry' : 'text-leaf'">{{ l.change > 0 ? '+' + l.change : l.change }}</td><td>{{ l.stock_after }}</td><td class="text-sm capitalize">{{ l.reason.replace('_', ' ') }}</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class InventoryAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  data = apiResource<InventoryData>(() => '/api/admin/inventory');
  saveIcon = Save;
  q = '';
  low = false;
  qSig = signal('');
  lowSig = signal(false);
  rows = computed(() => {
    const rows = (this.data.value()?.rows ?? [])
      .map((v) => ({ ...v, edit: { price: paiseToRupees(v.price_paise), sale: paiseToRupees(v.sale_price_paise), stock: v.stock, reason: 'restock' as const } }))
      .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '') || a.weight_grams - b.weight_grams);
    const q = this.qSig().toLowerCase();
    return rows.filter((v) => (!this.lowSig() || v.stock <= v.low_stock_threshold) && (!q || v.product?.name.toLowerCase().includes(q)));
  });
  save(v: InvRow) {
    const e = v.edit!;
    void this.r.run(this.api.put(`/api/admin/variants/${v.id}`, { price: String(e.price), sale_price: String(e.sale ?? ''), stock: Number(e.stock), reason: e.reason }), () => this.data.reload());
  }
}
