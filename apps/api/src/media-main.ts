import { createDatabase } from '@cofre/database';
import { fileURLToPath } from 'node:url';
import { settings } from './config.js';
import { R2Storage } from './storage.js';
import { MediaWorker, PythonRenderer } from './media-worker.js';
const config = settings();
if (!config.storage || !process.env.MEDIA_PYTHON) throw new Error('Configure R2 e MEDIA_PYTHON para iniciar o worker.');
const db = createDatabase(config.databaseUrl); const store = new R2Storage(config.storage);
const worker = new MediaWorker(db, store, new PythonRenderer(process.env.MEDIA_PYTHON,
 fileURLToPath(new URL('../../../media_worker/render.py', import.meta.url)), process.env.MEDIA_FFMPEG, process.env.MEDIA_FFPROBE));
let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
try {
 do {
  try { await worker.tick(); }
  catch { console.warn('{"event":"media_worker_retry"}'); }
  if (process.argv.includes('--once')) break;
  if (!stopping) await new Promise(resolve => setTimeout(resolve, 5000));
 } while (!stopping);
} finally { store.close(); await db.$disconnect(); }
