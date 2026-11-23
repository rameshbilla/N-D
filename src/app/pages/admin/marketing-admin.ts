import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ImagePlus, Pencil, Plus, Save, Trash2 } from 'lucide';
import { formatINR, paiseToRupees } from '../../../shared/money';
import type { Banner, Promotion } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { NdDatePipe, StatusBadge, type Tone } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AdminHeader, adminRunner, apiResource } from './admin-ui';

/** ISO → <input type="datetime-local"> value in India time. */
const toLocal = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 16) : '');

// ============================ Offers list ============================
type OfferRow = Promotion & { coupons: { code: string }[] };

@Component({
  selector: 'nd-offers-admin',
  imports: [RouterLink, IconComponent, StatusBadge, NdDatePipe, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Festival offers & promotions" description="Diwali, Pongal, Sankranti, Ugadi, Christmas, New Year and seasonal offers. Offers start and expire automatically; customers always get the single best discount per item.">
      <a routerLink="/admin/offers/new" class="btn btn-primary btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> New offer</a>
    </nd-admin-header>
    @if (data.value()?.length) {
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[900px]">
          <thead><tr><th>Offer</th><th>Discount</th><th>Applies to</th><th>Coupon</th><th>Dates</th><th>Used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of data.value()!; track p.id) {
              @let s = state(p);
              <tr>
                <td><a [routerLink]="['/admin/offers', p.id]" class="font-semibold text-leaf">{{ p.name }}</a><span class="block text-xs text-muted">{{ p.festival_name }}</span></td>
                <td>{{ p.discount_type === 'percentage' ? p.discount_value + '%' : inr(p.discount_value) }}@if (p.min_order_paise) { <span class="block text-xs text-muted">min {{ inr(p.min_order_paise) }}</span> }</td>
                <td class="text-sm capitalize">{{ p.scope === 'all' ? 'All products' : p.scope }}</td>
                <td class="font-mono text-sm">{{ p.coupons[0]?.code ?? '—' }}</td>
                <td class="text-xs">{{ p.starts_at | ndDate }} → {{ p.ends_at | ndDate }}</td>
                <td>{{ p.used_count }}{{ p.usage_limit ? ' / ' + p.usage_limit : '' }}</td>
                <td><nd-badge [tone]="s.tone">{{ s.label }}</nd-badge></td>
                <td><div class="flex gap-1">
                  <button type="button" [disabled]="r.pending()" (click)="toggle(p)" class="btn btn-outline btn-sm">{{ p.is_active ? 'Pause' : 'Activate' }}</button>
                  <button type="button" [disabled]="r.pending()" (click)="remove(p)" class="btn btn-ghost btn-sm text-berry">Delete</button>
                </div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (data.value()) {
      <div class="card p-10 text-center text-muted">No offers yet. <a routerLink="/admin/offers/new" class="font-semibold text-leaf">Create a festival offer</a>.</div>
    }
  `,
})
export class OffersAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  data = apiResource<OfferRow[]>(() => '/api/admin/offers');
  I = { plus: Plus };
  inr = formatINR;
  state(p: Promotion): { label: string; tone: Tone } {
    const now = Date.now();
    if (!p.is_active) return { label: 'Paused', tone: 'gray' };
    if (now < new Date(p.starts_at).getTime()) return { label: 'Scheduled', tone: 'blue' };
    if (now >= new Date(p.ends_at).getTime()) return { label: 'Expired', tone: 'gray' };
    if (p.usage_limit !== null && p.used_count >= p.usage_limit) return { label: 'Limit reached', tone: 'amber' };
    return { label: 'Live', tone: 'green' };
  }
  toggle(p: Promotion) {
    void this.r.run(this.api.put(`/api/admin/offers/${p.id}/active`, { active: !p.is_active }), () => this.data.reload());
  }
  remove(p: Promotion) {
    if (confirm('Delete this offer?')) void this.r.run(this.api.delete(`/api/admin/offers/${p.id}`), () => this.data.reload());
  }
}

// ============================ Offer form ============================
const FESTIVALS = ['Diwali', 'Pongal', 'Sankranti', 'Ugadi', 'Christmas', 'New Year', 'Independence Day', 'Republic Day', 'Summer Special', 'Monsoon Special', 'Other'];
const KINDS = [
  { key: 'all', label: 'All products', hint: 'Automatic discount on everything (e.g. Diwali 15% off all products).' },
  { key: 'categories', label: 'Category-wide', hint: 'Automatic discount on selected categories.' },
  { key: 'products', label: 'Individual products', hint: 'Automatic discount on selected products.' },
  { key: 'coupon', label: 'Coupon code', hint: 'Customers enter a code in the cart. Can also be limited to products/categories.' },
] as const;
type OfferDetail = Promotion & { promotion_products: { product_id: string }[]; promotion_categories: { category_id: string }[]; coupons: { code: string }[] };

@Component({
  selector: 'nd-offer-form',
  imports: [FormsModule, IconComponent, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header [heading]="id() ? f.name || 'Edit offer' : 'New festival offer'" backHref="/admin/offers" backLabel="Offers" />
    <form (ngSubmit)="save()" class="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div class="space-y-6">
        <section class="card grid gap-4 p-6 sm:grid-cols-2">
          <div><label class="field-label" for="o-name">Offer name (internal) *</label><input id="o-name" name="name" [(ngModel)]="f.name" class="field" placeholder="Diwali 2026" /></div>
          <div><label class="field-label" for="o-fest">Festival / season</label><input id="o-fest" name="fest" list="festivals" [(ngModel)]="f.festival_name" class="field" /><datalist id="festivals">@for (x of festivals; track x) { <option [value]="x"></option> }</datalist></div>
          <div class="sm:col-span-2"><label class="field-label" for="o-title">Offer title (shown to customers) *</label><input id="o-title" name="title" [(ngModel)]="f.title" class="field" placeholder="Diwali Special — 15% off all powders" /></div>
          <div class="sm:col-span-2"><label class="field-label" for="o-desc">Description</label><textarea id="o-desc" name="desc" [(ngModel)]="f.description" rows="2" class="field"></textarea></div>
        </section>
        <section class="card space-y-4 p-6">
          <h3 class="font-sans font-semibold text-forest">Offer type</h3>
          <div class="grid gap-2 sm:grid-cols-2">
            @for (k of kinds; track k.key) {
              <label class="cursor-pointer rounded-2xl border-2 p-3 text-sm" [class]="kind() === k.key ? 'border-leaf bg-mint/40' : 'border-line'">
                <input type="radio" name="kind" class="sr-only" [checked]="kind() === k.key" (change)="setKind(k.key)" />
                <span class="font-semibold text-forest">{{ k.label }}</span><span class="block text-xs text-muted">{{ k.hint }}</span>
              </label>
            }
          </div>
          @if (f.requires_coupon) {
            <div class="grid gap-4 sm:grid-cols-2">
              <div><label class="field-label" for="o-code">Coupon code *</label><input id="o-code" name="code" [ngModel]="f.coupon_code" (ngModelChange)="f.coupon_code = $event.toUpperCase()" class="field font-mono uppercase" placeholder="DIWALI15" /></div>
              <div><label class="field-label" for="o-scope">Coupon applies to</label>
                <select id="o-scope" name="scope" [(ngModel)]="f.scope" class="field"><option value="all">All products</option><option value="categories">Selected categories</option><option value="products">Selected products</option></select>
              </div>
              <label class="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="comb" [(ngModel)]="f.combinable_with_offers" class="mt-1 size-4 accent-leaf" /><span>Allow on items that already have a sale price or festival discount <span class="block text-xs text-muted">Off by default to prevent discount stacking — the coupon then applies only to undiscounted items.</span></span></label>
            </div>
          }
          @if (f.scope === 'categories') {
            <fieldset><legend class="field-label">Categories</legend>
              <div class="flex flex-wrap gap-2">@for (c of opts.value()?.categories ?? []; track c.id) { <label class="cursor-pointer rounded-full border px-3 py-1.5 text-sm" [class]="f.category_ids.includes(c.id) ? 'border-leaf bg-leaf text-white' : 'border-line'"><input type="checkbox" class="sr-only" [checked]="f.category_ids.includes(c.id)" (change)="toggleId(f.category_ids, c.id)" />{{ c.name }}</label> }</div>
            </fieldset>
          }
          @if (f.scope === 'products') {
            <fieldset><legend class="field-label">Products</legend>
              <div class="flex max-h-56 flex-wrap gap-2 overflow-y-auto">@for (p of opts.value()?.products ?? []; track p.id) { <label class="cursor-pointer rounded-full border px-3 py-1.5 text-sm" [class]="f.product_ids.includes(p.id) ? 'border-leaf bg-leaf text-white' : 'border-line'"><input type="checkbox" class="sr-only" [checked]="f.product_ids.includes(p.id)" (change)="toggleId(f.product_ids, p.id)" />{{ p.name }}</label> }</div>
            </fieldset>
          }
        </section>
        <section class="card grid gap-4 p-6 sm:grid-cols-2">
          <h3 class="font-sans font-semibold text-forest sm:col-span-2">Discount</h3>
          <div><label class="field-label" for="o-type">Discount type</label><select id="o-type" name="type" [(ngModel)]="f.discount_type" class="field"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (₹)</option></select></div>
          <div><label class="field-label" for="o-val">Discount value *</label><input id="o-val" name="val" [(ngModel)]="f.discount_value" inputmode="decimal" class="field" /></div>
          <div><label class="field-label" for="o-min">Minimum order value ₹</label><input id="o-min" name="min" [(ngModel)]="f.min_order" inputmode="decimal" class="field" placeholder="None" /></div>
          <div><label class="field-label" for="o-max">Maximum discount ₹</label><input id="o-max" name="max" [(ngModel)]="f.max_discount" inputmode="decimal" class="field" placeholder="No cap" /></div>
          <div><label class="field-label" for="o-ul">Total usage limit</label><input id="o-ul" name="ul" [(ngModel)]="f.usage_limit" inputmode="numeric" class="field" placeholder="Unlimited" /></div>
          @if (f.requires_coupon) { <div><label class="field-label" for="o-pul">Uses per customer</label><input id="o-pul" name="pul" [(ngModel)]="f.per_user_limit" inputmode="numeric" class="field" placeholder="Unlimited" /></div> }
          <p class="text-xs text-muted sm:col-span-2">Fixed-amount offers are split across eligible items. Automatic offers never stack with a sale price — each item gets the best single discount.</p>
        </section>
      </div>
      <aside class="space-y-6">
        <section class="card space-y-4 p-5">
          <h3 class="font-sans font-semibold text-forest">Schedule (India time)</h3>
          <div><label class="field-label" for="o-start">Start *</label><input id="o-start" name="start" type="datetime-local" [(ngModel)]="f.starts_at" class="field" /></div>
          <div><label class="field-label" for="o-end">End *</label><input id="o-end" name="end" type="datetime-local" [(ngModel)]="f.ends_at" class="field" /></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" [(ngModel)]="f.is_active" class="size-4 accent-leaf" /> Offer enabled</label>
          <div><label class="field-label" for="o-pri">Priority</label><input id="o-pri" name="pri" type="number" min="0" max="100" [(ngModel)]="f.priority" class="field" /></div>
        </section>
        <section class="card space-y-3 p-5">
          <h3 class="font-sans font-semibold text-forest">Homepage banner</h3>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="banner" [(ngModel)]="f.show_banner" class="size-4 accent-leaf" /> Show banner &amp; announcement bar while live</label>
          @if (f.banner_image_url) { <img [src]="f.banner_image_url" alt="" class="aspect-[2/1] w-full rounded-xl object-cover" /> }
          <button type="button" (click)="picker.click()" class="btn btn-outline btn-sm" [disabled]="r.pending()"><nd-icon [icon]="I.image" class="size-4" /> {{ f.banner_image_url ? 'Replace image' : 'Upload banner image' }}</button>
          @if (f.banner_image_url) { <button type="button" (click)="f.banner_image_url = ''" class="ml-2 text-xs text-berry underline">Remove</button> }
          <input #picker type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden (change)="uploadBanner($event)" />
        </section>
        <button class="btn btn-primary w-full" [disabled]="r.pending()"><nd-icon [icon]="I.save" class="size-4" /> Save offer</button>
      </aside>
    </form>
  `,
})
export class OfferFormPage {
  private api = inject(ApiService);
  private router = inject(Router);
  r = adminRunner();
  id = input<string>();
  opts = apiResource<{ products: { id: string; name: string }[]; categories: { id: string; name: string }[] }>(() => '/api/admin/offer-options');
  festivals = FESTIVALS;
  kinds = KINDS;
  I = { image: ImagePlus, save: Save };
  kind = signal<string>('all');
  f = {
    name: '', festival_name: 'Diwali', title: '', description: '', banner_image_url: '', show_banner: true, discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '15', scope: 'all' as 'all' | 'categories' | 'products', product_ids: [] as string[], category_ids: [] as string[], requires_coupon: false,
    coupon_code: '', combinable_with_offers: false, min_order: '', max_discount: '', starts_at: toLocal(new Date().toISOString()),
    ends_at: toLocal(new Date(Date.now() + 7 * 86400000).toISOString()), usage_limit: '', per_user_limit: '', is_active: true, priority: 0,
  };

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
  }
  private async load(id: string) {
    const r = await this.api.get<OfferDetail>(`/api/admin/offers/${id}`);
    if (!r.ok) return;
    const p = r.data;
    this.f = {
      name: p.name, festival_name: p.festival_name ?? '', title: p.title, description: p.description ?? '', banner_image_url: p.banner_image_url ?? '', show_banner: p.show_banner,
      discount_type: p.discount_type, discount_value: p.discount_type === 'percentage' ? String(p.discount_value) : paiseToRupees(p.discount_value), scope: p.scope,
      product_ids: p.promotion_products.map((x) => x.product_id), category_ids: p.promotion_categories.map((x) => x.category_id), requires_coupon: p.requires_coupon,
      coupon_code: p.coupons[0]?.code ?? '', combinable_with_offers: p.combinable_with_offers, min_order: p.min_order_paise ? paiseToRupees(p.min_order_paise) : '',
      max_discount: p.max_discount_paise ? paiseToRupees(p.max_discount_paise) : '', starts_at: toLocal(p.starts_at), ends_at: toLocal(p.ends_at),
      usage_limit: p.usage_limit ? String(p.usage_limit) : '', per_user_limit: p.per_user_limit ? String(p.per_user_limit) : '', is_active: p.is_active, priority: p.priority,
    };
    this.kind.set(p.requires_coupon ? 'coupon' : p.scope);
  }
  setKind(k: string) {
    this.kind.set(k);
    this.f.requires_coupon = k === 'coupon';
    if (k !== 'coupon') this.f.scope = k as 'all';
  }
  toggleId(list: string[], id: string) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
  }
  uploadBanner(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    void this.r.run(this.api.post<{ url: string }>('/api/admin/banner-image', fd), (d) => (this.f.banner_image_url = d.url));
  }
  save() {
    const body = { ...this.f, priority: Number(this.f.priority), discount_value: String(this.f.discount_value) };
    const id = this.id();
    void this.r.run(id ? this.api.put(`/api/admin/offers/${id}`, body) : this.api.post<{ id: string }>('/api/admin/offers', body), (d) => {
      if (!id && d && typeof d === 'object' && 'id' in d) void this.router.navigate(['/admin/offers', (d as { id: string }).id]);
    });
  }
}

// ============================ Banners ============================
type BannerForm = { id?: string; title: string; subtitle: string; image_url: string; link_url: string; link_label: string; placement: 'home_strip' | 'shop_top'; starts_at: string; ends_at: string; is_active: boolean; sort_order: number };

@Component({
  selector: 'nd-banners-admin',
  imports: [FormsModule, IconComponent, StatusBadge, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Website banners" description="Promotional banners on the homepage. Festival offers with “Show banner” appear automatically while live." />
    <div class="grid gap-6 lg:grid-cols-[1fr_400px]">
      <ul class="space-y-3">
        @for (b of data.value() ?? []; track b.id) {
          <li class="card flex items-center gap-4 p-4">
            <div class="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-forest">@if (b.image_url) { <img [src]="b.image_url" alt="" class="absolute inset-0 size-full object-cover" /> }</div>
            <div class="min-w-0 flex-1"><p class="font-semibold text-forest">{{ b.title }}</p><p class="truncate text-xs text-muted">{{ b.subtitle }} · {{ b.link_url }}</p></div>
            <nd-badge [tone]="b.is_active ? 'green' : 'gray'">{{ b.is_active ? 'Active' : 'Hidden' }}</nd-badge>
            <button type="button" class="p-1.5" aria-label="Edit banner" (click)="edit(b)"><nd-icon [icon]="I.pencil" class="size-4" /></button>
            <button type="button" class="p-1.5 text-berry" aria-label="Delete banner" [disabled]="r.pending()" (click)="remove(b)"><nd-icon [icon]="I.trash" class="size-4" /></button>
          </li>
        } @empty { <li class="card p-8 text-center text-muted">No custom banners yet.</li> }
      </ul>
      <div class="card h-fit p-5">
        @if (form(); as f) {
          <form class="space-y-3" (ngSubmit)="save(f)">
            <h2 class="font-sans font-semibold text-forest">{{ f.id ? 'Edit banner' : 'New banner' }}</h2>
            <input name="title" [(ngModel)]="f.title" placeholder="Title *" class="field" aria-label="Title" />
            <input name="subtitle" [(ngModel)]="f.subtitle" placeholder="Subtitle" class="field" aria-label="Subtitle" />
            <div class="flex gap-2"><input name="link" [(ngModel)]="f.link_url" placeholder="/shop or https://…" class="field" aria-label="Link" /><input name="label" [(ngModel)]="f.link_label" placeholder="Button label" class="field" aria-label="Button label" /></div>
            @if (f.image_url) { <img [src]="f.image_url" alt="" class="aspect-[2/1] w-full rounded-xl object-cover" /> }
            <button type="button" class="btn btn-outline btn-sm" (click)="picker.click()" [disabled]="r.pending()"><nd-icon [icon]="I.image" class="size-4" /> {{ f.image_url ? 'Replace image' : 'Upload image' }}</button>
            <input #picker type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" (change)="upload($event, f)" />
            <label class="block text-sm">Show from<input type="datetime-local" name="from" [(ngModel)]="f.starts_at" class="field mt-1" /></label>
            <label class="block text-sm">Until<input type="datetime-local" name="to" [(ngModel)]="f.ends_at" class="field mt-1" /></label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" [(ngModel)]="f.is_active" class="size-4 accent-leaf" /> Active</label>
            <div class="flex gap-2"><button class="btn btn-primary" [disabled]="r.pending()">Save</button><button type="button" class="btn btn-ghost" (click)="form.set(null)">Cancel</button></div>
          </form>
        } @else {
          <button type="button" (click)="form.set(blank())" class="btn btn-primary w-full"><nd-icon [icon]="I.plus" class="size-4" /> Add banner</button>
        }
      </div>
    </div>
  `,
})
export class BannersAdminPage {
  private api = inject(ApiService);
  r = adminRunner();
  data = apiResource<Banner[]>(() => '/api/admin/banners');
  form = signal<BannerForm | null>(null);
  I = { pencil: Pencil, trash: Trash2, plus: Plus, image: ImagePlus };
  blank = (): BannerForm => ({ title: '', subtitle: '', image_url: '', link_url: '/shop', link_label: 'Shop now', placement: 'home_strip', starts_at: '', ends_at: '', is_active: true, sort_order: 0 });
  edit(b: Banner) {
    this.form.set({ id: b.id, title: b.title, subtitle: b.subtitle ?? '', image_url: b.image_url ?? '', link_url: b.link_url ?? '', link_label: b.link_label ?? '', placement: b.placement, starts_at: toLocal(b.starts_at), ends_at: toLocal(b.ends_at), is_active: b.is_active, sort_order: b.sort_order });
  }
  upload(e: Event, f: BannerForm) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    void this.r.run(this.api.post<{ url: string }>('/api/admin/banner-image', fd), (d) => this.form.set({ ...f, image_url: d.url }));
  }
  save(f: BannerForm) {
    const { id, ...body } = f;
    void this.r.run(id ? this.api.put(`/api/admin/banners/${id}`, body) : this.api.post('/api/admin/banners', body), () => {
      this.form.set(null);
      this.data.reload();
    });
  }
  remove(b: Banner) {
    if (confirm('Delete banner?')) void this.r.run(this.api.delete(`/api/admin/banners/${b.id}`), () => this.data.reload());
  }
}
