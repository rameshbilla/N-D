import type { User } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import type { AppRole } from '../shared/types';
import { isSupabaseConfigured } from './config';
import { HttpError } from './http';
import { serviceClient, userClient } from './supabase';

const RANK: Record<AppRole, number> = { staff: 1, admin: 2, super_admin: 3 };
export const hasRole = (role: AppRole | null, min: AppRole) => role !== null && RANK[role] >= RANK[min];

/** The verified user for this request (validated with Supabase Auth, not just decoded). */
export async function getUser(req: Request, res: Response): Promise<User | null> {
  if ('user' in res.locals) return res.locals['user'] as User | null;
  let user: User | null = null;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await userClient(req, res).auth.getUser();
      user = data.user ?? null;
    } catch {
      user = null;
    }
  }
  res.locals['user'] = user;
  return user;
}

/** Role from user_roles, valid only while the verified phone stays on the active allowlist. */
export async function getStaffRole(userId: string): Promise<AppRole | null> {
  const svc = serviceClient();
  const { data: profile } = await svc.from('profiles').select('phone, is_blocked').eq('id', userId).maybeSingle();
  if (!profile?.phone || profile.is_blocked) return null;
  const { data: allow } = await svc.from('admin_allowlist').select('role, is_active').eq('phone', profile.phone).maybeSingle();
  if (!allow?.is_active) return null;
  const { data: roles } = await svc.from('user_roles').select('role').eq('user_id', userId);
  return (roles ?? []).some((r) => r.role === allow.role) ? (allow.role as AppRole) : null;
}

export async function requireUser(req: Request, res: Response): Promise<User> {
  const user = await getUser(req, res);
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  return user;
}

export async function requireStaff(req: Request, res: Response, min: AppRole = 'staff'): Promise<{ user: User; role: AppRole }> {
  const user = await getUser(req, res);
  if (!user) throw new HttpError(401, 'Please sign in again.');
  if (!('role' in res.locals)) res.locals['role'] = await getStaffRole(user.id);
  const role = res.locals['role'] as AppRole | null;
  if (!hasRole(role, min)) throw new HttpError(403, 'You are not authorised to perform this action.');
  return { user, role: role! };
}
