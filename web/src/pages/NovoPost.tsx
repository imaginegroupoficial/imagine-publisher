import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadPost } from '../api';

const PLATS = [
  { id: 'tiktok', label: 'TikTok', modes: [['draft', 'Rascunho na caixa de entrada (escolher o áudio no app)']] },
  { id: 'instagram', label: 'Instagram', modes: [['manual', 'Rascunho: finalizar no app (áudio oficial e Facebook)'], ['direct', 'Publicar direto pela API']] },
  { id: 'youtube', label: 'YouTube', modes: [['manual', 'Pendência manual']] },
];

export default function NovoPost({ user }: { user: any }) {
  const nav = useNavigate();
  const team = user.role === 'team';
  const [artists, setArtists] = useState<any[]>([]);
  const [artistId, setArtistId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [sel, setSel] = useState<Record<string, { on: boolean; mode: string }>>({
    tiktok: { on: false, mode: 'draft' }, instagram: { on: false, mode: 'manual' }, youtube: { on: false, mode: 'manual' },
  });
  const [f, setF] = useState({ title: '', caption: '', audioName: '', location: '' });
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [dt, setDt] = useState('');
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/artists').then((a) => { setArtists(a); if (a[0]) setArtistId(String(a[0].id)); }).catch(() => {});
  }, []);
  const artist = artists.find((a) => String(a.id) === artistId);
  const connected = (p: string) => !!artist?.channels.find((c: any) => c.platform === p);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const chosen = PLATS.filter((p) => sel[p.id].on).map((p) => ({ platform: p.id, mode: sel[p.id].mode }));
    if (!file) return setErr('Selecione o vídeo em MP4.');
    if (!chosen.length) return setErr('Selecione ao menos uma plataforma.');
    if (when === 'later' && !dt) return setErr('Escolha a data e a hora.');
    const fd = new FormData();
    if (team) fd.append('artistId', artistId);
    fd.append('deliveries', JSON.stringify(chosen));
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (when === 'later') fd.append('scheduledAt', String(new Date(dt).getTime()));
    fd.append('video', file);
    setPct(0);
    try { await uploadPost(fd, setPct); nav('/'); }
    catch (x: any) { setErr(x.message); setPct(null); }
  };

  return (
    <form onSubmit={submit}>
      <h1>Novo post</h1>
      <p className="muted">Escolha onde publicar. TikTok e Instagram em rascunho ficam prontos para você só escolher o áudio oficial e publicar.</p>

      {team && <>
        <label>Artista</label>
        <select value={artistId} onChange={(e) => setArtistId(e.target.value)} required>
          {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </>}

      <label>Vídeo (MP4)</label>
      <input type="file" accept="video/mp4,.mp4" onChange={(e) => setFile(e.target.files?.[0] || null)} />

      <label>Plataformas</label>
      {PLATS.map((p) => (
        <div key={p.id} className={`plat ${sel[p.id].on ? 'on' : ''}`}>
          <label style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text)', fontSize: 15 }}>
            <input type="checkbox" style={{ width: 18 }} checked={sel[p.id].on}
              onChange={(e) => setSel({ ...sel, [p.id]: { ...sel[p.id], on: e.target.checked } })} />
            <b>{p.label}</b>
            {(p.id === 'tiktok' || p.id === 'instagram') && (
              <span className={`chip ${connected(p.id) ? 'connected' : ''}`}>{connected(p.id) ? 'conectado' : 'não conectado'}</span>
            )}
          </label>
          {sel[p.id].on && (
            <>
              {p.modes.length > 1 ? (
                <select style={{ marginTop: 10 }} value={sel[p.id].mode} onChange={(e) => setSel({ ...sel, [p.id]: { ...sel[p.id], mode: e.target.value } })}>
                  {p.modes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : <div className="muted" style={{ marginTop: 8 }}>{p.modes[0][1]}</div>}
              {p.id === 'tiktok' && !connected('tiktok') && <div className="err">Conecte o TikTok deste artista em Artistas antes de enviar.</div>}
              {p.id === 'instagram' && sel.instagram.mode === 'direct' && !connected('instagram') && <div className="err">Conecte o Instagram deste artista para publicar direto.</div>}
            </>
          )}
        </div>
      ))}

      <label>Título (opcional, para organização)</label>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Gerado automaticamente se ficar vazio" />
      <label>Legenda</label>
      <textarea value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} />
      <label>Áudio oficial (nome da música)</label>
      <input value={f.audioName} onChange={(e) => setF({ ...f, audioName: e.target.value })} />
      <label>Localização (opcional)</label>
      <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />

      <label>Quando</label>
      <div className="row">
        <button type="button" className={when === 'now' ? '' : 'ghost'} onClick={() => setWhen('now')}>Agora</button>
        <button type="button" className={when === 'later' ? '' : 'ghost'} onClick={() => setWhen('later')}>Agendar</button>
      </div>
      {when === 'later' && <input type="datetime-local" style={{ marginTop: 10 }} value={dt} onChange={(e) => setDt(e.target.value)} />}

      {err && <div className="banner bad" style={{ marginTop: 16 }}>{err}</div>}
      {pct !== null && <div className="progress"><div style={{ width: `${pct}%` }} /></div>}
      <button style={{ width: '100%', marginTop: 22, padding: 14 }} disabled={pct !== null}>
        {pct === null ? 'Enviar' : pct < 100 ? `Enviando... ${pct}%` : 'Processando...'}
      </button>
    </form>
  );
}
