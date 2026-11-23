import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, model, output, signal, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LoaderCircle, RotateCw, ShieldCheck, Smartphone } from 'lucide';
import { formatIndianPhone, normalizeIndianPhone } from '../../shared/phone';
import { ApiService } from '../core/api.service';
import { IconComponent } from './icon';
import { LogoMark } from './common';

@Component({
  selector: 'nd-auth-card',
  imports: [LogoMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="relative flex min-h-[calc(100dvh-68px)] items-center justify-center overflow-hidden bg-gradient-to-br from-mint via-cream to-cream px-4 py-12">
      <div class="pointer-events-none absolute -left-24 top-10 size-80 rounded-full bg-leaf/15 blur-3xl"></div>
      <div class="pointer-events-none absolute -right-16 bottom-0 size-72 rounded-full bg-berry/10 blur-3xl"></div>
      <div class="glass relative w-full max-w-md rounded-4xl p-7 shadow-lift sm:p-9">
        <nd-logo-mark class="size-12" />
        <h1 class="mt-5 text-3xl font-semibold text-forest">{{ heading() }}</h1>
        @if (subtitle()) { <p class="mt-2 text-sm text-muted">{{ subtitle() }}</p> }
        <div class="mt-7"><ng-content /></div>
        <div class="mt-6 border-t border-line pt-5 text-center text-xs text-muted empty:hidden"><ng-content select="[footer]" /></div>
      </div>
    </section>
  `,
})
export class AuthCard {
  heading = input.required<string>();
  subtitle = input<string>();
}

/** Six single-digit boxes with paste, SMS autofill (one-time-code) and keyboard navigation. */
@Component({
  selector: 'nd-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex justify-between gap-2" role="group" aria-label="One-time password">
      @for (d of digits(); track $index; let i = $index) {
        <input #box [value]="d" [disabled]="disabled()" inputmode="numeric" [attr.autocomplete]="i === 0 ? 'one-time-code' : 'off'" [attr.maxlength]="i === 0 ? 6 : 1"
          [attr.aria-label]="'Digit ' + (i + 1)" class="field h-14 w-12 p-0 text-center text-2xl font-bold tracking-widest sm:w-14"
          (input)="onInput(i, $event)" (keydown)="onKey(i, $event)" />
      }
    </div>
  `,
})
export class OtpInput {
  value = model('');
  disabled = input(false);
  complete = output<string>();
  boxes = viewChildren<ElementRef<HTMLInputElement>>('box');
  digits = computed(() => Array.from({ length: 6 }, (_, i) => this.value()[i] ?? ''));

  onInput(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const raw = el.value.replace(/\D/g, '');
    if (raw.length > 1) {
      const v = raw.slice(0, 6); // paste or SMS autofill
      this.value.set(v);
      this.focus(Math.min(v.length, 5));
      if (v.length === 6) this.complete.emit(v);
      return;
    }
    const arr = this.digits().slice();
    arr[i] = raw;
    const next = arr.join('').slice(0, 6);
    this.value.set(next);
    el.value = raw;
    if (raw && i < 5) this.focus(i + 1);
    if (next.length === 6 && arr.every(Boolean)) this.complete.emit(next);
  }
  onKey(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !this.digits()[i] && i > 0) this.focus(i - 1);
    if (e.key === 'ArrowLeft' && i > 0) this.focus(i - 1);
    if (e.key === 'ArrowRight' && i < 5) this.focus(i + 1);
  }
  private focus(i: number) {
    this.boxes()[i]?.nativeElement.focus();
  }
}

@Component({
  selector: 'nd-phone-step',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate (ngSubmit)="submit()" class="space-y-4">
      <div>
        <label for="phone" class="field-label">Mobile number</label>
        <div class="flex">
          <span class="inline-flex items-center gap-1.5 rounded-l-[0.85rem] border-[1.5px] border-r-0 border-line bg-mint-50 px-3 text-sm font-semibold text-forest">🇮🇳 +91</span>
          <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" [ngModel]="phone()" (ngModelChange)="onPhone($event)"
            class="field rounded-l-none" placeholder="98765 43210" [attr.aria-invalid]="!!error()" [attr.aria-describedby]="error() ? 'phone-error' : null" autofocus />
        </div>
        @if (error()) { <p id="phone-error" class="field-error" role="alert">{{ error() }}</p> }
      </div>
      <button class="btn btn-primary w-full" [disabled]="pending() || !valid()">
        <nd-icon [icon]="pending() ? I.loader : I.phone" class="size-4" [class.animate-spin]="pending()" />
        {{ pending() ? 'Sending code…' : 'Send OTP' }}
      </button>
      <p class="text-center text-xs text-muted">We will send a 6-digit code by SMS. Standard SMS charges may apply.</p>
    </form>
  `,
})
export class PhoneStep {
  private api = inject(ApiService);
  mode = input.required<'customer' | 'admin'>();
  sent = output<{ phone: string; cooldown: number }>();
  phone = signal('');
  error = signal<string | null>(null);
  pending = signal(false);
  valid = computed(() => normalizeIndianPhone(this.phone()) !== null);
  I = { loader: LoaderCircle, phone: Smartphone };

  onPhone(v: string) {
    this.phone.set(v.replace(/[^\d\s+-]/g, ''));
  }
  async submit() {
    this.error.set(null);
    if (!this.valid()) return this.error.set('Enter a valid 10-digit Indian mobile number.');
    this.pending.set(true);
    const r = await this.api.post<{ phone: string; cooldown: number }>('/api/auth/otp', { phone: this.phone(), mode: this.mode() });
    this.pending.set(false);
    if (r.ok) this.sent.emit(r.data);
    else this.error.set(r.error);
  }
}

@Component({
  selector: 'nd-verify-step',
  imports: [OtpInput, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5">
      <p class="text-sm text-muted">
        Enter the 6-digit code sent to <strong class="text-forest">{{ display() }}</strong>.
        <button type="button" (click)="changeNumber.emit()" class="font-semibold text-leaf underline">Change</button>
      </p>
      <form (submit)="$event.preventDefault(); code().length === 6 && verify(code())" class="space-y-4">
        <nd-otp-input [(value)]="code" [disabled]="pending()" (complete)="verify($event)" />
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
        @if (info()) { <p class="text-sm text-leaf" role="status">{{ info() }}</p> }
        <button class="btn btn-primary w-full" [disabled]="pending() || code().length !== 6">
          <nd-icon [icon]="pending() ? I.loader : I.shield" class="size-4" [class.animate-spin]="pending()" /> {{ pending() ? 'Verifying…' : 'Verify & continue' }}
        </button>
      </form>
      <div class="text-center text-sm">
        @if (cooldown() > 0) {
          <span class="text-muted">Resend code in {{ cooldown() }}s</span>
        } @else {
          <button type="button" class="inline-flex items-center gap-1 font-semibold text-leaf" [disabled]="pending()" (click)="resend()"><nd-icon [icon]="I.rotate" class="size-4" /> Resend OTP</button>
        }
      </div>
    </div>
  `,
})
export class VerifyStep {
  private api = inject(ApiService);
  phone = input.required<string>();
  mode = input.required<'customer' | 'admin'>();
  initialCooldown = input(45);
  verified = output<{ needsProfile: boolean }>();
  changeNumber = output<void>();
  code = signal('');
  error = signal<string | null>(null);
  info = signal<string | null>(null);
  pending = signal(false);
  cooldown = signal(0);
  display = computed(() => formatIndianPhone(this.phone()));
  I = { loader: LoaderCircle, shield: ShieldCheck, rotate: RotateCw };
  private timer = setInterval(() => this.cooldown() > 0 && this.cooldown.update((c) => c - 1), 1000);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
    queueMicrotask(() => this.cooldown.set(this.initialCooldown()));
  }

  async verify(token: string) {
    if (this.pending()) return;
    this.error.set(null);
    this.pending.set(true);
    const r = await this.api.post<{ needsProfile: boolean }>('/api/auth/verify', { phone: this.phone(), token, mode: this.mode() });
    this.pending.set(false);
    if (r.ok) this.verified.emit(r.data);
    else {
      this.error.set(r.error);
      this.code.set('');
    }
  }
  async resend() {
    this.error.set(null);
    this.pending.set(true);
    const r = await this.api.post<{ phone: string; cooldown: number }>('/api/auth/otp', { phone: this.phone(), mode: this.mode() });
    this.pending.set(false);
    if (r.ok) {
      this.cooldown.set(r.data.cooldown);
      this.info.set('A new code has been sent.');
    } else this.error.set(r.error);
  }
}
