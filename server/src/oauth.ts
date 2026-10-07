import { Router } from 'express';
import { db, now } from './db.js';
import { randomToken, signPayload, verifyPayload } from './crypto.js';
import { getSessionUser } from './auth.js';
import { saveChannel } from './channels.js';
import { isConfigured } from './settings.js';
import { baseUrl } from './util.js';
import * as tiktok from './providers/tiktok.js';
import * as instagram from './providers/instagram.js';

const router = Router();

const providers: Record<string, {
  authUrl: (state: string, redirect: string) => string;
  complete: (code: string, redirect: string) => Promise<any>;
}> = {
  tiktok: {
    authUrl: tiktok.authUrl,
    complete: async (code, redirect) => {
      const t = await tiktok.exchangeCode(code, redirect);
      return { ...t, displayName: await tiktok.displayName(t.accessToken) };
    },
  },
  instagram: {
    authUrl: instagram.authUrl,
    complete: (code, redirect) => instagram.exchangeCode(code, redirect),
  },
};

const redirectUri = (req: any, platform: string) => `${baseUrl(req)}/auth/${platform}/callback`;
const back = (invite: string | null | undefined, q: string) => (invite ? `/connect/${invite}?${q}` : `/artistas?${q}`);

router.get('/:platform', (req: any, res: any) => {
  const platform = req.params.platform;
  const p = providers[platform];
  if (!p) return res.status(404).send('Plataforma inválida.');

  let artistId: number;
  let invite: string | null = null;
  if (req.query.invite) {
    const inv: any = db.prepare('SELECT * FROM invites WHERE token=?').get(String(req.query.invite));
    if (!inv || inv.expires_at < now()) return res.status(400).send('Link de conexão inválido ou expirado.');
    artistId = inv.artist_id;
    invite = inv.token;
  } else {
    const u = getSessionUser(req);
    if (!u || u.role !== 'team') return res.status(401).send('Entre como time para conectar contas.');
    artistId = Number(req.query.artistId);
    if (!db.prepare('SELECT 1 FROM artists WHERE id=?').get(artistId)) return res.status(400).send('Artista não encontrado.');
  }

  if (!isConfigured(platform as any)) {
    return res.redirect(back(invite, 'error=' + encodeURIComponent('Integração não configurada. Peça ao time para preencher em Integrações.')));
  }
  const state = signPayload({ a: artistId, i: invite, n: randomToken(8), exp: now() + 15 * 60e3 });
  res.redirect(p.authUrl(state, redirectUri(req, platform)));
});

router.get('/:platform/callback', async (req: any, res: any) => {
  const platform = req.params.platform;
  const p = providers[platform];
  if (!p) return res.status(404).send('Plataforma inválida.');
  const st = verifyPayload(String(req.query.state || ''));
  if (!st) return res.status(400).send('Sessão de conexão inválida ou expirada. Volte e tente conectar de novo.');
  if (req.query.error) {
    return res.redirect(back(st.i, 'error=' + encodeURIComponent(String(req.query.error_description || req.query.error))));
  }
  try {
    const ch = await p.complete(String(req.query.code || ''), redirectUri(req, platform));
    saveChannel({ artistId: st.a, platform, ...ch });
    res.redirect(back(st.i, 'ok=' + platform));
  } catch (e: any) {
    console.error(`[oauth] ${platform}:`, e.message);
    res.redirect(back(st.i, 'error=' + encodeURIComponent(String(e.message).slice(0, 200))));
  }
});

export default router;
