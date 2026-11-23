import { randomUUID } from 'node:crypto';
import { serviceClient as createServiceClient } from './supabase';

const MAX_BYTES = 5 * 1024 * 1024;

/** Detects the real image type from magic bytes — the browser-provided MIME type is not trusted. */
export function sniffImageType(buf: Uint8Array): { mime: string; ext: string } | null {
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand.startsWith('avif') || brand === 'avis') return { mime: 'image/avif', ext: 'avif' };
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}

export class UploadError extends Error {}

/** Shape of a multer in-memory file. */
export interface UploadFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export async function uploadImage(
  bucket: 'product-images' | 'banners' | 'custom-request-photos',
  file: UploadFile,
  folder: string,
  opts: { allowHeic?: boolean } = {},
): Promise<{ path: string; publicUrl: string | null }> {
  if (!file?.buffer || file.size === 0) throw new UploadError('Empty file.');
  const name = file.originalname.slice(0, 60);
  if (file.size > MAX_BYTES) throw new UploadError(`${name}: images must be 5 MB or smaller.`);
  const bytes = new Uint8Array(file.buffer);
  const type = sniffImageType(bytes);
  if (!type || (type.mime === 'image/heic' && !opts.allowHeic)) {
    throw new UploadError(`${name}: only JPG, PNG, WEBP${opts.allowHeic ? ', HEIC' : ''} or AVIF images are allowed.`);
  }
  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 80);
  const path = `${safeFolder}/${randomUUID()}.${type.ext}`;
  const svc = createServiceClient();
  const { error } = await svc.storage.from(bucket).upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: '31536000' });
  if (error) throw new UploadError('Upload failed. Please try again.');
  const publicUrl = bucket === 'custom-request-photos' ? null : svc.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return { path, publicUrl };
}

export async function removeStorageObjects(bucket: string, paths: string[]) {
  if (!paths.length) return;
  await createServiceClient().storage.from(bucket).remove(paths);
}

export async function signedUrls(bucket: string, paths: string[], seconds = 600): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await createServiceClient().storage.from(bucket).createSignedUrls(paths, seconds);
  return (data ?? []).map((d) => d.signedUrl ?? '').filter(Boolean);
}
