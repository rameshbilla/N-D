import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Plus, Send, Trash2 } from 'lucide';
import { formatINR } from '../../../shared/money';
import { formatIndianPhone } from '../../../shared/phone';
import { LOGISTICS_LABEL, PROCESSING_LABEL, REQUEST_STATUS_LABEL } from '../../../shared/status';
import type { CustomRequest, CustomRequestStatus, Quotation } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { InrPipe, NdDatePipe, orderTone, StatusBadge } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { AdminHeader, adminRunner, apiResource, Pager } from './admin-ui';

// ============================ Requests list ============================
@Component({
  selector: 'nd-requests-admin',
  imports: [RouterLink, FormsModule, StatusBadge, InrPipe, NdDatePipe, AdminHeader, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Custom processing requests" description="Review requests, send quotations and update processing stages." />
    <div class="card mb-4 flex gap-2 p-3">
      <select [ngModel]="status()" (ngModelChange)="status.set($event); page.set(1)" name="status" class="field w-auto py-2">
        <option value="">All</option><option value="open">Needs review</option>@for (s of statuses; track s) { <option [value]="s">{{ label[s] }}</option> }
      </select>
    </div>
    @if (data.value(); as d) {
      <div class="card overflow-x-auto">
        <table class="table-nd min-w-[820px]">
          <thead><tr><th>Request</th><th>Customer</th><th>Ingredient</th><th>Processing</th><th>Estimate</th><th>Status</th></tr></thead>
          <tbody>
            @for (r of d.rows; track r.id) {
              <tr>
                <td><a [routerLink]="['/admin/custom-requests', r.id]" class="font-semibold text-leaf">#{{ r.request_number }}</a><span class="block text-xs text-muted">{{ r.created_at | ndDate: true }}</span></td>
                <td>{{ r.customer_name }}</td>
                <td>{{ r.ingredient_name }}<span class="block text-xs text-muted">{{ r.quantity }} {{ r.quantity_unit }}</span></td>
                <td class="text-sm">{{ processing[r.processing_type] }}</td>
                <td>@if (r.estimated_total_paise) { {{ r.estimated_total_paise | inr }} } @else { <span class="text-xs text-muted">Manual</span> }</td>
                <td><nd-badge [tone]="tone(r.status)">{{ label[r.status] }}</nd-badge></td>
              </tr>
            } @empty { <tr><td colspan="6" class="p-8 text-center text-muted">No requests found.</td></tr> }
          </tbody>
        </table>
      </div>
      <nd-pager [page]="d.page" [total]="d.total" [pageSize]="d.pageSize" [change]="pageFn" />
    }
  `,
})
export class RequestsAdminPage {
  status = signal('');
  page = signal(1);
  data = apiResource<{ rows: CustomRequest[]; total: number; page: number; pageSize: number }>(() => `/api/admin/custom-requests?status=${this.status()}&page=${this.page()}`);
  statuses = Object.keys(REQUEST_STATUS_LABEL) as CustomRequestStatus[];
  label = REQUEST_STATUS_LABEL;
  processing = PROCESSING_LABEL;
  tone = orderTone;
  pageFn = (p: number) => this.page.set(p);
}

// ============================ Request detail ============================
interface RequestAdminData {
  request: CustomRequest;
  quotations: Quotation[];
  stages: { status: CustomRequestStatus; note: string | null; created_at: string }[];
  photos: string[];
  canQuote: boolean;
}
const in7 = () => new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

@Component({
  selector: 'nd-request-admin',
  imports: [FormsModule, IconComponent, StatusBadge, InrPipe, NdDatePipe, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as d) {
      @let r = d.request;
      <nd-admin-header [heading]="'Request #' + r.request_number" backHref="/admin/custom-requests" backLabel="Custom requests"><nd-badge [tone]="tone(r.status)">{{ label[r.status] }}</nd-badge></nd-admin-header>
      <div class="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div class="space-y-6">
          <section class="card p-5 text-sm">
            <h3 class="font-sans font-semibold text-forest">Request</h3>
            <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt class="text-muted">Customer</dt><dd>{{ r.customer_name }} · {{ fmt(r.phone) }}</dd>
              <dt class="text-muted">Ingredient</dt><dd>{{ r.ingredient_name }} ({{ r.ingredient_category.replace('_', ' / ') }})</dd>
              <dt class="text-muted">Quantity</dt><dd>{{ r.quantity }} {{ r.quantity_unit }}</dd>
              <dt class="text-muted">Processing</dt><dd>{{ processing[r.processing_type] }}</dd>
              <dt class="text-muted">Hand-over</dt><dd>{{ logistics[r.logistics] }}{{ r.pickup_address ? ' — ' + r.pickup_address : '' }}</dd>
              <dt class="text-muted">Return</dt><dd>{{ r.return_preference === 'delivery' ? 'Deliver to customer' : 'Customer collects' }}</dd>
              <dt class="text-muted">Website estimate</dt><dd>@if (r.estimated_total_paise) { {{ r.estimated_total_paise | inr }} } @else { Manual quotation required }</dd>
              <dt class="text-muted">Submitted</dt><dd>{{ r.created_at | ndDate: true }}</dd>
            </dl>
            @if (r.special_instructions) { <p class="mt-3 rounded-xl bg-mint-50 p-3">{{ r.special_instructions }}</p> }
            @if (d.photos.length) {
              <div class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">@for (u of d.photos; track u) { <a [href]="u" target="_blank" rel="noopener noreferrer" class="relative aspect-square overflow-hidden rounded-xl"><img [src]="u" alt="Raw material" class="absolute inset-0 size-full object-cover" /></a> }</div>
            }
          </section>
          <section class="card p-5 text-sm">
            <h3 class="font-sans font-semibold text-forest">Quotations</h3>
            <ul class="mt-3 space-y-3">
              @for (q of d.quotations; track q.id) {
                <li class="rounded-2xl border border-line p-3">
                  <div class="flex flex-wrap items-center gap-2"><nd-badge [tone]="tone(q.status)">{{ q.status }}</nd-badge><strong>{{ q.total_paise | inr }}</strong><span class="text-xs text-muted">valid until {{ q.valid_until | ndDate }} · sent {{ q.created_at | ndDate }}</span></div>
                  <ul class="mt-2 text-xs text-muted">@for (l of q.line_items; track $index) { <li>{{ l.label }}: {{ l.amount_paise | inr }}</li> }</ul>
                </li>
              } @empty { <li class="text-muted">No quotation sent yet.</li> }
            </ul>
          </section>
          <section class="card p-5 text-sm">
            <h3 class="font-sans font-semibold text-forest">Stage history</h3>
            <ol class="mt-3 space-y-2">@for (s of d.stages; track $index) { <li><span class="text-xs text-muted">{{ s.created_at | ndDate: true }}</span> — <strong>{{ label[s.status] }}</strong>{{ s.note ? ': ' + s.note : '' }}</li> }</ol>
          </section>
        </div>
        <div class="space-y-6">
          <form class="card space-y-3 p-5" (ngSubmit)="setStatus()">
            <h3 class="font-sans font-semibold text-forest">Update processing stage</h3>
            <select name="next" [(ngModel)]="next" class="field" aria-label="Stage">@for (s of statuses; track s) { <option [value]="s">{{ label[s] }}</option> }</select>
            <textarea name="note" [(ngModel)]="note" rows="2" maxlength="500" placeholder="Message to customer (optional)" class="field"></textarea>
            <button class="btn btn-primary w-full" [disabled]="run.pending() || next === r.status">Update &amp; notify</button>
            <p class="text-xs text-muted">Use “Rejected” to decline a request (add a reason above).</p>
          </form>
          @if (d.canQuote) {
            <form class="card space-y-3 p-5" (ngSubmit)="sendQuote()">
              <h3 class="font-sans font-semibold text-forest">{{ openQuote() ? 'Revise quotation' : 'Send quotation' }}</h3>
              @if (openQuote(); as oq) {
                <div class="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                  Open quotation of {{ oq.total_paise | inr }} ({{ oq.status }}). Sending a new one withdraws it.
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button type="button" class="btn btn-ghost btn-sm" [disabled]="run.pending()" (click)="withdraw(oq.id)">Withdraw</button>
                    <button type="button" class="btn btn-outline btn-sm" [disabled]="run.pending()" (click)="offline(oq.id)">Record offline payment</button>
                  </div>
                </div>
              }
              @for (l of lines; track $index; let i = $index) {
                <div class="flex gap-2">
                  <input [(ngModel)]="l.label" [name]="'ll' + i" class="field flex-[2] py-2" aria-label="Line description" />
                  <input [(ngModel)]="l.amount" [name]="'la' + i" inputmode="decimal" placeholder="₹" class="field flex-1 py-2" aria-label="Amount in rupees" />
                  <button type="button" (click)="lines.splice(i, 1)" class="p-1 text-berry" aria-label="Remove line"><nd-icon [icon]="I.trash" class="size-4" /></button>
                </div>
              }
              <button type="button" (click)="lines.push({ label: '', amount: '' })" class="btn btn-ghost btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> Add line (transport, ingredient-specific…)</button>
              <p class="text-right font-bold text-forest">Total {{ total() }}</p>
              <label class="block text-sm">Valid until<input type="date" name="valid" [(ngModel)]="validUntil" class="field mt-1" /></label>
              <textarea name="qnotes" [(ngModel)]="qNotes" rows="2" placeholder="Notes for the customer (yield, timelines…)" class="field"></textarea>
              <button class="btn btn-accent w-full" [disabled]="run.pending()"><nd-icon [icon]="I.send" class="size-4" /> Send quotation</button>
            </form>
          }
          <form class="card space-y-3 p-5" (ngSubmit)="saveNotes()">
            <h3 class="font-sans font-semibold text-forest">Internal notes</h3>
            <textarea name="notes" [(ngModel)]="notes" rows="4" class="field" placeholder="Visible to staff only"></textarea>
            <button class="btn btn-outline btn-sm" [disabled]="run.pending()">Save notes</button>
          </form>
        </div>
      </div>
    }
  `,
})
export class RequestAdminPage {
  private api = inject(ApiService);
  run = adminRunner();
  id = input.required<string>();
  data = apiResource<RequestAdminData>(() => `/api/admin/custom-requests/${this.id()}`);
  statuses = Object.keys(REQUEST_STATUS_LABEL) as CustomRequestStatus[];
  label = REQUEST_STATUS_LABEL;
  processing = PROCESSING_LABEL;
  logistics = LOGISTICS_LABEL;
  tone = orderTone;
  fmt = formatIndianPhone;
  I = { plus: Plus, trash: Trash2, send: Send };
  next: CustomRequestStatus = 'request_received';
  note = '';
  notes = '';
  lines: { label: string; amount: string }[] = [];
  qNotes = '';
  validUntil = in7();
  openQuote = computed(() => this.data.value()?.quotations.find((q) => q.status === 'sent' || q.status === 'accepted') ?? null);

  constructor() {
    effect(() => {
      const d = this.data.value();
      if (!d) return;
      const r = d.request;
      const kg = r.quantity_unit === 'g' ? r.quantity / 1000 : Number(r.quantity);
      this.next = r.status;
      this.notes = r.admin_notes ?? '';
      this.lines = [{ label: `Processing charges (${kg} kg)`, amount: r.estimated_total_paise ? String(r.estimated_total_paise / 100) : '' }, { label: 'Packaging', amount: '' }];
    });
  }
  total() {
    return formatINR(Math.round(this.lines.reduce((a, l) => a + (Number.parseFloat(l.amount) || 0), 0) * 100));
  }
  private after = () => {
    this.note = '';
    this.data.reload();
  };
  setStatus() {
    void this.run.run(this.api.put(`/api/admin/custom-requests/${this.id()}/status`, { status: this.next, note: this.note }), this.after);
  }
  sendQuote() {
    void this.run.run(this.api.post(`/api/admin/custom-requests/${this.id()}/quotation`, { line_items: this.lines, notes: this.qNotes, valid_until: this.validUntil }), this.after);
  }
  withdraw(qid: string) {
    if (confirm('Withdraw this quotation?')) void this.run.run(this.api.post(`/api/admin/quotations/${qid}/withdraw`), this.after);
  }
  offline(qid: string) {
    const ref = prompt('Payment reference (cash / bank transfer / UPI ID)');
    if (ref !== null) void this.run.run(this.api.post(`/api/admin/quotations/${qid}/offline-payment`, { reference: ref }), this.after);
  }
  saveNotes() {
    void this.run.run(this.api.put(`/api/admin/custom-requests/${this.id()}/notes`, { notes: this.notes }));
  }
}

// ============================ Quotations ============================
type QuoteRow = Quotation & { request: { id: string; request_number: string; customer_name: string; ingredient_name: string } };

@Component({
  selector: 'nd-quotations-admin',
  imports: [RouterLink, FormsModule, StatusBadge, InrPipe, NdDatePipe, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-admin-header heading="Quotations" description="All quotations sent for custom processing requests." />
    <div class="card mb-4 flex gap-2 p-3">
      <select [ngModel]="status()" (ngModelChange)="status.set($event)" name="status" class="field w-auto py-2"><option value="">All</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select>
    </div>
    <div class="card overflow-x-auto">
      <table class="table-nd min-w-[720px]">
        <thead><tr><th>Request</th><th>Customer</th><th>Sent</th><th>Valid until</th><th>Status</th><th class="text-right">Total</th></tr></thead>
        <tbody>
          @for (q of data.value() ?? []; track q.id) {
            <tr>
              <td><a [routerLink]="['/admin/custom-requests', q.request.id]" class="font-semibold text-leaf">#{{ q.request.request_number }}</a><span class="block text-xs text-muted">{{ q.request.ingredient_name }}</span></td>
              <td>{{ q.request.customer_name }}</td><td class="text-sm">{{ q.created_at | ndDate }}</td><td class="text-sm">{{ q.valid_until | ndDate }}</td>
              <td><nd-badge [tone]="tone(q.status)">{{ q.status }}</nd-badge></td><td class="text-right font-semibold">{{ q.total_paise | inr }}</td>
            </tr>
          } @empty { <tr><td colspan="6" class="p-8 text-center text-muted">No quotations yet.</td></tr> }
        </tbody>
      </table>
    </div>
  `,
})
export class QuotationsAdminPage {
  status = signal('');
  data = apiResource<QuoteRow[]>(() => `/api/admin/quotations?status=${this.status()}`);
  statuses = ['sent', 'accepted', 'paid', 'rejected', 'expired', 'withdrawn'];
  tone = orderTone;
}
