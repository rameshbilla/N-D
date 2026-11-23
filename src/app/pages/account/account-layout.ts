import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CreditCard, FileText, FlaskConical, Heart, LayoutDashboard, LogOut, MapPin, Package, User } from 'lucide';
import { formatIndianPhone } from '../../../shared/phone';
import { AuthService } from '../../core/auth.service';
import { SeoService } from '../../core/seo.service';
import { IconComponent } from '../../ui/icon';

@Component({
  selector: 'nd-account-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container-page pb-10 pt-10">
      <div class="mb-8">
        <p class="eyebrow">My account</p>
        <h1 class="mt-1 text-3xl font-semibold text-forest md:text-4xl">Hello{{ firstName() ? ', ' + firstName() : '' }}</h1>
        <p class="text-sm text-muted">{{ phone() }}</p>
      </div>
      <div class="grid gap-8 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Account" class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          @for (l of links; track l.href) {
            <a [routerLink]="l.href" routerLinkActive="!bg-leaf !text-white shadow-glow" [routerLinkActiveOptions]="{ exact: l.href === '/account' }" class="flex shrink-0 items-center gap-2.5 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-forest transition hover:bg-mint lg:bg-transparent">
              <nd-icon [icon]="l.icon" class="size-4" /> {{ l.label }}
            </a>
          }
          <button type="button" (click)="logout()" class="flex shrink-0 items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-berry hover:bg-red-50"><nd-icon [icon]="out" class="size-4" /> Logout</button>
        </nav>
        <div class="min-w-0"><router-outlet /></div>
      </div>
    </div>
  `,
})
export class AccountLayout {
  private auth = inject(AuthService);
  out = LogOut;
  links = [
    { href: '/account', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/account/profile', label: 'My Profile', icon: User },
    { href: '/account/orders', label: 'My Orders', icon: Package },
    { href: '/account/requests', label: 'Custom Requests', icon: FlaskConical },
    { href: '/account/quotations', label: 'My Quotations', icon: FileText },
    { href: '/account/addresses', label: 'My Addresses', icon: MapPin },
    { href: '/account/wishlist', label: 'Wishlist', icon: Heart },
    { href: '/account/payments', label: 'Payment History', icon: CreditCard },
  ];
  firstName = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');
  phone = computed(() => formatIndianPhone(this.auth.user()?.phone));
  constructor() {
    inject(SeoService).set({ title: 'My Account', noindex: true });
  }
  async logout() {
    await this.auth.logout();
    window.location.assign('/');
  }
}
