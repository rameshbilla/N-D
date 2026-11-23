import { isSupabaseConfigured } from './config';
import { anonClient as createPublicClient } from './supabase';
import type { CommerceSettings, CustomServiceSettings, StoreSettings } from '../shared/types';

export const DEFAULT_STORE: StoreSettings = {
  name: 'N&D Nature Healthy Food',
  tagline: 'Pure dehydrated fruit, vegetable & herbal powders',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  fssai: '',
};

export const DEFAULT_COMMERCE: CommerceSettings = {
  gst_percent: 5,
  prices_include_tax: true,
  delivery_fee_paise: 6000,
  free_delivery_threshold_paise: 99900,
  cod_enabled: false,
  cod_fee_paise: 0,
  cod_max_order_paise: 500000,
  max_qty_per_item: 20,
};

export const DEFAULT_CUSTOM: CustomServiceSettings = {
  packaging_charge_per_kg_paise: 0,
  transport_charge_paise: 0,
  min_quantity_kg: 1,
  estimates_enabled: true,
  notes: '',
};

export interface AllSettings {
  store: StoreSettings;
  commerce: CommerceSettings;
  custom_service: CustomServiceSettings;
}

export const getSettings = async (): Promise<AllSettings> => {
  const out: AllSettings = { store: DEFAULT_STORE, commerce: DEFAULT_COMMERCE, custom_service: DEFAULT_CUSTOM };
  if (!isSupabaseConfigured()) return out;
  try {
    const { data } = await createPublicClient().from('site_settings').select('key, value');
    for (const row of data ?? []) {
      if (row.key === 'store') out.store = { ...DEFAULT_STORE, ...row.value };
      if (row.key === 'commerce') out.commerce = { ...DEFAULT_COMMERCE, ...row.value };
      if (row.key === 'custom_service') out.custom_service = { ...DEFAULT_CUSTOM, ...row.value };
    }
  } catch (e) {
    console.error('settings load failed', (e as Error).message);
  }
  return out;
};
