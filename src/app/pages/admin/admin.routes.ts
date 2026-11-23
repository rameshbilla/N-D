import type { Routes } from '@angular/router';
import { staffGuard } from '../../core/guards';

const admin = [staffGuard('admin')];

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadComponent: () => import('./dashboard').then((m) => m.DashboardPage) },
  { path: 'products', loadComponent: () => import('./products').then((m) => m.ProductsAdminPage) },
  { path: 'products/new', canActivate: admin, loadComponent: () => import('./product-editor').then((m) => m.ProductEditorPage) },
  { path: 'products/:id', loadComponent: () => import('./product-editor').then((m) => m.ProductEditorPage) },
  { path: 'health-info', canActivate: admin, loadComponent: () => import('./catalog-admin').then((m) => m.HealthInfoAdminPage) },
  { path: 'categories', canActivate: admin, loadComponent: () => import('./catalog-admin').then((m) => m.CategoriesAdminPage) },
  { path: 'inventory', loadComponent: () => import('./catalog-admin').then((m) => m.InventoryAdminPage) },
  { path: 'orders', loadComponent: () => import('./sales-admin').then((m) => m.OrdersAdminPage) },
  { path: 'orders/:id', loadComponent: () => import('./sales-admin').then((m) => m.OrderAdminPage) },
  { path: 'customers', loadComponent: () => import('./sales-admin').then((m) => m.CustomersAdminPage) },
  { path: 'payments', canActivate: admin, loadComponent: () => import('./sales-admin').then((m) => m.PaymentsAdminPage) },
  { path: 'reviews', canActivate: admin, loadComponent: () => import('./sales-admin').then((m) => m.ReviewsAdminPage) },
  { path: 'custom-requests', loadComponent: () => import('./service-admin').then((m) => m.RequestsAdminPage) },
  { path: 'custom-requests/:id', loadComponent: () => import('./service-admin').then((m) => m.RequestAdminPage) },
  { path: 'quotations', loadComponent: () => import('./service-admin').then((m) => m.QuotationsAdminPage) },
  { path: 'offers', canActivate: admin, loadComponent: () => import('./marketing-admin').then((m) => m.OffersAdminPage) },
  { path: 'offers/new', canActivate: admin, loadComponent: () => import('./marketing-admin').then((m) => m.OfferFormPage) },
  { path: 'offers/:id', canActivate: admin, loadComponent: () => import('./marketing-admin').then((m) => m.OfferFormPage) },
  { path: 'banners', canActivate: admin, loadComponent: () => import('./marketing-admin').then((m) => m.BannersAdminPage) },
  { path: 'reports', canActivate: admin, loadComponent: () => import('./settings-admin').then((m) => m.ReportsAdminPage) },
  { path: 'settings', canActivate: admin, loadComponent: () => import('./settings-admin').then((m) => m.SettingsAdminPage) },
  { path: 'admins', canActivate: [staffGuard('super_admin')], loadComponent: () => import('./settings-admin').then((m) => m.AdminUsersPage) },
];
