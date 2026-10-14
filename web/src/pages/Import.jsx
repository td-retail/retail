import React, { useRef, useState } from 'react';
import { useApi, Card, Loading, ErrorBox, Empty, Field, Badge, useToast, Icon, ConfirmModal } from '../components/ui.jsx';
import { api } from '../api.js';
import { num, itDateTime, SOURCE } from '../format.js';

const SOURCES = [['GIPO', 'GIPO (Docplanner) · accettazioni e pazienti B2C'], ['TUOTEMPO', 'TuoTempo · prenotazioni online'], ['STUDIOLAB', 'StudioLab (CB Sistemi) · accettazioni B2B'], ['IMPORT', 'Altro file (format Retail)']];
const DATASETS = [['SALES', 'Vendite / accettazioni'], ['CUSTOMERS', 'Anagrafiche clienti'], ['PRODUCTS', 'Catalogo prestazioni (listino)']];

export default function Import() {
  const toast = useToast();
  const input = useRef(null);
  const [source, setSource] = useState('GIPO');
  const [dataset, setDataset] = useState('SALES');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null);
  const batches = useApi('/sales/import/batches');
  const reset = () => { setFile(null); setPreview(null); setMapping({}); setResult(null); if (input.current) input.current.value = ''; };
  const onFile = async (f) => {
    if (!f) return; setFile(f); setResult(null); setBusy(true);
    try { const fd = new FormData(); fd.append('file', f); fd.append('source', source); fd.append('dataset', dataset); const r = await api.upload('/sales/import/preview', fd); setPreview(r); setMapping(r.mapping); }
    catch (e) { toast(e.message, 'err'); setPreview(null); }
    finally { setBusy(false); }
  };
  const run = async (dry) => {
    setBusy(true); setResult(null);
    try { const fd = new FormData(); fd.append('file', file); fd.append('source', source); fd.append('dataset', dataset); fd.append('mapping', JSON.stringify(mapping)); if (dry) fd.append('dry_run', '1'); const r = await api.upload('/sales/import/run', fd); setResult(r); if (!dry) { toast(`Import completato: ${r.rows_ok} righe`); batches.reload(); } }
    catch (e) { setResult({ error: e.message, errors: e.errors || e.details || [] }); }
    finally { setBusy(false); }
  };
  const missingRequired = preview ? preview.fields.filter((f) => f.required && !mapping[f.key]) : [];
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Import dai gestionali</h1><div className="sub">Carica gli export Excel o CSV di GIPO, TuoTempo e StudioLab. Alla prima importazione mappi le colonne; la mappatura resta salvata per quella sorgente e il caricamento diventa ripetibile. Le righe già presenti (stesso numero di accettazione) vengono aggiornate, non duplicate.</div></div>
        <div className="row"><a className="btn ghost" href={`/api/sales/import/template.xlsx?dataset=${dataset}`}><Icon name="download" />Scarica format {DATASETS.find((d) => d[0] === dataset)?.[1]}</a></div>
      </div>
      <div className="steps">
        <div className={`s ${!preview ? 'now' : 'done'}`}><i>1</i> Sorgente e file</div>
        <div className={`s ${preview && !result?.batch_id ? 'now' : result?.batch_id ? 'done' : ''}`}><i>2</i> Mappatura colonne</div>
        <div className={`s ${result && !result.batch_id && !result.error ? 'now' : result?.batch_id ? 'done' : ''}`}><i>3</i> Verifica</div>
        <div className={`s ${result?.batch_id ? 'done' : ''}`}><i>4</i> Import</div>
      </div>
      <div className="grid g2">
        <Card title="1 · Sorgente e file">
          <div className="form-grid">
            <Field label="Gestionale di origine"><select value={source} onChange={(e) => { setSource(e.target.value); reset(); }}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Contenuto del file"><select value={dataset} onChange={(e) => { setDataset(e.target.value); reset(); }}>{DATASETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="File Excel (.xlsx) o CSV" className="span2"><input ref={input} type="file" accept=".xlsx,.csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
          </div>
          {busy && !preview && <Loading text="Lettura del file…" />}
          {preview && <div className="alert info" style={{ marginTop: 12, display: 'block' }}>{num(preview.rows_total)} righe, {preview.headers.length} colonne. {preview.saved ? 'Mappatura recuperata dall\'ultimo import di questa sorgente.' : 'Mappatura proposta automaticamente dai nomi delle colonne: controllala prima di procedere.'}</div>}
        </Card>
        <Card title="Come funziona">
          <p className="small"><b>GIPO</b>: esporta da Statistiche o Fatturazione l'elenco delle accettazioni con righe di prestazione (numero accettazione, data, paziente, codice e descrizione prestazione, importi, regime). Per le anagrafiche usa l'export pazienti.</p>
          <p className="small"><b>TuoTempo</b>: esporta le prenotazioni dal pannello (data, ora, paziente, sede/area, attività, canale). Le prenotazioni senza importo prendono il prezzo di listino del catalogo.</p>
          <p className="small"><b>StudioLab</b>: esporta le accettazioni B2B con l'azienda o la struttura committente: ogni riga diventa una vendita B2B collegata al cliente aziendale (creato se manca).</p>
          <p className="small"><b>Sedi</b>: la colonna sede viene riconosciuta dal codice (es. FI-CEC) o dal nome configurato in Sedi del network. <b>Prestazioni</b> non in catalogo vengono create con il codice del file; completa linea e prezzi dalla pagina Prestazioni.</p>
        </Card>
      </div>
      {preview && (
        <Card title="2 · Mappatura colonne" className="card mt" actions={<span className="small muted">a sinistra il campo Retail, a destra la colonna del tuo file</span>}>
          <div className="wizard-map">
            {preview.fields.map((f) => (
              <Field key={f.key} label={<span>{f.label}{f.required && <span className="req"> *</span>}</span>}>
                <select value={mapping[f.key] || ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })} style={{ borderColor: f.required && !mapping[f.key] ? 'var(--red)' : undefined }}>
                  <option value="">– non presente –</option>{preview.headers.map((h) => <option key={h} value={h}>{h}{preview.sample[0]?.[h] != null ? ` (es. ${String(preview.sample[0][h]).slice(0, 24)})` : ''}</option>)}
                </select>
              </Field>
            ))}
          </div>
          {missingRequired.length > 0 && <div className="alert warn" style={{ marginTop: 12 }}>Campi obbligatori non mappati: {missingRequired.map((f) => f.label).join(', ')}.</div>}
          <div className="subhead">Anteprima (prime righe del file)</div>
          <div className="table-wrap" style={{ maxHeight: 220 }}><table className="t"><thead><tr>{preview.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.sample.map((r, i) => <tr key={i}>{preview.headers.map((h) => <td key={h} className="small">{r[h] instanceof Object ? JSON.stringify(r[h]) : String(r[h] ?? '')}</td>)}</tr>)}</tbody></table></div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn ghost" disabled={busy || missingRequired.length > 0} onClick={() => run(true)}>3 · Verifica senza salvare</button>
            <button className="btn" disabled={busy || missingRequired.length > 0} onClick={() => run(false)}><Icon name="upload" />{busy ? 'In corso…' : '4 · Importa'}</button>
            <button className="btn link" onClick={reset}>Annulla</button>
          </div>
          {result && (result.error ? <div className="alert err" style={{ marginTop: 12, display: 'block' }}>{result.error}{result.errors?.length ? <ul className="small">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}</div>
            : <div className={`alert ${result.rows_skipped ? 'warn' : 'ok'}`} style={{ marginTop: 12, display: 'block' }}>
              <b>{result.dry_run ? 'Verifica' : 'Import'} completat{result.dry_run ? 'a' : 'o'}:</b> {num(result.rows_total)} righe lette, {num(result.rows_ok)} valide, {num(result.rows_skipped)} scartate.{result.dry_run ? ' Nessun dato è stato salvato.' : ''}
              {result.errors?.length ? <ul className="small" style={{ marginTop: 6 }}>{result.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}{result.errors.length > 30 && <li>… e altri {result.errors.length - 30}</li>}</ul> : null}
            </div>)}
        </Card>
      )}
      <Card title="Importazioni eseguite" className="card mt" flush actions={<span className="small muted">una importazione si può annullare: le sue righe di vendita vengono rimosse</span>}>
        {!batches.data ? <Loading /> : !batches.data.length ? <Empty>Nessuna importazione</Empty> : (
          <table className="t"><thead><tr><th>Quando</th><th>Sorgente</th><th>Contenuto</th><th>File</th><th className="num">Righe</th><th className="num">OK</th><th className="num">Scartate</th><th>Utente</th><th /></tr></thead>
            <tbody>{batches.data.map((b) => <tr key={b.id}><td className="small">{itDateTime(b.created_at)}</td><td><Badge tone="teal">{SOURCE[b.source] || b.source}</Badge></td><td>{DATASETS.find((d) => d[0] === b.dataset)?.[1] || b.dataset}</td><td className="small">{b.filename}</td><td className="num">{num(b.rows_total)}</td><td className="num">{num(b.rows_ok)}</td><td className="num">{b.rows_skipped ? <span className="red">{num(b.rows_skipped)}</span> : '0'}</td><td className="small">{b.user_name || '–'}</td><td className="num">{b.dataset === 'SALES' && <button className="btn sm danger" onClick={() => setUndo(b)}>Annulla</button>}</td></tr>)}</tbody></table>
        )}
      </Card>
      {undo && <ConfirmModal danger title="Annulla importazione" text={`Rimuovere le righe di vendita importate da "${undo.filename}" (${num(undo.rows_ok)} righe)? I clienti e le prestazioni creati restano.`} confirmText="Rimuovi" onClose={() => setUndo(null)} onConfirm={async () => { const r = await api.del(`/sales/import/batches/${undo.id}`); toast(`${r.deleted} righe rimosse`); batches.reload(); }} />}
    </div>
  );
}
