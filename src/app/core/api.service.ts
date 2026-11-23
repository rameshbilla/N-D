import { HttpClient, HttpErrorResponse, HttpParams, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, REQUEST } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type ApiResult<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * During server-side rendering, relative `/api/...` URLs are resolved against the incoming
 * request so the SSR process can call its own Express API.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const request = inject(REQUEST, { optional: true });
  if (request && req.url.startsWith('/')) return next(req.clone({ url: new URL(req.url, request.url).toString() }));
  return next(req);
};

/** Thin wrapper over HttpClient returning `{ ok, data | error }` envelopes (never throws). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  async get<T>(url: string, params?: Record<string, string | number | undefined | null>): Promise<ApiResult<T>> {
    const p = new HttpParams({ fromObject: Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])) });
    return this.wrap(() => firstValueFrom(this.http.get<ApiResult<T>>(url, { params: p })));
  }
  post<T>(url: string, body?: unknown) {
    return this.wrap<T>(() => firstValueFrom(this.http.post<ApiResult<T>>(url, body ?? {})));
  }
  put<T>(url: string, body?: unknown) {
    return this.wrap<T>(() => firstValueFrom(this.http.put<ApiResult<T>>(url, body ?? {})));
  }
  delete<T>(url: string) {
    return this.wrap<T>(() => firstValueFrom(this.http.delete<ApiResult<T>>(url)));
  }

  private async wrap<T>(fn: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const body = e.error as Partial<{ error: string; fieldErrors: Record<string, string> }> | null;
        if (body && typeof body.error === 'string') return { ok: false, error: body.error, fieldErrors: body.fieldErrors };
        return { ok: false, error: e.status === 0 ? 'Network error. Check your connection and try again.' : 'Something went wrong. Please try again.' };
      }
      return { ok: false, error: 'Something went wrong. Please try again.' };
    }
  }
}
