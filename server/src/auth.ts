import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { signPayload, verifyPayload } from './crypto.js';

const COOKIE = 'imagine_session';
const DAYS = 30;

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function issueSession(res: any, user: any) {
  res.cookie(COOKIE, signPayload({ uid: user.id, exp: Date.now() + DAYS * 864e5 }), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: DAYS * 864e5,
  });
}
export const clearSession = (res: any) => res.clearCookie(COOKIE);

export function getSessionUser(req: any): any | null {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  const p = verifyPayload(t);
  if (!p?.uid) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(p.uid) || null;
}

export function requireAuth(req: any, res: any, next: any) {
  const u = getSessionUser(req);
  if (!u) return res.status(401).json({ error: 'Faça login para continuar.' });
  req.user = u;
  next();
}
export function requireTeam(req: any, res: any, next: any) {
  if (req.user?.role !== 'team') return res.status(403).json({ error: 'Apenas o time pode fazer isso.' });
  next();
}
export const canAccessArtist = (user: any, artistId: number) =>
  user.role === 'team' || user.artist_id === artistId;

export const publicUser = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role, artist_id: u.artist_id });

// Limite simples de tentativas de login (em memoria)
const attempts = new Map<string, { n: number; t: number }>();
export function loginAllowed(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.t > 10 * 60e3) return true;
  return a.n < 8;
}
export function loginFailed(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.t > 10 * 60e3) attempts.set(key, { n: 1, t: Date.now() });
  else a.n++;
}
export const loginOk = (key: string) => attempts.delete(key);
