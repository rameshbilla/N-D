import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { serviceClient } from './supabase';

/** Hash identifiers so phone numbers / IPs are never stored in clear text in rate_limits. */
export const hashKey = (...parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);

export const clientIp = (req: Request) =>
  (String(req.headers['x-forwarded-for'] ?? '').split(',')[0] || req.socket.remoteAddress || 'unknown').trim();

/** Atomic fixed-window limiter backed by Postgres (works across instances). Fails closed. */
export async function rateLimit(bucket: string, identifier: string, max: number, windowSeconds: number, minIntervalSeconds = 0) {
  const { data, error } = await serviceClient().rpc('check_rate_limit', {
    p_key: `${bucket}:${hashKey(bucket, identifier)}`,
    p_max: max,
    p_window_seconds: windowSeconds,
    p_min_interval_seconds: minIntervalSeconds,
  });
  if (error) {
    console.error('rate-limit error', error.code);
    return { allowed: false, retryAfter: 60 };
  }
  return { allowed: Boolean(data?.allowed), retryAfter: Number(data?.retry_after ?? 0) };
}

export async function resetRateLimit(bucket: string, identifier: string) {
  await serviceClient().rpc('reset_rate_limit', { p_key: `${bucket}:${hashKey(bucket, identifier)}` });
}
