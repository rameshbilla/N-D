import { afterNextRender, ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Calculator, Droplets, Factory, ImagePlus, LoaderCircle, PackageCheck, Send, Truck, X } from 'lucide';
import type { Estimate } from '../../../shared/custom-estimate';
import { INGREDIENT_CATEGORIES, LOGISTICS_LABEL, PROCESSING_LABEL } from '../../../shared/status';
import type { CustomServiceSettings, ProcessingType } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SeoService } from '../../core/seo.service';
import { InrPipe, PageHero, RevealDirective } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { safeResource } from '../../core/safe-resource';

const DRAFT_KEY = 'nd-custom-draft';

@Component({
  selector: 'nd-custom-request-form',
  imports: [FormsModule, IconComponent, InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (ngSubmit)="submit()" novalidate class="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div class="card grid gap-4 p-6 sm:grid-cols-2">
        <div><label class="field-label" for="cn">Your name *</label><input id="cn" name="customer_name" [(ngModel)]="d.customer_name" class="field" autocomplete="name" />@if (errors()['customer_name']) { <p class="field-error">{{ errors()['customer_name'] }}</p> }</div>
        <div><label class="field-label" for="cp">Mobile number *</label><input id="cp" name="phone" [(ngModel)]="d.phone" inputmode="numeric" maxlength="14" class="field" autocomplete="tel-national" />@if (errors()['phone']) { <p class="field-error">{{ errors()['phone'] }}</p> }</div>
        <div><label class="field-label" for="ci">Ingredient name *</label><input id="ci" name="ingredient_name" [(ngModel)]="d.ingredient_name" (ngModelChange)="estimateSoon()" class="field" placeholder="e.g. Amla, Moringa leaves" />@if (errors()['ingredient_name']) { <p class="field-error">{{ errors()['ingredient_name'] }}</p> }</div>
        <div><label class="field-label" for="cc">Ingredient category *</label>
          <select id="cc" name="ingredient_category" [(ngModel)]="d.ingredient_category" class="field">@for (c of categories; track c.value) { <option [value]="c.value">{{ c.label }}</option> }</select>
        </div>
        <div><label class="field-label" for="cq">Raw material quantity *</label>
          <div class="flex gap-2">
            <input id="cq" name="quantity" [(ngModel)]="d.quantity" (ngModelChange)="estimateSoon()" inputmode="decimal" class="field" [placeholder]="'Min ' + minKg() + ' kg'" />
            <select aria-label="Unit" name="quantity_unit" [(ngModel)]="d.quantity_unit" (ngModelChange)="estimateSoon()" class="field w-24"><option value="kg">kg</option><option value="g">g</option></select>
          </div>@if (errors()['quantity']) { <p class="field-error">{{ errors()['quantity'] }}</p> }
        </div>
        <fieldset class="sm:col-span-2">
          <legend class="field-label">Processing type *</legend>
          <div class="grid gap-2 sm:grid-cols-3">
            @for (k of processingTypes; track k) {
              <label class="cursor-pointer rounded-2xl border-2 p-3 text-sm font-semibold transition" [class]="d.processing_type === k ? 'border-leaf bg-mint/50 text-forest' : 'border-line text-forest/80'">
                <input type="radio" name="processing_type" [value]="k" [(ngModel)]="d.processing_type" (ngModelChange)="estimateSoon()" class="sr-only" />{{ processing[k] }}
              </label>
            }
          </div>
        </fieldset>
        <div class="sm:col-span-2">
          <span class="field-label">Ingredient photos (up to 5, optional)</span>
          <div class="flex flex-wrap gap-2">
            @for (f of files(); track $index; let i = $index) {
              <span class="flex items-center gap-1 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest">{{ f.name.slice(0, 22) }} <button type="button" (click)="removeFile(i)" [attr.aria-label]="'Remove ' + f.name"><nd-icon [icon]="I.x" class="size-3" /></button></span>
            }
            @if (files().length < 5) { <button type="button" (click)="picker.click()" class="btn btn-outline btn-sm"><nd-icon [icon]="I.image" class="size-4" /> Add photos</button> }
            <input #picker type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden (change)="addFiles($event)" />
          </div>
        </div>
        <div><label class="field-label" for="cl">Raw material hand-over *</label>
          <select id="cl" name="logistics" [(ngModel)]="d.logistics" (ngModelChange)="estimateSoon()" class="field">@for (l of logistics; track l.key) { <option [value]="l.key">{{ l.label }}</option> }</select>
        </div>
        <div><label class="field-label" for="cr">Finished product *</label>
          <select id="cr" name="return_preference" [(ngModel)]="d.return_preference" class="field"><option value="delivery">Deliver to me</option><option value="collect">I will collect</option></select>
        </div>
        @if (d.logistics === 'pickup_requested') {
          <div class="sm:col-span-2"><label class="field-label" for="ca">Pickup address *</label><textarea id="ca" name="pickup_address" [(ngModel)]="d.pickup_address" rows="2" class="field"></textarea>@if (errors()['pickup_address']) { <p class="field-error">{{ errors()['pickup_address'] }}</p> }</div>
        }
        <div class="sm:col-span-2"><label class="field-label" for="cs">Special instructions</label><textarea id="cs" name="special_instructions" [(ngModel)]="d.special_instructions" rows="3" maxlength="1000" class="field" placeholder="Seed removal, mesh fineness, pack sizes, deadline…"></textarea></div>
      </div>
      <aside class="card h-fit space-y-4 p-6 lg:sticky lg:top-24">
        <h3 class="flex items-center gap-2 font-sans text-lg font-semibold text-forest"><nd-icon [icon]="I.calc" class="size-5" /> Estimated charges</h3>
        @if (estimate()?.available) {
          <dl class="space-y-1.5 text-sm">
            @for (l of estimate()!.lines; track l.label) { <div class="flex justify-between gap-3"><dt class="text-muted">{{ l.label }}</dt><dd>{{ l.amount_paise | inr }}</dd></div> }
            <div class="flex justify-between border-t border-line pt-2 text-base font-bold text-forest"><dt>Estimate</dt><dd>{{ estimate()!.total_paise | inr }}</dd></div>
          </dl>
        } @else {
          <p class="text-sm text-muted">{{ estimate()?.reason ?? 'Enter the ingredient and quantity to see an indicative estimate.' }}</p>
        }
        <p class="text-xs text-muted">Estimates are indicative. Final charges are confirmed in your quotation after we inspect the raw material.</p>
        @if (error()) { <p class="rounded-2xl bg-red-50 p-3 text-sm text-berry" role="alert">{{ error() }}</p> }
        <button class="btn btn-accent w-full" [disabled]="pending()"><nd-icon [icon]="pending() ? I.loader : I.send" class="size-4" [class.animate-spin]="pending()" /> {{ auth.user() ? 'Submit request' : 'Sign in & submit' }}</button>
        @if (!auth.user()) { <p class="text-center text-xs text-muted">We’ll verify your mobile number by OTP so you can track and pay for your request. Your details are kept; please re-attach photos after signing in.</p> }
      </aside>
    </form>
  `,
})
export class CustomRequestForm {
  private api = inject(ApiService);
  private router = inject(Router);
  auth = inject(AuthService);
  minKg = input(1);
  categories = INGREDIENT_CATEGORIES;
  processing = PROCESSING_LABEL;
  processingTypes = Object.keys(PROCESSING_LABEL) as ProcessingType[];
  logistics = Object.entries(LOGISTICS_LABEL).map(([key, label]) => ({ key, label }));
  I = { x: X, image: ImagePlus, calc: Calculator, loader: LoaderCircle, send: Send };
  d = {
    customer_name: '', phone: '', ingredient_name: '', ingredient_category: 'fruit', quantity: '', quantity_unit: 'kg' as 'kg' | 'g',
    processing_type: 'dehydration_powder' as ProcessingType, special_instructions: '', logistics: 'customer_dropoff', return_preference: 'delivery', pickup_address: '',
  };
  files = signal<File[]>([]);
  estimate = signal<Estimate | null>(null);
  errors = signal<Record<string, string>>({});
  error = signal<string | null>(null);
  pending = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY);
        if (saved) {
          this.d = { ...this.d, ...JSON.parse(saved) };
          sessionStorage.removeItem(DRAFT_KEY);
          this.estimateSoon();
        }
      } catch {
        /* ignore */
      }
    });
    // Prefill from the signed-in profile.
    effect(() => {
      const u = this.auth.user();
      if (u) {
        this.d.customer_name ||= u.name ?? '';
        this.d.phone ||= (u.phone ?? '').replace(/^\+91/, '');
      }
    });
  }

  estimateSoon() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      const qty = Number.parseFloat(this.d.quantity);
      if (!qty) return this.estimate.set(null);
      const r = await this.api.post<Estimate>('/api/custom/estimate', { ingredient: this.d.ingredient_name, processingType: this.d.processing_type, quantity: qty, unit: this.d.quantity_unit, wantsPickup: this.d.logistics === 'pickup_requested' });
      if (r.ok) this.estimate.set(r.data);
    }, 350);
  }
  addFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const next = [...this.files(), ...Array.from(input.files ?? [])].slice(0, 5);
    const bad = next.find((f) => f.size > 5 * 1024 * 1024 || !/^image\//.test(f.type));
    if (bad) this.error.set(`${bad.name}: please upload images up to 5 MB.`);
    this.files.set(next.filter((f) => f.size <= 5 * 1024 * 1024 && /^image\//.test(f.type)));
    input.value = '';
  }
  removeFile(i: number) {
    this.files.update((f) => f.filter((_, j) => j !== i));
  }
  async submit() {
    this.error.set(null);
    await this.auth.ensureLoaded();
    if (!this.auth.user()) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(this.d));
      } catch {
        /* ignore */
      }
      return void this.router.navigate(['/login'], { queryParams: { next: '/custom-processing' } });
    }
    const fd = new FormData();
    Object.entries(this.d).forEach(([k, v]) => fd.append(k, String(v)));
    this.files().forEach((f) => fd.append('photos', f));
    this.pending.set(true);
    const r = await this.api.post<{ id: string; number: string }>('/api/custom/requests', fd);
    this.pending.set(false);
    if (r.ok) void this.router.navigate(['/account/requests', r.data.id]);
    else {
      this.errors.set(r.fieldErrors ?? {});
      this.error.set(r.error);
    }
  }
}

interface ServiceInfo {
  rates: { id: string; ingredient_name: string | null; processing_type: string; rate_per_kg_paise: number }[];
  settings: CustomServiceSettings;
}

@Component({
  selector: 'nd-custom-processing',
  imports: [IconComponent, InrPipe, PageHero, RevealDirective, CustomRequestForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Custom processing" heading="Your ingredients. Our dehydration & milling." [crumbs]="[{ href: '/custom-processing', label: 'Custom Processing' }]"
      description="Grew a bumper crop of amla or moringa? Send it to us. We clean, dehydrate, grind and pack your own raw material into shelf-stable powder." />
    <section class="container-page mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      @for (f of features; track f.t; let i = $index) {
        <div [ndReveal]="i * 0.06" class="card h-full p-5"><nd-icon [icon]="f.icon" class="size-6 text-leaf" /><h2 class="mt-3 font-sans text-lg font-semibold text-forest">{{ f.t }}</h2><p class="mt-1 text-sm text-muted">{{ f.d }}</p></div>
      }
    </section>
    @let s = info.value()?.data;
    @if (s && defaults(s).length) {
      <section class="container-page mt-10">
        <div class="card overflow-x-auto p-6">
          <h2 class="font-sans text-lg font-semibold text-forest">Standard rates</h2>
          <table class="table-nd mt-3 min-w-[480px]">
            <thead><tr><th>Service</th><th>Rate</th></tr></thead>
            <tbody>
              @for (r of defaults(s); track r.id) { <tr><td>{{ label(r.processing_type) }}</td><td>{{ r.rate_per_kg_paise | inr }} / kg of raw material</td></tr> }
              @if (s.settings.packaging_charge_per_kg_paise > 0) { <tr><td>Packaging</td><td>{{ s.settings.packaging_charge_per_kg_paise | inr }} / kg</td></tr> }
              @if (s.settings.transport_charge_paise > 0) { <tr><td>Pickup / transport</td><td>{{ s.settings.transport_charge_paise | inr }} per trip</td></tr> }
            </tbody>
          </table>
          <p class="mt-3 text-xs text-muted">Minimum quantity {{ s.settings.min_quantity_kg }} kg. Some ingredients have specific rates. {{ s.settings.notes }}</p>
        </div>
      </section>
    }
    <section id="request" class="container-page mt-10 scroll-mt-24">
      <h2 class="text-3xl font-semibold text-forest">Request custom processing</h2>
      <p class="mt-1 text-muted">Get an instant estimate, then a confirmed quotation from our team.</p>
      <div class="mt-6"><nd-custom-request-form [minKg]="s?.settings?.min_quantity_kg ?? 1" /></div>
    </section>
  `,
})
export class CustomProcessingPage {
  info = safeResource(httpResource<{ data: ServiceInfo }>(() => '/api/custom-service'));
  features = [
    { icon: Droplets, t: 'Dehydration only', d: 'Slices or whole leaves dried at controlled temperatures.' },
    { icon: Factory, t: 'Dehydration + powder', d: 'Dried and milled into fine powder, sieved for even texture.' },
    { icon: PackageCheck, t: 'Grinding only', d: 'Already-dry ingredients milled to your preferred fineness.' },
    { icon: Truck, t: 'Pickup & delivery', d: 'Drop off, courier, or request a pickup; we deliver back.' },
  ];
  defaults = (s: ServiceInfo) => s.rates.filter((r) => !r.ingredient_name);
  label = (t: string) => PROCESSING_LABEL[t as ProcessingType];
  constructor() {
    inject(SeoService).set({
      title: 'Custom Dehydration & Powder Making',
      description: 'Bring your own fruits, vegetables, leaves or spices — we dehydrate, grind and pack them. Instant estimates, quotations and stage-by-stage tracking.',
      path: '/custom-processing',
    });
  }
}

@Component({
  selector: 'nd-request-quotation',
  imports: [RouterLink, PageHero, CustomRequestForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Quotation" heading="Request a quotation" [crumbs]="[{ href: '/custom-processing', label: 'Custom Processing' }, { href: '/request-quotation', label: 'Request Quotation' }]"
      description="Tell us what you would like processed. You will see an indicative estimate now and receive a confirmed quotation in your account — accept it and pay online when you are ready.">
      <p class="mt-4 text-sm text-muted">Bulk product orders (5 kg+) or something else? <a routerLink="/contact" class="font-semibold text-leaf underline">Contact us</a>.</p>
    </nd-page-hero>
    <section class="container-page mt-10"><nd-custom-request-form [minKg]="info.value()?.data?.settings?.min_quantity_kg ?? 1" /></section>
  `,
})
export class RequestQuotationPage {
  info = safeResource(httpResource<{ data: ServiceInfo }>(() => '/api/custom-service'));
  constructor() {
    inject(SeoService).set({ title: 'Request a Quotation', description: 'Request a quotation for custom dehydration, grinding or powder making of your own raw material.', path: '/request-quotation' });
  }
}
