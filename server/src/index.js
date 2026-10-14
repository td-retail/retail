import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool, many } from './db.js';
import { migrate } from './migrate.js';
import { loadUser, requireAuth } from './lib/access.js';
import { HttpError } from './lib/util.js';
import { syncConnector } from './lib/connectors.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import customerRoutes from './routes/customers.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import campaignRoutes from './routes/campaigns.js';
import promotionRoutes from './routes/promotions.js';
import exposureRoutes from './routes/exposure.js';
import connectorRoutes from './routes/connectors.js';
import statsRoutes from './routes/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);

// Dominio canonico: richieste su altri host (es. td-retail.onrender.com) reindirizzate a retail.toscanadiagnostica.it
const canonicalHost = (() => { try { const u = new URL(config.baseUrl); return /localhost|127\.0\.0\.1/.test(u.hostname) ? null : u.host; } catch { return null; } })();
if (canonicalHost) {
  app.use((req, res, next) => {
    if (req.path === '/api/health' || req.hostname === canonicalHost || process.env.CANONICAL_REDIRECT === 'false') return next();
    res.redirect(302, `https://${canonicalHost}${req.originalUrl}`);
  });
}
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ["'self'", 'blob:'],
      objectSrc: ["'self'", 'blob:'],
      formAction: ["'self'", 'https://login.microsoftonline.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '4mb' }));

const PgStore = pgSession(session);
app.use(session({
  store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
  name: 'tdretail.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: config.sessionHours * 3600 * 1000 },
}));

// Protezione CSRF: le richieste che modificano dati devono arrivare dal client dell'app
app.use('/api', (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'td-retail') return next(new HttpError(403, 'Richiesta non valida'));
  next();
});

app.use(loadUser);
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api', adminRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/exposure', exposureRoutes);
app.use('/api/connectors', connectorRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint inesistente')));

// Frontend (build Vite)
const webDir = process.env.WEB_DIR || path.join(__dirname, '..', 'public');
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
}

app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (err.code === '23505') return res.status(409).json({ error: 'Elemento duplicato (codice, codice fiscale, partita IVA o email già presenti)' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File troppo grande (max ${config.maxUploadMb} MB)` });
  res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Errore interno del server' : err.message, code: err.code, details: err.details });
});

// Sincronizzazione schedulata dei connettori abilitati (controllo ogni 15 minuti)
function scheduleSync() {
  setInterval(async () => {
    try {
      const rows = await many("SELECT kind, schedule, last_sync_at FROM connectors WHERE enabled AND schedule<>'MANUALE'");
      for (const c of rows) {
        const hours = c.schedule === 'HOURLY' ? 1 : 24;
        if (c.last_sync_at && Date.now() - new Date(c.last_sync_at).getTime() < hours * 3600 * 1000) continue;
        console.log(`[sync] ${c.kind}`);
        await syncConnector(c.kind, null).catch((e) => console.error(`[sync ${c.kind}]`, e.message));
      }
    } catch (e) { console.error('[sync]', e.message); }
  }, 15 * 60 * 1000).unref();
}

async function start() {
  const deadline = Date.now() + 150_000;
  for (let attempt = 1; ; attempt++) {
    try { await pool.query('SELECT 1'); break; } catch (e) {
      if (Date.now() > deadline) throw new Error(`Database non raggiungibile: ${e.message}`);
      console.log(`[avvio] database non pronto (tentativo ${attempt}): ${e.message}. Riprovo tra 5 s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await migrate();
  scheduleSync();
  app.listen(config.port, () => console.log(`TD Retail in ascolto su :${config.port}`));
}
start().catch((e) => { console.error(e); process.exit(1); });
