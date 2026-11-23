import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { IconNode } from 'lucide';

const esc = (v: string | number) => String(v).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]!);

/**
 * Lucide icon renderer. Usage: `<nd-icon [icon]="ShoppingBag" class="size-5" />`.
 * Icon data is static library data (never user input), so it is rendered as trusted SVG.
 */
@Component({
  selector: 'nd-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center [&>svg]:size-full', 'aria-hidden': 'true', '[innerHTML]': 'svg()' },
  template: '',
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);
  readonly icon = input.required<IconNode>();
  readonly svg = computed(() => {
    const inner = this.icon()
      .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v as string)}"`).join(' ')}/>`)
      .join('');
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
    );
  });
}
