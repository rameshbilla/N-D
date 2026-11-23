import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  Bell, Boxes, ChartColumn, ClipboardList, CreditCard, ExternalLink, FileText, FlaskConical, FolderTree, HeartPulse, Image, LayoutDashboard, LogOut, Menu,
  MessageSquareText, Package, Percent, Settings, ShieldCheck, Users, X, type IconNode,
} from 'lucide';
import type { AppRole } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SeoService } from '../../core/seo.service';
import { LogoMark } from '../../ui/common';
import { IconComponent } from '../../ui/icon';

const RANK: Record<AppRole, number> = { staff: 1, admin: 2, super_admin: 3 };
const NAV: { group: string; items: { href: string; label: string; icon: IconNode; min: AppRole }[] }[] = [
  { group: 'Overview', items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, min: 'staff' }] },
  {
    group: 'Catalogue',
    items: [
      { href: '/admin/products', label: 'Products', icon: Package, min: 'staff' },
      { href: '/admin/health-info', label: 'Health Information', icon: HeartPulse, min: 'admin' },
      { href: '/admin/categories', label: 'Categories', icon: FolderTree, min: 'admin' },
      { href: '/admin/inventory', label: 'Pricing & Inventory', icon: Boxes, min: 'staff' },
    ],
  },
  {
    group: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: ClipboardList, min: 'staff' },
      { href: '/admin/customers', label: 'Customers', icon: Users, min: 'staff' },
      { href: '/admin/payments', label: 'Payments', icon: CreditCard, min: 'admin' },
      { href: '/admin/reviews', label: 'Reviews', icon: MessageSquareText, min: 'admin' },
    ],
  },
  {
    group: 'Custom Service',
    items: [
      { href: '/admin/custom-requests', label: 'Custom Requests', icon: FlaskConical, min: 'staff' },
      { href: '/admin/quotations', label: 'Quotations', icon: FileText, min: 'staff' },
    ],
  },
  {
    group: 'Marketing',
    items: [
      { href: '/admin/offers', label: 'Festival Offers', icon: Percent, min: 'admin' },
      { href: '/admin/banners', label: 'Banners', icon: Image, min: 'admin' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { href: '/admin/reports', label: 'Reports', icon: ChartColumn, min: 'admin' },
      { href: '/admin/settings', label: 'Settings', icon: Settings, min: 'admin' },
      { href: '/admin/admins', label: 'Admin Users', icon: ShieldCheck, min: 'super_admin' },
    ],
  },
];

@Component({
  selector: 'nd-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, LogoMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh bg-[#F4F7F1]">
      <aside class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-forest transition-transform lg:translate-x-0" [class]="open() ? 'translate-x-0' : '-translate-x-full'">
        <div class="flex items-center gap-3 px-5 py-5">
          <nd-logo-mark class="size-9" />
          <div class="leading-tight"><p class="font-display text-lg font-bold text-white">N&amp;D Admin</p><p class="text-xs capitalize text-mint/70">{{ roleLabel() }}</p></div>
          <button type="button" (click)="open.set(false)" class="ml-auto rounded-lg p-1 text-mint lg:hidden" aria-label="Close menu"><nd-icon [icon]="I.x" class="size-5" /></button>
        </div>
        <nav aria-label="Admin" class="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          @for (g of nav(); track g.group) {
            <div>
              <p class="px-3 pb-1.5 text-[0.68rem] font-bold uppercase tracking-widest text-mint/50">{{ g.group }}</p>
              <ul class="space-y-0.5">
                @for (i of g.items; track i.href) {
                  <li><a [routerLink]="i.href" routerLinkActive="!bg-white !text-forest shadow-soft" class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-mint/85 transition hover:bg-white/10 hover:text-white"><nd-icon [icon]="i.icon" class="size-4" /> {{ i.label }}</a></li>
                }
              </ul>
            </div>
          }
        </nav>
        <div class="border-t border-white/10 p-3">
          <a href="/" target="_blank" class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-mint/85 hover:bg-white/10"><nd-icon [icon]="I.ext" class="size-4" /> View website</a>
          <button type="button" (click)="logout()" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-mint/85 hover:bg-white/10"><nd-icon [icon]="I.out" class="size-4" /> Sign out</button>
        </div>
      </aside>
      @if (open()) { <div class="fixed inset-0 z-40 bg-black/30 lg:hidden" (click)="open.set(false)"></div> }
      <div class="lg:pl-64">
        <header class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur md:px-8">
          <button type="button" (click)="open.set(true)" class="rounded-lg p-2 lg:hidden" aria-label="Open menu"><nd-icon [icon]="I.menu" class="size-5" /></button>
          <p class="truncate text-sm text-muted">Signed in as <strong class="text-forest">{{ name() }}</strong></p>
          <a routerLink="/admin/dashboard" fragment="notifications" class="relative ml-auto rounded-full p-2 hover:bg-mint" [attr.aria-label]="unread() + ' unread notifications'">
            <nd-icon [icon]="I.bell" class="size-5 text-forest" />
            @if (unread() > 0) { <span class="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-berry px-1 text-center text-[10px] font-bold leading-4 text-white">{{ unread() > 99 ? '99+' : unread() }}</span> }
          </a>
        </header>
        <main class="p-4 md:p-8"><router-outlet /></main>
      </div>
    </div>
  `,
})
export class AdminShell {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  I = { x: X, menu: Menu, bell: Bell, ext: ExternalLink, out: LogOut };
  open = signal(false);
  name = signal('Admin');
  unread = signal(0);
  roleLabel = computed(() => (this.auth.role() ?? '').replace('_', ' '));
  nav = computed(() => {
    const role = this.auth.role();
    return NAV.map((g) => ({ ...g, items: g.items.filter((i) => role && RANK[role] >= RANK[i.min]) })).filter((g) => g.items.length);
  });

  constructor() {
    inject(SeoService).set({ title: 'Admin', noindex: true });
    void this.refreshMe();
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.open.set(false);
      void this.refreshMe();
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }
  private async refreshMe() {
    const r = await this.api.get<{ name: string; unread: number }>('/api/admin/me');
    if (r.ok) {
      this.name.set(r.data.name);
      this.unread.set(r.data.unread);
    }
  }
  async logout() {
    await this.auth.logout();
    window.location.assign('/admin/login');
  }
}
