import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ArrowRight, ChevronDown, FlaskConical, ShoppingBag } from 'lucide';
import { IconComponent } from '../../../ui/icon';
import { backgroundSvg, worldSvg } from './production-world';
import { buildProductionTimeline, STAGE_COUNT, TOTAL, UNIT } from './production-timeline';

export const STAGES = [
  { step: 'Step 01 · Fresh Ingredients', title: 'Every Great Powder Begins With Fresh Ingredients.', text: 'Meet the ingredients you will follow all the way: three carrots, two amla and two beetroots.' },
  { step: 'Step 02 · Washing', title: 'Carefully Washed and Prepared.', text: 'The same carrots, amla and beetroot ride the conveyor through our spray washer.' },
  { step: 'Step 03 · Cutting & Slicing', title: 'Precision Cutting for Better Processing.', text: 'One by one, each ingredient is trimmed and sliced into even pieces for uniform drying.' },
  { step: 'Step 04 · Dehydration', title: 'Controlled Dehydration. Natural Ingredients.', text: 'Those exact slices go onto trays. Warm, circulating air gently draws out their moisture.' },
  { step: 'Step 05 · Dried Collection', title: 'Fresh Ingredients Transformed Into Dried Goodness.', text: 'The trays roll out and the same pieces — now crisp and dried — are collected by ingredient.' },
  { step: 'Step 06 · Grinding', title: 'From Dried Ingredients to Fine Natural Powder.', text: 'Each dried ingredient is milled separately: orange carrot, green-brown amla, deep red beetroot.' },
  { step: 'Step 07 · Mixing', title: 'Three Natural Ingredients. One Beautiful Blend.', text: 'The three powders meet in our ribbon blender and become one even ABC blend.' },
  { step: 'Step 08 · Sieving & Quality Check', title: 'Fine Texture. Carefully Processed.', text: 'The blend is sifted through fine mesh and checked for texture, colour and cleanliness.' },
  { step: 'Step 09 · Packaging', title: 'Freshly Packed. Ready for You.', text: 'That same powder is weighed into a food-grade pouch, heat-sealed and labelled.' },
  { step: 'Step 10 · Your ABC Powder', title: "Nature's Goodness. Preserved in Every Powder.", text: 'From those seven fresh ingredients to the pouch in your hands.' },
];
const STAGE_BG = ['#F1FBE9', '#EEF5F1', '#EEF3EF', '#EEF2EF', '#F4F2E8', '#EDF1F2', '#F0F3EE', '#FFFCF0', '#F1FBE9', '#064421'];
const VIEWBOX_DESKTOP = '0 0 1600 900';
const VIEWBOX_MOBILE = '420 80 1160 860';
/** Side-by-side layout only on landscape screens >=768px; phones and portrait tablets get the stacked layout. Keep in sync with the `wide` variant in styles.css. */
const WIDE = '(min-width: 768px) and (min-aspect-ratio: 1/1)';
const NARROW = '(max-width: 767px), (max-aspect-ratio: 1/1)';
/** Viewport-heights of scrolling per stage: generous, so each movement plays out slowly. */
const SCROLL_PER_STAGE = { wide: 1.8, narrow: 1.5 };

/**
 * Continuous, scroll-linked production story. One pinned stage, one SVG factory, one master GSAP
 * timeline: the camera follows the same carrots, amla and beetroot from the table to the pouch.
 * Scroll position is the only clock (scrub) — stop scrolling and it pauses, scroll up and it reverses.
 * Reduced motion: the same story advances in discrete steps with no animated movement.
 */
@Component({
  selector: 'nd-production-story',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section #root aria-label="How N&D ABC Powder is made — from fresh ingredients to pouch" class="relative">
      <a href="#after-story" class="btn btn-light btn-sm sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-24 focus:z-50">Skip the production story</a>
      <div #stage class="relative h-dvh w-full overflow-hidden" [style.background-color]="bg[0]">
        <!-- Static, trusted artwork (no user input). innerHTML sits on a wrapper div because the server DOM cannot parse markup inside <svg>. -->
        <div class="absolute inset-x-0 bottom-0 top-[38%] wide:inset-0" aria-hidden="true" [innerHTML]="art"></div>

        <div class="pointer-events-none absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-cream via-cream/90 to-transparent wide:inset-y-0 wide:left-0 wide:h-full wide:w-[50%] wide:bg-gradient-to-r wide:from-cream/95 wide:via-cream/75"></div>
        <div data-dark-veil class="pointer-events-none absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-forest via-forest/85 to-transparent opacity-0 wide:inset-y-0 wide:left-0 wide:h-full wide:w-[50%] wide:bg-gradient-to-r"></div>

        <div class="pointer-events-none absolute inset-x-0 top-[72px] h-[38%] px-4 sm:px-8 wide:inset-y-0 wide:left-[5vw] wide:right-auto wide:top-0 wide:flex wide:h-full wide:w-[40vw] wide:max-w-[540px] wide:items-center wide:px-0">
          <div class="relative h-full w-full wide:h-[78%]">
            @for (s of stages; track s.step; let i = $index, last = $last) {
              <div data-text class="absolute inset-0 flex flex-col justify-start wide:justify-center" [style.opacity]="i ? 0 : null" [style.visibility]="i ? 'hidden' : null" style="will-change: opacity, transform">
                <div class="flex flex-col" [class.animate-fade-up]="i === 0">
                  <p data-fade class="eyebrow mb-3" [class.text-mint]="last">{{ s.step }}</p>
                  <h2 class="text-[clamp(1.45rem,6.4vw,2.25rem)] font-semibold leading-[1.08] wide:text-[clamp(1.6rem,min(4.2vw,7.2vh),3.4rem)]" [class]="last ? 'text-white' : 'text-forest'">
                    @for (w of words[i]; track $index) {
                      <span class="inline-block pb-[0.08em] align-bottom"><span data-w class="inline-block will-change-transform">{{ w }}&nbsp;</span></span>
                    }
                  </h2>
                  <p data-fade class="mt-3 max-w-md text-[clamp(0.85rem,3.6vw,1rem)] leading-relaxed wide:mt-[min(1.25rem,2.2vh)] wide:text-[clamp(0.9rem,2.3vh,1.125rem)]" [class]="last ? 'text-mint/90' : 'text-muted'">{{ s.text }}</p>
                  @if (last) {
                    <div class="pointer-events-auto mt-[min(1.5rem,3vh)] flex flex-wrap gap-2.5" data-fade>
                      <a routerLink="/products/abc-powder" class="btn btn-accent"><nd-icon [icon]="I.bag" class="size-4" /> Shop ABC Powder</a>
                      <a routerLink="/shop" class="btn btn-light">Explore All Products <nd-icon [icon]="I.arrow" class="size-4" /></a>
                      <a routerLink="/custom-processing" class="btn btn-ghost text-mint hover:!bg-white/10"><nd-icon [icon]="I.flask" class="size-4" /> Make Your Own Powder</a>
                    </div>
                  }
                  @if (i === 0) {
                    <p data-fade class="mt-6 hidden items-center gap-2 text-sm font-medium text-leaf wide:flex"><nd-icon [icon]="I.down" class="size-4 animate-bounce" /> Scroll to follow them through our factory</p>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <nav aria-label="Production stages" class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 wide:bottom-auto wide:left-auto wide:right-6 wide:top-1/2 wide:-translate-y-1/2 wide:translate-x-0">
          <ol class="glass flex gap-1 rounded-full px-2.5 py-1.5 transition-colors duration-700 wide:flex-col wide:gap-[min(0.625rem,1.2vh)] wide:px-2 wide:py-3" [class.!bg-forest/60]="dark()">
            @for (s of stages; track s.step; let i = $index) {
              <li>
                <button type="button" (click)="jumpTo(i)" class="group relative flex size-6 items-center justify-center wide:size-[clamp(1.1rem,3.4vh,1.5rem)]" [attr.aria-label]="'Go to ' + s.step" [attr.aria-current]="i === active() ? 'step' : null">
                  <span class="block rounded-full transition-all duration-500 ease-out" [class]="i === active() ? 'size-3 bg-berry ring-4 ring-berry/20' : i < active() ? 'size-2 bg-leaf' : dark() ? 'size-2 bg-white/40' : 'size-2 bg-forest/25'"></span>
                  <span class="pointer-events-none absolute right-9 hidden whitespace-nowrap rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-soft transition group-hover:opacity-100 wide:block">{{ s.step.split('· ')[1] }}</span>
                </button>
              </li>
            }
          </ol>
        </nav>
        <div class="absolute inset-x-0 top-0 z-10 h-1"><div #bar class="h-full origin-left bg-gradient-to-r from-leaf via-saffron to-berry" style="transform: scaleX(0)"></div></div>
      </div>
    </section>
    <div id="after-story"></div>
  `,
})
export class ProductionStory {
  private sanitizer = inject(DomSanitizer);
  private destroyRef = inject(DestroyRef);
  readonly stages = STAGES;
  readonly bg = STAGE_BG;
  readonly words = STAGES.map((s) => s.title.split(' '));
  readonly I = { arrow: ArrowRight, flask: FlaskConical, down: ChevronDown, bag: ShoppingBag };
  // Static, trusted artwork shipped with the app (no user input).
  readonly art = this.sanitizer.bypassSecurityTrustHtml(
    `<svg data-story-svg viewBox="${VIEWBOX_DESKTOP}" preserveAspectRatio="xMidYMid slice" class="size-full"><g data-k="cam"><g data-k="bg">${backgroundSvg()}</g><g data-k="world">${worldSvg()}</g></g></svg>`,
  );
  readonly active = signal(0);
  readonly dark = signal(false);
  private root = viewChild.required<ElementRef<HTMLElement>>('root');
  private stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private trigger: { start: number; end: number } | null = null;

  constructor() {
    afterNextRender(async () => {
      // GSAP is loaded only in the browser, after hydration.
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia(this.root().nativeElement);
      mm.add(
        { isMobile: NARROW, isDesktop: WIDE, reduce: '(prefers-reduced-motion: reduce)' },
        (ctx) => this.build(gsap, ScrollTrigger, ctx.conditions as { isMobile: boolean; reduce: boolean }),
      );
      // Reverts every tween + ScrollTrigger (and restores pinned markup) when the component is destroyed.
      this.destroyRef.onDestroy(() => mm.revert());
    });
  }

  private build(gsap: typeof import('gsap').gsap, ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger, c: { isMobile: boolean; reduce: boolean }) {
    const stage = this.stage().nativeElement;
    const svg = stage.querySelector<SVGSVGElement>('[data-story-svg]')!;
    svg.setAttribute('viewBox', c.isMobile ? VIEWBOX_MOBILE : VIEWBOX_DESKTOP);
    svg.setAttribute('preserveAspectRatio', c.isMobile ? 'xMidYMid meet' : 'xMidYMid slice');

    const tl = buildProductionTimeline(gsap, svg, { lite: c.isMobile });
    this.addTextTimeline(gsap, tl, stage);
    tl.pause();

    let lastIdx = -1;
    const setStage = (progress: number) => {
      const idx = Math.min(STAGE_COUNT - 1, Math.floor((progress * TOTAL + 0.6) / UNIT));
      if (idx !== lastIdx) {
        lastIdx = idx;
        this.active.set(idx);
        this.dark.set(idx === STAGE_COUNT - 1);
      }
      this.bar().nativeElement.style.transform = `scaleX(${progress})`;
      return idx;
    };

    const st = ScrollTrigger.create({
      trigger: stage,
      start: 'top top',
      end: () => `+=${window.innerHeight * STAGE_COUNT * (c.isMobile ? SCROLL_PER_STAGE.narrow : SCROLL_PER_STAGE.wide)}`,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      ...(c.reduce
        ? {
            // Reduced motion: jump straight to each stage's completed state — no animated movement.
            onUpdate: (self: ScrollTrigger) => {
              const idx = setStage(self.progress);
              tl.progress(Math.min(1, ((idx + 1) * UNIT - 0.4) / TOTAL));
            },
          }
        : {
            // Scrub: the timeline position IS the scroll position; 1.6s catch-up smooths wheel steps and flicks.
            animation: tl,
            scrub: 1.6,
            onUpdate: (self: ScrollTrigger) => void setStage(self.progress),
          }),
    });
    this.trigger = st;
    return () => {
      st.kill();
      tl.kill();
    };
  }

  /**
   * Stage copy: a slow, overlapping cross-fade on the master timeline. The outgoing text drifts up and
   * softens while the next one rises in word by word, so there are no hard cuts between stages.
   */
  private addTextTimeline(gsap: typeof import('gsap').gsap, tl: gsap.core.Timeline, stage: HTMLElement) {
    const texts = gsap.utils.toArray<HTMLElement>('[data-text]', stage);
    const veil = stage.querySelector('[data-dark-veil]');
    texts.forEach((el, i) => {
      const at = i * UNIT;
      const last = i === texts.length - 1;
      const words = el.querySelectorAll('[data-w]');
      const fades = el.querySelectorAll('[data-fade]');
      if (i > 0) {
        tl.to(stage, { backgroundColor: STAGE_BG[i], duration: 3, ease: 'sine.inOut' }, at - 1.6);
        tl.fromTo(el, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1.8, ease: 'sine.out' }, at - 0.7);
        tl.fromTo(words, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.09, duration: 1.4, ease: 'power2.out' }, at - 0.7);
        tl.fromTo(fades, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, stagger: 0.2, duration: 1.3, ease: 'sine.out' }, at + 0.1);
      }
      if (!last) {
        tl.to(el, { autoAlpha: 0, y: -30, filter: 'blur(4px)', duration: 1.6, ease: 'sine.in' }, at + UNIT - 2.2);
        tl.set(el, { filter: 'none' }, at + UNIT - 0.55);
      }
    });
    if (veil) tl.to(veil, { opacity: 1, duration: 3, ease: 'sine.inOut' }, (STAGE_COUNT - 1) * UNIT - 1.6);
  }

  jumpTo(i: number) {
    const st = this.trigger;
    if (!st) return;
    window.scrollTo({ top: st.start + (st.end - st.start) * ((i * UNIT + (i ? 1.6 : 0)) / TOTAL), behavior: 'smooth' });
  }
}
