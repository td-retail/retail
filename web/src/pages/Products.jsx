import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, canWrite } from '../auth.jsx';
import { useApi, Card, Loading, ErrorBox, Empty, Field, Badge, Modal, useToast, Kpi, Delta, MoneyInput } from '../components/ui.jsx';
import { Donut, HBars, VBars, C } from '../components/charts.jsx';
import { PeriodFilter, SiteSelect, KindSelect, LineSelect, defaultPeriod } from '../components/filters.jsx';
import { qs, api } from '../api.js';
import { eur, eur0, num, delta, monthLabel, SEX, AGE_BUCKET } from '../format.js';

export default function Products() {
  const { user } = useAuth();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [p, setP] = useState(() => ({ preset: '12m', from: new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }));
  const [f, setF] = useState({ q: '', line_id: '', site_id: '', kind: '', active: '' });
  const [sort, setSort] = useState({ key: 'revenue', dir: -1 });
  const [open, setOpen] = useState(sp.get('open') ? Number(sp.get('open')) : null);
  const [edit, setEdit] = useState(null);
  const list = useApi(`/products${qs({ ...f, from: p.from, to: p.to })}`);
  const lines = useApi('/product-lines');
  useEffect(() => { if (sp.get('open')) { setOpen(Number(sp.get('open'))); setSp({}, { replace: true }); } }, [sp, setSp]);
  const rows = useMemo(() => { const r = [...(list.data?.rows || [])]; r.sort((a, b) => { const x = a[sort.key] ?? ''; const y = b[sort.key] ?? ''; return (typeof x === 'number' || typeof y === 'number' ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * sort.dir; }); return r; }, [list.data, sort]);
  const th = (key, label, cls = '') => <th className={`sortable ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}>{label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>;
  const tot = rows.reduce((a, x) => ({ revenue: a.revenue + Number(x.revenue), qty: a.qty + Number(x.qty), prev: a.prev + Number(x.revenue_prev) }), { revenue: 0, qty: 0, prev: 0 });
  const sold = rows.filter((x) => x.qty > 0);
  const save = async () => {
    try {
      const b = { ...edit }; delete b.id; for (const k of ['price', 'price_ssn', 'cost']) b[k] = b[k] === '' || b[k] == null ? null : Number(b[k]); for (const k of ['duration_min', 'periodicity_months']) b[k] = b[k] === '' || b[k] == null ? null : Number(b[k]); b.line_id = b.line_id ? Number(b.line_id) : null;
      for (const k of Object.keys(b)) if (!['code', 'description', 'line_id', 'specialty', 'nomenclature', 'price', 'price_ssn', 'cost', 'duration_min', 'is_package', 'periodicity_months', 'active'].includes(k)) delete b[k];
      if (edit.id) await api.put(`/products/${edit.id}`, b); else await api.post('/products', b);
      toast('Prestazione salvata'); setEdit(null); list.reload();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Prestazioni e prodotti</h1><div className="sub">Cosa funziona di più e cosa di meno: quantità, fatturato, clienti e confronto con il periodo precedente. Clicca una riga per il dettaglio (andamento, sedi, profilo di chi la compra, cosa si abbina).</div></div>
        <div className="row"><a className="btn ghost" href={`/api/products/export.xlsx${qs({ from: p.from, to: p.to })}`}>Esporta Excel</a>{canWrite(user) && <button className="btn" onClick={() => setEdit({ active: true, is_package: false })}>+ Nuova prestazione</button>}</div>
      </div>
      <PeriodFilter value={p} onChange={setP}>
        <Field label="Cerca"><input value={f.q} placeholder="Codice, descrizione, specialità" onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <LineSelect value={f.line_id} onChange={(v) => setF({ ...f, line_id: v })} />
        <SiteSelect value={f.site_id} onChange={(v) => setF({ ...f, site_id: v })} />
        <KindSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v })} />
        <Field label="Catalogo"><select value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })}><option value="">Solo attive</option><option value="all">Anche disattivate</option></select></Field>
      </PeriodFilter>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi accent label="Fatturato nel periodo" value={eur0(tot.revenue)} foot={<span><Delta value={delta(tot.revenue, tot.prev)} /> vs periodo precedente</span>} />
        <Kpi label="Prestazioni erogate" value={num(tot.qty)} foot={`${num(sold.length)} codici venduti su ${num(rows.length)} in catalogo`} />
        <Kpi label="Prezzo medio realizzato" value={eur(tot.qty ? tot.revenue / tot.qty : 0)} foot="netto per prestazione" />
        <Kpi label="Mai vendute nel periodo" value={num(rows.length - sold.length)} foot="candidate a revisione o a spinta commerciale" />
      </div>
      <ErrorBox error={list.error} />
      <Card flush>
        {!list.data ? <Loading /> : !rows.length ? <Empty>Nessuna prestazione</Empty> : (
          <div className="table-wrap"><table className="t">
            <thead><tr>{th('description', 'Prestazione')}{th('line_name', 'Linea')}{th('price', 'Listino', 'num')}{th('qty', 'Q.tà', 'num')}{th('revenue', 'Fatturato', 'num')}{th('revenue_prev', 'Δ periodo prec.', 'num')}{th('customers', 'Clienti', 'num')}{th('margin', 'Margine', 'num')}<th className="num">Sconto medio</th></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.id} className="click" onClick={() => setOpen(x.id)}>
                <td><div className="strong">{x.description}{!x.active && <Badge tone="red">disattivata</Badge>}{x.is_package && <Badge tone="mauve">pacchetto</Badge>}</div><div className="small muted">{x.code}{x.specialty ? ` · ${x.specialty}` : ''}{x.periodicity_months ? ` · richiamo ${x.periodicity_months} mesi` : ''}</div></td>
                <td><span className="pill" style={{ background: `${x.line_color || '#1C505E'}22`, color: x.line_color || 'var(--teal)' }}>{x.line_name || '–'}</span></td>
                <td className="num">{eur(x.price)}</td><td className="num">{num(x.qty)}</td><td className="num strong">{eur0(x.revenue)}</td><td className="num"><Delta value={delta(x.revenue, x.revenue_prev)} /></td><td className="num">{num(x.customers)}</td>
                <td className="num">{x.margin != null ? eur0(x.margin) : <span className="muted">–</span>}</td><td className="num small muted">{x.qty ? `${Math.round((Number(x.discount) / (Number(x.revenue) + Number(x.discount) || 1)) * 100)}%` : '–'}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={3}>Totale</td><td className="num">{num(tot.qty)}</td><td className="num">{eur0(tot.revenue)}</td><td className="num"><Delta value={delta(tot.revenue, tot.prev)} /></td><td colSpan={3} /></tr></tfoot>
          </table></div>
        )}
      </Card>
      {open && <ProductDetail id={open} onClose={() => setOpen(null)} onEdit={canWrite(user) ? (x) => { setOpen(null); setEdit(x); } : null} />}
      {edit && <Modal title={edit.id ? 'Modifica prestazione' : 'Nuova prestazione'} onClose={() => setEdit(null)} footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}>
        <div className="form-grid">
          <Field label="Codice *"><input value={edit.code || ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className="mono" /></Field>
          <Field label="Linea"><select value={edit.line_id || ''} onChange={(e) => setEdit({ ...edit, line_id: e.target.value })}><option value="">–</option>{(lines.data || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Descrizione *" className="span2"><input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <Field label="Specialità / branca"><input value={edit.specialty || ''} onChange={(e) => setEdit({ ...edit, specialty: e.target.value })} /></Field>
          <Field label="Codice nomenclatore"><input value={edit.nomenclature || ''} onChange={(e) => setEdit({ ...edit, nomenclature: e.target.value })} /></Field>
          <Field label="Prezzo listino privato"><MoneyInput value={edit.price ?? ''} onChange={(x) => setEdit({ ...edit, price: x })} /></Field>
          <Field label="Tariffa SSN"><MoneyInput value={edit.price_ssn ?? ''} onChange={(x) => setEdit({ ...edit, price_ssn: x })} /></Field>
          <Field label="Costo di produzione"><MoneyInput value={edit.cost ?? ''} onChange={(x) => setEdit({ ...edit, cost: x })} /></Field>
          <Field label="Durata (minuti)"><input type="number" value={edit.duration_min ?? ''} onChange={(e) => setEdit({ ...edit, duration_min: e.target.value })} /></Field>
          <Field label="Periodicità richiamo (mesi)" help="Vuoto = nessun richiamo"><input type="number" value={edit.periodicity_months ?? ''} onChange={(e) => setEdit({ ...edit, periodicity_months: e.target.value })} /></Field>
          <Field label="Pacchetto" className="inline"><input type="checkbox" checked={Boolean(edit.is_package)} onChange={(e) => setEdit({ ...edit, is_package: e.target.checked })} /> è un pacchetto / check-up</Field>
          <Field label="Attiva" className="inline"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> presente nel catalogo</Field>
        </div>
      </Modal>}
    </div>
  );
}

function ProductDetail({ id, onClose, onEdit }) {
  const d = useApi(`/products/${id}`);
  const x = d.data;
  return (
    <Modal title={x ? `${x.description}` : 'Prestazione'} onClose={onClose} wide footer={<>{onEdit && x && <button className="btn ghost" onClick={() => onEdit(x)}>Modifica scheda</button>}<button className="btn" onClick={onClose}>Chiudi</button></>}>
      {!x ? <Loading /> : <>
        <div className="small muted" style={{ marginBottom: 12 }}>{x.code} · {x.line_name || '–'}{x.specialty ? ` · ${x.specialty}` : ''} · listino {eur(x.price)}{x.cost != null ? ` · costo ${eur(x.cost)}` : ''}{x.duration_min ? ` · ${x.duration_min} min` : ''}{x.periodicity_months ? ` · richiamo ogni ${x.periodicity_months} mesi` : ''}</div>
        <div className="two">
          <Card title="Ultimi 12 mesi"><VBars data={x.trend.map((t) => ({ label: monthLabel(t.month), value: Number(t.revenue) }))} money keys={[{ key: 'value', label: 'Fatturato', color: C.teal }]} height={180} /></Card>
          <Card title="Per sede">{x.by_site.length ? <HBars data={x.by_site.map((s) => ({ label: s.label, value: Number(s.revenue) }))} money keys={[{ key: 'value', label: 'Fatturato', color: C.blue }]} labelWidth={170} height={Math.max(120, x.by_site.length * 26 + 20)} /> : <Empty>Nessuna vendita</Empty>}</Card>
        </div>
        <div className="two" style={{ marginTop: 16 }}>
          <Card title="Chi la compra">
            <div className="row"><div style={{ flex: 1 }}><Donut size={140} data={x.by_sex.map((s) => ({ name: SEX[s.label] || 'n.d.', value: Number(s.count), color: s.label === 'F' ? C.teal : s.label === 'M' ? C.blue : C.grey }))} /></div><div style={{ flex: 1.4 }}><VBars data={x.by_age.map((a) => ({ label: a.bucket === 'n.d.' ? 'n.d.' : AGE_BUCKET[Number(a.bucket)] || a.bucket, value: Number(a.count) }))} keys={[{ key: 'value', label: 'Pazienti', color: C.teal }]} height={140} /></div></div>
          </Card>
          <Card title="Cosa si abbina nella stessa accettazione" flush>{x.basket.length ? <table className="t"><tbody>{x.basket.map((b) => <tr key={b.id}><td>{b.description}<div className="small muted">{b.code}</div></td><td className="num">{num(b.n)} volte</td></tr>)}</tbody></table> : <Empty>Nessun abbinamento</Empty>}</Card>
        </div>
      </>}
    </Modal>
  );
}
