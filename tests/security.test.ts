import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { estimateCustomProcessing } from '../src/shared/custom-estimate';
import { findClaimWarnings } from '../src/shared/health';
import { maskPhone, normalizeIndianPhone } from '../src/shared/phone';
import { verifyPaymentSignature, verifyWebhookSignature } from '../src/server/razorpay';
import { sniffImageType } from '../src/server/uploads';

describe('Indian mobile validation', () => {
  it.each([
    ['9014325025', '+919014325025'],
    ['+91 90143 25025', '+919014325025'],
    ['09014325025', '+919014325025'],
    ['919014325025', '+919014325025'],
  ])('normalises %s', (input, out) => expect(normalizeIndianPhone(input)).toBe(out));
  it.each(['12345', '5014325025', '+1 4155550100', '90143250251', ''])('rejects %s', (input) => expect(normalizeIndianPhone(input)).toBeNull());
  it('masks numbers for display', () => expect(maskPhone('+919014325025')).toBe('+91 90XXX XX025'));
});

describe('Razorpay signatures', () => {
  const secret = 'test_secret';
  const sig = createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
  it('accepts a valid checkout signature', () => expect(verifyPaymentSignature('order_1', 'pay_1', sig, secret)).toBe(true));
  it('rejects a tampered payment id', () => expect(verifyPaymentSignature('order_1', 'pay_2', sig, secret)).toBe(false));
  it('rejects when no secret is configured', () => expect(verifyPaymentSignature('order_1', 'pay_1', sig, '')).toBe(false));
  it('verifies webhook bodies', () => {
    const body = '{"event":"payment.captured"}';
    const wsig = createHmac('sha256', 'wh').update(body).digest('hex');
    expect(verifyWebhookSignature(body, wsig, 'wh')).toBe(true);
    expect(verifyWebhookSignature(body + ' ', wsig, 'wh')).toBe(false);
  });
});

describe('upload type sniffing (does not trust browser MIME)', () => {
  it('detects real images', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))?.mime).toBe('image/png');
  });
  it('rejects disguised files', () => {
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });
});

describe('custom processing estimate', () => {
  const settings = { packaging_charge_per_kg_paise: 2000, transport_charge_paise: 15000, min_quantity_kg: 2, estimates_enabled: true, notes: '' };
  const rates = [
    { ingredient_name: null, processing_type: 'dehydration_powder', rate_per_kg_paise: 9000 },
    { ingredient_name: 'Amla', processing_type: 'dehydration_powder', rate_per_kg_paise: 9500 },
  ];
  it('uses ingredient-specific rates and adds packaging + pickup', () => {
    const e = estimateCustomProcessing({ ingredient: 'amla', processingType: 'dehydration_powder', quantity: 10, unit: 'kg', wantsPickup: true }, rates, settings);
    expect(e.total_paise).toBe(95000 + 20000 + 15000);
  });
  it('enforces the minimum quantity and falls back to manual quotes', () => {
    expect(estimateCustomProcessing({ ingredient: 'x', processingType: 'dehydration_powder', quantity: 500, unit: 'g', wantsPickup: false }, rates, settings).available).toBe(false);
    expect(estimateCustomProcessing({ ingredient: 'x', processingType: 'grinding_only', quantity: 5, unit: 'kg', wantsPickup: false }, rates, settings).available).toBe(false);
  });
});

describe('health content policy', () => {
  it('flags disease-claim wording', () => {
    expect(findClaimWarnings('This powder cures diabetes')).toContain('cures');
    expect(findClaimWarnings('Carrots contain beta-carotene.')).toEqual([]);
  });
});
