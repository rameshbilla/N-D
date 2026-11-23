import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { AppRole } from '../../shared/types';
import { AuthService } from './auth.service';

const RANK: Record<AppRole, number> = { staff: 1, admin: 2, super_admin: 3 };

/** Customer pages: redirect guests to OTP login, preserving the destination (cart is kept). */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureLoaded();
  return auth.user() ? true : router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Admin pages (UX only — every admin API call re-verifies the role on the server and via RLS). */
export const staffGuard = (min: AppRole = 'staff'): CanActivateFn => async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureLoaded();
  const role = auth.role();
  if (!auth.user() || !role) return router.createUrlTree(['/admin/login']);
  return RANK[role] >= RANK[min] ? true : router.createUrlTree(['/admin/dashboard']);
};
