import type { ClaimType, HealthSection } from './types';

/** Display order and labels for product health / usage sections. */
export const HEALTH_SECTIONS: { key: HealthSection; label: string; icon: string; hint: string }[] = [
  { key: 'ingredients', label: 'Ingredients', icon: 'Sprout', hint: 'What goes into the pack.' },
  { key: 'nutritional_info', label: 'Nutritional Information', icon: 'BarChart3', hint: 'General nutrition notes. Structured values go in the Nutrition facts table.' },
  { key: 'health_uses', label: 'Health Uses', icon: 'HeartPulse', hint: 'How the product is commonly used as part of a diet. No cure/treatment claims.' },
  { key: 'potential_benefits', label: 'Potential Nutritional Benefits', icon: 'Sparkles', hint: 'Nutrient-based statements only. Mark the evidence level for each.' },
  { key: 'common_uses', label: 'Common Uses', icon: 'ChefHat', hint: 'Culinary and everyday uses.' },
  { key: 'how_to_consume', label: 'How to Consume', icon: 'GlassWater', hint: 'Simple consumption guidance.' },
  { key: 'preparation', label: 'Preparation Methods', icon: 'CookingPot', hint: 'Recipes and preparation ideas.' },
  { key: 'serving', label: 'Suggested Serving', icon: 'Scale', hint: 'Only where product-specific guidance supports it.' },
  { key: 'storage', label: 'Storage Instructions', icon: 'Archive', hint: 'How to keep the powder fresh.' },
  { key: 'precautions', label: 'Precautions', icon: 'ShieldAlert', hint: 'Safety notes, interactions and who should consult a doctor.' },
  { key: 'allergens', label: 'Allergen Information', icon: 'AlertTriangle', hint: 'Allergens and cross-contact information.' },
];

export const CLAIM_LABEL: Record<ClaimType, { label: string; description: string }> = {
  general: { label: 'General nutrition', description: 'General, widely accepted nutritional or culinary information.' },
  traditional: { label: 'Traditional use', description: 'Describes traditional or cultural use — not a scientifically established effect.' },
  research_supported: { label: 'Research-supported', description: 'Supported by published nutrition research. Add a source reference.' },
};

/** Words that indicate prohibited disease claims. Admin UI warns before saving. */
const PROHIBITED = /\b(cure[sd]?|curing|treat(s|ment|ing)?|heal(s|ing)?|prevent(s|ion)?|remed(y|ies)|diagnos\w*|guarantee[sd]?|miracle|cancer|diabetes cure|reverses?)\b/i;

export function findClaimWarnings(text: string): string[] {
  const m = text.match(new RegExp(PROHIBITED, 'gi'));
  return m ? [...new Set(m.map((w) => w.toLowerCase()))] : [];
}
