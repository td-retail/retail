import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, one, q } from './db.js';
import { config } from './config.js';
import { DEFAULT_SETTINGS, PRODUCT_LINES, SITES, EXPOSURE_ZONES, EXPOSURE_STANDARDS, CONNECTORS } from './lib/seedData.js';
import { loadDemo } from './lib/demo.js';
import { MARKET_SEED, MARKET_BENCH } from './lib/marketSeed.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log(`[migrate] applicata ${f}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Migrazione ${f} fallita: ${e.message}`);
    } finally {
      c.release();
    }
  }
  await seed();
}

async function seed() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await q('INSERT INTO app_settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  for (const l of PRODUCT_LINES) {
    await q('INSERT INTO product_lines(code, name, color, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING', [l.code, l.name, l.color, l.sort_order]);
  }
  // Sedi: solo al primo avvio (poi si gestiscono dall'app)
  if ((await one('SELECT count(*)::int AS n FROM sites')).n === 0) {
    for (const [i, s] of SITES.entries()) {
      await q('INSERT INTO sites(code, name, kind, address, city, province, zip, manager, legacy_brand, lat, lng, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [s.code, s.name, s.kind, s.address, s.city, s.province, s.zip, s.manager, s.legacy_brand, s.lat, s.lng, (i + 1) * 10]);
    }
  }
  for (const z of EXPOSURE_ZONES) {
    await q('INSERT INTO exposure_zones(code, name, description, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING', [z.code, z.name, z.description, z.sort_order]);
  }
  if ((await one('SELECT count(*)::int AS n FROM exposure_standards')).n === 0) {
    for (const [i, s] of EXPOSURE_STANDARDS.entries()) {
      const zone = await one('SELECT id FROM exposure_zones WHERE code=$1', [s[1]]);
      await q('INSERT INTO exposure_standards(site_kind, zone_id, material, format, quantity, rule, mandatory, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [s[0], zone.id, s[2], s[3], s[4], s[5], s[6], (i + 1) * 10]);
    }
  }
  for (const c of CONNECTORS) {
    await q('INSERT INTO connectors(kind, base_url, auth_kind, settings) VALUES ($1,$2,$3,$4) ON CONFLICT (kind) DO NOTHING', [c.kind, c.base_url, c.auth_kind, JSON.stringify(c.settings)]);
  }
  // Dati di mercato MEF a.i. 2024 per i comuni del network (solo se assenti)
  for (const [comune, prov, contr, rc, ri, lo, mid, hi] of MARKET_SEED) {
    for (const [metric, value] of [['contribuenti', contr], ['reddito_medio', rc], ['reddito_imponibile_medio', ri], ['quota_redditi_bassi', lo], ['quota_redditi_medi', mid], ['quota_redditi_alti', hi]]) {
      await q("INSERT INTO market_data(year, territory_kind, territory, province, metric, value, source) VALUES (2024,'COMUNE',$1,$2,$3,$4,'MEF, Redditi IRPEF su base comunale a.i. 2024') ON CONFLICT DO NOTHING", [comune, prov, metric, value]);
    }
  }
  for (const [kind, terr, metric, value, src] of MARKET_BENCH) await q('INSERT INTO market_data(year, territory_kind, territory, metric, value, source) VALUES (2024,$1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [kind, terr, metric, value, src]);
  // Primo amministratore
  if (config.seed.adminEmail) {
    const ex = await one('SELECT id FROM users WHERE lower(email)=lower($1)', [config.seed.adminEmail]);
    if (!ex) {
      if (!config.seed.adminPassword || config.seed.adminPassword.length < 12) {
        throw new Error('SEED_ADMIN_PASSWORD obbligatoria (min 12 caratteri) per creare il primo amministratore');
      }
      const hash = await bcrypt.hash(config.seed.adminPassword, 12);
      await q(`INSERT INTO users (email, full_name, role, auth_provider, password_hash, must_change_password) VALUES ($1,$2,'ADMIN','BOTH',$3,TRUE)`,
        [config.seed.adminEmail, config.seed.adminName, hash]);
      console.log(`[seed] creato amministratore ${config.seed.adminEmail}`);
    }
  }
  // Set dimostrativo (facoltativo, solo su database vuoto)
  if (config.demoData && (await one('SELECT count(*)::int AS n FROM sales')).n === 0) {
    console.log('[seed] caricamento del set dimostrativo…');
    const r = await loadDemo();
    console.log(`[seed] demo: ${r.customers} clienti, ${r.products} prestazioni, ${r.sales} righe di vendita`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
