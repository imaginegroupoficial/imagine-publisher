import fs from 'node:fs';
import { Readable } from 'node:stream';
import { getSetting } from '../settings.js';
import { PermanentError } from '../errors.js';

const API = process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com';

function creds() {
  const key = getSetting('tiktok.client_key'), secret = getSetting('tiktok.client_secret');
  if (!key || !secret) throw new PermanentError('Credenciais do TikTok não configuradas em Integrações.');
  return { key, secret };
}

export function authUrl(state: string, redirectUri: string) {
  const { key } = creds();
  const p = new URLSearchParams({
    client_key: key, scope: 'user.info.basic,video.upload', response_type: 'code',
    redirect_uri: redirectUri, state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

async function tokenCall(params: Record<string, string>) {
  const { key, secret } = creds();
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok || d.error || !d.access_token) {
    throw new Error(`TikTok recusou o token: ${d.error_description || d.error || res.status}`);
  }
  const t = Date.now();
  return {
    externalId: d.open_id as string, accessToken: d.access_token as string,
    refreshToken: d.refresh_token as string,
    expiresAt: t + d.expires_in * 1000, refreshExpiresAt: t + (d.refresh_expires_in || 0) * 1000,
  };
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
export const refresh = (refreshToken: string) =>
  tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken });

export async function displayName(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/v2/user/info/?fields=open_id,display_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d: any = await r.json();
    return d?.data?.user?.display_name || null;
  } catch { return null; }
}

// Envia o MP4 para a caixa de entrada do TikTok (rascunho), em streaming direto do disco.
export async function uploadDraft(accessToken: string, filePath: string): Promise<string> {
  const size = fs.statSync(filePath).size;
  const init = await fetch(`${API}/v2/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 } }),
  });
  const d: any = await init.json().catch(() => ({}));
  if (!init.ok || d.error?.code !== 'ok') {
    const code = d.error?.code || init.status;
    const msg = `TikTok recusou o envio (${code}): ${d.error?.message || ''}`;
    if (['access_token_invalid', 'scope_not_authorized'].includes(code)) throw new PermanentError(msg);
    throw new Error(msg);
  }
  const { publish_id, upload_url } = d.data;
  const body = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
  const put = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body,
    // @ts-expect-error duplex e exigido pelo fetch nativo para corpo em streaming
    duplex: 'half',
  });
  if (!put.ok) throw new Error(`Falha ao enviar o vídeo ao TikTok: ${put.status} ${await put.text()}`);
  return publish_id as string;
}

export async function inboxStatus(accessToken: string, publishId: string) {
  const r = await fetch(`${API}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const d: any = await r.json().catch(() => ({}));
  return { status: d?.data?.status as string | undefined, failReason: d?.data?.fail_reason as string | undefined };
}
