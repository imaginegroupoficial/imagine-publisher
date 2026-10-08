import { db, now } from './db.js';
import { enc, dec } from './crypto.js';
import * as tiktok from './providers/tiktok.js';
import * as instagram from './providers/instagram.js';
import * as youtube from './providers/youtube.js';
import { PermanentError } from './errors.js';

export const getChannel = (artistId: number, platform: string) =>
  db.prepare('SELECT * FROM channels WHERE artist_id=? AND platform=?').get(artistId, platform) as any;

export function saveChannel(c: {
  artistId: number; platform: string; externalId?: string | null; displayName?: string | null;
  accessToken: string; refreshToken?: string | null; expiresAt?: number | null; refreshExpiresAt?: number | null;
}) {
  const t = now();
  db.prepare(`INSERT INTO channels(artist_id,platform,external_id,display_name,access_token_enc,refresh_token_enc,expires_at,refresh_expires_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(artist_id,platform) DO UPDATE SET
      external_id=COALESCE(excluded.external_id,channels.external_id),
      display_name=COALESCE(excluded.display_name,channels.display_name),
      access_token_enc=excluded.access_token_enc,
      refresh_token_enc=COALESCE(excluded.refresh_token_enc,channels.refresh_token_enc),
      expires_at=excluded.expires_at,
      refresh_expires_at=COALESCE(excluded.refresh_expires_at,channels.refresh_expires_at),
      updated_at=excluded.updated_at`)
    .run(c.artistId, c.platform, c.externalId ?? null, c.displayName ?? null, enc(c.accessToken),
      c.refreshToken ? enc(c.refreshToken) : null, c.expiresAt ?? null, c.refreshExpiresAt ?? null, t, t);
}

export const listChannelsPublic = (artistId: number) =>
  db.prepare('SELECT platform, display_name, external_id, expires_at FROM channels WHERE artist_id=?').all(artistId);

export const removeChannel = (artistId: number, platform: string) =>
  db.prepare('DELETE FROM channels WHERE artist_id=? AND platform=?').run(artistId, platform);

// Devolve um token valido, renovando se estiver perto de vencer.
export async function freshToken(artistId: number, platform: 'tiktok' | 'instagram' | 'youtube') {
  const ch = getChannel(artistId, platform);
  if (!ch) throw new PermanentError(`Conta ${platform} não conectada para este artista.`);
  let access = dec(ch.access_token_enc);
  const t = now();
  try {
    if (platform === 'tiktok' && ch.expires_at && ch.expires_at - t < 10 * 60e3) {
      const rt = ch.refresh_token_enc ? dec(ch.refresh_token_enc) : null;
      if (!rt || (ch.refresh_expires_at && ch.refresh_expires_at < t)) throw new PermanentError('Acesso do TikTok expirou. Reconecte a conta.');
      const r = await tiktok.refresh(rt);
      saveChannel({ artistId, platform, ...r });
      access = r.accessToken;
    }
    if (platform === 'instagram' && ch.expires_at && ch.expires_at - t < 7 * 864e5) {
      if (ch.expires_at < t) throw new PermanentError('Acesso do Instagram expirou. Reconecte a conta.');
      const r = await instagram.refresh(access);
      saveChannel({ artistId, platform, externalId: ch.external_id, accessToken: r.accessToken, expiresAt: r.expiresAt });
      access = r.accessToken;
    }
    if (platform === 'youtube' && ch.expires_at && ch.expires_at - t < 5 * 60e3) {
      const rt = ch.refresh_token_enc ? dec(ch.refresh_token_enc) : null;
      if (!rt) throw new PermanentError('Acesso do YouTube expirou. Reconecte a conta.');
      const r = await youtube.refresh(rt);
      saveChannel({ artistId, platform, externalId: ch.external_id, accessToken: r.accessToken, expiresAt: r.expiresAt });
      access = r.accessToken;
    }
  } catch (e) {
    if (e instanceof PermanentError) throw e;
    if (ch.expires_at && ch.expires_at - t < 60e3) throw e; // sem margem: nao da pra seguir com o token atual
  }
  return { accessToken: access, externalId: ch.external_id as string };
}
