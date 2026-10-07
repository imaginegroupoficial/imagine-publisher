export async function api<T = any>(path: string, opts: { method?: string; json?: any } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.json ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export function uploadPost(form: FormData, onProgress: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/posts');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => {
      let d: any = {};
      try { d = JSON.parse(x.responseText); } catch { /* resposta vazia */ }
      x.status >= 200 && x.status < 300 ? resolve(d) : reject(new Error(d.error || `Erro ${x.status}`));
    };
    x.onerror = () => reject(new Error('Falha de conexão durante o envio.'));
    x.send(form);
  });
}

export const PLATFORM: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
export const APP_URL: Record<string, string> = {
  tiktok: 'https://www.tiktok.com/',
  instagram: 'https://www.instagram.com/',
  youtube: 'https://studio.youtube.com/',
};
export const STATUS: Record<string, string> = {
  scheduled: 'Agendado', processing: 'Enviando', awaiting_finalize: 'Finalizar no app', published: 'Publicado', failed: 'Falhou',
};

export function fmtDateTime(ts?: number | null) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  }
}
