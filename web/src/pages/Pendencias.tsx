import { useCallback, useEffect, useState } from 'react';
import { api, PLATFORM, APP_URL, STATUS, fmtDateTime, copyText } from '../api';

const TABS: [string, string][] = [['pending', 'Pendentes'], ['scheduled', 'Agendados'], ['done', 'Concluídos']];

function PostCard({ p, reload }: { p: any; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const act = async (url: string, method = 'POST') => {
    setBusy(true);
    try { await api(url, { method }); await reload(); } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const copy = async () => { await copyText(p.caption || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const remove = () => { if (confirm('Excluir este post e o vídeo guardado?')) act(`/api/posts/${p.id}`, 'DELETE'); };

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{p.artist_name}</div>
          <div className="muted">{p.title}</div>
        </div>
        <div className="row">
          {p.deliveries.map((d: any) => <span key={d.id} className={`chip ${d.status}`}>{PLATFORM[d.platform]}</span>)}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {p.audio_name && <div className="info"><span className="ic">♪</span><div><b>{p.audio_name}</b><div className="muted">Áudio oficial</div></div></div>}
        {p.scheduled_at && <div className="info"><span className="ic">▦</span><div><b>{fmtDateTime(p.scheduled_at)}</b><div className="muted">Programação</div></div></div>}
        {p.location && <div className="info"><span className="ic">➤</span><div><b>{p.location}</b><div className="muted">Localização</div></div></div>}
      </div>
      {p.caption && <div className="caption">{p.caption}</div>}
      <div className="row" style={{ marginBottom: 6 }}>
        {p.title && p.deliveries.some((d: any) => d.platform === 'youtube') && <button className="ghost small" onClick={() => copyText(p.title)}>Copiar título</button>}
        {p.caption && <button className="ghost small" onClick={copy}>{copied ? 'Copiado!' : 'Copiar legenda'}</button>}
        {p.has_media && <a className="btn ghost small" href={`/api/posts/${p.id}/media`}>Baixar vídeo</a>}
        <button className="danger small" onClick={remove} disabled={busy}>Excluir</button>
      </div>
      {p.deliveries.map((d: any) => (
        <div className="delivery" key={d.id}>
          <div className="row spread">
            <div className="row">
              <b>{PLATFORM[d.platform]}</b>
              <span className={`chip ${d.status}`}>{STATUS[d.status]}</span>
              <span className="muted">{d.mode === 'direct' ? 'publicação direta' : d.mode === 'draft' ? 'rascunho no app' : 'finalizar manualmente'}</span>
            </div>
            <div className="row">
              {d.status === 'awaiting_finalize' && <>
                <a className="btn ghost small" href={d.platform === 'youtube' && d.external_id ? `https://studio.youtube.com/video/${d.external_id}/edit` : APP_URL[d.platform]} target="_blank" rel="noreferrer">Abrir {PLATFORM[d.platform]}</a>
                <button className="ok small" disabled={busy} onClick={() => act(`/api/deliveries/${d.id}/finalize`)}>Marcar como publicado</button>
              </>}
              {d.status === 'failed' && <button className="small" disabled={busy} onClick={() => act(`/api/deliveries/${d.id}/retry`)}>Tentar de novo</button>}
            </div>
          </div>
          {d.note && <div style={{ color: 'var(--warn)', fontSize: 13, marginTop: 6 }}>{d.note}</div>}
          {d.error && <div className="err">{d.status === 'scheduled' ? `Tentativa ${d.attempts} falhou, nova tentativa automática: ` : ''}{d.error}</div>}
        </div>
      ))}
    </div>
  );
}

export default function Pendencias() {
  const [tab, setTab] = useState('pending');
  const [posts, setPosts] = useState<any[] | null>(null);
  const load = useCallback(async () => {
    try { setPosts(await api(`/api/posts?tab=${tab}`)); } catch { setPosts([]); }
  }, [tab]);
  useEffect(() => { setPosts(null); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  return (
    <>
      <h1>Pendências</h1>
      <p className="muted" style={{ marginBottom: 18 }}>Conteúdos que precisam da sua finalização.</p>
      <div className="tabs">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {posts === null ? <div className="empty">Carregando...</div>
        : posts.length === 0 ? <div className="empty">Nada por aqui.</div>
        : posts.map((p) => <PostCard key={p.id} p={p} reload={load} />)}
    </>
  );
}
