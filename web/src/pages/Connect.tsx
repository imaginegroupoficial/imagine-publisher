import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, PLATFORM } from '../api';

export default function Connect() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/api/invites/${token}`).then(setInfo).catch((e) => setErr(e.message)); }, [token]);

  if (err) return <div className="auth"><div className="auth-card"><h1>Link inválido</h1><p className="muted">{err} Peça um novo link ao time da Imagine.</p></div></div>;
  if (!info) return <div className="center">Carregando...</div>;

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Conectar contas</h1>
        <p className="muted">Artista: <b style={{ color: 'var(--text)' }}>{info.artist.name}</b>. Autorize cada rede para a Imagine conseguir enviar os conteúdos para você finalizar.</p>
        {params.get('ok') && <div className="banner ok">{PLATFORM[params.get('ok')!]} conectado com sucesso.</div>}
        {params.get('error') && <div className="banner bad">Não foi possível conectar: {params.get('error')}</div>}
        {['tiktok', 'instagram', 'youtube'].map((p) => {
          const ch = info.channels.find((c: any) => c.platform === p);
          return (
            <div className="card" key={p}>
              <div className="row spread">
                <b>{PLATFORM[p]}</b>
                {ch ? <span className="chip connected">conectado{ch.display_name ? ` ${ch.display_name}` : ''}</span>
                  : info.configured[p] ? <a className="btn small" href={`/auth/${p}?invite=${token}`}>Conectar</a>
                  : <span className="chip">indisponível</span>}
              </div>
            </div>
          );
        })}
        <p className="muted">Você pode desconectar a qualquer momento pelas configurações da própria rede.</p>
      </div>
    </div>
  );
}
