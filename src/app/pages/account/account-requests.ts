import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, ChevronRight, Plus } from 'lucide';
import { LOGISTICS_LABEL, PROCESSING_LABEL, REQUEST_STATUS_LABEL, REQUEST_TIMELINE } from '../../../shared/status';
import type { CustomRequest, CustomRequestStatus, Quotation } from '../../../shared/types';
import { fmtDate, InrPipe, NdDatePipe, orderTone, StatusBadge, Timeline } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { QuotationCard } from '../../ui/order';
import { apiResource } from './account-pages';

@Component({
  selector: 'nd-requests',
  imports: [RouterLink, IconComponent, StatusBadge, InrPipe, NdDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between">
      <h2 class="font-sans text-xl font-semibold text-forest">Custom processing requests</h2>
      <a routerLink="/custom-processing" class="btn btn-primary btn-sm"><nd-icon [icon]="I.plus" class="size-4" /> New request</a>
    </div>
    @if (data.value()?.length) {
      <ul class="mt-4 space-y-3">
        @for (r of data.value()!; track r.id) {
          <li>
            <a [routerLink]="['/account/requests', r.id]" class="card flex flex-wrap items-center gap-3 p-5 transition hover:shadow-lift">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2"><span class="font-semibold text-forest">#{{ r.request_number }}</span><nd-badge [tone]="tone(r.status)">{{ label[r.status] }}</nd-badge></div>
                <p class="mt-1 text-sm text-muted">{{ r.ingredient_name }} · {{ r.quantity }} {{ r.quantity_unit }} · {{ processing[r.processing_type] }}</p>
                <p class="text-xs text-muted">{{ r.created_at | ndDate: true }}</p>
              </div>
              @if (r.estimated_total_paise) { <span class="text-sm text-muted">Est. {{ r.estimated_total_paise | inr }}</span> }
              <nd-icon [icon]="I.chevron" class="size-5 text-muted" />
            </a>
          </li>
        }
      </ul>
    } @else if (data.value()) {
      <div class="card mt-4 p-8 text-center"><p class="text-muted">No custom processing requests yet.</p><a routerLink="/custom-processing" class="btn btn-primary mt-4">Request custom processing</a></div>
    }
  `,
})
export class RequestsPage {
  data = apiResource<CustomRequest[]>(() => '/api/account/requests');
  label = REQUEST_STATUS_LABEL;
  processing = PROCESSING_LABEL;
  tone = orderTone;
  I = { plus: Plus, chevron: ChevronRight };
}

interface RequestDetail {
  request: CustomRequest;
  quotations: Quotation[];
  stages: { status: CustomRequestStatus; note: string | null; created_at: string }[];
  photos: string[];
}

@Component({
  selector: 'nd-request-detail',
  imports: [RouterLink, IconComponent, StatusBadge, InrPipe, NdDatePipe, Timeline, QuotationCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/account/requests" class="inline-flex items-center gap-1 text-sm font-semibold text-leaf"><nd-icon [icon]="back" class="size-4" /> All requests</a>
    @if (data.value(); as d) {
      @let r = d.request;
      <div class="mt-4 space-y-6">
        <div class="flex flex-wrap items-center gap-3"><h2 class="text-2xl font-semibold text-forest">Request #{{ r.request_number }}</h2><nd-badge [tone]="tone(r.status)">{{ label[r.status] }}</nd-badge></div>
        <section class="card overflow-x-auto p-5">
          <h3 class="mb-5 font-sans font-semibold text-forest">Processing progress</h3>
          <div class="md:min-w-[900px]"><nd-timeline [steps]="steps" [current]="current()" [events]="events()" [failed]="failed()" /></div>
        </section>
        <div class="grid gap-6 md:grid-cols-2">
          <section class="card p-5 text-sm">
            <h3 class="font-sans font-semibold text-forest">Request details</h3>
            <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt class="text-muted">Ingredient</dt><dd>{{ r.ingredient_name }}</dd>
              <dt class="text-muted">Quantity</dt><dd>{{ r.quantity }} {{ r.quantity_unit }}</dd>
              <dt class="text-muted">Processing</dt><dd>{{ processing[r.processing_type] }}</dd>
              <dt class="text-muted">Raw material</dt><dd>{{ logistics[r.logistics] }}</dd>
              <dt class="text-muted">Return</dt><dd>{{ r.return_preference === 'delivery' ? 'Deliver finished product' : 'I will collect' }}</dd>
              @if (r.estimated_total_paise) { <dt class="text-muted">Estimate</dt><dd>{{ r.estimated_total_paise | inr }} (indicative)</dd> }
              <dt class="text-muted">Submitted</dt><dd>{{ r.created_at | ndDate: true }}</dd>
            </dl>
            @if (r.special_instructions) { <p class="mt-3 rounded-2xl bg-mint-50 p-3">{{ r.special_instructions }}</p> }
            @if (d.photos.length) {
              <div class="mt-4 grid grid-cols-3 gap-2">@for (u of d.photos; track u) { <a [href]="u" target="_blank" rel="noopener noreferrer" class="relative aspect-square overflow-hidden rounded-xl"><img [src]="u" alt="Raw material photo" class="absolute inset-0 size-full object-cover" /></a> }</div>
            }
          </section>
          <div class="space-y-4">
            @for (q of d.quotations; track q.id) { <nd-quotation-card [quotation]="q" [requestNumber]="r.request_number" (changed)="data.reload()" /> }
            @empty { <div class="card p-5 text-sm text-muted">Our team is reviewing your request. Your quotation will appear here and you will be notified.</div> }
            @if (notes().length) {
              <div class="card p-5 text-sm">
                <h3 class="font-sans font-semibold text-forest">Updates</h3>
                <ul class="mt-3 space-y-2">@for (s of notes(); track $index) { <li><span class="text-xs text-muted">{{ s.created_at | ndDate: true }}</span><br />{{ s.note }}</li> }</ul>
              </div>
            }
          </div>
        </div>
      </div>
    } @else if (data.error()) {
      <p class="card mt-4 p-8 text-center text-muted">Request not found.</p>
    }
  `,
})
export class RequestDetailPage {
  id = input.required<string>();
  data = apiResource<RequestDetail>(() => `/api/account/requests/${this.id()}`);
  label = REQUEST_STATUS_LABEL;
  processing = PROCESSING_LABEL;
  logistics = LOGISTICS_LABEL;
  tone = orderTone;
  back = ArrowLeft;
  steps = REQUEST_TIMELINE.map((s) => ({ key: s.status as string, label: s.label }));
  current = computed(() => REQUEST_TIMELINE.findIndex((s) => s.status === this.data.value()?.request.status));
  events = computed(() => Object.fromEntries((this.data.value()?.stages ?? []).map((s) => [s.status, fmtDate(s.created_at)])));
  notes = computed(() => (this.data.value()?.stages ?? []).filter((s) => s.note));
  failed = computed(() => {
    const s = this.data.value()?.request.status;
    return s === 'rejected' ? 'This request was declined. Please see the notes below or contact us.' : s === 'cancelled' ? 'This request was cancelled.' : null;
  });
}

@Component({
  selector: 'nd-quotations',
  imports: [RouterLink, QuotationCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="font-sans text-xl font-semibold text-forest">My quotations</h2>
    @if (data.value()?.length) {
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        @for (q of data.value()!; track q.id) {
          <div>
            <a [routerLink]="['/account/requests', q.request.id]" class="mb-2 block text-sm font-semibold text-leaf">#{{ q.request.request_number }} · {{ q.request.ingredient_name }}</a>
            <nd-quotation-card [quotation]="q" [requestNumber]="q.request.request_number" (changed)="data.reload()" />
          </div>
        }
      </div>
    } @else if (data.value()) {
      <p class="card mt-4 p-8 text-center text-muted">No quotations yet. Submit a custom processing request to receive one.</p>
    }
  `,
})
export class QuotationsPage {
  data = apiResource<(Quotation & { request: { id: string; request_number: string; ingredient_name: string } })[]>(() => '/api/account/quotations');
}
