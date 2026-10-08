import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const T = '/tmp/ip2test'; fs.rmSync(T, { recursive: true, force: true }); fs.mkdirSync(T + '/web', { recursive: true });
const env = { ...process.env, APP_SECRET: 'segredo-de-teste-1234567890', DATA_DIR: T + '/data', PORT: '3999',
  PUBLIC_BASE_URL: 'http://localhost:3999', WEB_DIR: T + '/web', TIKTOK_API_BASE: 'http://localhost:4400',
  IG_GRAPH_BASE: 'http://localhost:4400/ig', IG_OAUTH_BASE: 'http://localhost:4400/ig',
  GOOGLE_TOKEN_URL: 'http://localhost:4400/token', GOOGLE_USERINFO_URL: 'http://localhost:4400/userinfo', YT_UPLOAD_BASE: 'http://localhost:4400' };
let uploaded = 0, igPublished = 0, tiktokInits = 0, ytMeta = null, ytUploads = 0;
const mock = http.createServer((req, res) => {
  const chunks = []; let bytes = 0;
  req.on('data', (c) => { bytes += c.length; chunks.push(c); });
  req.on('end', () => {
    const j = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = req.url;
    if (u.startsWith('/v2/post/publish/inbox/video/init/')) {
      tiktokInits++;
      if (req.headers.authorization === 'Bearer badtoken') return j({ error: { code: 'internal_error', message: 'boom' } }, 500);
      return j({ data: { publish_id: 'pub' + tiktokInits, upload_url: 'http://localhost:4400/upload/x' }, error: { code: 'ok' } });
    }
    if (u.startsWith('/token')) return j({ access_token: 'yt-new', expires_in: 3600 });
    if (u.startsWith('/userinfo')) return j({ email: 'canal@x.com' });
    if (u.startsWith('/upload/youtube')) { try { ytMeta = JSON.parse(Buffer.concat(chunks).toString()); } catch {} res.writeHead(200, { Location: 'http://localhost:4400/yt-put' }); return res.end(); }
    if (u.startsWith('/yt-put')) { ytUploads++; const priv = (ytMeta?.snippet?.title || '').includes('PRIV') ? 'private' : ytMeta?.status?.privacyStatus; return j({ id: 'vid' + ytUploads, status: { privacyStatus: priv } }); }
    if (u.startsWith('/upload/')) { uploaded = bytes; res.writeHead(200); return res.end(); }
    if (u.startsWith('/v2/post/publish/status/fetch/')) return j({ data: { status: 'SEND_TO_USER_INBOX' } });
    if (u.includes('/media_publish')) { igPublished++; return j({ id: 'ig-media-1' }); }
    if (u.includes('/media?')) return j({ id: 'container1' });
    if (u.includes('/container1')) return j({ status_code: 'FINISHED' });
    j({});
  });
}).listen(4400);

fs.mkdirSync(T + '/data', { recursive: true });
fs.writeFileSync(T + '/mk-old.cjs', `const D=require(${JSON.stringify(path.resolve('server/node_modules/better-sqlite3'))});const d=new D(${JSON.stringify(T + '/data/publisher.db')});
d.exec("CREATE TABLE artists(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at INTEGER NOT NULL); INSERT INTO artists(name,created_at) VALUES('Antigo',1); CREATE TABLE channels(id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE, platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram')), external_id TEXT, display_name TEXT, access_token_enc TEXT NOT NULL, refresh_token_enc TEXT, expires_at INTEGER, refresh_expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(artist_id, platform)); INSERT INTO channels(artist_id,platform,external_id,access_token_enc,created_at,updated_at) VALUES(1,'tiktok','old','enc',1,1);");`);
execSync('node ' + T + '/mk-old.cjs');
const srv = spawn('node', ['server/dist/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

let pass = 0, failN = 0;
const ok = (c, m) => { c ? pass++ : failN++; console.log((c ? 'OK   ' : 'FALHA'), m); };
async function call(method, p, { json, form, cookie } = {}) {
  const headers = {}; if (cookie) headers.cookie = cookie; if (json) headers['content-type'] = 'application/json';
  const r = await fetch('http://localhost:3999' + p, { method, headers, body: json ? JSON.stringify(json) : form });
  const sc = r.headers.get('set-cookie'); let data; const txt = await r.text(); try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data, cookie: sc ? sc.split(';')[0] : null };
}
const videoPath = T + '/v.mp4'; fs.writeFileSync(videoPath, Buffer.alloc(3_000_000, 7));
const mkForm = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append('video', new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' }), 'v.mp4'); return f; };
const dbq = (sql, ...a) => execSync(`node -e "const D=require('./server/node_modules/better-sqlite3');const d=new D('${T}/data/publisher.db');console.log(JSON.stringify(d.prepare(process.argv[1]).all(...JSON.parse(process.argv[2]))))" "${sql}" '${JSON.stringify(a)}'`, { env }).toString();

try {
  ok(JSON.parse(dbq("SELECT sql FROM sqlite_master WHERE name='channels'"))[0].sql.includes("'youtube'"), 'migração: a tabela channels antiga passou a aceitar YouTube');
  ok(JSON.parse(dbq('SELECT COUNT(*) c FROM channels'))[0].c === 1, 'migração: o canal que já existia foi preservado');
  let r = await call('GET', '/api/status'); ok(r.data.needsSetup === true, 'status: precisa de setup');
  r = await call('POST', '/api/setup', { json: { name: 'Igor', email: 'igor@x.com', password: 'curta' } }); ok(r.status === 400, 'setup rejeita senha curta');
  r = await call('POST', '/api/setup', { json: { name: 'Igor', email: 'igor@x.com', password: 'senhaforte1' } }); const team = r.cookie; ok(r.status === 200 && team, 'setup cria o admin e abre sessao');
  r = await call('POST', '/api/setup', { json: { name: 'X', email: 'x@x.com', password: 'senhaforte1' } }); ok(r.status === 403, 'setup so funciona uma vez');
  r = await call('POST', '/api/login', { json: { email: 'igor@x.com', password: 'errada123' } }); ok(r.status === 401, 'login com senha errada falha');

  r = await call('POST', '/api/artists', { cookie: team, json: { name: 'Netto Brito', email: 'netto@x.com', password: 'senhanetto1' } }); ok(r.status === 201 && r.data.users.length === 1, 'cria artista com acesso');
  const A = r.data.id;
  r = await call('POST', '/api/artists', { cookie: team, json: { name: 'Outro Artista' } }); const B = r.data.id; ok(r.status === 201, 'cria artista sem acesso');

  r = await call('GET', '/api/integrations', { cookie: team }); ok(r.data.tiktok.configured === false && r.data.tiktok.redirect_uri.endsWith('/auth/tiktok/callback'), 'integracoes: vazio e redirect URI correto');
  r = await call('PUT', '/api/integrations', { cookie: team, json: { tiktok: { client_key: 'ck', client_secret: 'cs' }, instagram: { app_id: 'ia', app_secret: 'is' }, google: { client_id: 'gid', client_secret: 'gsec' } } });
  ok(r.data.tiktok.configured && r.data.instagram.configured && !JSON.stringify(r.data).includes('"cs"'), 'integracoes salvas sem expor o secret');
  ok(!dbq('SELECT value_enc FROM settings').includes('"cs"'), 'secret gravado criptografado no banco');

  r = await call('POST', `/api/artists/${A}/invite`, { cookie: team }); const token = r.data.url.split('/').pop(); ok(r.status === 200 && token.length === 32, 'gera link de convite');
  r = await call('GET', `/api/invites/${token}`); ok(r.status === 200 && r.data.artist.name === 'Netto Brito' && r.data.configured.tiktok, 'convite publico mostra artista e integracoes');
  r = await call('GET', '/api/invites/naoexiste'); ok(r.status === 404, 'convite invalido da 404');
  const loc = await fetch(`http://localhost:3999/auth/tiktok?invite=${token}`, { redirect: 'manual' });
  ok(loc.status === 302 && loc.headers.get('location').startsWith('https://www.tiktok.com/v2/auth/authorize/') && loc.headers.get('location').includes('client_key=ck'), 'OAuth TikTok redireciona com client_key');
  const loc2 = await fetch(`http://localhost:3999/auth/instagram?invite=${token}`, { redirect: 'manual' });
  ok(loc2.status === 302 && loc2.headers.get('location').includes('instagram_business_content_publish'), 'OAuth Instagram pede escopo de publicacao');

  // canais conectados direto no banco (o OAuth real nao da pra simular aqui)
  const mk = (aid, plat, tok) => execSync(`node -e "const c=require('./server/dist/channels.js');c.saveChannel({artistId:${aid},platform:'${plat}',externalId:'777',displayName:'@t',accessToken:'${tok}',refreshToken:'r',expiresAt:Date.now()+36e5,refreshExpiresAt:Date.now()+9e9})"`, { env });
  mk(A, 'tiktok', 'tok1'); mk(A, 'instagram', 'ig1'); mk(B, 'tiktok', 'badtoken'); mk(A, 'youtube', 'ytok');

  let f = mkForm({ artistId: A, deliveries: JSON.stringify([{ platform: 'tiktok', mode: 'draft' }, { platform: 'instagram', mode: 'direct' }, { platform: 'youtube', mode: 'manual' }]), title: 'Titulo teste', caption: 'Legenda teste', audioName: 'Som Oficial', location: 'Sao Luis' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 201, 'cria post (TikTok rascunho + Instagram direto + YouTube manual)'); const P = r.data.id;
  await sleep(3500);
  ok(uploaded === 3_000_000, `TikTok recebeu o arquivo inteiro em streaming (${uploaded} bytes)`);
  ok(igPublished === 1, 'Instagram publicado direto via container');
  r = await call('GET', '/api/posts?tab=pending', { cookie: team }); const post = r.data.find((x) => x.id === P);
  const st = Object.fromEntries(post.deliveries.map((d) => [d.platform, d.status]));
  ok(st.tiktok === 'awaiting_finalize' && st.instagram === 'published' && st.youtube === 'awaiting_finalize', 'status por plataforma correto: ' + JSON.stringify(st));
  ok(post.has_media && post.caption === 'Legenda teste', 'pendencia traz legenda e video');

  r = await fetch(`http://localhost:3999/api/posts/${P}/media`, { headers: { cookie: team } }); const buf = Buffer.from(await r.arrayBuffer()); ok(r.status === 200 && buf.length === 3_000_000, 'download do video pela interface');
  const mt = JSON.parse(dbq('SELECT media_token FROM posts WHERE id=?', P))[0].media_token;
  r = await fetch(`http://localhost:3999/m/${mt}.mp4`); ok(r.status === 200 && r.headers.get('content-type') === 'video/mp4', 'URL publica do video (para o Instagram buscar)');
  r = await fetch(`http://localhost:3999/m/tokeninvalido.mp4`); ok(r.status === 404, 'URL publica invalida da 404');

  // permissoes do artista
  r = await call('POST', '/api/login', { json: { email: 'netto@x.com', password: 'senhanetto1' } }); const art = r.cookie; ok(r.status === 200, 'artista faz login');
  r = await call('GET', '/api/integrations', { cookie: art }); ok(r.status === 403, 'artista nao acessa integracoes');
  r = await call('POST', `/api/artists/${A}/invite`, { cookie: art }); ok(r.status === 403, 'artista nao gera convite');
  r = await call('GET', '/api/artists', { cookie: art }); ok(r.data.length === 1 && r.data[0].id === A, 'artista ve so ele mesmo');
  f = mkForm({ artistId: B, deliveries: JSON.stringify([{ platform: 'instagram', mode: 'manual' }]) });
  r = await call('POST', '/api/posts', { cookie: art, form: f }); ok(r.status === 201, 'artista cria post (forca o proprio artista, ignora artistId enviado)');
  const own = JSON.parse(dbq('SELECT artist_id FROM posts WHERE id=?', r.data.id))[0].artist_id; ok(own === A, 'post do artista ficou no artista dele');
  r = await call('GET', '/api/posts?tab=pending&artistId=' + B, { cookie: art }); ok(r.data.every((x) => x.artist_id === A), 'artista nao enxerga posts de outro');

  // validacoes
  f = mkForm({ artistId: B, deliveries: JSON.stringify([{ platform: 'instagram', mode: 'direct' }]) });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 400, 'Instagram direto sem conta conectada e recusado na hora');
  f = new FormData(); f.append('artistId', A); f.append('deliveries', '[{"platform":"tiktok","mode":"draft"}]'); f.append('video', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 400, 'arquivo que nao e MP4 e recusado');

  // falha e tentativas automaticas (TikTok do artista B responde 500)
  f = mkForm({ artistId: B, deliveries: JSON.stringify([{ platform: 'tiktok', mode: 'draft' }]) });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); const PB = r.data.id; await sleep(2500);
  const dl = JSON.parse(dbq('SELECT status,attempts,error FROM deliveries WHERE post_id=?', PB))[0];
  ok(dl.status === 'scheduled' && dl.attempts === 1 && dl.error.includes('boom'), 'falha do TikTok reagenda com erro visivel: ' + JSON.stringify(dl));

  // YouTube Shorts
  const yloc = await fetch(`http://localhost:3999/auth/youtube?invite=${token}`, { redirect: 'manual' });
  const yl = yloc.headers.get('location') || '';
  ok(yloc.status === 302 && yl.startsWith('https://accounts.google.com/o/oauth2/v2/auth') && yl.includes('access_type=offline') && yl.includes('youtube.upload'), 'OAuth YouTube pede escopo de upload e token de renovação');
  f = mkForm({ artistId: A, deliveries: JSON.stringify([{ platform: 'youtube', mode: 'direct' }]), title: 'So titulo' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 400 && r.data.error.includes('título e legenda'), 'YouTube exige título e legenda');
  f = mkForm({ artistId: B, deliveries: JSON.stringify([{ platform: 'youtube', mode: 'direct' }]), title: 'T', caption: 'D' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 400, 'YouTube direto sem conta conectada é recusado');
  f = mkForm({ artistId: A, deliveries: JSON.stringify([{ platform: 'youtube', mode: 'direct' }]), title: 'Meu Short <oficial>', caption: 'Legenda do video', ytPrivacy: 'public' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 201, 'cria post de YouTube Shorts direto'); const PY = r.data.id; await sleep(3000);
  let yd = JSON.parse(dbq('SELECT status,external_id,note FROM deliveries WHERE post_id=?', PY))[0];
  ok(yd.status === 'published' && yd.external_id === 'vid1' && !yd.note, 'YouTube público: publicado direto ' + JSON.stringify(yd));
  ok(ytMeta.snippet.title === 'Meu Short oficial' && ytMeta.snippet.description.includes('#Shorts') && ytMeta.status.privacyStatus === 'public' && ytMeta.status.selfDeclaredMadeForKids === false, 'metadados do YouTube: título limpo, #Shorts e visibilidade');
  f = mkForm({ artistId: A, deliveries: JSON.stringify([{ platform: 'youtube', mode: 'direct' }]), title: 'Short PRIV', caption: 'D', ytPrivacy: 'public' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); const PY2 = r.data.id; await sleep(3000);
  yd = JSON.parse(dbq('SELECT status,note FROM deliveries WHERE post_id=?', PY2))[0];
  ok(yd.status === 'awaiting_finalize' && yd.note.includes('auditoria'), 'YouTube devolveu privado: vira pendência com o aviso da auditoria');
  f = mkForm({ artistId: A, deliveries: JSON.stringify([{ platform: 'youtube', mode: 'direct' }]), title: 'Escolhi privado', caption: 'D', ytPrivacy: 'private' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); const PY3 = r.data.id; await sleep(3000);
  yd = JSON.parse(dbq('SELECT status,note FROM deliveries WHERE post_id=?', PY3))[0];
  ok(yd.status === 'awaiting_finalize' && yd.note.includes('como escolhido'), 'YouTube privado por escolha: pendência com o aviso certo');
  f = mkForm({ artistId: A, deliveries: JSON.stringify([{ platform: 'youtube', mode: 'manual' }]), title: 'Manual', caption: 'D' });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 201, 'YouTube manual continua disponível');
  r = await call('GET', '/api/integrations', { cookie: team }); ok(r.data.youtube.configured === true && r.data.youtube.redirect_uri.endsWith('/auth/youtube/callback') && !JSON.stringify(r.data).includes('gsec'), 'Integrações mostram YouTube configurado sem expor o secret');

  // finalizar e limpeza do video
  const dels = (await call('GET', '/api/posts?tab=pending', { cookie: team })).data.find((x) => x.id === P).deliveries;
  for (const d of dels.filter((x) => x.status === 'awaiting_finalize')) { r = await call('POST', `/api/deliveries/${d.id}/finalize`, { cookie: team }); ok(r.status === 200, `marcar ${d.platform} como publicado`); }
  r = await call('GET', '/api/posts?tab=done', { cookie: team }); ok(r.data.some((x) => x.id === P), 'post vai para Concluidos');
  const fileLeft = fs.readdirSync(T + '/data/media').some((n) => JSON.parse(dbq('SELECT media_file FROM posts WHERE id=?', P))[0].media_file === n);
  ok(!fileLeft, 'video apagado do disco quando tudo foi publicado');

  // calendario
  const fut = Date.now() + 40 * 864e5; const d = new Date(fut); const month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  f = mkForm({ artistId: A, scheduledAt: fut, title: 'Agendado', caption: 'x', deliveries: JSON.stringify([{ platform: 'youtube', mode: 'manual' }]) });
  r = await call('POST', '/api/posts', { cookie: team, form: f }); ok(r.status === 201, 'cria post agendado no futuro');
  r = await call('GET', `/api/calendar?month=${month}&offset=180`, { cookie: team }); ok(r.data.length === 1, 'calendario mostra o post do mes');
  r = await call('GET', `/api/calendar?month=${month}&artistId=${B}`, { cookie: team }); ok(r.data.length === 0, 'calendario filtra por artista');

  r = await call('DELETE', `/api/posts/${P}`, { cookie: team }); ok(r.status === 200, 'excluir post');
  r = await call('POST', '/api/logout', { cookie: team }); r = await call('GET', '/api/me'); ok(r.status === 401, 'sem sessao da 401');

} catch (e) { failN++; console.log('ERRO NO TESTE', e); }

console.log(`\n${pass} ok, ${failN} falhas`);
if (failN) console.log('--- log do servidor ---\n' + log.slice(-1500));
srv.kill(); mock.close(); process.exit(failN ? 1 : 0);
