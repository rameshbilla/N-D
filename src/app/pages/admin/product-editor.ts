import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Circle, CircleCheck, ExternalLink, ImagePlus, Info, Plus, Save, Star, Trash2, TriangleAlert } from 'lucide';
import { CLAIM_LABEL, findClaimWarnings, HEALTH_SECTIONS } from '../../../shared/health';
import { formatINR, paiseToRupees, percentOff, rupeesToPaise } from '../../../shared/money';
import type { Category, ClaimType, HealthInfoItem, HealthSection, Product, ProductImage, Variant } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { IconComponent } from '../../ui/icon';
import { AdminHeader, adminRunner } from './admin-ui';

interface EditorData {
  product: Product;
  variants: Variant[];
  info: HealthInfoItem[];
  categories: Category[];
  readOnly: boolean;
}
type VRow = { key: string; id?: string; label: string; weight_grams: number; sku: string; price: string; sale_price: string; stock: number; low_stock_threshold: number; is_active: boolean; sort_order: number };
type HDraft = { key: string; id?: string; section: HealthSection; kind: 'bullet' | 'paragraph'; body: string; claim_type: ClaimType; source_reference: string; is_approved: boolean; dirty: boolean };

const PRESETS = [{ label: '100 g', grams: 100 }, { label: '250 g', grams: 250 }, { label: '500 g', grams: 500 }, { label: '750 g', grams: 750 }, { label: '1 kg', grams: 1000 }];
const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'pricing', label: 'Pack sizes, prices & stock' },
  { key: 'media', label: 'Images & video' },
  { key: 'health', label: 'Health information' },
  { key: 'seo', label: 'SEO' },
];
const toDraft = (i: HealthInfoItem): HDraft => ({ key: i.id, id: i.id, section: i.section, kind: i.kind, body: i.body, claim_type: i.claim_type, source_reference: i.source_reference ?? '', is_approved: i.is_approved, dirty: false });
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

@Component({
  selector: 'nd-product-editor',
  imports: [FormsModule, IconComponent, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header [heading]="id() ? (form.name || 'Edit product') : 'Add product'" backHref="/admin/products" backLabel="Products"
      [description]="id() ? undefined : 'Save the basic details first; then add pack sizes, images and health information.'">
      @if (loadedProduct()?.status === 'active') { <a [href]="'/products/' + loadedProduct()!.slug" target="_blank" class="btn btn-outline btn-sm">View on website <nd-icon [icon]="I.ext" class="size-3.5" /></a> }
    </nd-admin-header>

    @if (readOnly()) { <p class="mb-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><nd-icon [icon]="I.info" class="size-4" /> Staff accounts can view products and update stock from Pricing &amp; Inventory. Editing requires an Admin.</p> }

    <div role="tablist" class="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-soft">
      @for (t of tabs; track t.key) {
        <button role="tab" type="button" [attr.aria-selected]="tab() === t.key" [disabled]="!id() && t.key !== 'details' && t.key !== 'seo'" (click)="tab.set(t.key)"
          class="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40" [class]="tab() === t.key ? 'bg-leaf text-white' : 'text-forest hover:bg-mint'">{{ t.label }}</button>
      }
    </div>

    <fieldset [disabled]="readOnly()" class="contents">
      @switch (tab()) {
        @case ('details') {
          <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div class="card grid gap-4 p-6">
              <div><label class="field-label" for="p-name">Product name *</label><input id="p-name" name="name" [(ngModel)]="form.name" class="field" /></div>
              <div><label class="field-label" for="p-tag">Short tagline</label><input id="p-tag" name="tagline" [(ngModel)]="form.tagline" maxlength="160" class="field" placeholder="Shown on product cards" /></div>
              <div><label class="field-label" for="p-desc">Product description</label><textarea id="p-desc" name="description" [(ngModel)]="form.description" rows="7" class="field"></textarea></div>
              <p class="rounded-2xl bg-mint-50 p-3 text-xs text-muted">Ingredients, nutrition, uses, preparation, storage, precautions and allergens are managed in the <strong>Health information</strong> tab, where each statement is reviewed before publishing.</p>
            </div>
            <div class="card space-y-4 p-5">
              <div><label class="field-label" for="p-status">Status</label>
                <select id="p-status" name="status" [(ngModel)]="form.status" class="field"><option value="active">Active — visible on website</option><option value="draft">Draft — hidden</option><option value="inactive">Disabled — hidden</option></select>
              </div>
              <label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="featured" [(ngModel)]="form.is_featured" class="size-4 accent-leaf" /> Featured on homepage</label>
              <div><label class="field-label" for="p-cat">Category</label>
                <select id="p-cat" name="category" [(ngModel)]="form.category_id" class="field"><option value="">— None —</option>@for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
              </div>
              <div><label class="field-label" for="p-sku">SKU</label><input id="p-sku" name="sku" [(ngModel)]="form.sku" class="field" /></div>
              <div>
                <label class="field-label" for="p-disc">Product discount %</label><input id="p-disc" name="disc" type="number" min="0" max="90" [(ngModel)]="form.discount_percent" class="field" />
                <p class="mt-1 text-xs text-muted">Applies to all pack sizes. If a pack also has a sale price, customers get whichever is lower — discounts never stack.</p>
              </div>
              <div class="flex items-center gap-3"><input id="p-color" name="color" type="color" [(ngModel)]="form.accent_color" class="size-10 rounded-lg border border-line" /><label for="p-color" class="text-sm">Pack colour <span class="block text-xs text-muted">Used for the illustrated pack when no photo is uploaded</span></label></div>
              <div><label class="field-label" for="p-sort">Display order</label><input id="p-sort" name="sort" type="number" min="0" [(ngModel)]="form.sort_order" class="field" /></div>
            </div>
          </div>
        }
        @case ('seo') {
          <div class="card grid max-w-3xl gap-4 p-6">
            <div><label class="field-label" for="p-slug">URL slug</label><div class="flex items-center gap-1 text-sm text-muted">/products/<input id="p-slug" name="slug" [(ngModel)]="form.slug" class="field" placeholder="auto from name" /></div></div>
            <div><label class="field-label" for="p-seot">SEO title <span class="font-normal text-muted">({{ form.seo_title.length }}/70)</span></label><input id="p-seot" name="seot" [(ngModel)]="form.seo_title" maxlength="70" class="field" /></div>
            <div><label class="field-label" for="p-seod">SEO description <span class="font-normal text-muted">({{ form.seo_description.length }}/170)</span></label><textarea id="p-seod" name="seod" [(ngModel)]="form.seo_description" maxlength="170" rows="3" class="field"></textarea></div>
            <div class="rounded-2xl border border-line p-4"><p class="text-xs text-muted">Search preview</p><p class="mt-1 text-lg text-[#1a0dab]">{{ form.seo_title || form.name || 'Product name' }}</p><p class="text-sm text-[#4d5156]">{{ form.seo_description || form.tagline || 'Description' }}</p></div>
          </div>
        }
        @case ('media') {
          <div class="space-y-6">
            <div class="card p-6">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div><h3 class="font-sans font-semibold text-forest">Product images</h3><p class="text-xs text-muted">JPG, PNG, WEBP or AVIF up to 5 MB each, max 10. The first image is the main image. Square images (1:1) look best.</p></div>
                <button type="button" (click)="imgPicker.click()" [disabled]="r.pending()" class="btn btn-outline btn-sm"><nd-icon [icon]="I.imagePlus" class="size-4" /> Upload images</button>
                <input #imgPicker type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" hidden (change)="upload($event)" />
              </div>
              <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                @for (img of images(); track img.url; let i = $index, last = $last) {
                  <div class="rounded-2xl border border-line p-2">
                    <div class="relative aspect-square overflow-hidden rounded-xl bg-mint-50">
                      <img [src]="img.url" [alt]="img.alt ?? ''" class="absolute inset-0 size-full object-cover" />
                      @if (i === 0) { <span class="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-leaf px-2 py-0.5 text-[10px] font-bold text-white"><nd-icon [icon]="I.star" class="size-3" /> Main</span> }
                    </div>
                    <input [ngModel]="img.alt" (ngModelChange)="setAlt(i, $event)" [name]="'alt' + i" placeholder="Alt text" class="field mt-2 py-1.5 text-xs" aria-label="Alt text" />
                    <div class="mt-1.5 flex justify-between">
                      <button type="button" (click)="moveImage(i, -1)" [disabled]="i === 0" class="p-1 disabled:opacity-30" aria-label="Move left"><nd-icon [icon]="I.left" class="size-4" /></button>
                      <button type="button" (click)="removeImage(i)" class="p-1 text-berry" aria-label="Remove image"><nd-icon [icon]="I.trash" class="size-4" /></button>
                      <button type="button" (click)="moveImage(i, 1)" [disabled]="last" class="p-1 disabled:opacity-30" aria-label="Move right"><nd-icon [icon]="I.right" class="size-4" /></button>
                    </div>
                  </div>
                } @empty { <p class="col-span-full py-6 text-center text-sm text-muted">No images yet — the illustrated brand pack is shown on the website until you upload photos.</p> }
              </div>
              @if (imagesDirty()) { <button type="button" [disabled]="r.pending()" (click)="saveImages()" class="btn btn-primary mt-4"><nd-icon [icon]="I.save" class="size-4" /> Save image order &amp; removals</button> }
            </div>
            <div class="card space-y-3 p-6">
              <h3 class="font-sans font-semibold text-forest">Instructional videos</h3>
              <p class="text-xs text-muted">Paste a YouTube link or a direct https video URL, then save.</p>
              @for (v of form.videos; track $index; let i = $index) {
                <div class="flex flex-wrap gap-2">
                  <input [(ngModel)]="v.url" [name]="'vurl' + i" placeholder="https://youtube.com/watch?v=…" class="field flex-[2]" />
                  <input [(ngModel)]="v.title" [name]="'vtitle' + i" placeholder="Title" class="field flex-1" />
                  <button type="button" (click)="form.videos.splice(i, 1)" class="btn btn-ghost text-berry" aria-label="Remove video"><nd-icon [icon]="I.trash" class="size-4" /></button>
                </div>
              }
              @if (form.videos.length < 5) { <button type="button" (click)="form.videos.push({ url: '', title: '' })" class="btn btn-outline btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> Add video</button> }
            </div>
          </div>
        }
        @case ('pricing') {
          <div class="card p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div><h3 class="font-sans font-semibold text-forest">Pack sizes</h3><p class="text-xs text-muted">Each pack size has its own regular price (MRP), optional sale price and stock. Price changes apply to new orders only.</p></div>
              @if (!readOnly()) {
                <div class="flex flex-wrap gap-1.5">
                  @for (p of missingPresets(); track p.grams) { <button type="button" (click)="addVariant(p.label, p.grams)" class="btn btn-outline btn-sm"><nd-icon [icon]="I.plus" class="size-3.5" /> {{ p.label }}</button> }
                  <button type="button" (click)="addVariant('', 0)" class="btn btn-ghost btn-sm"><nd-icon [icon]="I.plus" class="size-3.5" /> Custom</button>
                </div>
              }
            </div>
            <div class="mt-4 overflow-x-auto">
              <table class="table-nd min-w-[900px]">
                <thead><tr><th>Label</th><th>Grams</th><th>SKU</th><th>Regular price ₹</th><th>Sale price ₹</th><th>Stock</th><th>Low-stock alert</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  @for (v of variants(); track v.key; let i = $index) {
                    <tr>
                      <td><input [(ngModel)]="v.label" [name]="'vl' + i" class="field w-24 py-1.5" aria-label="Label" (ngModelChange)="touchVariants()" /></td>
                      <td><input type="number" [(ngModel)]="v.weight_grams" [name]="'vg' + i" class="field w-24 py-1.5" aria-label="Grams" (ngModelChange)="touchVariants()" /></td>
                      <td><input [(ngModel)]="v.sku" [name]="'vs' + i" class="field w-32 py-1.5" aria-label="SKU" /></td>
                      <td><input inputmode="decimal" [(ngModel)]="v.price" [name]="'vp' + i" class="field w-28 py-1.5" aria-label="Regular price" (ngModelChange)="touchVariants()" /></td>
                      <td><input inputmode="decimal" [(ngModel)]="v.sale_price" [name]="'vsp' + i" class="field w-28 py-1.5" placeholder="—" aria-label="Sale price" (ngModelChange)="touchVariants()" />
                        @if (salePct(v); as pct) { <span class="block text-xs text-leaf">{{ pct }}% off</span> }</td>
                      <td><input type="number" min="0" [(ngModel)]="v.stock" [name]="'vst' + i" class="field w-24 py-1.5" aria-label="Stock" /></td>
                      <td><input type="number" min="0" [(ngModel)]="v.low_stock_threshold" [name]="'vlt' + i" class="field w-20 py-1.5" aria-label="Low stock threshold" /></td>
                      <td><input type="checkbox" [(ngModel)]="v.is_active" [name]="'va' + i" class="size-4 accent-leaf" aria-label="Active" /></td>
                      <td>@if (!readOnly()) { <button type="button" class="p-1.5 text-muted hover:text-berry" aria-label="Remove pack size" (click)="removeVariant(v)"><nd-icon [icon]="I.trash" class="size-4" /></button> }</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (!variants().length) { <p class="py-6 text-center text-sm text-muted">No pack sizes yet. Add 100 g, 250 g, 500 g, 750 g or 1 kg above.</p> }
            </div>
            @if (perHundred()) { <p class="mt-3 text-xs text-muted">Price per 100 g: {{ perHundred() }}</p> }
            @if (!readOnly()) { <button type="button" [disabled]="r.pending()" (click)="saveVariants()" class="btn btn-primary mt-5"><nd-icon [icon]="I.save" class="size-4" /> Save pack sizes &amp; prices</button> }
          </div>
        }
        @case ('health') {
          <div class="space-y-4">
            <div class="card space-y-3 p-6">
              <h3 class="font-sans font-semibold text-forest">Nutrition facts table</h3>
              <p class="text-xs text-muted">Enter lab-tested or label values only. Leave empty if not available.</p>
              <div><label class="field-label" for="p-nb">Basis</label><input id="p-nb" name="nb" [(ngModel)]="form.nutrition_basis" class="field max-w-sm" /></div>
              @for (n of form.nutrition_facts; track $index; let i = $index) {
                <div class="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
                  <input [(ngModel)]="n.nutrient" [name]="'nn' + i" placeholder="Nutrient (e.g. Energy)" class="field" aria-label="Nutrient" />
                  <input [(ngModel)]="n.amount" [name]="'na' + i" placeholder="Amount" class="field" aria-label="Amount" />
                  <input [(ngModel)]="n.unit" [name]="'nu' + i" placeholder="Unit (kcal, g, mg)" class="field" aria-label="Unit" />
                  <button type="button" (click)="form.nutrition_facts.splice(i, 1)" class="btn btn-ghost text-berry" aria-label="Remove row"><nd-icon [icon]="I.trash" class="size-4" /></button>
                </div>
              }
              <div class="flex gap-2">
                <button type="button" (click)="form.nutrition_facts.push({ nutrient: '', amount: '', unit: '' })" class="btn btn-outline btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> Add nutrient</button>
                <button type="button" (click)="saveProduct()" [disabled]="r.pending()" class="btn btn-primary btn-sm"><nd-icon [icon]="I.save" class="size-4" /> Save nutrition table</button>
              </div>
            </div>
            <div class="card flex flex-wrap items-center gap-3 p-5">
              <div class="flex-1">
                <h3 class="font-sans font-semibold text-forest">Health information &amp; product uses</h3>
                <p class="text-xs text-muted">Add multiple bullet points or paragraphs per section. Only <strong>approved</strong> items appear on the product page. Editing an item un-publishes it until it is approved again.</p>
              </div>
              @if (!readOnly() && pendingIds().length) { <button type="button" [disabled]="r.pending()" (click)="approve(pendingIds(), true)" class="btn btn-primary btn-sm"><nd-icon [icon]="I.check" class="size-4" /> Review done — approve {{ pendingIds().length }} pending</button> }
            </div>
            <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><strong>Content policy:</strong> describe nutrients, culinary and traditional uses only. Never say a product cures, treats or prevents a disease, and never guarantee outcomes. Mark each statement’s evidence level — “Research-supported” requires a source.</div>
            @for (s of sections; track s.key) {
              <section class="card p-5">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-sans font-semibold text-forest">{{ s.label }}</h4><span class="text-xs text-muted">{{ s.hint }}</span>
                  @if (!readOnly()) { <button type="button" (click)="addItem(s.key)" class="btn btn-ghost btn-sm ml-auto"><nd-icon [icon]="I.plus" class="size-4" /> Add item</button> }
                </div>
                <ul class="mt-3 space-y-3">
                  @for (d of inSection(s.key); track d.key; let i = $index, last = $last) {
                    @let published = d.is_approved && !d.dirty;
                    <li class="rounded-2xl border p-3" [class]="published ? 'border-mint bg-mint-50/60' : 'border-amber-200 bg-amber-50/40'">
                      <div class="flex flex-wrap items-center gap-2 text-xs">
                        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold" [class]="published ? 'bg-mint text-forest' : 'bg-amber-100 text-amber-800'">
                          <nd-icon [icon]="published ? I.check : I.circle" class="size-3" /> {{ published ? 'Published' : d.dirty ? 'Unsaved' : 'Pending review' }}
                        </span>
                        <select [(ngModel)]="d.kind" [name]="'k' + d.key" (ngModelChange)="markDirty(d)" class="field w-auto px-2 py-1 text-xs" aria-label="Format"><option value="bullet">Bullet</option><option value="paragraph">Paragraph</option></select>
                        <select [(ngModel)]="d.claim_type" [name]="'c' + d.key" (ngModelChange)="markDirty(d)" class="field w-auto px-2 py-1 text-xs" aria-label="Evidence level" [title]="claim[d.claim_type].description">
                          @for (c of claimTypes; track c) { <option [value]="c">{{ claim[c].label }}</option> }
                        </select>
                        @if (!readOnly()) {
                          <span class="ml-auto flex gap-1">
                            <button type="button" (click)="move(d, -1)" [disabled]="i === 0 || !d.id" class="p-1 disabled:opacity-30" aria-label="Move up"><nd-icon [icon]="I.up" class="size-4" /></button>
                            <button type="button" (click)="move(d, 1)" [disabled]="last || !d.id" class="p-1 disabled:opacity-30" aria-label="Move down"><nd-icon [icon]="I.down" class="size-4" /></button>
                            <button type="button" (click)="deleteItem(d)" class="p-1 text-berry" aria-label="Delete item"><nd-icon [icon]="I.trash" class="size-4" /></button>
                          </span>
                        }
                      </div>
                      <textarea [(ngModel)]="d.body" [name]="'b' + d.key" (ngModelChange)="markDirty(d)" [rows]="d.kind === 'paragraph' ? 3 : 2" maxlength="2000" class="field mt-2 text-sm" [attr.aria-label]="s.label + ' text'"></textarea>
                      @if (d.claim_type !== 'general' || d.source_reference) {
                        <input [(ngModel)]="d.source_reference" [name]="'s' + d.key" (ngModelChange)="markDirty(d)" [placeholder]="d.claim_type === 'research_supported' ? 'Source reference (required) — study, guideline or https:// link' : 'Source reference (optional)'" class="field mt-2 py-1.5 text-xs" aria-label="Source reference" />
                      }
                      @if (warnings(d.body).length) { <p class="mt-2 flex items-center gap-1.5 text-xs font-semibold text-berry"><nd-icon [icon]="I.warn" class="size-3.5" /> Possible medical claim wording: {{ warnings(d.body).join(', ') }}. Rephrase as general nutrition information.</p> }
                      @if (!readOnly() && !published) {
                        <div class="mt-2 flex gap-2">
                          @if (d.dirty) { <button type="button" [disabled]="r.pending() || !d.body.trim()" (click)="saveItem(d, false)" class="btn btn-outline btn-sm"><nd-icon [icon]="I.save" class="size-3.5" /> Save draft</button> }
                          <button type="button" [disabled]="r.pending() || !d.body.trim()" (click)="d.dirty ? saveItem(d, true) : approve([d.id!], true)" class="btn btn-primary btn-sm"><nd-icon [icon]="I.check" class="size-3.5" /> {{ d.dirty ? 'Save & approve' : 'Approve & publish' }}</button>
                        </div>
                      }
                      @if (!readOnly() && published) { <button type="button" [disabled]="r.pending()" (click)="approve([d.id!], false)" class="mt-2 text-xs font-semibold text-muted underline">Unpublish</button> }
                    </li>
                  } @empty { <li class="text-sm text-muted">No items yet.</li> }
                </ul>
              </section>
            }
          </div>
        }
      }
    </fieldset>

    @if (!readOnly() && (tab() === 'details' || tab() === 'seo' || tab() === 'media')) {
      <div class="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-t border-line bg-white/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <button type="button" (click)="saveProduct()" [disabled]="r.pending()" class="btn btn-primary"><nd-icon [icon]="I.save" class="size-4" /> {{ id() ? 'Save changes' : 'Create product' }}</button>
        @if (id()) { <button type="button" class="btn btn-ghost ml-auto text-berry" [disabled]="r.pending()" (click)="deleteProduct()"><nd-icon [icon]="I.trash" class="size-4" /> Delete product</button> }
      </div>
    }
  `,
})
export class ProductEditorPage {
  private api = inject(ApiService);
  private router = inject(Router);
  r = adminRunner();
  id = input<string>();
  tabParam = input<string>(undefined, { alias: 'tab' });
  I = {
    ext: ExternalLink, info: Info, imagePlus: ImagePlus, star: Star, left: ArrowLeft, right: ArrowRight, trash: Trash2, save: Save, plus: Plus,
    check: CircleCheck, circle: Circle, up: ArrowUp, down: ArrowDown, warn: TriangleAlert,
  };
  tabs = TABS;
  sections = HEALTH_SECTIONS;
  claim = CLAIM_LABEL;
  claimTypes = Object.keys(CLAIM_LABEL) as ClaimType[];
  warnings = findClaimWarnings;

  tab = signal('details');
  readOnly = signal(false);
  categories = signal<Category[]>([]);
  loadedProduct = signal<Product | null>(null);
  images = signal<ProductImage[]>([]);
  imagesDirty = signal(false);
  variants = signal<VRow[]>([]);
  removedVariantIds: string[] = [];
  drafts = signal<HDraft[]>([]);
  form = this.blankForm();

  pendingIds = computed(() => this.drafts().filter((d) => d.id && !d.is_approved && !d.dirty).map((d) => d.id!));
  missingPresets = computed(() => PRESETS.filter((p) => !this.variants().some((v) => Number(v.weight_grams) === p.grams)));
  perHundred = computed(() =>
    this.variants()
      .filter((v) => Number(v.weight_grams) > 0 && rupeesToPaise(v.price))
      .map((v) => `${v.label} ${formatINR(Math.round(((rupeesToPaise(v.sale_price) ?? rupeesToPaise(v.price)!) / Number(v.weight_grams)) * 100))}`)
      .join(' · '),
  );

  constructor() {
    effect(() => {
      const t = this.tabParam();
      if (t && TABS.some((x) => x.key === t)) this.tab.set(t);
    });
    effect(() => void this.load(this.id()));
  }

  private blankForm() {
    return {
      name: '', slug: '', sku: '', category_id: '', tagline: '', description: '', status: 'draft' as Product['status'], is_featured: false, discount_percent: 0,
      accent_color: '#126B35', seo_title: '', seo_description: '', nutrition_basis: 'Per 100 g (approximate)',
      nutrition_facts: [] as { nutrient: string; amount: string; unit: string }[], videos: [] as { url: string; title: string }[], sort_order: 0,
    };
  }

  private async load(id: string | undefined) {
    if (!id) {
      const r = await this.api.get<{ categories: Category[] }>('/api/admin/categories');
      if (r.ok) this.categories.set(r.data.categories);
      return;
    }
    const r = await this.api.get<EditorData>(`/api/admin/products/${id}`);
    if (!r.ok) return;
    const { product: p, variants, info, categories, readOnly } = r.data;
    this.loadedProduct.set(p);
    this.categories.set(categories);
    this.readOnly.set(readOnly);
    this.form = {
      name: p.name, slug: p.slug, sku: p.sku ?? '', category_id: p.category_id ?? '', tagline: p.tagline ?? '', description: p.description ?? '', status: p.status,
      is_featured: p.is_featured, discount_percent: p.discount_percent, accent_color: p.accent_color, seo_title: p.seo_title ?? '', seo_description: p.seo_description ?? '',
      nutrition_basis: p.nutrition_basis ?? '', nutrition_facts: p.nutrition_facts.map((n) => ({ ...n })), videos: p.videos.map((v) => ({ url: v.url, title: v.title ?? '' })), sort_order: p.sort_order,
    };
    this.images.set(p.images);
    this.imagesDirty.set(false);
    this.variants.set(variants.map((v) => ({
      key: v.id, id: v.id, label: v.label, weight_grams: v.weight_grams, sku: v.sku ?? '', price: paiseToRupees(v.price_paise), sale_price: paiseToRupees(v.sale_price_paise),
      stock: v.stock, low_stock_threshold: v.low_stock_threshold, is_active: v.is_active, sort_order: v.sort_order,
    })));
    this.removedVariantIds = [];
    this.drafts.set(info.map(toDraft));
  }

  // ---------- Product details / SEO / media
  saveProduct() {
    const body = { ...this.form, discount_percent: Number(this.form.discount_percent), sort_order: Number(this.form.sort_order) };
    const id = this.id();
    void this.r.run(
      id ? this.api.put(`/api/admin/products/${id}`, body) : this.api.post<{ id: string }>('/api/admin/products', body),
      (d) => {
        if (!id && d && typeof d === 'object' && 'id' in d) void this.router.navigate(['/admin/products', (d as { id: string }).id], { queryParams: { tab: 'pricing' } });
        else void this.load(id);
      },
    );
  }
  deleteProduct() {
    if (!confirm(`Delete “${this.form.name}”? This removes it from the store. Past orders keep their details.`)) return;
    void this.r.run(this.api.delete(`/api/admin/products/${this.id()}`), () => void this.router.navigateByUrl('/admin/products'));
  }
  upload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    const fd = new FormData();
    Array.from(input.files).forEach((f) => fd.append('images', f));
    input.value = '';
    void this.r.run(this.api.post<{ images: ProductImage[] }>(`/api/admin/products/${this.id()}/images`, fd), (d) => this.images.set(d.images));
  }
  moveImage(i: number, d: number) {
    const next = [...this.images()];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    this.images.set(next);
    this.imagesDirty.set(true);
  }
  removeImage(i: number) {
    this.images.update((imgs) => imgs.filter((_, j) => j !== i));
    this.imagesDirty.set(true);
  }
  setAlt(i: number, alt: string) {
    this.images.update((imgs) => imgs.map((x, j) => (j === i ? { ...x, alt } : x)));
    this.imagesDirty.set(true);
  }
  saveImages() {
    void this.r.run(this.api.put(`/api/admin/products/${this.id()}/images`, { images: this.images() }), () => this.imagesDirty.set(false));
  }

  // ---------- Variants
  addVariant(label: string, grams: number) {
    this.variants.update((v) => [...v, { key: uid(), label, weight_grams: grams, sku: '', price: '', sale_price: '', stock: 0, low_stock_threshold: 10, is_active: true, sort_order: v.length + 1 }]);
  }
  removeVariant(v: VRow) {
    if (v.id) this.removedVariantIds.push(v.id);
    this.variants.update((rows) => rows.filter((x) => x.key !== v.key));
  }
  touchVariants() {
    this.variants.update((v) => [...v]);
  }
  salePct(v: VRow) {
    const p = rupeesToPaise(v.price) ?? 0;
    const s = rupeesToPaise(v.sale_price);
    return s && p > s ? percentOff(p, s) : 0;
  }
  saveVariants() {
    const variants = this.variants().map(({ key: _k, ...v }) => ({ ...v, weight_grams: Number(v.weight_grams), stock: Number(v.stock), low_stock_threshold: Number(v.low_stock_threshold), price: String(v.price), sale_price: String(v.sale_price ?? '') }));
    void this.r.run(this.api.put(`/api/admin/products/${this.id()}/variants`, { variants, removedIds: this.removedVariantIds }), () => void this.load(this.id()));
  }

  // ---------- Health information (each statement reviewed before publishing)
  inSection(s: HealthSection) {
    return this.drafts().filter((d) => d.section === s);
  }
  markDirty(d: HDraft) {
    d.dirty = true;
    this.drafts.update((ds) => [...ds]);
  }
  addItem(section: HealthSection) {
    this.drafts.update((ds) => [...ds, { key: uid(), section, kind: 'bullet', body: '', claim_type: 'general', source_reference: '', is_approved: false, dirty: true }]);
  }
  saveItem(d: HDraft, approve: boolean) {
    const order = this.inSection(d.section).findIndex((x) => x.key === d.key) + 1;
    void this.r.run(
      this.api.post<{ item: HealthInfoItem }>(`/api/admin/products/${this.id()}/health`, { id: d.id, section: d.section, kind: d.kind, body: d.body, claim_type: d.claim_type, source_reference: d.source_reference, sort_order: order, approve }),
      (res) => this.drafts.update((ds) => ds.map((x) => (x.key === d.key ? { ...toDraft(res.item), key: d.key } : x))),
    );
  }
  approve(ids: string[], approved: boolean) {
    void this.r.run(this.api.put(`/api/admin/products/${this.id()}/health-approval`, { ids, approved }), () =>
      this.drafts.update((ds) => ds.map((x) => (x.id && ids.includes(x.id) ? { ...x, is_approved: approved } : x))),
    );
  }
  deleteItem(d: HDraft) {
    if (!confirm('Delete this item?')) return;
    if (d.id) void this.r.run(this.api.delete(`/api/admin/products/${this.id()}/health/${d.id}`));
    this.drafts.update((ds) => ds.filter((x) => x.key !== d.key));
  }
  move(d: HDraft, dir: -1 | 1) {
    const list = this.inSection(d.section);
    const idx = list.findIndex((x) => x.key === d.key);
    if (!list[idx + dir]) return;
    const reordered = [...list];
    [reordered[idx], reordered[idx + dir]] = [reordered[idx + dir], reordered[idx]];
    this.drafts.update((ds) => [...ds.filter((x) => x.section !== d.section), ...reordered]);
    void this.r.run(this.api.put(`/api/admin/products/${this.id()}/health-order`, { ids: reordered.map((x) => x.id).filter(Boolean) }));
  }
}
