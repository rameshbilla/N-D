import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { NotConfiguredError } from './supabase';

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}
export const userError = (message: string, fieldErrors?: Record<string, string>) => new HttpError(400, message, fieldErrors);

/** Throws the Supabase error (if any) and returns non-null data. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

/**
 * Wraps an async route. Handlers return `data` (sent as { ok: true, data, message }) or throw.
 * Errors are mapped to safe messages — internal details are logged, never returned.
 */
export function route<T>(fn: (req: Request, res: Response) => Promise<T>, okMessage?: string): RequestHandler {
  return async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ ok: true, data: data ?? null, message: okMessage });
    } catch (e) {
      if (res.headersSent) return;
      if (e instanceof HttpError) return void res.status(e.status).json({ ok: false, error: e.message, fieldErrors: e.fieldErrors });
      if (e instanceof ZodError) {
        const fieldErrors = Object.fromEntries(e.issues.map((i) => [i.path.join('.'), i.message]));
        return void res.status(400).json({ ok: false, error: e.issues[0]?.message ?? 'Invalid input.', fieldErrors });
      }
      if (e instanceof NotConfiguredError) return void res.status(503).json({ ok: false, error: 'This feature is unavailable: the store database is not configured yet. See README → Setup.' });
      const msg = (e as { message?: string }).message ?? '';
      console.error(`[api] ${req.method} ${req.path} failed:`, msg);
      if (/duplicate key|unique/i.test(msg)) return void res.status(409).json({ ok: false, error: 'That value is already in use (slug, SKU or code must be unique).' });
      if (/violates check constraint|invalid input/i.test(msg)) return void res.status(400).json({ ok: false, error: 'Some values are invalid. Please check and try again.' });
      if (/FORBIDDEN|row-level security|permission denied/i.test(msg)) return void res.status(403).json({ ok: false, error: 'You do not have permission for this action.' });
      res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
    }
  };
}

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const param = (req: Request, k: string) => {
  const v = req.params[k];
  if (!isUuid(v)) throw new HttpError(404, 'Not found.');
  return v;
};
export const qs = (req: Request, k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
