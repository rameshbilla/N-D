import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LoaderCircle, Mail, MapPin, MessageCircle, Phone, Send } from 'lucide';
import type { StoreSettings } from '../../../shared/types';
import { ApiService } from '../../core/api.service';
import { SeoService } from '../../core/seo.service';
import { PageHero } from '../../ui/common';
import { IconComponent } from '../../ui/icon';
import { safeResource } from '../../core/safe-resource';

@Component({
  selector: 'nd-contact',
  imports: [FormsModule, IconComponent, PageHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="We're here to help" heading="Contact us" description="Questions about an order, a product or custom processing? Send us a message or reach us directly." [crumbs]="[{ href: '/contact', label: 'Contact' }]" />
    <section class="container-page mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
      <form class="card grid gap-4 p-6 sm:grid-cols-2" (ngSubmit)="send()">
        <div><label class="field-label" for="c-name">Name *</label><input id="c-name" name="name" [(ngModel)]="f.name" class="field" autocomplete="name" /></div>
        <div><label class="field-label" for="c-topic">Topic</label>
          <select id="c-topic" name="topic" [(ngModel)]="f.topic" class="field">
            <option value="order">An order</option><option value="product">A product</option><option value="custom">Custom processing</option><option value="bulk">Bulk / wholesale</option><option value="other">Something else</option>
          </select>
        </div>
        <div><label class="field-label" for="c-phone">Mobile</label><input id="c-phone" name="phone" [(ngModel)]="f.phone" class="field" inputmode="numeric" autocomplete="tel-national" /></div>
        <div><label class="field-label" for="c-email">Email</label><input id="c-email" name="email" type="email" [(ngModel)]="f.email" class="field" autocomplete="email" /></div>
        <input name="website" [(ngModel)]="f.website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
        <div class="sm:col-span-2"><label class="field-label" for="c-msg">Message *</label><textarea id="c-msg" name="message" [(ngModel)]="f.message" rows="5" class="field"></textarea></div>
        @if (msg(); as m) { <p class="text-sm sm:col-span-2" [class]="m.ok ? 'text-leaf' : 'text-berry'" role="status">{{ m.text }}</p> }
        <div class="sm:col-span-2"><button class="btn btn-primary" [disabled]="pending()"><nd-icon [icon]="pending() ? I.loader : I.send" class="size-4" [class.animate-spin]="pending()" /> Send message</button></div>
      </form>
      @let s = store.value()?.data?.store;
      <aside class="space-y-3">
        @if (s?.phone) { <a [href]="'tel:' + s!.phone.replaceAll(' ', '')" class="card flex items-center gap-3 p-5"><nd-icon [icon]="I.phone" class="size-5 text-leaf" /><span><span class="block text-xs text-muted">Call</span><span class="font-semibold text-forest">{{ s!.phone }}</span></span></a> }
        @if (s?.whatsapp) { <a [href]="'https://wa.me/' + s!.whatsapp" target="_blank" rel="noopener noreferrer" class="card flex items-center gap-3 p-5"><nd-icon [icon]="I.chat" class="size-5 text-leaf" /><span><span class="block text-xs text-muted">WhatsApp</span><span class="font-semibold text-forest">Chat with us</span></span></a> }
        @if (s?.email) { <a [href]="'mailto:' + s!.email" class="card flex items-center gap-3 p-5"><nd-icon [icon]="I.mail" class="size-5 text-leaf" /><span><span class="block text-xs text-muted">Email</span><span class="font-semibold text-forest">{{ s!.email }}</span></span></a> }
        @if (s?.address) { <div class="card flex items-start gap-3 p-5"><nd-icon [icon]="I.pin" class="mt-0.5 size-5 shrink-0 text-leaf" /><span><span class="block text-xs text-muted">Address</span><span class="text-forest">{{ s!.address }}</span></span></div> }
      </aside>
    </section>
  `,
})
export class ContactPage {
  private api = inject(ApiService);
  store = safeResource(httpResource<{ data: { store: StoreSettings } }>(() => '/api/store'));
  f = { name: '', phone: '', email: '', topic: 'order', message: '', website: '' };
  msg = signal<{ ok: boolean; text: string } | null>(null);
  pending = signal(false);
  I = { loader: LoaderCircle, send: Send, phone: Phone, chat: MessageCircle, mail: Mail, pin: MapPin };
  constructor() {
    inject(SeoService).set({ title: 'Contact Us', description: 'Contact N&D Nature Healthy Food about orders, products or custom processing.', path: '/contact' });
  }
  async send() {
    this.pending.set(true);
    const r = await this.api.post('/api/contact', this.f);
    this.pending.set(false);
    this.msg.set(r.ok ? { ok: true, text: r.message ?? 'Sent!' } : { ok: false, text: r.error });
    if (r.ok) this.f.message = '';
  }
}
