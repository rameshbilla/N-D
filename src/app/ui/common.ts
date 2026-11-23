import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, Directive, ElementRef, inject, input, OnDestroy, Pipe, PipeTransform, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Check, ChevronRight } from 'lucide';
import { formatINR } from '../../shared/money';
import { IconComponent } from './icon';

// ---------------------------------------------------------------- Pipes
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return formatINR(paise);
  }
}

export const fmtDate = (d: string | null | undefined, withTime = false) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}), timeZone: 'Asia/Kolkata' }) : '—';

@Pipe({ name: 'ndDate' })
export class NdDatePipe implements PipeTransform {
  transform(d: string | null | undefined, withTime = false): string {
    return fmtDate(d, withTime);
  }
}

// ---------------------------------------------------------------- Brand
@Component({
  selector: 'nd-logo-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `<svg viewBox="0 0 64 64" class="size-full" aria-hidden="true">
    <rect width="64" height="64" rx="18" fill="#126B35" />
    <path d="M32 11c13 6 19 17 17 29-2 9-9 13-17 13s-15-4-17-13c-2-12 4-23 17-29z" fill="#DDF5C9" />
    <path d="M32 18v32M32 30l-8-6M32 39l9-7" stroke="#126B35" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <circle cx="47" cy="15" r="5.5" fill="#C51D2D" />
  </svg>`,
})
export class LogoMark {}

@Component({
  selector: 'nd-logo',
  imports: [LogoMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <nd-logo-mark class="size-10 shrink-0" />
    <span class="leading-none">
      <span class="block font-display text-[1.35rem] font-bold tracking-tight" [class]="light() ? 'text-white' : 'text-forest'">N<span class="text-berry">&amp;</span>D</span>
      <span class="block text-[0.62rem] font-semibold uppercase tracking-[0.1em] min-[400px]:tracking-[0.18em]" [class]="light() ? 'text-mint' : 'text-leaf'">Nature Healthy Food</span>
    </span>
  `,
})
export class Logo {
  light = input(false);
}

// ---------------------------------------------------------------- Reveal on scroll
/** Fades content up the first time it enters the viewport. Respects reduced motion (CSS). */
@Directive({ selector: '[ndReveal]', host: { class: 'nd-reveal' } })
export class RevealDirective implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;
  delay = input(0, { alias: 'ndReveal', transform: (v: unknown) => Number(v) || 0 });
  constructor() {
    afterNextRender(() => {
      const node = this.el.nativeElement;
      node.style.transitionDelay = `${this.delay()}s`;
      this.io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && (node.classList.add('nd-revealed'), this.io?.disconnect())),
        { rootMargin: '0px 0px -60px 0px' },
      );
      this.io.observe(node);
    });
  }
  ngOnDestroy() {
    this.io?.disconnect();
  }
}

// ---------------------------------------------------------------- Page hero
@Component({
  selector: 'nd-page-hero',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="relative overflow-hidden bg-gradient-to-b from-mint/70 via-mint-50 to-cream">
      <div class="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-leaf/10 blur-3xl"></div>
      <div class="container-page relative pb-10 pt-10 md:pb-14 md:pt-14">
        @if (crumbs().length) {
          <nav aria-label="Breadcrumb" class="mb-4">
            <ol class="flex flex-wrap items-center gap-1 text-xs font-medium text-muted">
              <li><a routerLink="/" class="hover:text-leaf">Home</a></li>
              @for (c of crumbs(); track c.href) {
                <li class="flex items-center gap-1"><nd-icon [icon]="chevron" class="size-3" /><a [routerLink]="c.href" class="hover:text-leaf">{{ c.label }}</a></li>
              }
            </ol>
          </nav>
        }
        @if (eyebrow()) {
          <p class="eyebrow">{{ eyebrow() }}</p>
        }
        <h1 class="mt-2 max-w-3xl text-4xl font-semibold text-forest md:text-6xl">{{ heading() }}</h1>
        @if (description()) {
          <p class="mt-4 max-w-2xl text-base text-muted md:text-lg">{{ description() }}</p>
        }
        <ng-content />
      </div>
    </section>
  `,
})
export class PageHero {
  eyebrow = input<string>();
  heading = input.required<string>();
  description = input<string | null>();
  crumbs = input<{ href: string; label: string }[]>([]);
  chevron = ChevronRight;
}

// ---------------------------------------------------------------- Status & timeline
export type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';
export function orderTone(status: string): Tone {
  if (['delivered', 'payment_confirmed', 'placed', 'paid', 'captured', 'cod_collected'].includes(status)) return 'green';
  if (['cancelled', 'payment_failed', 'rejected', 'failed'].includes(status)) return 'red';
  if (['pending_payment', 'payment_review', 'payment_pending', 'quotation_sent', 'under_review', 'sent', 'accepted', 'cod_pending'].includes(status)) return 'amber';
  if (['withdrawn', 'expired', 'created'].includes(status)) return 'gray';
  return 'blue';
}
const TONES: Record<Tone, string> = {
  green: 'bg-mint text-forest',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-berry',
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-sky-100 text-sky-800',
};

@Component({
  selector: 'nd-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', '[class]': 'cls()' },
  template: `<ng-content />`,
})
export class StatusBadge {
  tone = input<Tone>('green');
  cls = computed(() => TONES[this.tone()]);
}

@Component({
  selector: 'nd-timeline',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (failed()) {
      <p class="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-berry">{{ failed() }}</p>
    }
    <ol class="relative grid md:flex">
      @for (s of steps(); track s.key; let i = $index, last = $last) {
        <li class="relative flex gap-3 pb-6 md:flex-1 md:flex-col md:items-center md:pb-0 md:text-center">
          @if (!last) {
            <span aria-hidden="true" class="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 md:left-[calc(50%+16px)] md:top-[15px] md:h-0.5 md:w-[calc(100%-32px)]" [class]="i < current() && !failed() ? 'bg-leaf' : 'bg-line'"></span>
          }
          <span class="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold"
            [class]="(i <= current() && !failed() ? 'border-leaf bg-leaf text-white' : 'border-line bg-white text-muted') + (i === current() && !failed() ? ' ring-4 ring-leaf/20' : '')">
            @if (i <= current() && !failed()) { <nd-icon [icon]="check" class="size-4" /> } @else { {{ i + 1 }} }
          </span>
          <div class="md:mt-2 md:px-1">
            <p class="text-sm font-semibold" [class]="i <= current() && !failed() ? 'text-forest' : 'text-muted'">{{ s.label }}</p>
            @if (events()[s.key]) { <p class="text-xs text-muted">{{ events()[s.key] }}</p> }
          </div>
        </li>
      }
    </ol>
  `,
})
export class Timeline {
  steps = input.required<{ key: string; label: string }[]>();
  current = input.required<number>();
  events = input<Record<string, string>>({});
  failed = input<string | null>(null);
  check = Check;
}

/** True only in the browser (for code that touches window/localStorage). */
export const isBrowser = () => isPlatformBrowser(inject(PLATFORM_ID));
