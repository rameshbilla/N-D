import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { config, isSupabaseConfigured } from './config';

export type Db = SupabaseClient;

export class NotConfiguredError extends Error {
  constructor(what = 'Supabase') {
    super(`${what} is not configured. Add the required environment variables (see .env.example).`);
    this.name = 'NotConfiguredError';
  }
}

/**
 * Client acting as the signed-in user (session in HttpOnly-capable cookies). Subject to RLS.
 * Cached per request so auth refreshes happen once.
 */
export function userClient(req: Request, res: Response): Db {
  if (!isSupabaseConfigured()) throw new NotConfiguredError();
  const cached = res.locals['sb'] as Db | undefined;
  if (cached) return cached;
  const client = createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (toSet) => {
        if (res.headersSent) return;
        toSet.forEach(({ name, value, options }) =>
          res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, { ...options, sameSite: 'lax', secure: config.siteUrl.startsWith('https://') })),
        );
      },
    },
  });
  res.locals['sb'] = client;
  return client;
}

let publicClient: Db | null = null;
/** Anonymous client — public catalogue reads. Subject to RLS. */
export function anonClient(): Db {
  if (!isSupabaseConfigured()) throw new NotConfiguredError();
  return (publicClient ??= createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}

let svc: Db | null = null;
/**
 * Service-role client. BYPASSES RLS — use only after the caller has been authenticated and
 * authorised in code (orders, payments, rate limits, uploads).
 */
export function serviceClient(): Db {
  if (!isSupabaseConfigured()) throw new NotConfiguredError();
  if (!config.serviceRoleKey) throw new NotConfiguredError('SUPABASE_SERVICE_ROLE_KEY');
  return (svc ??= createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}
