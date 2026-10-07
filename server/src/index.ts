import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { PORT, WEB_DIR, MAX_UPLOAD_MB } from './config.js';
import { db } from './db.js';
import api from './api.js';
import oauth from './oauth.js';
import { startScheduler } from './scheduler.js';
import { mediaPath } from './media.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ status: 'ok', service: 'imagine-publisher' }); }
  catch { res.status(500).json({ status: 'error' }); }
});

// Video publico por token aleatorio: e daqui que o Instagram busca o arquivo (modo "publicar direto").
app.get('/m/:file', (req, res) => {
  const token = String(req.params.file).replace(/\.mp4$/i, '');
  const p: any = db.prepare('SELECT media_file FROM posts WHERE media_token=?').get(token);
  const file = mediaPath(p?.media_file);
  if (!file) return res.sendStatus(404);
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(file);
});

app.use('/api', api);
app.use('/auth', oauth);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const index = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(index)) return res.status(404).send('Interface web não encontrada.');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(index);
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Arquivo maior que ${MAX_UPLOAD_MB} MB.` });
  if (err?.name === 'MulterError' || err?.message === 'Envie um arquivo MP4.') return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Erro interno.' });
});

const server = app.listen(PORT, () => {
  console.log(`imagine-publisher rodando na porta ${PORT}`);
  startScheduler();
});
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000); });
}
