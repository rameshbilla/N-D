import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SeoService } from '../../core/seo.service';
import { AuthCard, PhoneStep, VerifyStep } from '../../ui/auth';

/** /admin/login — OTP is only ever sent to numbers on the admin allowlist. */
@Component({
  selector: 'nd-admin-login',
  imports: [AuthCard, PhoneStep, VerifyStep],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-auth-card heading="Admin sign in" subtitle="Restricted area. Only pre-authorised mobile numbers can receive a sign-in code.">
      @if (sent(); as s) {
        <nd-verify-step [phone]="s.phone" mode="admin" [initialCooldown]="s.cooldown" (changeNumber)="sent.set(null)" (verified)="done()" />
      } @else {
        <nd-phone-step mode="admin" (sent)="sent.set($event)" />
      }
      <p footer>Every sign-in is verified with a one-time password. Access is managed by the Super Admin.</p>
    </nd-auth-card>
  `,
})
export class AdminLoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  sent = signal<{ phone: string; cooldown: number } | null>(null);
  constructor() {
    inject(SeoService).set({ title: 'Admin sign in', noindex: true });
    void this.auth.ensureLoaded().then(() => this.auth.role() && this.router.navigateByUrl('/admin/dashboard'));
  }
  async done() {
    await this.auth.refresh();
    void this.router.navigateByUrl('/admin/dashboard');
  }
}
