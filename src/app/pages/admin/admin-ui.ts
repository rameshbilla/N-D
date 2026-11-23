import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChevronLeft, ChevronRight } from 'lucide';
import type { ApiResult } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../ui/icon';

export { apiResource } from '../account/account-pages';

/** Runs an admin API call with a pending flag + toast feedback; calls `after` on success. */
export function adminRunner() {
  const toast = inject(ToastService);
  const pending = signal(false);
  async function run<T>(call: Promise<ApiResult<T>>, after?: (data: T) => void) {
    pending.set(true);
    const r = await call;
    pending.set(false);
    toast.result(r);
    if (r.ok) after?.(r.data);
    return r;
  }
  return { pending, run };
}

@Component({
  selector: 'nd-admin-header',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-6 block' },
  template: `
    @if (backHref()) { <a [routerLink]="backHref()" class="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-leaf"><nd-icon [icon]="left" class="size-4" /> {{ backLabel() }}</a> }
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-sans text-2xl font-bold text-forest md:text-3xl">{{ heading() }}</h1>
        @if (description()) { <p class="mt-1 text-sm text-muted">{{ description() }}</p> }
      </div>
      <div class="flex flex-wrap gap-2"><ng-content /></div>
    </div>
  `,
})
export class AdminHeader {
  heading = input.required<string>();
  description = input<string>();
  backHref = input<string>();
  backLabel = input('Back');
  left = ChevronLeft;
}

@Component({
  selector: 'nd-stat',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="href() ?? null" class="card block h-full p-5 transition" [class.hover:shadow-lift]="!!href()">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted">{{ label() }}</p>
      <p class="mt-2 font-sans text-3xl font-bold" [class]="alert() ? 'text-berry' : 'text-forest'">{{ value() }}</p>
      @if (hint()) { <p class="mt-1 text-xs text-muted">{{ hint() }}</p> }
    </a>
  `,
})
export class StatCard {
  label = input.required<string>();
  value = input.required<string | number>();
  hint = input<string>();
  href = input<string>();
  alert = input(false);
}

@Component({
  selector: 'nd-pager',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pages() > 1) {
      <nav class="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
        <span class="text-muted">Page {{ page() }} of {{ pages() }} · {{ total() }} records</span>
        <div class="flex gap-2">
          @if (page() > 1) { <button type="button" (click)="go(page() - 1)" class="btn btn-outline btn-sm"><nd-icon [icon]="I.l" class="size-4" /> Prev</button> }
          @if (page() < pages()) { <button type="button" (click)="go(page() + 1)" class="btn btn-outline btn-sm">Next <nd-icon [icon]="I.r" class="size-4" /></button> }
        </div>
      </nav>
    }
  `,
})
export class Pager {
  page = input.required<number>();
  total = input.required<number>();
  pageSize = input.required<number>();
  change = input.required<(page: number) => void>();
  pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  I = { l: ChevronLeft, r: ChevronRight };
  go(p: number) {
    this.change()(p);
  }
}

/**
 * Single-series column chart (one hue, no legend — the title names the series).
 * Thin bars with rounded data-ends on the baseline, recessive grid, hover tooltip with
 * generous hit targets, and an accessible table view.
 */
@Component({
  selector: 'nd-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="relative">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="h-auto w-full" role="img" [attr.aria-label]="label()" (mouseleave)="hover.set(null)">
        @for (t of ticks(); track t) {
          <line [attr.x1]="pad.l" [attr.x2]="W - pad.r" [attr.y1]="y(t)" [attr.y2]="y(t)" stroke="#E5E9D9" />
          <text [attr.x]="W - pad.r" [attr.y]="y(t) - 4" text-anchor="end" font-size="10" fill="#5A6A5E">{{ format()(t) }}</text>
        }
        <line [attr.x1]="pad.l" [attr.x2]="W - pad.r" [attr.y1]="H - pad.b" [attr.y2]="H - pad.b" stroke="#C9D3C5" />
        @for (d of data(); track d.key; let i = $index, last = $last) {
          @if (d.value > 0) { <path [attr.d]="bar(i, d.value)" [attr.fill]="hover() === i ? '#064421' : '#126B35'" /> }
          <rect [attr.x]="pad.l + i * step()" [attr.y]="pad.t" [attr.width]="step()" [attr.height]="H - pad.t - pad.b" fill="transparent" (mouseenter)="hover.set(i)" />
          @if (i % labelEvery() === 0 || last) { <text [attr.x]="pad.l + i * step() + step() / 2" [attr.y]="H - 10" text-anchor="middle" font-size="10" fill="#5A6A5E">{{ d.label }}</text> }
        }
      </svg>
      @if (hover() !== null) {
        <div class="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-forest px-3 py-2 text-xs text-white shadow-lift" [style.left.%]="((pad.l + hover()! * step() + step() / 2) / W) * 100">
          <p class="font-semibold">{{ format()(data()[hover()!].value) }}</p><p class="text-mint/80">{{ data()[hover()!].label }}</p>
        </div>
      }
      <details class="mt-2 text-xs text-muted">
        <summary class="cursor-pointer">View as table</summary>
        <table class="table-nd mt-2"><thead><tr><th>Date</th><th class="text-right">{{ label() }}</th></tr></thead>
          <tbody>@for (d of data(); track d.key) { <tr><td>{{ d.label }}</td><td class="text-right">{{ format()(d.value) }}</td></tr> }</tbody>
        </table>
      </details>
    </figure>
  `,
})
export class BarChart {
  data = input.required<{ key: string; label: string; value: number }[]>();
  format = input.required<(v: number) => string>();
  label = input.required<string>();
  W = 720;
  H = 220;
  pad = { l: 8, r: 8, t: 16, b: 28 };
  hover = signal<number | null>(null);
  max = computed(() => Math.max(1, ...this.data().map((d) => d.value)));
  step = computed(() => (this.W - this.pad.l - this.pad.r) / Math.max(1, this.data().length));
  bw = computed(() => Math.max(3, Math.min(22, this.step() - 4)));
  ticks = computed(() => [0.5, 1].map((f) => this.max() * f));
  labelEvery = computed(() => Math.ceil(this.data().length / 8));
  y = (v: number) => this.pad.t + (this.H - this.pad.t - this.pad.b) * (1 - v / this.max());
  bar(i: number, v: number) {
    const bw = this.bw();
    const x = this.pad.l + i * this.step() + (this.step() - bw) / 2;
    const top = this.y(v);
    const base = this.H - this.pad.b;
    const r = Math.min(4, bw / 2, base - top);
    return `M${x} ${base} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${base} Z`;
  }
}
