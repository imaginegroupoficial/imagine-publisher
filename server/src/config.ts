import path from 'node:path';
import fs from 'node:fs';

export const APP_SECRET = process.env.APP_SECRET || '';
if (APP_SECRET.length < 16) {
  console.error('APP_SECRET ausente ou curto demais (mínimo 16 caracteres).');
  process.exit(1);
}
export const PORT = Number(process.env.PORT || 3005);
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const WEB_DIR = process.env.WEB_DIR || path.resolve('public');
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 500);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
fs.mkdirSync(MEDIA_DIR, { recursive: true });
