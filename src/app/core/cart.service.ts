import { computed, effect, inject, Injectable, PLATFORM_ID, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { PricedCart } from '../../shared/pricing';
import type { PaymentMethod } from '../../shared/types';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface CartItem {
  variantId: string;
  quantity: number;
}

const CART_KEY = 'nd-cart-v1';
const WISH_KEY = 'nd-wishlist-v1';
const MAX_QTY = 50;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — cart still works for this session */
  }
}

/**
 * Guest cart lives in the browser; once signed in it is merged into the account cart
 * (never cleared on login). All prices shown come from the server (/api/cart/quote).
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly items = signal<CartItem[]>([]);
  readonly couponCode = signal<string | null>(null);
  readonly wishlist = signal<Set<string>>(new Set());
  readonly ready = signal(false);
  readonly drawerOpen = signal(false);
  readonly count = computed(() => this.items().reduce((a, i) => a + i.quantity, 0));
  private syncedFor: string | null | undefined = undefined;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.browser) return;
    void this.auth.ensureLoaded();
    // Load + merge whenever the signed-in user changes.
    effect(() => {
      if (!this.auth.loaded()) return;
      const userId = this.auth.user()?.id ?? null;
      untracked(() => void this.init(userId));
    });
    // Persist locally; debounce-save to the account when signed in.
    effect(() => {
      const items = this.items();
      const coupon = this.couponCode();
      if (!this.ready()) return;
      const userId = untracked(() => this.auth.user()?.id ?? null);
      write(CART_KEY, { items, couponCode: coupon, owner: userId });
      if (!userId) return;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => void this.api.put('/api/cart', { items, couponCode: coupon }), 600);
    });
    effect(() => {
      const w = this.wishlist();
      if (this.ready()) write(WISH_KEY, [...w]);
    });
  }

  private async init(userId: string | null) {
    if (this.syncedFor === userId) return;
    this.syncedFor = userId;
    const stored = read<{ items: CartItem[]; couponCode: string | null; owner?: string | null }>(CART_KEY, { items: [], couponCode: null });
    if (!userId && stored.owner) {
      // Signed out from an account cart → fresh guest cart (privacy on shared devices).
      this.items.set([]);
      this.couponCode.set(null);
      this.wishlist.set(new Set());
      write(CART_KEY, { items: [], couponCode: null, owner: null });
      write(WISH_KEY, []);
      this.ready.set(true);
      return;
    }
    const foreign = Boolean(userId && stored.owner && stored.owner !== userId);
    const local = foreign ? [] : (stored.items ?? []).filter((i) => typeof i.variantId === 'string' && i.quantity > 0);
    const localWish = foreign ? [] : read<string[]>(WISH_KEY, []);
    this.items.set(local);
    this.couponCode.set(stored.couponCode ?? null);
    this.wishlist.set(new Set(localWish));
    if (userId) {
      const [c, w] = await Promise.all([
        this.api.post<{ items: CartItem[]; couponCode: string | null }>('/api/cart/sync', { items: local, couponCode: stored.couponCode }),
        this.api.post<{ ids: string[] }>('/api/wishlist/sync', { ids: localWish }),
      ]);
      if (c.ok) {
        this.items.set(c.data.items);
        this.couponCode.set(c.data.couponCode);
      }
      if (w.ok) this.wishlist.set(new Set(w.data.ids));
    }
    this.ready.set(true);
  }

  add(variantId: string, quantity = 1) {
    this.items.update((prev) => {
      const found = prev.find((i) => i.variantId === variantId);
      if (found) return prev.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity) } : i));
      return [...prev, { variantId, quantity: Math.min(MAX_QTY, quantity) }];
    });
  }
  setQuantity(variantId: string, quantity: number) {
    this.items.update((prev) => (quantity <= 0 ? prev.filter((i) => i.variantId !== variantId) : prev.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i))));
  }
  replaceVariant(fromId: string, toId: string) {
    this.items.update((prev) => {
      const from = prev.find((i) => i.variantId === fromId);
      if (!from || fromId === toId) return prev;
      const rest = prev.filter((i) => i.variantId !== fromId);
      if (rest.some((i) => i.variantId === toId)) return rest.map((i) => (i.variantId === toId ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + from.quantity) } : i));
      const next = [...rest];
      next.splice(prev.findIndex((i) => i.variantId === fromId), 0, { variantId: toId, quantity: from.quantity });
      return next;
    });
  }
  remove(variantId: string) {
    this.items.update((prev) => prev.filter((i) => i.variantId !== variantId));
  }
  clear() {
    this.items.set([]);
    this.couponCode.set(null);
  }
  toggleWishlist(productId: string) {
    const next = new Set(this.wishlist());
    const on = !next.has(productId);
    if (on) next.add(productId);
    else next.delete(productId);
    this.wishlist.set(next);
    if (this.auth.user()) void this.api.put(`/api/wishlist/${productId}`, { on });
  }

  /** Server-calculated totals (display only — checkout recalculates again on the server). */
  quote(paymentMethod: PaymentMethod | null = null) {
    return this.api.post<PricedCart>('/api/cart/quote', { items: this.items(), couponCode: this.couponCode(), paymentMethod });
  }
}

/**
 * Reactive cart quote for components: re-prices (debounced) whenever items, coupon or
 * payment method change. Call inside an injection context.
 */
export function cartQuote(method: () => PaymentMethod | null = () => null) {
  const cart = inject(CartService);
  const quoted = signal<PricedCart | null>(null);
  const loading = signal(false);
  const error = signal<string | null>(null);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  effect(() => {
    const items = cart.items();
    cart.couponCode();
    const m = method();
    if (!cart.ready()) return;
    if (!items.length) {
      quoted.set(null);
      error.set(null);
      return;
    }
    loading.set(true);
    const mine = ++seq;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const r = await cart.quote(m);
      if (mine !== seq) return;
      if (r.ok) {
        quoted.set(r.data);
        error.set(null);
      } else error.set(r.error);
      loading.set(false);
    }, 180);
  });
  return { cart: quoted, loading, error };
}
