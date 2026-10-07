import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { db, now } from './db.js';
import { MEDIA_DIR, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from './config.js';
import { randomToken } from './crypto.js';
import {
  hashPassword, verifyPassword, issueSession, clearSession, requireAuth, requireTeam,
  canAccessArtist, publicUser, loginAllowed, loginFailed, loginOk, getSessionUser,
} from './auth.js';
import { listChannelsPublic, removeChannel, getChannel } from './channels.js';
import { integrationsView, saveIntegrations, isConfigured } from './settings.js';
import { tick } from './scheduler.js';
import { cleanupMedia, mediaPath, removeMediaFile } from './media.js';
import { baseUrl } from './util.js';
import { PUBLIC_BASE_URL } from './config.js';

const router = Router();
const wrap = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- status, setup e sessao ----------
router.get('/status', (_req, res) => {
  const n = (db.prepare('SELECT COUNT(*) c FROM users').get() as any).c;
  res.json({ needsSetup: n === 0 });
});

router.post('/setup', wrap(async (req: any, res: any) => {
  const n = (db.prepare('SELECT COUNT(*) c FROM users').get() as any).c;
  if (n > 0) return res.status(403).json({ error: 'A configuração inicial já foi feita.' });
  const { name, email, password } = req.body || {};
  if (!name || !EMAIL.test(email || '') || String(password || '').length < 8)
    return res.status(400).json({ error: 'Informe nome, email válido e senha com no mínimo 8 caracteres.' });
  const info = db.prepare(`INSERT INTO users(email,password_hash,name,role,created_at) VALUES(?,?,?,'team',?)`)
    .run(email.toLowerCase().trim(), await hashPassword(password), String(name).trim(), now());
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  issueSession(res, user);
  res.json(publicUser(user));
}));

router.post('/login', wrap(async (req: any, res: any) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const key = `${req.ip}|${email}`;
  if (!loginAllowed(key)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  const user: any = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !(await verifyPassword(String(req.body?.password || ''), user.password_hash))) {
    loginFailed(key);
    return res.status(401).json({ error: 'Email ou senha inválidos.' });
  }
  loginOk(key);
  issueSession(res, user);
  res.json(publicUser(user));
}));

router.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
router.get('/me', requireAuth, (req: any, res) => res.json(publicUser(req.user)));

// ---------- artistas ----------
const artistView = (a: any, team: boolean) => ({
  ...a,
  channels: listChannelsPublic(a.id),
  users: team ? db.prepare('SELECT id,email,name FROM users WHERE artist_id=?').all(a.id) : undefined,
});

router.get('/artists', requireAuth, (req: any, res) => {
  const u = req.user;
  const rows: any[] = u.role === 'team'
    ? db.prepare('SELECT * FROM artists ORDER BY name').all()
    : db.prepare('SELECT * FROM artists WHERE id=?').all(u.artist_id);
  res.json(rows.map((a) => artistView(a, u.role === 'team')));
});

function createArtistUser(artistId: number, name: string, email: string, passwordHash: string) {
  db.prepare(`INSERT INTO users(email,password_hash,name,role,artist_id,created_at) VALUES(?,?,?,'artist',?,?)`)
    .run(email.toLowerCase().trim(), passwordHash, name, artistId, now());
}

router.post('/artists', requireAuth, requireTeam, wrap(async (req: any, res: any) => {
  const { name, email, password } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Informe o nome do artista.' });
  if (email || password) {
    if (!EMAIL.test(email || '') || String(password || '').length < 8)
      return res.status(400).json({ error: 'Para criar o acesso, informe email válido e senha com no mínimo 8 caracteres.' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(String(email).toLowerCase().trim()))
      return res.status(409).json({ error: 'Já existe um usuário com esse email.' });
  }
  const hash = email ? await hashPassword(password) : '';
  const id = db.transaction(() => {
    const info = db.prepare('INSERT INTO artists(name,created_at) VALUES(?,?)').run(String(name).trim(), now());
    const artistId = Number(info.lastInsertRowid);
    if (email) createArtistUser(artistId, String(name).trim(), email, hash);
    return artistId;
  })();
  res.status(201).json(artistView(db.prepare('SELECT * FROM artists WHERE id=?').get(id), true));
}));

router.post('/artists/:id/users', requireAuth, requireTeam, wrap(async (req: any, res: any) => {
  const artistId = Number(req.params.id);
  const { name, email, password } = req.body || {};
  if (!db.prepare('SELECT 1 FROM artists WHERE id=?').get(artistId)) return res.status(404).json({ error: 'Artista não encontrado.' });
  if (!name || !EMAIL.test(email || '') || String(password || '').length < 8)
    return res.status(400).json({ error: 'Informe nome, email válido e senha com no mínimo 8 caracteres.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(String(email).toLowerCase().trim()))
    return res.status(409).json({ error: 'Já existe um usuário com esse email.' });
  createArtistUser(artistId, String(name).trim(), email, await hashPassword(password));
  res.status(201).json({ ok: true });
}));

router.delete('/users/:id', requireAuth, requireTeam, (req: any, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Você não pode remover o próprio acesso.' });
  db.prepare(`DELETE FROM users WHERE id=? AND role='artist'`).run(id);
  res.json({ ok: true });
});

router.post('/artists/:id/invite', requireAuth, requireTeam, (req: any, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM artists WHERE id=?').get(id)) return res.status(404).json({ error: 'Artista não encontrado.' });
  const token = randomToken(16);
  const expires = now() + 14 * 864e5;
  db.prepare('INSERT INTO invites(token,artist_id,expires_at,created_at) VALUES(?,?,?,?)').run(token, id, expires, now());
  res.json({ url: `${baseUrl(req)}/connect/${token}`, expires_at: expires });
});

router.delete('/artists/:id/channels/:platform', requireAuth, requireTeam, (req: any, res) => {
  removeChannel(Number(req.params.id), String(req.params.platform));
  res.json({ ok: true });
});

router.delete('/artists/:id', requireAuth, requireTeam, (req: any, res) => {
  const id = Number(req.params.id);
  const posts = db.prepare('SELECT media_file FROM posts WHERE artist_id=?').all(id) as any[];
  posts.forEach((p) => removeMediaFile(p.media_file));
  db.prepare('DELETE FROM artists WHERE id=?').run(id);
  res.json({ ok: true });
});

// Pagina publica de conexao (link de convite)
router.get('/invites/:token', (req: any, res) => {
  const inv: any = db.prepare('SELECT * FROM invites WHERE token=?').get(req.params.token);
  if (!inv || inv.expires_at < now()) return res.status(404).json({ error: 'Link inválido ou expirado.' });
  const artist: any = db.prepare('SELECT * FROM artists WHERE id=?').get(inv.artist_id);
  res.json({
    artist: { name: artist.name },
    channels: listChannelsPublic(artist.id).map((c: any) => ({ platform: c.platform, display_name: c.display_name })),
    configured: { tiktok: isConfigured('tiktok'), instagram: isConfigured('instagram') },
  });
});

// ---------- integracoes ----------
router.get('/integrations', requireAuth, requireTeam, (req: any, res) => res.json(integrationsView(baseUrl(req))));
router.put('/integrations', requireAuth, requireTeam, (req: any, res) => {
  saveIntegrations(req.body);
  res.json(integrationsView(baseUrl(req)));
});

// ---------- posts ----------
const upload = multer({
  storage: multer.diskStorage({ destination: MEDIA_DIR, filename: (_r, _f, cb) => cb(null, randomToken(12) + '.mp4') }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_r, f, cb) => {
    const ok = /\.mp4$/i.test(f.originalname) || ['video/mp4', 'application/mp4', 'application/octet-stream'].includes(f.mimetype);
    ok ? cb(null, true) : cb(new Error('Envie um arquivo MP4.'));
  },
});

const MODES: Record<string, string[]> = { tiktok: ['draft'], instagram: ['manual', 'direct'], youtube: ['manual'] };

router.post('/posts', requireAuth, upload.single('video'), (req: any, res: any) => {
  const file = req.file;
  const fail = (code: number, msg: string) => { if (file) fs.unlink(file.path, () => {}); return res.status(code).json({ error: msg }); };
  const user = req.user;
  if (!file) return fail(400, 'Envie o vídeo em MP4.');

  const artistId = user.role === 'artist' ? user.artist_id : Number(req.body.artistId);
  const artist: any = artistId ? db.prepare('SELECT * FROM artists WHERE id=?').get(artistId) : null;
  if (!artist || !canAccessArtist(user, artist.id)) return fail(400, 'Artista inválido.');

  let deliveries: Array<{ platform: string; mode: string }>;
  try { deliveries = JSON.parse(req.body.deliveries || '[]'); } catch { return fail(400, 'Campo deliveries inválido.'); }
  if (!Array.isArray(deliveries) || deliveries.length === 0) return fail(400, 'Selecione ao menos uma plataforma.');
  const seen = new Set<string>();
  for (const d of deliveries) {
    if (!MODES[d.platform] || !MODES[d.platform].includes(d.mode) || seen.has(d.platform)) return fail(400, 'Plataforma ou modo inválido.');
    seen.add(d.platform);
    if (d.platform === 'tiktok' && !getChannel(artist.id, 'tiktok')) return fail(400, 'Conecte o TikTok deste artista antes de enviar.');
    if (d.platform === 'instagram' && d.mode === 'direct') {
      if (!getChannel(artist.id, 'instagram')) return fail(400, 'Conecte o Instagram deste artista para publicar direto.');
      if (!PUBLIC_BASE_URL) return fail(400, 'PUBLIC_BASE_URL não está configurada no servidor.');
    }
  }

  const scheduledAt = Number(req.body.scheduledAt) > 0 ? Number(req.body.scheduledAt) : null;
  const runAt = scheduledAt && scheduledAt > now() ? scheduledAt : now();
  const d0 = new Date(scheduledAt || now());
  const title = String(req.body.title || '').trim() ||
    `${artist.name} ${String(d0.getDate()).padStart(2, '0')}/${String(d0.getMonth() + 1).padStart(2, '0')}`;

  const postId = db.transaction(() => {
    const info = db.prepare(`INSERT INTO posts(artist_id,title,caption,audio_name,location,scheduled_at,media_file,media_token,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(artist.id, title, req.body.caption || null, req.body.audioName || null,
      req.body.location || null, scheduledAt, file.filename, randomToken(16), user.id, now());
    const id = Number(info.lastInsertRowid);
    for (const d of deliveries) {
      const auto = d.mode !== 'manual';
      db.prepare(`INSERT INTO deliveries(post_id,platform,mode,status,run_at,updated_at) VALUES(?,?,?,?,?,?)`)
        .run(id, d.platform, d.mode, auto ? 'scheduled' : 'awaiting_finalize', auto ? runAt : null, now());
    }
    return id;
  })();

  setImmediate(() => tick().catch(() => {}));
  res.status(201).json({ id: postId });
});

function loadPosts(user: any, opts: { artistId?: number; from?: number; to?: number }) {
  const conds: string[] = [];
  const params: any[] = [];
  const scope = user.role === 'artist' ? user.artist_id : opts.artistId;
  if (scope) { conds.push('p.artist_id=?'); params.push(scope); }
  if (opts.from !== undefined) { conds.push('p.scheduled_at>=? AND p.scheduled_at<?'); params.push(opts.from, opts.to); }
  const posts = db.prepare(`SELECT p.*, a.name AS artist_name FROM posts p JOIN artists a ON a.id=p.artist_id
    ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY p.created_at DESC LIMIT 300`).all(...params) as any[];
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const dels = db.prepare(`SELECT id,post_id,platform,mode,status,error,attempts,external_id FROM deliveries
    WHERE post_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids) as any[];
  return posts.map((p) => ({
    id: p.id, artist_id: p.artist_id, artist_name: p.artist_name, title: p.title, caption: p.caption,
    audio_name: p.audio_name, location: p.location, scheduled_at: p.scheduled_at, created_at: p.created_at,
    has_media: !!p.media_file && !!mediaPath(p.media_file),
    deliveries: dels.filter((d) => d.post_id === p.id),
  }));
}

router.get('/posts', requireAuth, (req: any, res) => {
  const tab = String(req.query.tab || 'pending');
  const artistId = req.query.artistId ? Number(req.query.artistId) : undefined;
  const all = loadPosts(req.user, { artistId });
  const has = (p: any, s: string[]) => p.deliveries.some((d: any) => s.includes(d.status));
  let out: any[];
  if (tab === 'pending') out = all.filter((p) => has(p, ['awaiting_finalize', 'failed']));
  else if (tab === 'scheduled') out = all.filter((p) => has(p, ['scheduled', 'processing']) && !has(p, ['awaiting_finalize', 'failed']));
  else out = all.filter((p) => p.deliveries.every((d: any) => d.status === 'published'));
  const key = (p: any) => p.scheduled_at ?? p.created_at;
  out.sort((a, b) => (tab === 'done' ? key(b) - key(a) : key(a) - key(b)));
  res.json(out);
});

router.get('/calendar', requireAuth, (req: any, res) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ''));
  if (!m) return res.status(400).json({ error: 'Informe month no formato AAAA-MM.' });
  const y = Number(m[1]), mo = Number(m[2]);
  const off = Number(req.query.offset) || 0; // minutos, igual a Date.getTimezoneOffset()
  const from = Date.UTC(y, mo - 1, 1) + off * 60000, to = Date.UTC(y, mo, 1) + off * 60000;
  const artistId = req.query.artistId ? Number(req.query.artistId) : undefined;
  res.json(loadPosts(req.user, { artistId, from, to }));
});

function ownedPost(req: any, res: any, postId: number) {
  const p: any = db.prepare('SELECT * FROM posts WHERE id=?').get(postId);
  if (!p || !canAccessArtist(req.user, p.artist_id)) { res.status(404).json({ error: 'Post não encontrado.' }); return null; }
  return p;
}

router.get('/posts/:id/media', requireAuth, (req: any, res: any) => {
  const p = ownedPost(req, res, Number(req.params.id));
  if (!p) return;
  const file = mediaPath(p.media_file);
  if (!file) return res.status(404).json({ error: 'O vídeo já foi removido (todas as plataformas publicadas).' });
  const name = String(p.title || 'video').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'video';
  res.download(file, `${name}.mp4`);
});

router.delete('/posts/:id', requireAuth, (req: any, res: any) => {
  const p = ownedPost(req, res, Number(req.params.id));
  if (!p) return;
  removeMediaFile(p.media_file);
  db.prepare('DELETE FROM posts WHERE id=?').run(p.id);
  res.json({ ok: true });
});

function ownedDelivery(req: any, res: any) {
  const d: any = db.prepare('SELECT d.*, p.artist_id FROM deliveries d JOIN posts p ON p.id=d.post_id WHERE d.id=?').get(Number(req.params.id));
  if (!d || !canAccessArtist(req.user, d.artist_id)) { res.status(404).json({ error: 'Entrega não encontrada.' }); return null; }
  return d;
}

router.post('/deliveries/:id/finalize', requireAuth, (req: any, res: any) => {
  const d = ownedDelivery(req, res);
  if (!d) return;
  if (d.status !== 'awaiting_finalize') return res.status(400).json({ error: 'Esta entrega não está aguardando finalização.' });
  db.prepare(`UPDATE deliveries SET status='published', updated_at=? WHERE id=?`).run(now(), d.id);
  cleanupMedia(d.post_id);
  res.json({ ok: true });
});

router.post('/deliveries/:id/retry', requireAuth, (req: any, res: any) => {
  const d = ownedDelivery(req, res);
  if (!d) return;
  if (d.status !== 'failed') return res.status(400).json({ error: 'Só é possível tentar de novo uma entrega que falhou.' });
  db.prepare(`UPDATE deliveries SET status='scheduled', run_at=?, attempts=0, error=NULL, updated_at=? WHERE id=?`).run(now(), now(), d.id);
  setImmediate(() => tick().catch(() => {}));
  res.json({ ok: true });
});

void MAX_UPLOAD_MB; void getSessionUser;
export default router;
