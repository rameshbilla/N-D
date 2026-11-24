import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { adminReadRouter } from './admin-read';
import { adminWriteRouter } from './admin-write';
import { authRouter } from './auth';
import { catalogRouter } from './catalog';
import { customerRouter } from './customer';
import { reportsCsv } from './reports';
import { shopRouter } from './shop';
import { razorpayWebhook } from './webhooks';
import { config, isServiceRoleConfigured, isSupabaseConfigured } from '../config';
import { anonClient } from '../supabase';

/**
 * CSRF protection for cookie-authenticated API calls: state-changing requests must come from
 * this site (Origin / Sec-Fetch-Site), in addition to SameSite=Lax session cookies.
 */
function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const site = req.get('sec-fetch-site');
  const host = req.get('x-forwarded-host') ?? req.get('host');
  if (origin) {
    try {
      if (new URL(origin).host === host) return next();
    } catch {
      /* invalid origin header */
    }
    return void res.status(403).json({ ok: false, error: 'Cross-site request blocked.' });
  }
  if (site && site !== 'same-origin' && site !== 'none') return void res.status(403).json({ ok: false, error: 'Cross-site request blocked.' });
  next();
}

export function apiRouter(): Router {
  const api = Router();
  // The webhook must see the raw body for signature verification (and is exempt from the CSRF check).
  api.post('/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => void razorpayWebhook(req, res));
  // Health check for the host (no database call). `?db=1` also checks Supabase connectivity; never reveals secrets.
  api.get('/health', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const info: Record<string, unknown> = {
      ok: true,
      supabaseConfigured: isSupabaseConfigured(),
      serviceRoleConfigured: isServiceRoleConfigured(),
      supabaseHost: (() => {
        try {
          return new URL(config.supabaseUrl).hostname;
        } catch {
          return null;
        }
      })(),
    };
    if (req.query['db'] === '1' && isSupabaseConfigured()) {
      const t = Date.now();
      try {
        const { error } = await anonClient().from('site_settings').select('key').limit(1);
        info['db'] = error ? `error: ${error.message}` : 'ok';
      } catch (e) {
        info['db'] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
      info['dbMs'] = Date.now() - t;
    }
    res.json(info);
  });
  api.use(express.json({ limit: '1mb' }));
  api.use(sameOrigin);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', authRouter);
  api.use('/', catalogRouter);
  api.use('/', shopRouter);
  api.use('/', customerRouter);
  api.get('/admin/reports.csv', (req, res) => void reportsCsv(req, res));
  api.use('/admin', adminReadRouter);
  api.use('/admin', adminWriteRouter);
  api.use((_req, res) => void res.status(404).json({ ok: false, error: 'Not found.' }));
  return api;
}
