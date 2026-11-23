import type { CustomServiceSettings, ProcessingType } from './types';

export interface ServiceRate {
  ingredient_name: string | null;
  processing_type: string;
  rate_per_kg_paise: number;
}

export interface Estimate {
  available: boolean;
  reason?: string;
  quantityKg: number;
  lines: { label: string; amount_paise: number }[];
  total_paise: number;
}

/** Indicative estimate for custom processing. Final charges are set by the admin's quotation. */
export function estimateCustomProcessing(
  input: { ingredient: string; processingType: ProcessingType; quantity: number; unit: 'kg' | 'g'; wantsPickup: boolean },
  rates: ServiceRate[],
  settings: CustomServiceSettings,
): Estimate {
  const quantityKg = input.unit === 'g' ? input.quantity / 1000 : input.quantity;
  const empty = (reason: string): Estimate => ({ available: false, reason, quantityKg, lines: [], total_paise: 0 });
  if (!settings.estimates_enabled) return empty('Our team will review your request and send a custom quotation.');
  if (!(quantityKg > 0)) return empty('Enter the raw material quantity.');
  if (quantityKg < settings.min_quantity_kg) return empty(`Minimum quantity is ${settings.min_quantity_kg} kg.`);

  const name = input.ingredient.trim().toLowerCase();
  const forType = rates.filter((r) => r.processing_type === input.processingType);
  const specific = name ? forType.find((r) => r.ingredient_name && r.ingredient_name.trim().toLowerCase() === name) : undefined;
  const rate = specific ?? forType.find((r) => !r.ingredient_name);
  if (!rate) return empty('This combination needs a manual quotation. Submit your request and we will price it.');

  const lines = [
    {
      label: `${specific ? `${specific.ingredient_name} — ` : ''}Processing @ ₹${(rate.rate_per_kg_paise / 100).toFixed(0)}/kg × ${quantityKg} kg`,
      amount_paise: Math.round(rate.rate_per_kg_paise * quantityKg),
    },
  ];
  if (settings.packaging_charge_per_kg_paise > 0) {
    lines.push({ label: 'Packaging', amount_paise: Math.round(settings.packaging_charge_per_kg_paise * quantityKg) });
  }
  if (input.wantsPickup && settings.transport_charge_paise > 0) {
    lines.push({ label: 'Pickup / transport', amount_paise: settings.transport_charge_paise });
  }
  return { available: true, quantityKg, lines, total_paise: lines.reduce((a, l) => a + l.amount_paise, 0) };
}
