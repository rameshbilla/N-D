import { Router } from 'express';
import { z } from 'zod';
import { normalizeIndianPhone } from '../../shared/phone';
import { getStaffRole, getUser, requireUser } from '../auth';
import { config, isServiceRoleConfigured, isSupabaseConfigured } from '../config';
import { HttpError, route, userError } from '../http';
import { clientIp, rateLimit, resetRateLimit } from '../rate-limit';
import { serviceClient, userClient } from '../supabase';

export const authRouter = Router();
const modeSchema = z.enum(['customer', 'admin']);

const ensureConfigured = () => {
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) throw new HttpError(503, 'Login is unavailable: Supabase is not configured yet. See README → Setup.');
};

/** Ensures the env-configured initial Super Admin exists on the allowlist (idempotent). */
async function ensureInitialSuperAdmin(phone: string) {
  const initial = normalizeIndianPhone(config.initialSuperAdminPhone);
  if (!initial || initial !== phone) return;
  const svc = serviceClient();
  const { data } = await svc.from('admin_allowlist').select('phone').eq('phone', initial).maybeSingle();
  if (!data) await svc.from('admin_allowlist').insert({ phone: initial, role: 'super_admin', display_name: 'Owner' });
}

async function isAllowlisted(phone: string) {
  const { data } = await serviceClient().from('admin_allowlist').select('is_active').eq('phone', phone).maybeSingle();
  return Boolean(data?.is_active);
}

/** Step 1: send a 6-digit OTP by SMS (generated, delivered and expired by Supabase Auth). */
authRouter.post(
  '/otp',
  route(async (req, res) => {
    ensureConfigured();
    const mode = modeSchema.parse(req.body?.mode);
    const phone = normalizeIndianPhone(req.body?.phone);
    if (!phone) throw userError('Enter a valid 10-digit Indian mobile number.');
    const { otp } = config;

    const ipLimit = await rateLimit('otp-ip', clientIp(req), otp.maxSendsPerIpPerHour, 3600);
    if (!ipLimit.allowed) throw new HttpError(429, `Too many requests. Try again in ${Math.ceil(ipLimit.retryAfter / 60)} min.`);
    const cooldown = await rateLimit('otp-cool', phone, 1000, 86400, otp.resendCooldownSeconds);
    if (!cooldown.allowed) throw new HttpError(429, `Please wait ${cooldown.retryAfter}s before requesting another code.`);
    const hourly = await rateLimit('otp-send', phone, otp.maxSendsPerHour, 3600);
    if (!hourly.allowed) throw new HttpError(429, `Too many codes requested. Try again in ${Math.ceil(hourly.retryAfter / 60)} min.`);

    if (mode === 'admin') {
      await ensureInitialSuperAdmin(phone);
      // Never send OTPs to numbers that are not authorised for the admin area.
      if (!(await isAllowlisted(phone))) throw new HttpError(403, 'This mobile number is not authorised for admin access.');
    }
    const { data: blocked } = await serviceClient().from('profiles').select('is_blocked').eq('phone', phone).maybeSingle();
    if (blocked?.is_blocked) throw new HttpError(403, 'This account has been suspended. Please contact support.');

    const { error } = await userClient(req, res).auth.signInWithOtp({ phone, options: { channel: 'sms' } });
    if (error) {
      console.error('signInWithOtp failed', error.status, error.code);
      throw new HttpError(error.status === 429 ? 429 : 502, error.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'We could not send the code. Please try again shortly.');
    }
    return { phone, cooldown: otp.resendCooldownSeconds };
  }),
);

/** Step 2: verify the code; sets the session cookie. Admin mode also checks the allowlist. */
authRouter.post(
  '/verify',
  route(async (req, res) => {
    ensureConfigured();
    const mode = modeSchema.parse(req.body?.mode);
    const phone = normalizeIndianPhone(req.body?.phone);
    const token = String(req.body?.token ?? '').replace(/\D/g, '');
    if (!phone) throw userError('Invalid mobile number.');
    if (!/^\d{6}$/.test(token)) throw userError('Enter the 6-digit code.');

    const { otp } = config;
    const attempts = await rateLimit('otp-verify', phone, otp.maxVerifyAttempts, otp.verifyWindowMinutes * 60);
    if (!attempts.allowed) throw new HttpError(429, `Too many incorrect attempts. Request a new code in ${Math.ceil(attempts.retryAfter / 60)} min.`);
    if (mode === 'admin' && !(await isAllowlisted(phone))) throw new HttpError(403, 'This mobile number is not authorised for admin access.');

    const supabase = userClient(req, res);
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.user) throw userError('The code is incorrect or has expired.');
    await resetRateLimit('otp-verify', phone);

    const svc = serviceClient();
    await svc.from('profiles').upsert({ id: data.user.id, phone }, { onConflict: 'id' });
    const { data: role } = await svc.rpc('sync_admin_role', { p_user_id: data.user.id });
    if (mode === 'admin' && !role) {
      await supabase.auth.signOut();
      throw new HttpError(403, 'This mobile number is not authorised for admin access.');
    }
    const { data: profile } = await svc.from('profiles').select('full_name, is_blocked').eq('id', data.user.id).maybeSingle();
    if (profile?.is_blocked) {
      await supabase.auth.signOut();
      throw new HttpError(403, 'This account has been suspended. Please contact support.');
    }
    return { needsProfile: mode === 'customer' && !profile?.full_name };
  }),
);

/** Current session (used by the Angular app on start-up and by route guards). */
authRouter.get(
  '/me',
  route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = await getUser(req, res);
    if (!user) return { user: null, role: null };
    const { data: profile } = await userClient(req, res).from('profiles').select('full_name, phone, email').eq('id', user.id).maybeSingle();
    const role = isServiceRoleConfigured() ? await getStaffRole(user.id).catch(() => null) : null;
    return { user: { id: user.id, name: profile?.full_name ?? null, phone: profile?.phone ?? null, email: profile?.email ?? null }, role };
  }),
);

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
});

authRouter.put(
  '/profile',
  route(async (req, res) => {
    const user = await requireUser(req, res);
    const p = profileSchema.parse(req.body);
    const { error } = await userClient(req, res).from('profiles').update({ full_name: p.fullName, email: p.email || null }).eq('id', user.id);
    if (error) throw userError('Could not save your profile.');
  }, 'Profile saved.'),
);

authRouter.post(
  '/logout',
  route(async (req, res) => {
    if (isSupabaseConfigured()) await userClient(req, res).auth.signOut();
  }),
);
