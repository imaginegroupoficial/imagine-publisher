import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, PLATFORM, copyText } from '../api';

function NewArtist({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api('/api/artists', { method: 'POST', json: { name: f.name, email: f.email || undefined, password: f.password || undefined } });
      onDone(); onClose();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Novo artista</h2>
        <label>Nome do artista</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
        <label>Email de acesso (opcional)</label>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <label>Senha (mínimo 8 caracteres)</label>
        <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ marginTop: 20 }}>
          <button type="button" className="ghost grow" onClick={onClose}>Cancelar</button>
          <button className="grow" disabled={busy}>{busy ? 'Criando...' : 'Criar'}</button>
        </div>
      </form>
    </div>
  );
}

function NewAccess({ artist, onClose, onDone }: { artist: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    try { await api(`/api/artists/${artist.id}/users`, { method: 'POST', json: f }); onDone(); onClose(); }
    catch (x: any) { setErr(x.message); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Novo acesso para {artist.name}</h2>
        <p className="muted">Quem entra aqui vê só o que é deste artista e pode enviar vídeos, baixar e finalizar pendências.</p>
        <label>Nome</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <label>Email</label>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <label>Senha (mínimo 8 caracteres)</label>
        <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ marginTop: 20 }}>
          <button type="button" className="ghost grow" onClick={onClose}>Cancelar</button>
          <button className="grow">Criar acesso</button>
        </div>
      </form>
    </div>
  );
}

export default function Artistas() {
  const [artists, setArtists] = useState<any[]>([]);
  const [modal, setModal] = useState<'new' | null>(null);
  const [access, setAccess] = useState<any>(null);
  const [link, setLink] = useState<{ id: number; url: string } | null>(null);
  const [params] = useSearchParams();
  const load = useCallback(() => { api('/api/artists').then(setArtists).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async (a: any) => {
    const r = await api(`/api/artists/${a.id}/invite`, { method: 'POST' });
    await copyText(r.url);
    setLink({ id: a.id, url: r.url });
  };
  const disconnect = async (a: any, platform: string) => {
    if (confirm(`Desconectar ${PLATFORM[platform]} de ${a.name}?`)) { await api(`/api/artists/${a.id}/channels/${platform}`, { method: 'DELETE' }); load(); }
  };
  const removeArtist = async (a: any) => {
    if (confirm(`Excluir ${a.name} e todos os posts dele? Isso não pode ser desfeito.`)) { await api(`/api/artists/${a.id}`, { method: 'DELETE' }); load(); }
  };
  const removeUser = async (id: number) => { if (confirm('Remover este acesso?')) { await api(`/api/users/${id}`, { method: 'DELETE' }); load(); } };

  return (
    <>
      <h1>Artistas</h1>
      <p className="muted" style={{ marginBottom: 16 }}>Cadastre artistas, gere o link para eles conectarem as próprias redes e crie acessos.</p>
      {params.get('ok') && <div className="banner ok">{PLATFORM[params.get('ok')!] || 'Conta'} conectada com sucesso.</div>}
      {params.get('error') && <div className="banner bad">Não foi possível conectar: {params.get('error')}</div>}
      <button style={{ marginBottom: 16 }} onClick={() => setModal('new')}>+ Cadastrar artista</button>

      {artists.length === 0 && <div className="empty">Nenhum artista cadastrado ainda.</div>}
      {artists.map((a) => (
        <div className="card" key={a.id}>
          <div className="row spread">
            <b style={{ fontSize: 17 }}>{a.name}</b>
            <button className="danger small" onClick={() => removeArtist(a)}>Excluir</button>
          </div>
          <div className="row" style={{ margin: '12px 0' }}>
            {['tiktok', 'instagram', 'youtube'].map((p) => {
              const ch = a.channels.find((c: any) => c.platform === p);
              return ch ? (
                <span key={p} className="chip connected">
                  {PLATFORM[p]}{ch.display_name ? ` ${ch.display_name}` : ''}
                  <a href="#" style={{ marginLeft: 4, opacity: .7 }} onClick={(e) => { e.preventDefault(); disconnect(a, p); }} title="Desconectar">×</a>
                </span>
              ) : <a key={p} className="chip" href={`/auth/${p}?artistId=${a.id}`}>{PLATFORM[p]}: conectar</a>;
            })}
          </div>
          <div className="row">
            <button className="ghost small" onClick={() => invite(a)}>Copiar link de conexão</button>
            <button className="ghost small" onClick={() => setAccess(a)}>Novo acesso</button>
          </div>
          {link && link.id === a.id && (
            <div className="banner ok" style={{ marginTop: 12 }}>
              Link copiado (vale por 14 dias). Envie para o artista ou o social media dele conectar as contas:
              <div className="mono" style={{ marginTop: 6 }}>{link.url}</div>
            </div>
          )}
          {a.users?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="muted">Acessos</div>
              {a.users.map((u: any) => (
                <div className="row spread" key={u.id} style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 14 }}>{u.name} <span className="muted">{u.email}</span></span>
                  <button className="danger small" onClick={() => removeUser(u.id)}>Remover</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {modal === 'new' && <NewArtist onClose={() => setModal(null)} onDone={load} />}
      {access && <NewAccess artist={access} onClose={() => setAccess(null)} onDone={load} />}
    </>
  );
}
