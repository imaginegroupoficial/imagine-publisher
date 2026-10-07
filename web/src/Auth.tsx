import { useState } from 'react';
import { api } from './api';

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/api/login', { method: 'POST', json: { email, password } }); onDone(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Imagine Publisher</h1>
        <p className="muted">Entre para ver suas pendências e agendamentos.</p>
        <label>Email</label>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Senha</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="err">{err}</div>}
        <button disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}

export function Setup({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/api/setup', { method: 'POST', json: f }); onDone(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Bem-vindo</h1>
        <p className="muted">Crie o primeiro acesso do time. Depois você cadastra artistas e conecta as redes pela própria plataforma.</p>
        <label>Seu nome</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <label>Email</label>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <label>Senha (mínimo 8 caracteres)</label>
        <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
        {err && <div className="err">{err}</div>}
        <button disabled={busy}>{busy ? 'Criando...' : 'Criar acesso'}</button>
      </form>
    </div>
  );
}
