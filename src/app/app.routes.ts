import { Routes } from '@angular/router';
import { authGuard, staffGuard } from './core/guards';


export const routes: Routes = [
  {
    path: 'admin/login',
    loadComponent: () => import('./pages/admin/admin-login').then((m) => m.AdminLoginPage),
  },
  {
    path: 'admin',
    canActivate: [staffGuard('staff')],
    loadComponent: () => import('./pages/admin/admin-shell').then((m) => m.AdminShell),
    loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '',
    loadComponent: () => import('./layout/store-layout').then((m) => m.StoreLayout),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/home/home').then((m) => m.HomePage) },
      { path: 'shop', loadComponent: () => import('./pages/store/catalogue').then((m) => m.CataloguePage) },
      { path: 'categories', loadComponent: () => import('./pages/store/categories').then((m) => m.CategoriesPage) },
      { path: 'categories/:slug', loadComponent: () => import('./pages/store/catalogue').then((m) => m.CataloguePage) },
      { path: 'products/:slug', loadComponent: () => import('./pages/store/product').then((m) => m.ProductPage) },
      { path: 'cart', loadComponent: () => import('./pages/store/cart').then((m) => m.CartPage) },
      { path: 'checkout', canActivate: [authGuard], loadComponent: () => import('./pages/store/checkout').then((m) => m.CheckoutPage) },
      { path: 'login', loadComponent: () => import('./pages/store/login').then((m) => m.LoginPage) },
      { path: 'login/verify', loadComponent: () => import('./pages/store/login').then((m) => m.VerifyPage) },
      { path: 'payment/success', loadComponent: () => import('./pages/store/payment-result').then((m) => m.PaymentSuccessPage) },
      { path: 'payment/failure', loadComponent: () => import('./pages/store/payment-result').then((m) => m.PaymentFailurePage) },
      { path: 'custom-processing', loadComponent: () => import('./pages/store/custom-processing').then((m) => m.CustomProcessingPage) },
      { path: 'request-quotation', loadComponent: () => import('./pages/store/custom-processing').then((m) => m.RequestQuotationPage) },
      { path: 'how-it-works', loadComponent: () => import('./pages/store/content').then((m) => m.HowItWorksPage) },
      { path: 'about', loadComponent: () => import('./pages/store/content').then((m) => m.AboutPage) },
      { path: 'contact', loadComponent: () => import('./pages/store/contact').then((m) => m.ContactPage) },
      { path: 'faqs', loadComponent: () => import('./pages/store/content').then((m) => m.FaqPage) },
      { path: 'privacy-policy', loadComponent: () => import('./pages/store/legal').then((m) => m.PrivacyPage) },
      { path: 'terms', loadComponent: () => import('./pages/store/legal').then((m) => m.TermsPage) },
      { path: 'shipping-returns', loadComponent: () => import('./pages/store/legal').then((m) => m.ShippingPage) },
      {
        path: 'account',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/account/account-layout').then((m) => m.AccountLayout),
        loadChildren: () => import('./pages/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
      },
      { path: '**', loadComponent: () => import('./pages/store/not-found').then((m) => m.NotFoundPage) },
    ],
  },
];
