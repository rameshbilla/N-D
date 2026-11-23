import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, ChevronDown, Factory, HeartHandshake, Leaf } from 'lucide';
import { HEALTH_DISCLAIMER } from '../../../shared/brand';
import { SeoService } from '../../core/seo.service';
import { PageHero, RevealDirective } from '../../ui/common';
import { IconComponent } from '../../ui/icon';

@Component({
  selector: 'nd-how-it-works',
  imports: [RouterLink, IconComponent, PageHero, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Process" heading="How it works" description="From fresh produce to fine powder — and how we can process your own ingredients." [crumbs]="[{ href: '/how-it-works', label: 'How It Works' }]" />
    @for (b of blocks; track b.title) {
      <section class="container-page mt-14">
        <h2 class="text-3xl font-semibold text-forest md:text-4xl">{{ b.title }}</h2>
        <ol class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (s of b.steps; track s[0]; let i = $index) {
            <li [ndReveal]="(i % 3) * 0.06" class="card h-full list-none p-6">
              <span class="font-display text-4xl font-bold text-leaf/30">{{ (i + 1).toString().padStart(2, '0') }}</span>
              <h3 class="mt-3 font-sans text-lg font-semibold text-forest">{{ s[0] }}</h3>
              <p class="mt-1 text-sm text-muted">{{ s[1] }}</p>
            </li>
          }
        </ol>
        <a [routerLink]="b.href" class="btn btn-primary mt-6">{{ b.cta }} <nd-icon [icon]="arrow" class="size-4" /></a>
      </section>
    }
  `,
})
export class HowItWorksPage {
  arrow = ArrowRight;
  blocks = [
    {
      title: 'How we make our powders', href: '/shop', cta: 'Shop powders',
      steps: [
        ['Sourcing', 'We buy fresh, ripe produce and leaves, choosing for colour, aroma and condition.'],
        ['Cleaning & preparation', 'Everything is washed, hand-sorted, trimmed and evenly sliced so it dries uniformly.'],
        ['Controlled dehydration', 'Slices go onto food-grade trays in our dehydrator, where warm circulating air at a controlled temperature gently removes moisture.'],
        ['Milling', 'The dried pieces are milled in stainless-steel grinders into a fine powder.'],
        ['Sieving & quality checks', 'Powder is sieved for even texture and checked for colour, aroma and cleanliness.'],
        ['Packing', 'Measured into food-grade resealable pouches and jars, heat-sealed and labelled.'],
      ],
    },
    {
      title: 'Custom processing, step by step', href: '/custom-processing', cta: 'Start a request',
      steps: [
        ['Submit a request', 'Choose dehydration only, dehydration + powder, or grinding only. Add quantity, photos and instructions. You will see an indicative estimate.'],
        ['Review & quotation', 'We review your request and send a quotation to your account.'],
        ['Accept & pay', 'Accept the quotation and pay online securely (UPI, cards, net banking).'],
        ['Hand over raw material', 'Drop it off, courier it, or request a pickup.'],
        ['Processing', 'Track every stage: material received, processing started, dehydration complete, powder ready, packed.'],
        ['Dispatch', 'Collect your powder or receive it by delivery.'],
      ],
    },
  ];
  constructor() {
    inject(SeoService).set({ title: 'How It Works', description: 'How we make our powders — and how our custom dehydration and powder-making service works, step by step.', path: '/how-it-works' });
  }
}

@Component({
  selector: 'nd-about',
  imports: [RouterLink, IconComponent, PageHero, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Our story" heading="Nature’s goodness, made convenient" [crumbs]="[{ href: '/about', label: 'About' }]"
      description="N&D Nature Healthy Food makes dehydrated fruit, vegetable and herbal powders — and helps farmers, homemakers and small businesses turn their own produce into powder." />
    <section class="container-page mt-12 grid gap-10 lg:grid-cols-2">
      <div ndReveal class="prose-nd">
        <h2>Why powders?</h2>
        <p>Fresh produce is seasonal and perishable. Careful dehydration removes moisture so fruits, vegetables and leaves can be stored and used through the year — stirred into drinks, doughs, soups and bakes.</p>
        <h2>How we work</h2>
        <p>We keep our process simple and transparent: wash, sort, slice, dehydrate at controlled temperatures, mill, sieve, check and pack. Each product page tells you exactly what is inside, how to use it, how to store it and any precautions.</p>
        <h2>Honest information</h2>
        <p>We share general nutritional and culinary information only. Our products are foods — not medicines — and we never claim they cure or treat any condition.</p>
      </div>
      <div class="grid gap-4">
        @for (f of features; track f.t; let i = $index) {
          <div [ndReveal]="i * 0.08" class="card flex gap-4 p-6"><nd-icon [icon]="f.icon" class="size-7 shrink-0 text-leaf" /><div><h3 class="font-sans text-lg font-semibold text-forest">{{ f.t }}</h3><p class="text-sm text-muted">{{ f.d }}</p></div></div>
        }
        <a routerLink="/shop" class="btn btn-primary w-fit">Explore our products</a>
      </div>
    </section>
  `,
})
export class AboutPage {
  features = [
    { icon: Leaf, t: 'Real ingredients', d: 'Single-ingredient powders and simple blends like our signature ABC Powder.' },
    { icon: Factory, t: 'Careful processing', d: 'Controlled dehydration, stainless-steel milling and batch checks.' },
    { icon: HeartHandshake, t: 'Custom service', d: 'We process your own raw material with clear per-kg pricing.' },
  ];
  constructor() {
    inject(SeoService).set({ title: 'About Us', description: 'The story behind N&D Nature Healthy Food dehydrated powders.', path: '/about' });
  }
}

const FAQS: [string, string][] = [
  ['Do I need an account to shop?', 'No. You can browse, search, read product information, choose pack sizes, add to cart and apply coupons as a guest. We only ask you to verify your mobile number with a one-time password when you proceed to checkout — your cart is kept.'],
  ['How does mobile OTP login work?', 'Enter your 10-digit Indian mobile number and we send a 6-digit code by SMS. Enter it to sign in. New customers are registered automatically and asked for their name.'],
  ['Which payment methods do you accept?', 'UPI (Google Pay, PhonePe, Paytm, BHIM and other UPI apps), debit and credit cards, net banking and other methods enabled through Razorpay. Cash on delivery may be available for some orders.'],
  ['Is my payment information safe?', 'Payments are processed by Razorpay. We never see or store your card details, and every payment is verified on our server before your order is confirmed.'],
  ['What is ABC Powder?', 'ABC Powder is our blend of dehydrated Amla (Indian gooseberry), Beetroot and Carrot. See the product page for uses, preparation ideas, storage and precautions.'],
  ['How should I store the powders?', 'Keep the pouch tightly closed in a cool, dry place away from sunlight and always use a dry spoon. Fruit and vegetable powders absorb moisture and may clump if left open.'],
  ['Are these powders a medicine?', `No. Our powders are foods. ${HEALTH_DISCLAIMER}`],
  ['Can you process my own fruits or leaves?', 'Yes. Use our Custom Processing page to request dehydration only, dehydration + powder making, or grinding only. You will see an estimate, then receive a quotation you can accept and pay online, and you can track every stage.'],
  ['How long does delivery take?', 'Orders are usually dispatched within 1–3 working days. You will see courier and tracking details in My Orders once your order ships.'],
  ['Can I cancel or return an order?', 'Please see our Shipping & Returns policy. As food products, opened packs cannot be returned, but we will always help if something arrives damaged or incorrect.'],
];

@Component({
  selector: 'nd-faq',
  imports: [IconComponent, PageHero],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nd-page-hero eyebrow="Help" heading="Frequently asked questions" [crumbs]="[{ href: '/faqs', label: 'FAQs' }]" />
    <section class="container-page mt-10 max-w-3xl space-y-3">
      @for (f of faqs; track f[0]) {
        <details class="group card [&_summary::-webkit-details-marker]:hidden">
          <summary class="flex cursor-pointer list-none items-center gap-3 p-5 font-semibold text-forest"><span class="flex-1">{{ f[0] }}</span><nd-icon [icon]="down" class="size-5 text-muted transition group-open:rotate-180" /></summary>
          <p class="px-5 pb-5 leading-relaxed text-muted">{{ f[1] }}</p>
        </details>
      }
    </section>
  `,
})
export class FaqPage {
  faqs = FAQS;
  down = ChevronDown;
  constructor() {
    inject(SeoService).set({
      title: 'FAQs',
      description: 'Answers about ordering, OTP login, payments, storage and custom processing.',
      path: '/faqs',
      jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    });
  }
}
