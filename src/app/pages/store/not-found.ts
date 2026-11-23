import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { LogoMark } from '../../ui/common';

@Component({
  selector: 'nd-not-found',
  imports: [RouterLink, LogoMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex min-h-[70dvh] flex-col items-center justify-center bg-gradient-to-b from-mint to-cream px-4 text-center">
      <nd-logo-mark class="size-16" />
      <h1 class="mt-6 text-5xl font-semibold text-forest">Page not found</h1>
      <p class="mt-3 max-w-md text-muted">The page you are looking for has moved or no longer exists.</p>
      <div class="mt-8 flex gap-3"><a routerLink="/" class="btn btn-primary">Go home</a><a routerLink="/shop" class="btn btn-outline">Shop products</a></div>
    </section>
  `,
})
export class NotFoundPage {
  constructor() {
    inject(SeoService).notFound(); // real 404 status for server-rendered responses
  }
}
