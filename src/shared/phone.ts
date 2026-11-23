/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts "9014325025", "09014325025", "919014325025", "+91 90143-25025".
 * Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9.
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export function formatIndianPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/^\+91/, '');
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : e164;
}

/** Masks for display/logging: +91 90XXX XX025 */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+91/, '');
  return d.length === 10 ? `+91 ${d.slice(0, 2)}XXX XX${d.slice(7)}` : '***';
}
