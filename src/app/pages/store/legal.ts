import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { HEALTH_DISCLAIMER } from '../../../shared/brand';
import type { CommerceSettings, StoreSettings } from '../../../shared/types';
import { SeoService } from '../../core/seo.service';
import { InrPipe, PageHero } from '../../ui/common';
import { safeResource } from '../../core/safe-resource';

const UPDATED = 'Last updated 23 November 2026';
const storeInfo = () => safeResource(httpResource<{ data: { store: StoreSettings; commerce: CommerceSettings } }>(() => '/api/store'));

@Component({
  selector: 'nd-privacy',
  imports: [PageHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = info.value()?.data?.store;
    <nd-page-hero eyebrow="Policies" heading="Privacy Policy" [description]="updated" [crumbs]="[{ href: '/privacy-policy', label: 'Privacy Policy' }]" />
    <section class="container-page mt-10"><div class="prose-nd card max-w-3xl p-6 md:p-10">
      <p>{{ s?.name ?? 'N&D Nature Healthy Food' }} (“we”, “us”) respects your privacy. This policy explains what personal data we collect, why, and your choices.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Mobile number (to sign you in with a one-time password), name and optional email.</li>
        <li>Delivery addresses, order history, custom-processing requests and photos you upload.</li>
        <li>Payment status and reference IDs from Razorpay. We never receive or store your card, UPI PIN or bank credentials.</li>
        <li>Basic technical data (IP address, device/browser) used for security, fraud prevention and rate limiting.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To process and deliver orders and custom-processing requests, and to send order updates by SMS, email or WhatsApp.</li>
        <li>To provide customer support and keep our services secure.</li>
        <li>To meet legal, tax and accounting obligations.</li>
      </ul>
      <h2>Sharing</h2>
      <p>We share data only with service providers needed to run the store — hosting and database (Supabase), payments (Razorpay), SMS/email/WhatsApp providers and couriers — and when required by law. We do not sell your personal data.</p>
      <h2>Retention &amp; security</h2>
      <p>We keep order records as required by law and delete other data when no longer needed. Data is protected with access controls, encryption in transit and row-level security.</p>
      <h2>Your rights</h2>
      <p>You can view and update your profile and addresses in My Account, and request access to or deletion of your data by contacting us{{ s?.email ? ' at ' + s!.email : '' }}.</p>
      <h2>Contact</h2>
      <p>{{ s?.name }}{{ s?.address ? ', ' + s!.address : '' }}{{ s?.phone ? ' · ' + s!.phone : '' }}</p>
    </div></section>
  `,
})
export class PrivacyPage {
  info = storeInfo();
  updated = UPDATED;
  constructor() {
    inject(SeoService).set({ title: 'Privacy Policy', path: '/privacy-policy' });
  }
}

@Component({
  selector: 'nd-terms',
  imports: [PageHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Policies" heading="Terms & Conditions" [description]="updated" [crumbs]="[{ href: '/terms', label: 'Terms & Conditions' }]" />
    <section class="container-page mt-10"><div class="prose-nd card max-w-3xl p-6 md:p-10">
      <p>By using this website and placing orders with {{ info.value()?.data?.store?.name ?? 'N&D Nature Healthy Food' }}, you agree to these terms.</p>
      <h2>Accounts</h2>
      <p>You sign in with your Indian mobile number and a one-time password. Keep your phone secure; you are responsible for activity on your account.</p>
      <h2>Products &amp; information</h2>
      <p>Our products are food products. {{ disclaimer }}</p>
      <p>Product images may be illustrative. Natural products vary in colour, aroma and texture between batches.</p>
      <h2>Prices, offers &amp; payment</h2>
      <ul>
        <li>Prices are in Indian Rupees and include applicable GST unless stated otherwise. Final amounts are confirmed at checkout.</li>
        <li>Offers and coupons are subject to their dates, eligibility and limits, and cannot be combined unless stated.</li>
        <li>Online payments are processed by Razorpay. An order is confirmed only after successful payment verification (or acceptance as Cash on Delivery).</li>
        <li>We may cancel and refund an order in case of stock unavailability, pricing errors or suspected fraud.</li>
      </ul>
      <h2>Custom processing</h2>
      <ul>
        <li>Website estimates are indicative. The quotation we send is the binding price once you accept and pay it.</li>
        <li>Yield (powder weight) depends on the moisture content of your raw material and is not guaranteed.</li>
        <li>We may decline raw material that is spoiled, contaminated or unsuitable for food processing.</li>
      </ul>
      <h2>Liability</h2>
      <p>To the extent permitted by law, our liability is limited to the value of the relevant order.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India.</p>
    </div></section>
  `,
})
export class TermsPage {
  info = storeInfo();
  updated = UPDATED;
  disclaimer = HEALTH_DISCLAIMER;
  constructor() {
    inject(SeoService).set({ title: 'Terms & Conditions', path: '/terms' });
  }
}

@Component({
  selector: 'nd-shipping',
  imports: [PageHero, InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = info.value()?.data?.commerce;
    @let s = info.value()?.data?.store;
    <nd-page-hero eyebrow="Policies" heading="Shipping & Returns" [description]="updated" [crumbs]="[{ href: '/shipping-returns', label: 'Shipping & Returns' }]" />
    <section class="container-page mt-10"><div class="prose-nd card max-w-3xl p-6 md:p-10">
      <h2>Shipping</h2>
      <ul>
        <li>We ship across India. Orders are usually dispatched within 1–3 working days.</li>
        @if (c) {
          <li>Delivery charge: {{ c.delivery_fee_paise | inr }}. Free delivery on orders of {{ c.free_delivery_threshold_paise | inr }} or more.</li>
          @if (c.cod_enabled) { <li>Cash on delivery is available on eligible orders{{ c.cod_fee_paise ? ' with a handling fee of ' + (c.cod_fee_paise | inr) : '' }}.</li> }
        }
        <li>Courier and tracking details appear in My Orders once your order ships.</li>
      </ul>
      <h2>Cancellations</h2>
      <p>You can request cancellation before your order is packed by contacting us. Prepaid cancellations are refunded to the original payment method.</p>
      <h2>Returns &amp; replacements</h2>
      <ul>
        <li>For food safety, opened or used packs cannot be returned.</li>
        <li>If your order arrives damaged, leaking or incorrect, contact us within 48 hours of delivery with photos — we will replace the item or refund you.</li>
      </ul>
      <h2>Refunds</h2>
      <p>Approved refunds are initiated within 2 working days and usually reach your account in 5–7 working days, depending on your bank.</p>
      <h2>Need help?</h2>
      <p>{{ s?.phone ? 'Call ' + s!.phone : 'Contact us' }}{{ s?.email ? ' or email ' + s!.email : '' }}.</p>
    </div></section>
  `,
})
export class ShippingPage {
  info = storeInfo();
  updated = UPDATED;
  constructor() {
    inject(SeoService).set({ title: 'Shipping & Returns', path: '/shipping-returns' });
  }
}
