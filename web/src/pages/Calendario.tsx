import { useEffect, useState } from 'react';
import { api, PLATFORM, STATUS, fmtDateTime } from '../api';

const SHORT: Record<string, string> = { tiktok: 'TT', instagram: 'IG', youtube: 'YT' };

export default function Calendario({ user }: { user: any }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [artists, setArtists] = useState<any[]>([]);
  const [artistId, setArtistId] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const team = user.role === 'team';

  useEffect(() => { if (team) api('/api/artists').then(setArtists).catch(() => {}); }, [team]);
  useEffect(() => {
    const month = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    const q = new URLSearchParams({ month, offset: String(new Date().getTimezoneOffset()) });
    if (artistId) q.set('artistId', artistId);
    api(`/api/calendar?${q}`).then(setPosts).catch(() => setPosts([]));
    setSel(null);
  }, [cur, artistId]);

  const byDay = new Map<number, any[]>();
  posts.forEach((p) => { const d = new Date(p.scheduled_at).getDate(); byDay.set(d, [...(byDay.get(d) || []), p]); });
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1).getDay();
  const days = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  const worst = (p: any) => p.deliveries.some((d: any) => d.status === 'failed') ? 'failed'
    : p.deliveries.some((d: any) => d.status === 'awaiting_finalize') ? 'awaiting_finalize'
    : p.deliveries.every((d: any) => d.status === 'published') ? 'published' : '';
  const move = (n: number) => setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1));

  return (
    <>
      <h1>Calendário</h1>
      <div className="row spread" style={{ margin: '14px 0' }}>
        <div className="row">
          <button className="ghost small" onClick={() => move(-1)}>‹</button>
          <b style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{cur.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
          <button className="ghost small" onClick={() => move(1)}>›</button>
        </div>
        {team && (
          <select style={{ width: 'auto' }} value={artistId} onChange={(e) => setArtistId(e.target.value)}>
            <option value="">Todos os artistas</option>
            {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
      <div className="cal">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div className="dow" key={i}>{d}</div>)}
        {Array.from({ length: first }).map((_, i) => <div key={'b' + i} className="day blank" />)}
        {Array.from({ length: days }).map((_, i) => {
          const n = i + 1; const items = byDay.get(n) || [];
          return (
            <div key={n} className={`day ${sel === n ? 'sel' : ''}`} onClick={() => setSel(n)}>
              <div className="n">{n}</div>
              {items.slice(0, 2).map((p) => <div key={p.id} className={`pill ${worst(p)}`}>{p.artist_name.split(' ')[0]} {p.deliveries.map((d: any) => SHORT[d.platform]).join('/')}</div>)}
              {items.length > 2 && <div className="pill">+{items.length - 2}</div>}
            </div>
          );
        })}
      </div>
      {sel && (
        <div style={{ marginTop: 18 }}>
          <h2>Dia {sel}</h2>
          {(byDay.get(sel) || []).length === 0 && <div className="muted">Nada agendado.</div>}
          {(byDay.get(sel) || []).map((p) => (
            <div className="card" key={p.id}>
              <b>{p.artist_name}</b> <span className="muted">{p.title}</span>
              <div className="muted">{fmtDateTime(p.scheduled_at)}</div>
              <div className="row" style={{ marginTop: 8 }}>
                {p.deliveries.map((d: any) => <span key={d.id} className={`chip ${d.status}`}>{PLATFORM[d.platform]}: {STATUS[d.status]}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
