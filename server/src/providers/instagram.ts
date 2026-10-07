import { getSetting } from '../settings.js';
import { PermanentError } from '../errors.js';

const OAUTH = process.env.IG_OAUTH_BASE || 'https://api.instagram.com';
const GRAPH = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com';
const VER = process.env.IG_API_VERSION || 'v23.0';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function creds() {
  const id = getSetting('instagram.app_id'), secret = getSetting('instagram.app_secret');
  if (!id || !secret) throw new PermanentError('Credenciais do Instagram não configuradas em Integrações.');
  return { id, secret };
}

export function authUrl(state: string, redirectUri: string) {
  const { id } = creds();
  const p = new URLSearchParams({
    client_id: id, redirect_uri: redirectUri, response_type: 'code', state,
    scope: 'instagram_business_basic,instagram_business_content_publish',
  });
  return `${OAUTH}/oauth/authorize?${p}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = creds();
  const r = await fetch(`${OAUTH}/oauth/access_token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  });
  const raw: any = await r.json().catch(() => ({}));
  const short = raw?.data?.[0] ?? raw; // a Meta devolve em formatos diferentes conforme a versao
  if (!r.ok || !short.access_token) throw new Error(`Instagram recusou o código: ${raw?.error_message || raw?.error?.message || r.status}`);

  const lr = await fetch(`${GRAPH}/access_token?` + new URLSearchParams({
    grant_type: 'ig_exchange_token', client_secret: secret, access_token: short.access_token }));
  const long: any = await lr.json().catch(() => ({}));
  if (!lr.ok || !long.access_token) throw new Error(`Instagram não gerou token longo: ${long?.error?.message || lr.status}`);

  let username: string | null = null;
  try {
    const mr = await fetch(`${GRAPH}/me?` + new URLSearchParams({ fields: 'user_id,username', access_token: long.access_token }));
    const m: any = await mr.json();
    username = m?.username || null;
  } catch { /* nome e opcional */ }

  return {
    externalId: String(short.user_id), displayName: username, accessToken: long.access_token as string,
    expiresAt: Date.now() + (long.expires_in || 5184000) * 1000,
  };
}

export async function refresh(accessToken: string) {
  const r = await fetch(`${GRAPH}/refresh_access_token?` + new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken }));
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Falha ao renovar token do Instagram: ${d?.error?.message || r.status}`);
  return { accessToken: d.access_token as string, expiresAt: Date.now() + (d.expires_in || 5184000) * 1000 };
}

// Publica um Reel direto: cria container (o Instagram busca o video na URL), espera processar e publica.
export async function publishReel(p: { accessToken: string; igUserId: string; videoUrl: string; caption: string }) {
  const c = await fetch(`${GRAPH}/${VER}/${p.igUserId}/media?` + new URLSearchParams({
    media_type: 'REELS', video_url: p.videoUrl, caption: p.caption, access_token: p.accessToken }), { method: 'POST' });
  const cd: any = await c.json().catch(() => ({}));
  if (!c.ok || !cd.id) throw new Error(`Instagram recusou o container: ${cd?.error?.message || c.status}`);

  for (let i = 0; i < 60; i++) {
    const s = await fetch(`${GRAPH}/${VER}/${cd.id}?` + new URLSearchParams({ fields: 'status_code', access_token: p.accessToken }));
    const sd: any = await s.json().catch(() => ({}));
    if (sd.status_code === 'FINISHED') break;
    if (sd.status_code === 'ERROR' || sd.status_code === 'EXPIRED') throw new Error(`Instagram falhou ao processar o vídeo (${sd.status_code}).`);
    if (i === 59) throw new Error('Tempo esgotado esperando o Instagram processar o vídeo.');
    await sleep(5000);
  }

  const pub = await fetch(`${GRAPH}/${VER}/${p.igUserId}/media_publish?` + new URLSearchParams({
    creation_id: cd.id, access_token: p.accessToken }), { method: 'POST' });
  const pd: any = await pub.json().catch(() => ({}));
  if (!pub.ok || !pd.id) throw new Error(`Instagram recusou a publicação: ${pd?.error?.message || pub.status}`);
  return pd.id as string;
}
