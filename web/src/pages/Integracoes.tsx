import { useEffect, useState } from 'react';
import { api, copyText } from '../api';

function Redirect({ uri }: { uri: string }) {
  const [c, setC] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted">Redirect URI (cadastre exatamente assim no painel da plataforma)</div>
      <div className="row" style={{ marginTop: 6 }}>
        <div className="mono grow">{uri}</div>
        <button className="ghost small" type="button" onClick={async () => { await copyText(uri); setC(true); setTimeout(() => setC(false), 1500); }}>{c ? 'Copiado!' : 'Copiar'}</button>
      </div>
    </div>
  );
}

export default function Integracoes() {
  const [v, setV] = useState<any>(null);
  const [f, setF] = useState({ tk: '', ts: '', ia: '', is: '', gi: '', gs: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/integrations').then(setV).catch(() => {}); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('');
    try {
      const r = await api('/api/integrations', { method: 'PUT', json: {
        tiktok: { client_key: f.tk, client_secret: f.ts }, instagram: { app_id: f.ia, app_secret: f.is }, google: { client_id: f.gi, client_secret: f.gs } } });
      setV(r); setF({ tk: '', ts: '', ia: '', is: '', gi: '', gs: '' }); setMsg('Salvo.');
    } catch (x: any) { setMsg(x.message); }
  };
  if (!v) return <div className="empty">Carregando...</div>;

  return (
    <form onSubmit={save}>
      <h1>Integrações</h1>
      <p className="muted" style={{ marginBottom: 16 }}>As chaves ficam guardadas criptografadas no servidor. Campos em branco mantêm o valor atual.</p>

      <div className="card">
        <div className="row spread"><h2>TikTok</h2><span className={`chip ${v.tiktok.configured ? 'connected' : ''}`}>{v.tiktok.configured ? 'configurado' : 'pendente'}</span></div>
        <label>Client key</label>
        <input value={f.tk} onChange={(e) => setF({ ...f, tk: e.target.value })} placeholder={v.tiktok.client_key || 'sbaw...'} autoComplete="off" />
        <label>Client secret</label>
        <input type="password" value={f.ts} onChange={(e) => setF({ ...f, ts: e.target.value })} placeholder={v.tiktok.has_secret ? '•••••••• (já salvo)' : ''} autoComplete="new-password" />
        <Redirect uri={v.tiktok.redirect_uri} />
      </div>

      <div className="card">
        <div className="row spread"><h2>Instagram</h2><span className={`chip ${v.instagram.configured ? 'connected' : ''}`}>{v.instagram.configured ? 'configurado' : 'pendente'}</span></div>
        <p className="muted">Use o App ID e a chave secreta do produto "API do Instagram com login do Instagram". Cada artista precisa estar como Instagram Tester no app da Meta enquanto o app estiver em desenvolvimento.</p>
        <label>App ID do Instagram</label>
        <input value={f.ia} onChange={(e) => setF({ ...f, ia: e.target.value })} placeholder={v.instagram.app_id || ''} autoComplete="off" />
        <label>Chave secreta do app do Instagram</label>
        <input type="password" value={f.is} onChange={(e) => setF({ ...f, is: e.target.value })} placeholder={v.instagram.has_secret ? '•••••••• (já salvo)' : ''} autoComplete="new-password" />
        <Redirect uri={v.instagram.redirect_uri} />
      </div>

      <div className="card">
        <div className="row spread"><h2>YouTube Shorts</h2><span className={`chip ${v.youtube.configured ? 'connected' : ''}`}>{v.youtube.configured ? 'configurado' : 'pendente'}</span></div>
        <p className="muted">Use o ID do cliente e a chave secreta OAuth do projeto no Google Cloud (YouTube Data API v3 ativada). Enquanto o projeto não passar na auditoria do Google, os vídeos enviados ficam privados e você só muda a visibilidade no YouTube Studio. Com o app em modo de teste, cada conta precisa ser reconectada a cada 7 dias.</p>
        <label>ID do cliente (Client ID)</label>
        <input value={f.gi} onChange={(e) => setF({ ...f, gi: e.target.value })} placeholder={v.youtube.client_id || '...apps.googleusercontent.com'} autoComplete="off" />
        <label>Chave secreta do cliente</label>
        <input type="password" value={f.gs} onChange={(e) => setF({ ...f, gs: e.target.value })} placeholder={v.youtube.has_secret ? '•••••••• (já salvo)' : ''} autoComplete="new-password" />
        <Redirect uri={v.youtube.redirect_uri} />
      </div>

      {msg && <div className={`banner ${msg === 'Salvo.' ? 'ok' : 'bad'}`}>{msg}</div>}
      <button style={{ width: '100%', padding: 14 }}>Salvar</button>
    </form>
  );
}
