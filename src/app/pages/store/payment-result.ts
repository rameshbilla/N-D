import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CircleCheck, Clock, CircleX } from 'lucide';
import { ORDER_STATUS_LABEL } from '../../../shared/status';
import type { OrderStatus } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { SeoService } from '../../core/seo.service';
import { InrPipe } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { RetryPayment } from '../../ui/order';

const CONFIRMED: OrderStatus[] = ['placed', 'payment_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));

@Component({
  selector: 'nd-payment-success',
  imports: [RouterLink, IconComponent, InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let o = data.value();
    <section class="container-page flex flex-col items-center py-20 text-center">
      <div class="rounded-full p-6" [class]="confirmed() ? 'bg-mint' : 'bg-amber-100'"><nd-icon [icon]="confirmed() ? I.ok : I.clock" class="size-14" [class]="confirmed() ? 'text-leaf' : 'text-amber-700'" /></div>
      <h1 class="mt-6 text-4xl font-semibold text-forest">{{ confirmed() ? 'Thank you! Your order is confirmed.' : 'We are confirming your payment' }}</h1>
      @if (o) {
        <p class="mt-3 text-muted">Order <strong class="text-forest">#{{ o.order_number }}</strong> · {{ o.total_paise | inr }} · {{ label(o.status) }}</p>
        @if (!confirmed()) { <p class="mt-2 max-w-md text-sm text-muted">This usually takes a few seconds. If money was deducted, your order will update automatically — refresh this page or check My Orders.</p> }
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <a [routerLink]="['/account/orders', o.id]" class="btn btn-primary">Track order</a>
          <a routerLink="/shop" class="btn btn-outline">Continue shopping</a>
        </div>
      } @else {
        <a routerLink="/account/orders" class="btn btn-primary mt-8">View my orders</a>
      }
    </section>
  `,
})
export class PaymentSuccessPage {
  private api = inject(ApiService);
  order = input<string>();
  I = { ok: CircleCheck, clock: Clock };
  data = resource({
    params: () => this.order(),
    loader: async ({ params }) => {
      if (!isId(params)) return null;
      const r = await this.api.get<{ id: string; order_number: string; status: OrderStatus; total_paise: number }>(`/api/account/orders/${params}/summary`);
      return r.ok ? r.data : null;
    },
  });
  confirmed = computed(() => CONFIRMED.includes(this.data.value()?.status as OrderStatus));
  label = (s: OrderStatus) => ORDER_STATUS_LABEL[s];
  constructor() {
    inject(SeoService).set({ title: 'Order confirmed', noindex: true });
  }
}

@Component({
  selector: 'nd-payment-failure',
  imports: [RouterLink, IconComponent, RetryPayment],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container-page flex flex-col items-center py-20 text-center">
      <div class="rounded-full bg-red-50 p-6"><nd-icon [icon]="x" class="size-14 text-berry" /></div>
      <h1 class="mt-6 text-4xl font-semibold text-forest">{{ reason() === 'cancelled' ? 'Payment cancelled' : 'Payment not completed' }}</h1>
      <p class="mt-3 max-w-lg text-muted">
        {{ reason() === 'verify'
          ? 'We could not confirm your payment yet. If money was deducted, your order will update automatically within a few minutes — no need to pay again.'
          : 'No money was taken for this attempt. Your order is saved — you can try again with any UPI app, card or net banking.' }}
      </p>
      @if (valid() && reason() !== 'verify') { <div class="mt-8 w-full max-w-xl"><nd-retry-payment [orderId]="order()!" /></div> }
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        @if (valid()) { <a [routerLink]="['/account/orders', order()]" class="btn btn-outline">View order</a> }
        <a routerLink="/contact" class="btn btn-ghost">Need help?</a>
      </div>
    </section>
  `,
})
export class PaymentFailurePage {
  order = input<string>();
  reason = input<string>();
  valid = computed(() => isId(this.order()));
  x = CircleX;
  constructor() {
    inject(SeoService).set({ title: 'Payment not completed', noindex: true });
  }
}
