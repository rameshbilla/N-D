import { Component, inject, Injectable, signal } from '@angular/core';
import { CircleAlert, CircleCheck, X } from 'lucide';
import { IconComponent } from '../ui/icon';
import type { ApiResult } from './api.service';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  show(message: string, kind: Toast['kind'] = 'success') {
    const id = Date.now() + Math.random();
    this.toasts.update((t) => [...t.slice(-2), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), 4200);
  }
  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
  /** Shows the server's message / error for an API result and returns it unchanged. */
  result<T>(r: ApiResult<T>): ApiResult<T> {
    if (r.ok && r.message) this.show(r.message);
    if (!r.ok) this.show(r.error, 'error');
    return r;
  }
}

@Component({
  selector: 'nd-toasts',
  imports: [IconComponent],
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="pointer-events-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-forest px-4 py-3 text-sm text-white shadow-lift" [attr.role]="t.kind === 'error' ? 'alert' : 'status'">
          <nd-icon [icon]="t.kind === 'success' ? ok : err" [class]="t.kind === 'success' ? 'size-5 text-mint' : 'size-5 text-red-300'" />
          <span class="flex-1">{{ t.message }}</span>
          <button type="button" (click)="toasts.dismiss(t.id)" aria-label="Dismiss"><nd-icon [icon]="close" class="size-4 opacity-70" /></button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  toasts = inject(ToastService);
  ok = CircleCheck;
  err = CircleAlert;
  close = X;
}
