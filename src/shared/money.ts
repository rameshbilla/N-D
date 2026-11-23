const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formats integer paise as Indian Rupees, e.g. 42900 → "₹429". */
export function formatINR(paise: number | null | undefined): string {
  return inr.format((paise ?? 0) / 100);
}

/** Parses a rupee amount typed by an admin ("429", "429.50") into integer paise. */
export function rupeesToPaise(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[,₹\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const paiseToRupees = (paise: number | null | undefined) =>
  paise === null || paise === undefined ? '' : String(paise / 100);

export function percentOff(mrp: number, price: number): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}
