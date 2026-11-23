import type { Routes } from '@angular/router';

export const ACCOUNT_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./account-pages').then((m) => m.AccountDashboard) },
  { path: 'profile', loadComponent: () => import('./account-pages').then((m) => m.ProfilePage) },
  { path: 'orders', loadComponent: () => import('./account-orders').then((m) => m.OrdersPage) },
  { path: 'orders/:id', loadComponent: () => import('./account-orders').then((m) => m.OrderDetailPage) },
  { path: 'requests', loadComponent: () => import('./account-requests').then((m) => m.RequestsPage) },
  { path: 'requests/:id', loadComponent: () => import('./account-requests').then((m) => m.RequestDetailPage) },
  { path: 'quotations', loadComponent: () => import('./account-requests').then((m) => m.QuotationsPage) },
  { path: 'addresses', loadComponent: () => import('./account-pages').then((m) => m.AddressesPage) },
  { path: 'wishlist', loadComponent: () => import('./account-pages').then((m) => m.WishlistPage) },
  { path: 'payments', loadComponent: () => import('./account-pages').then((m) => m.PaymentsPage) },
];
