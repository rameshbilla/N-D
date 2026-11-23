import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Plus } from 'lucide';
import type { Product, Variant } from '../../../shared/types';
import { InrPipe, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { ProductThumb } from '../../ui/product-art';
import { AdminHeader, apiResource } from './admin-ui';

type Row = Product & { product_variants: Variant[]; category: { name: string } | null };

@Component({
  selector: 'nd-admin-products',
  imports: [RouterLink, FormsModule, IconComponent, StatusBadge, InrPipe, ProductThumb, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Products" description="Add, edit, price and publish products. Changes appear on the website immediately.">
      <a routerLink="/admin/products/new" class="btn btn-primary btn-sm"><nd-icon [icon]="plus" class="size-4" /> Add product</a>
    </nd-admin-header>
    <form class="card mb-4 flex flex-wrap gap-2 p-3" (ngSubmit)="filter.set({ q: q, category: category, status: status })">
      <input name="q" [(ngModel)]="q" placeholder="Search products" class="field max-w-xs py-2" />
      <select name="category" [(ngModel)]="category" class="field w-auto py-2"><option value="">All categories</option>@for (c of data.value()?.categories ?? []; track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
      <select name="status" [(ngModel)]="status" class="field w-auto py-2"><option value="">Any status</option><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Disabled</option></select>
      <button class="btn btn-outline btn-sm">Filter</button>
    </form>
    @if (data.value()?.products?.length) {
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[760px]">
          <thead><tr><th>Product</th><th>Category</th><th>Price range</th><th>Stock</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of data.value()!.products; track p.id) {
              @let vs = active(p);
              <tr>
                <td><a [routerLink]="['/admin/products', p.id]" class="flex items-center gap-3">
                  <nd-product-thumb [name]="p.name" [imageUrl]="p.images[0]?.url" [accent]="p.accent_color" class="size-11 shrink-0 rounded-lg" />
                  <span><span class="font-semibold text-forest">{{ p.name }}</span>@if (p.is_featured) { <span class="ml-2 text-xs text-saffron">★ Featured</span> }<span class="block text-xs text-muted">{{ p.sku ?? '—' }}</span></span>
                </a></td>
                <td class="text-sm">{{ p.category?.name ?? '—' }}</td>
                <td class="text-sm">@if (vs.length) { {{ minPrice(vs) | inr }} – {{ maxPrice(vs) | inr }} } @else { — }@if (p.discount_percent) { <span class="block text-xs text-leaf">{{ p.discount_percent }}% product discount</span> }</td>
                <td [class.font-semibold]="stock(vs) === 0" [class.text-berry]="stock(vs) === 0">{{ stock(vs) }}</td>
                <td><nd-badge [tone]="p.status === 'active' ? 'green' : p.status === 'draft' ? 'amber' : 'gray'">{{ p.status === 'inactive' ? 'disabled' : p.status }}</nd-badge></td>
                <td><a [routerLink]="['/admin/products', p.id]" class="btn btn-outline btn-sm">Edit</a></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (data.value()) {
      <div class="card p-10 text-center text-muted">No products match. <a routerLink="/admin/products/new" class="font-semibold text-leaf">Add your first product</a>.</div>
    }
  `,
})
export class ProductsAdminPage {
  q = '';
  category = '';
  status = '';
  plus = Plus;
  filter = signal({ q: '', category: '', status: '' });
  data = apiResource<{ products: Row[]; categories: { id: string; name: string }[] }>(() => {
    const f = this.filter();
    return `/api/admin/products?${new URLSearchParams(f).toString()}`;
  });
  active = (p: Row) => p.product_variants.filter((v) => v.is_active);
  minPrice = (vs: Variant[]) => Math.min(...vs.map((v) => v.sale_price_paise ?? v.price_paise));
  maxPrice = (vs: Variant[]) => Math.max(...vs.map((v) => v.sale_price_paise ?? v.price_paise));
  stock = (vs: Variant[]) => vs.reduce((a, v) => a + v.stock, 0);
}
