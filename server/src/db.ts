import Database from 'better-sqlite3';
import path from 'node:path';
import { DATA_DIR } from './config.js';

export const db = new Database(path.join(DATA_DIR, 'publisher.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS artists(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('team','artist')),
  artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY, value_enc TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS channels(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram','youtube')),
  external_id TEXT, display_name TEXT,
  access_token_enc TEXT NOT NULL, refresh_token_enc TEXT,
  expires_at INTEGER, refresh_expires_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(artist_id, platform));
CREATE TABLE IF NOT EXISTS invites(
  token TEXT PRIMARY KEY, artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title TEXT, caption TEXT, audio_name TEXT, location TEXT, scheduled_at INTEGER,
  media_file TEXT, media_token TEXT UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram','youtube')),
  mode TEXT NOT NULL CHECK(mode IN ('draft','direct','manual')),
  status TEXT NOT NULL CHECK(status IN ('scheduled','processing','awaiting_finalize','published','failed')),
  run_at INTEGER, external_id TEXT, error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, UNIQUE(post_id, platform));
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries(status, run_at);
CREATE INDEX IF NOT EXISTS idx_posts_artist ON posts(artist_id, scheduled_at);
`);

// Migracao: bancos criados antes do YouTube tinham a tabela channels sem 'youtube' na regra.
const chSql = ((db.prepare("SELECT sql FROM sqlite_master WHERE name='channels'").get() as any)?.sql || '') as string;
if (chSql && !chSql.includes("'youtube'")) {
  db.exec(`PRAGMA foreign_keys=OFF;
  BEGIN;
  CREATE TABLE channels_new(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram','youtube')),
    external_id TEXT, display_name TEXT,
    access_token_enc TEXT NOT NULL, refresh_token_enc TEXT,
    expires_at INTEGER, refresh_expires_at INTEGER,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE(artist_id, platform));
  INSERT INTO channels_new(id,artist_id,platform,external_id,display_name,access_token_enc,refresh_token_enc,expires_at,refresh_expires_at,created_at,updated_at)
    SELECT id,artist_id,platform,external_id,display_name,access_token_enc,refresh_token_enc,expires_at,refresh_expires_at,created_at,updated_at FROM channels;
  DROP TABLE channels;
  ALTER TABLE channels_new RENAME TO channels;
  COMMIT;
  PRAGMA foreign_keys=ON;`);
}
// Colunas novas (idempotente: ignora erro se ja existirem)
for (const sql of ['ALTER TABLE posts ADD COLUMN yt_privacy TEXT', 'ALTER TABLE deliveries ADD COLUMN note TEXT']) {
  try { db.exec(sql); } catch { /* ja existe */ }
}

export const now = () => Date.now();
