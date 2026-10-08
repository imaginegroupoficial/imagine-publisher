import { db, now } from './db.js';
import { enc, dec } from './crypto.js';

const DEFS: Record<string, { env: string }> = {
  'tiktok.client_key': { env: 'TIKTOK_CLIENT_KEY' },
  'tiktok.client_secret': { env: 'TIKTOK_CLIENT_SECRET' },
  'instagram.app_id': { env: 'INSTAGRAM_APP_ID' },
  'instagram.app_secret': { env: 'INSTAGRAM_APP_SECRET' },
  'google.client_id': { env: 'GOOGLE_CLIENT_ID' },
  'google.client_secret': { env: 'GOOGLE_CLIENT_SECRET' },
};

export function getSetting(key: string): string {
  const row = db.prepare('SELECT value_enc FROM settings WHERE key=?').get(key) as any;
  if (row) { try { return dec(row.value_enc); } catch { return ''; } }
  return process.env[DEFS[key]?.env] || '';
}

function setSetting(key: string, value: string) {
  db.prepare(`INSERT INTO settings(key,value_enc,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value_enc=excluded.value_enc, updated_at=excluded.updated_at`)
    .run(key, enc(value), now());
}

export function saveIntegrations(body: any) {
  for (const key of Object.keys(DEFS)) {
    const [plat, field] = key.split('.');
    const val = body?.[plat]?.[field];
    if (typeof val === 'string' && val.trim() !== '') setSetting(key, val.trim());
  }
}

export const isConfigured = (platform: 'tiktok' | 'instagram' | 'youtube') =>
  platform === 'tiktok'
    ? !!(getSetting('tiktok.client_key') && getSetting('tiktok.client_secret'))
    : platform === 'instagram'
      ? !!(getSetting('instagram.app_id') && getSetting('instagram.app_secret'))
      : !!(getSetting('google.client_id') && getSetting('google.client_secret'));

export function integrationsView(base: string) {
  return {
    base_url: base,
    tiktok: {
      configured: isConfigured('tiktok'),
      client_key: getSetting('tiktok.client_key'),
      has_secret: !!getSetting('tiktok.client_secret'),
      redirect_uri: `${base}/auth/tiktok/callback`,
    },
    instagram: {
      configured: isConfigured('instagram'),
      app_id: getSetting('instagram.app_id'),
      has_secret: !!getSetting('instagram.app_secret'),
      redirect_uri: `${base}/auth/instagram/callback`,
    },
    youtube: {
      configured: isConfigured('youtube'),
      client_id: getSetting('google.client_id'),
      has_secret: !!getSetting('google.client_secret'),
      redirect_uri: `${base}/auth/youtube/callback`,
    },
  };
}
