import { db, now } from './db.js';
import { PUBLIC_BASE_URL } from './config.js';
import { PermanentError } from './errors.js';
import { freshToken, getChannel } from './channels.js';
import { mediaPath, cleanupMedia } from './media.js';
import * as tiktok from './providers/tiktok.js';
import * as instagram from './providers/instagram.js';

let running = false;

async function execute(d: any) {
  if (d.platform === 'tiktok' && d.mode === 'draft') {
    const { accessToken } = await freshToken(d.artist_id, 'tiktok');
    const file = mediaPath(d.media_file);
    if (!file) throw new PermanentError('Arquivo de vídeo não encontrado.');
    const publishId = await tiktok.uploadDraft(accessToken, file);
    db.prepare(`UPDATE deliveries SET status='awaiting_finalize', external_id=?, error=NULL, verified=0, updated_at=? WHERE id=?`)
      .run(publishId, now(), d.id);
    return;
  }
  if (d.platform === 'instagram' && d.mode === 'direct') {
    if (!PUBLIC_BASE_URL) throw new PermanentError('PUBLIC_BASE_URL não configurada.');
    if (!d.media_file || !d.media_token || !mediaPath(d.media_file)) throw new PermanentError('Arquivo de vídeo não encontrado.');
    const { accessToken, externalId } = await freshToken(d.artist_id, 'instagram');
    const mediaId = await instagram.publishReel({
      accessToken, igUserId: externalId, videoUrl: `${PUBLIC_BASE_URL}/m/${d.media_token}.mp4`, caption: d.caption || '',
    });
    db.prepare(`UPDATE deliveries SET status='published', external_id=?, error=NULL, updated_at=? WHERE id=?`).run(mediaId, now(), d.id);
    cleanupMedia(d.post_id);
    return;
  }
  throw new PermanentError(`Modo não suportado: ${d.platform}/${d.mode}`);
}

function handleFailure(d: any, e: any) {
  const attempts = d.attempts + 1;
  const msg = String(e?.message || e).slice(0, 500);
  if (e instanceof PermanentError || attempts >= 3) {
    db.prepare(`UPDATE deliveries SET status='failed', error=?, attempts=?, updated_at=? WHERE id=?`).run(msg, attempts, now(), d.id);
  } else {
    db.prepare(`UPDATE deliveries SET status='scheduled', error=?, attempts=?, run_at=?, updated_at=? WHERE id=?`)
      .run(msg, attempts, now() + attempts * 60e3, now(), d.id);
  }
  console.error(`[worker] entrega ${d.id} (${d.platform}) falhou (tentativa ${attempts}): ${msg}`);
}

export async function tick() {
  if (running) return;
  running = true;
  try {
    const due = db.prepare(`SELECT d.*, p.artist_id, p.caption, p.media_file, p.media_token
      FROM deliveries d JOIN posts p ON p.id=d.post_id
      WHERE d.status='scheduled' AND d.run_at<=? ORDER BY d.run_at LIMIT 20`).all(now()) as any[];
    for (const d of due) {
      const claimed = db.prepare(`UPDATE deliveries SET status='processing', updated_at=? WHERE id=? AND status='scheduled'`).run(now(), d.id).changes;
      if (!claimed) continue;
      try { await execute(d); } catch (e) { handleFailure(d, e); }
    }
  } finally { running = false; }
}

// Confere se os rascunhos do TikTok realmente chegaram na caixa de entrada.
async function verifyInbox() {
  const rows = db.prepare(`SELECT d.*, p.artist_id FROM deliveries d JOIN posts p ON p.id=d.post_id
    WHERE d.platform='tiktok' AND d.status='awaiting_finalize' AND d.verified=0 AND d.external_id IS NOT NULL
      AND d.updated_at<? AND d.updated_at>?`).all(now() - 20e3, now() - 30 * 60e3) as any[];
  for (const d of rows) {
    try {
      const { accessToken } = await freshToken(d.artist_id, 'tiktok');
      const s = await tiktok.inboxStatus(accessToken, d.external_id);
      if (s.status === 'SEND_TO_USER_INBOX') db.prepare('UPDATE deliveries SET verified=1 WHERE id=?').run(d.id);
      else if (s.status === 'FAILED') {
        db.prepare(`UPDATE deliveries SET status='failed', error=?, updated_at=? WHERE id=?`)
          .run(`TikTok recusou o rascunho: ${s.failReason || 'sem motivo informado'}`, now(), d.id);
      }
    } catch (e: any) { console.error('[worker] verificacao TikTok:', e.message); }
  }
}

// Renova tokens do Instagram que vencem em breve, mesmo sem posts novos.
async function refreshSweep() {
  const rows = db.prepare(`SELECT artist_id FROM channels WHERE platform='instagram' AND expires_at<?`).all(now() + 10 * 864e5) as any[];
  for (const r of rows) {
    try { if (getChannel(r.artist_id, 'instagram')) await freshToken(r.artist_id, 'instagram'); }
    catch (e: any) { console.error('[worker] renovacao Instagram:', e.message); }
  }
}

export function startScheduler() {
  db.prepare(`UPDATE deliveries SET status='scheduled' WHERE status='processing'`).run();
  setInterval(() => tick().catch((e) => console.error('[worker] tick:', e)), 10_000);
  setInterval(() => verifyInbox().catch(() => {}), 30_000);
  setInterval(() => refreshSweep().catch(() => {}), 6 * 3600e3);
  setTimeout(() => refreshSweep().catch(() => {}), 60_000);
  tick().catch(() => {});
}
