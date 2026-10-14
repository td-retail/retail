// Connettori verso i gestionali. Struttura pronta: configurazione cifrata, test di connessione, sincronizzazione.
// GIPO e StudioLab non espongono API pubbliche documentate: finché il fornitore non fornisce credenziali
// di integrazione, i dati entrano con l'import da file (lib/importer.js). TuoTempo espone API REST v3.
import { one, q } from '../db.js';
import { decrypt } from './crypto.js';
import { HttpError } from './util.js';
import { runImport } from './importer.js';

export async function getConnector(kind) {
  const c = await one('SELECT * FROM connectors WHERE kind=$1', [kind]);
  if (!c) throw new HttpError(404, 'Connettore inesistente');
  return c;
}

async function tuotempoRequest(c, path, params = {}) {
  const creds = c.credentials ? JSON.parse(decrypt(c.credentials)) : {};
  const settings = c.settings || {};
  if (!settings.instance) throw new HttpError(400, 'Impostare l\'identificativo dell\'istanza TuoTempo (dbName) nelle impostazioni del connettore');
  const url = new URL(`${(c.base_url || 'https://app.tuotempo.com/api/v3').replace(/\/$/, '')}/${settings.instance}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (creds.user && creds.password) headers.authorization = `Basic ${Buffer.from(`${creds.user}:${creds.password}`).toString('base64')}`;
  else if (creds.token) headers.authorization = `Bearer ${creds.token}`;
  let res;
  try { res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) }); } catch (e) { throw new HttpError(502, `TuoTempo non raggiungibile: ${e.cause?.message || e.message}`); }
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, `TuoTempo ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new HttpError(502, 'Risposta TuoTempo non in formato JSON'); }
}

export async function testConnector(kind) {
  const c = await getConnector(kind);
  if (kind === 'TUOTEMPO') {
    // Endpoint leggero: elenco risorse/aree dell'istanza
    const r = await tuotempoRequest(c, 'areas', { limit: 1 });
    return { ok: true, message: `Connessione riuscita (${Array.isArray(r?.return?.results?.areas) ? r.return.results.areas.length : 'ok'})` };
  }
  if (!c.base_url) throw new HttpError(400, `${kind}: nessun endpoint configurato. Finché il fornitore non attiva l'integrazione, usa l'import da file.`);
  try {
    const res = await fetch(c.base_url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, message: `Endpoint raggiungibile (HTTP ${res.status})` };
  } catch (e) { throw new HttpError(502, `Endpoint non raggiungibile: ${e.message}`); }
}

// Sincronizzazione: per TuoTempo legge le prenotazioni del periodo e le importa come vendite "prenotate" (importo da listino se assente)
export async function syncConnector(kind, userId, { from, to } = {}) {
  const c = await getConnector(kind);
  const log = await one('INSERT INTO sync_log(connector_id) VALUES ($1) RETURNING id', [c.id]);
  const finish = async (status, message, read = 0, written = 0) => {
    await q('UPDATE sync_log SET finished_at=now(), status=$2, message=$3, rows_read=$4, rows_written=$5 WHERE id=$1', [log.id, status, message, read, written]);
    await q('UPDATE connectors SET last_sync_at=now(), last_status=$2, last_message=$3, updated_at=now() WHERE id=$1', [c.id, status, message]);
  };
  try {
    if (kind !== 'TUOTEMPO') {
      await finish('ERRORE', `${kind}: sincronizzazione automatica non disponibile senza API del fornitore. Usa l'import da file.`);
      throw new HttpError(400, `${kind}: sincronizzazione automatica non disponibile senza API del fornitore. Usa l'import da file.`);
    }
    const days = Number(c.settings?.sync_days || 30);
    const end = to || new Date().toISOString().slice(0, 10);
    const start = from || new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const data = await tuotempoRequest(c, 'reservations', { startDate: start, endDate: end, limit: 5000 });
    const list = data?.return?.results?.reservations || data?.results || [];
    // Trasforma in righe "tabellari" e riusa l'importatore con mappatura fissa
    const rows = list.map((r) => ({
      ref: r.resid || r.id, date: r.start_date || r.startDate, time: r.start_time || r.startTime, pid: r.userid || r.patientId, cf: r.fiscal_code || r.cf,
      cognome: r.lname || r.lastName, nome: r.fname || r.firstName, sesso: r.gender, nascita: r.birthday, email: r.email, tel: r.phone,
      sede: r.areaTitle || r.area, codice: r.activityid || r.activityId || r.activity, descrizione: r.activityTitle || r.activity_title, prezzo: r.price, canale: 'TUOTEMPO', comune: r.city, provincia: r.province, cap: r.zip,
    }));
    if (!rows.length) { await finish('OK', `Nessuna prenotazione tra ${start} e ${end}`, 0, 0); return { rows_read: 0, rows_ok: 0 }; }
    const header = Object.keys(rows[0]);
    const csv = [header.join(';'), ...rows.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    const mapping = { external_ref: 'ref', sale_date: 'date', sale_time: 'time', customer_external_id: 'pid', customer_tax_code: 'cf', customer_last_name: 'cognome', customer_first_name: 'nome', customer_sex: 'sesso', customer_birth_date: 'nascita', customer_email: 'email', customer_phone: 'tel', site_code: 'sede', product_code: 'codice', product_desc: 'descrizione', gross_amount: 'prezzo', booking_channel: 'canale', customer_city: 'comune', customer_province: 'provincia', customer_zip: 'cap' };
    const r = await runImport({ source: 'TUOTEMPO', dataset: 'SALES', buffer: Buffer.from(csv, 'utf8'), filename: `tuotempo_${start}_${end}.csv`, mapping, userId });
    await finish(r.rows_skipped && !r.rows_ok ? 'ERRORE' : 'OK', `Prenotazioni lette ${r.rows_total}, importate ${r.rows_ok}, scartate ${r.rows_skipped}`, r.rows_total, r.rows_ok);
    return r;
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 400)) await finish('ERRORE', e.message);
    throw e;
  }
}
