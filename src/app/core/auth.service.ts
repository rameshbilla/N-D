import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { AppRole } from '../../shared/types';
import { ApiService } from './api.service';

export interface Me {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** Session state for the browser. The server re-verifies the session on every API call. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly user = signal<Me | null>(null);
  readonly role = signal<AppRole | null>(null);
  readonly loaded = signal(false);
  readonly isLoggedIn = computed(() => this.user() !== null);
  private pending: Promise<void> | null = null;

  /** Resolves once the session has been fetched (no-op during SSR: public pages render as guests). */
  ensureLoaded(): Promise<void> {
    if (!this.browser || this.loaded()) return Promise.resolve();
    return (this.pending ??= this.refresh());
  }

  async refresh(): Promise<void> {
    const r = await this.api.get<{ user: Me | null; role: AppRole | null }>('/api/auth/me');
    this.user.set(r.ok ? r.data.user : null);
    this.role.set(r.ok ? r.data.role : null);
    this.loaded.set(true);
    this.pending = null;
  }

  async logout() {
    await this.api.post('/api/auth/logout');
    this.user.set(null);
    this.role.set(null);
  }
}
