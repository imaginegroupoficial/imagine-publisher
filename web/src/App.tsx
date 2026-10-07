import { useEffect, useState, ReactNode } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { api } from './api';
import { Login, Setup } from './Auth';
import Pendencias from './pages/Pendencias';
import NovoPost from './pages/NovoPost';
import Calendario from './pages/Calendario';
import Artistas from './pages/Artistas';
import Integracoes from './pages/Integracoes';
import Connect from './pages/Connect';

type Session = { loading: boolean; needsSetup: boolean; user: any };

function Layout({ user, onLogout, children }: { user: any; onLogout: () => void; children: ReactNode }) {
  const team = user.role === 'team';
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">Imagine Publisher</div>
        <nav>
          <NavLink to="/" end>Pendências</NavLink>
          <NavLink to="/novo">Novo post</NavLink>
          <NavLink to="/calendario">Calendário</NavLink>
          {team && <NavLink to="/artistas">Artistas</NavLink>}
          {team && <NavLink to="/integracoes">Integrações</NavLink>}
        </nav>
        <button className="ghost small" onClick={onLogout}>Sair</button>
      </header>
      {children}
    </div>
  );
}

export default function App() {
  const [s, setS] = useState<Session>({ loading: true, needsSetup: false, user: null });
  const loc = useLocation();

  const load = async () => {
    try {
      const st = await api('/api/status');
      let user = null;
      if (!st.needsSetup) { try { user = await api('/api/me'); } catch { /* sem sessão */ } }
      setS({ loading: false, needsSetup: st.needsSetup, user });
    } catch { setS({ loading: false, needsSetup: false, user: null }); }
  };
  useEffect(() => { load(); }, []);

  if (loc.pathname.startsWith('/connect/')) {
    return <Routes><Route path="/connect/:token" element={<Connect />} /></Routes>;
  }
  if (s.loading) return <div className="center">Carregando...</div>;
  if (s.needsSetup) return <Setup onDone={load} />;
  if (!s.user) return <Login onDone={load} />;

  const team = s.user.role === 'team';
  const logout = async () => { await api('/api/logout', { method: 'POST' }); load(); };
  return (
    <Layout user={s.user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Pendencias />} />
        <Route path="/novo" element={<NovoPost user={s.user} />} />
        <Route path="/calendario" element={<Calendario user={s.user} />} />
        <Route path="/artistas" element={team ? <Artistas /> : <Navigate to="/" />} />
        <Route path="/integracoes" element={team ? <Integracoes /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
