import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SeoService } from '../../core/seo.service';
import { AuthCard, PhoneStep, VerifyStep } from '../../ui/auth';

const OTP_SESSION_KEY = 'nd-otp-session';
const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

/** Customer login step 1: mobile number. Guests reach this only at checkout (or custom requests). */
@Component({
  selector: 'nd-login',
  imports: [AuthCard, PhoneStep, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-auth-card [heading]="checkout() ? 'Sign in to checkout' : 'Sign in with mobile'"
      [subtitle]="checkout() ? 'Your cart is saved. Verify your mobile number to continue to delivery and payment.' : 'New here? Your account is created automatically when you verify your number.'">
      <nd-phone-step mode="customer" (sent)="onSent($event)" />
      <p footer>By continuing you agree to our <a routerLink="/terms" class="underline">Terms</a> and <a routerLink="/privacy-policy" class="underline">Privacy Policy</a>.</p>
    </nd-auth-card>
  `,
})
export class LoginPage {
  private router = inject(Router);
  private auth = inject(AuthService);
  next = input<string>();
  checkout = computed(() => this.next()?.startsWith('/checkout'));

  constructor() {
    inject(SeoService).set({ title: 'Sign in', noindex: true });
    void this.auth.ensureLoaded().then(() => this.auth.user() && this.router.navigateByUrl(safeNext(this.next())));
  }
  onSent(e: { phone: string; cooldown: number }) {
    try {
      sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify({ ...e, sentAt: Date.now() }));
    } catch {
      /* storage unavailable */
    }
    void this.router.navigate(['/login/verify'], { queryParams: { next: safeNext(this.next()) } });
  }
}

/** Customer login step 2: OTP verification. New customers then complete their profile. */
@Component({
  selector: 'nd-verify',
  imports: [AuthCard, VerifyStep],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-auth-card heading="Verify your number" subtitle="For your security, the code expires in a few minutes.">
      @if (session(); as s) {
        <nd-verify-step [phone]="s.phone" mode="customer" [initialCooldown]="s.cooldown" (changeNumber)="back()" (verified)="done($event)" />
      }
    </nd-auth-card>
  `,
})
export class VerifyPage {
  private router = inject(Router);
  next = input<string>();
  session = signal<{ phone: string; cooldown: number } | null>(null);

  constructor() {
    inject(SeoService).set({ title: 'Verify OTP', noindex: true });
    try {
      const s = JSON.parse(sessionStorage.getItem(OTP_SESSION_KEY) ?? 'null');
      if (!s?.phone) throw new Error('missing');
      this.session.set({ phone: s.phone, cooldown: Math.max(0, (s.cooldown ?? 45) - Math.floor((Date.now() - (s.sentAt ?? 0)) / 1000)) });
    } catch {
      queueMicrotask(() => this.back());
    }
  }
  back() {
    void this.router.navigate(['/login'], { queryParams: { next: safeNext(this.next()) } });
  }
  done(e: { needsProfile: boolean }) {
    try {
      sessionStorage.removeItem(OTP_SESSION_KEY);
    } catch {
      /* ignore */
    }
    const next = safeNext(this.next());
    // Full navigation so the session cookie is used everywhere and the guest cart merges.
    window.location.assign(e.needsProfile ? `/account/profile?welcome=1&next=${encodeURIComponent(next)}` : next);
  }
}
