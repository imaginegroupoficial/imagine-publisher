import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { MEDIA_DIR } from './config.js';

export function mediaPath(file?: string | null): string | null {
  if (!file) return null;
  const p = path.join(MEDIA_DIR, path.basename(file));
  return fs.existsSync(p) ? p : null;
}

export function removeMediaFile(file?: string | null) {
  const p = mediaPath(file);
  if (p) fs.unlink(p, () => {});
}

// Apaga o video quando todas as plataformas do post ja foram publicadas.
export function cleanupMedia(postId: number) {
  const open = db.prepare(`SELECT COUNT(*) c FROM deliveries WHERE post_id=? AND status!='published'`).get(postId) as any;
  if (open.c > 0) return;
  const post = db.prepare('SELECT media_file FROM posts WHERE id=?').get(postId) as any;
  if (post?.media_file) {
    removeMediaFile(post.media_file);
    db.prepare('UPDATE posts SET media_file=NULL WHERE id=?').run(postId);
  }
}
