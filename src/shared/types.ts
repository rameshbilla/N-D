// Hand-written row types matching supabase/migrations. Money is integer paise.

export type AppRole = 'super_admin' | 'admin' | 'staff';
export type ProductStatus = 'draft' | 'active' | 'inactive';
export type DiscountType = 'percentage' | 'fixed';
export type PromotionScope = 'all' | 'categories' | 'products';
export type PaymentMethod = 'razorpay' | 'cod';
export type ProcessingType = 'dehydration_only' | 'dehydration_powder' | 'grinding_only';
export type HealthSection =
  | 'ingredients' | 'nutritional_info' | 'health_uses' | 'potential_benefits' | 'common_uses'
  | 'how_to_consume' | 'preparation' | 'serving' | 'storage' | 'precautions' | 'allergens';
export type ClaimType = 'general' | 'traditional' | 'research_supported';

export type OrderStatus =
  | 'pending_payment' | 'placed' | 'payment_confirmed' | 'processing' | 'packed' | 'shipped'
  | 'out_for_delivery' | 'delivered' | 'cancelled' | 'payment_failed' | 'payment_review';

export type CustomRequestStatus =
  | 'request_received' | 'under_review' | 'quotation_sent' | 'payment_pending' | 'payment_completed'
  | 'raw_material_received' | 'processing_started' | 'dehydration_completed' | 'powder_completed'
  | 'packaging_completed' | 'ready_for_dispatch' | 'shipped' | 'delivered' | 'rejected' | 'cancelled';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProductImage { url: string; path?: string | null; alt?: string }
export interface ProductVideo { url: string; title?: string }
export interface NutritionFact { nutrient: string; amount: string; unit: string }

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  tagline: string | null;
  description: string | null;
  images: ProductImage[];
  videos: ProductVideo[];
  nutrition_facts: NutritionFact[];
  nutrition_basis: string | null;
  discount_percent: number;
  status: ProductStatus;
  is_featured: boolean;
  accent_color: string;
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Variant {
  id: string;
  product_id: string;
  label: string;
  weight_grams: number;
  sku: string | null;
  price_paise: number;
  sale_price_paise: number | null;
  stock: number;
  low_stock_threshold: number;
  is_active: boolean;
  sort_order: number;
}

export interface HealthInfoItem {
  id: string;
  product_id: string;
  section: HealthSection;
  kind: 'bullet' | 'paragraph';
  body: string;
  claim_type: ClaimType;
  source_reference: string | null;
  sort_order: number;
  is_approved: boolean;
  approved_at: string | null;
  updated_at: string;
}

export interface Promotion {
  id: string;
  name: string;
  festival_name: string | null;
  title: string;
  description: string | null;
  banner_image_url: string | null;
  show_banner: boolean;
  discount_type: DiscountType;
  discount_value: number;
  scope: PromotionScope;
  requires_coupon: boolean;
  combinable_with_offers: boolean;
  min_order_paise: number;
  max_discount_paise: number | null;
  starts_at: string;
  ends_at: string;
  usage_limit: number | null;
  per_user_limit: number | null;
  used_count: number;
  is_active: boolean;
  priority: number;
}

/** Promotion with its resolved targets, as used by the pricing engine. */
export interface OfferRule extends Promotion {
  product_ids: string[];
  category_ids: string[];
}

export interface CommerceSettings {
  gst_percent: number;
  prices_include_tax: boolean;
  delivery_fee_paise: number;
  free_delivery_threshold_paise: number;
  cod_enabled: boolean;
  cod_fee_paise: number;
  cod_max_order_paise: number;
  max_qty_per_item: number;
}

export interface StoreSettings {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  fssai: string;
}

export interface CustomServiceSettings {
  packaging_charge_per_kg_paise: number;
  transport_charge_paise: number;
  min_quantity_kg: number;
  estimates_enabled: boolean;
  notes: string;
}

export interface Address {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_blocked: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  subtotal_mrp_paise: number;
  item_discount_paise: number;
  coupon_discount_paise: number;
  delivery_fee_paise: number;
  cod_fee_paise: number;
  tax_paise: number;
  tax_inclusive: boolean;
  total_paise: number;
  coupon_code: string | null;
  discount_snapshot: { promotion_id: string | null; label: string; amount_paise: number; kind: string }[];
  shipping_address: Omit<Address, 'id' | 'user_id' | 'is_default'>;
  customer_note: string | null;
  placed_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_label: string;
  sku: string | null;
  unit_mrp_paise: number;
  unit_price_paise: number;
  quantity: number;
  line_discount_paise: number;
  coupon_share_paise: number;
  line_total_paise: number;
  discount_label: string | null;
  image_url: string | null;
}

export interface CustomRequest {
  id: string;
  request_number: string;
  user_id: string;
  customer_name: string;
  phone: string;
  ingredient_name: string;
  ingredient_category: string;
  quantity: number;
  quantity_unit: 'kg' | 'g';
  processing_type: ProcessingType;
  photo_paths: string[];
  special_instructions: string | null;
  logistics: 'customer_dropoff' | 'pickup_requested' | 'courier';
  return_preference: 'collect' | 'delivery';
  pickup_address: string | null;
  estimated_total_paise: number | null;
  status: CustomRequestStatus;
  admin_notes: string | null;
  created_at: string;
}

export interface Quotation {
  id: string;
  request_id: string;
  line_items: { label: string; amount_paise: number }[];
  total_paise: number;
  notes: string | null;
  valid_until: string;
  status: 'sent' | 'accepted' | 'rejected' | 'expired' | 'paid' | 'withdrawn';
  created_at: string;
  responded_at: string | null;
  paid_at: string | null;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  reviewer_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_approved: boolean;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  placement: 'home_strip' | 'shop_top';
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Result envelope for server actions. */
export type ActionResult<T = undefined> =
  | ({ ok: true; message?: string } & ([T] extends [undefined | void] ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
