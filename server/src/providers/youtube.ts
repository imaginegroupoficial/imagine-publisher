import fs from 'node:fs';
import { Readable } from 'node:stream';
import { getSetting } from '../settings.js';
import { PermanentError } from '../errors.js';

const OAUTH = process.env.GOOGLE_OAUTH_BASE || 'https://accounts.google.com';
const TOKEN = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const USERINFO = process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo';
const API = process.env.YT_UPLOAD_BASE || 'https://www.googleapis.com';

function creds() {
  const id = getSetting('google.client_id'), secret = getSetting('google.client_secret');
  if (!id || !secret) throw new PermanentError('Credenciais do Google não configuradas em Integrações.');
  return { id, secret };
}

export function authUrl(state: string, redirectUri: string) {
  const { id } = creds();
  const p = new URLSearchParams({
    client_id: id, redirect_uri: redirectUri, response_type: 'code', state,
    scope: 'https://www.googleapis.com/auth/youtube.upload openid email',
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  });
  return `${OAUTH}/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(params: Record<string, string>) {
  const { id, secret } = creds();
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) {
    if (d.error === 'invalid_grant') {
      throw new PermanentError('O acesso do YouTube expirou ou foi revogado. Reconecte a conta (apps do Google em modo de teste expiram a cada 7 dias).');
    }
    throw new Error(`Google recusou o token: ${d.error_description || d.error || res.status}`);
  }
  return {
    accessToken: d.access_token as string,
    refreshToken: d.refresh_token as string | undefined,
    expiresAt: Date.now() + (d.expires_in || 3600) * 1000,
  };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  if (!t.refreshToken) throw new Error('O Google não devolveu o token de renovação. Remova o acesso do app na conta Google e conecte de novo.');
  let displayName: string | null = null;
  try {
    const r = await fetch(USERINFO, { headers: { Authorization: `Bearer ${t.accessToken}` } });
    const u: any = await r.json();
    displayName = u.email || u.name || null;
  } catch { /* nome é opcional */ }
  return { ...t, displayName, externalId: null };
}

export const refresh = (refreshToken: string) => tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken });

const clean = (s: string) => s.replace(/[<>]/g, '');

// Envia o vídeo como YouTube Short (mesmo endpoint de upload comum; vertical e curto vira Short).
export async function uploadShort(p: { accessToken: string; filePath: string; title: string; description: string; privacy: string }) {
  const size = fs.statSync(p.filePath).size;
  const title = clean(p.title).trim().slice(0, 100);
  let description = clean(p.description).trim();
  if (!/#shorts/i.test(description) && !/#shorts/i.test(title)) description = `${description}\n\n#Shorts`.trim();

  const init = await fetch(`${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: { title, description, categoryId: '10' },
      status: { privacyStatus: p.privacy, selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) {
    const d: any = await init.json().catch(() => ({}));
    const reason = d?.error?.errors?.[0]?.reason;
    const msg = `YouTube recusou o envio (${reason || init.status}): ${d?.error?.message || ''}`;
    const permanent = ['quotaExceeded', 'uploadLimitExceeded', 'forbidden', 'authError', 'invalidTitle', 'invalidDescription'];
    if (permanent.includes(reason) || init.status === 401 || init.status === 403) throw new PermanentError(msg);
    throw new Error(msg);
  }
  const location = init.headers.get('location');
  if (!location) throw new Error('O YouTube não devolveu o endereço de envio.');

  const put = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: Readable.toWeb(fs.createReadStream(p.filePath)) as unknown as ReadableStream,
    // @ts-expect-error duplex é exigido pelo fetch nativo para corpo em streaming
    duplex: 'half',
  });
  const d: any = await put.json().catch(() => ({}));
  if (!put.ok || !d.id) throw new Error(`Falha ao enviar o vídeo ao YouTube: ${d?.error?.message || put.status}`);
  return { videoId: d.id as string, privacy: (d.status?.privacyStatus || p.privacy) as string };
}
