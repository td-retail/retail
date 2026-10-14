import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, Kpi, Card, Loading, ErrorBox, Empty, Badge, Delta, Progress } from '../components/ui.jsx';
import { Donut, HBars, VBars, Trend, Legend, C } from '../components/charts.jsx';
import { PeriodFilter, SiteSelect, KindSelect, defaultPeriod } from '../components/filters.jsx';
import { qs } from '../api.js';
import { eur, eur0, num, pct, delta, itDate, monthLabel, SEX, CHANNEL, PAYMENT, WEEKDAYS, MONTHS, itDateTime } from '../format.js';

function KpiD({ label, value, prev, foot, accent, money = true, invert }) {
  return (
    <div className={`card kpi ${accent ? 'accent' : ''}`}>
      <div className="lbl">{label}</div>
      <div className="val">{money ? eur0(value) : num(value)}</div>
      <div className="delta"><Delta value={delta(value, prev)} invert={invert} /> <span className="muted">vs periodo precedente{foot ? ` · ${foot}` : ''}</span></div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState(defaultPeriod());
  const [site, setSite] = useState('');
  const [kind, setKind] = useState('');
  const s = useApi(`/stats/summary${qs({ from: p.from, to: p.to, site_id: site, kind })}`);
  const d = s.data;
  if (s.error) return <div className="page"><ErrorBox error={s.error} /></div>;
  const k = d?.kpi; const pr = d?.prev;
  const avgTicket = k && k.tickets ? k.revenue / k.tickets : 0; const avgTicketPrev = pr && pr.tickets ? pr.revenue / pr.tickets : 0;
  const trend = (d?.trend || []).map((t) => ({ ...t, month: monthLabel(t.month), b2c: Number(t.b2c), b2b: Number(t.b2b) }));
  const promo = d?.promo;
  const target = promo?.kpi_target || {};
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Buongiorno, {user.full_name.split(' ')[0]}</h1>
          <div className="sub">Retail B2C e B2B di Toscana Diagnostica: clienti, prestazioni, campagne, promozioni ed esposizione in sede. {d?.data_range?.min ? `Dati dal ${itDate(d.data_range.min)} al ${itDate(d.data_range.max)}` : 'Nessuna vendita caricata'}{d?.last_import ? ` · ultimo import ${itDateTime(d.last_import.created_at)} (${d.last_import.source})` : ''}.</div>
        </div>
      </div>
      <PeriodFilter value={p} onChange={setP}>
        <SiteSelect value={site} onChange={setSite} />
        <KindSelect value={kind} onChange={setKind} />
      </PeriodFilter>
      {!d ? <Loading /> : <>
        <div className="grid g4">
          <KpiD accent label="Fatturato netto" value={k.revenue} prev={pr.revenue} foot={`B2C ${eur0(k.revenue_b2c)} · B2B ${eur0(k.revenue_b2b)}`} />
          <KpiD label="Accettazioni" value={k.tickets} prev={pr.tickets} money={false} foot={`${num(k.items)} prestazioni`} />
          <KpiD label="Scontrino medio" value={avgTicket} prev={avgTicketPrev} />
          <KpiD label="Sconti e abbattimenti" value={k.discount} prev={pr.discount} invert foot={k.gross ? `${pct((k.discount / k.gross) * 100, 1)} del lordo` : ''} />
        </div>
        <div className="grid g4" style={{ marginTop: 16 }}>
          <div onClick={() => nav('/clienti')} style={{ cursor: 'pointer' }}><KpiD label="Pazienti serviti" value={k.customers} prev={pr.customers} money={false} foot={`${num(k.b2b_customers)} clienti B2B`} /></div>
          <div onClick={() => nav('/clienti?segment=NUOVO')} style={{ cursor: 'pointer' }}><KpiD label="Nuovi pazienti" value={k.new_customers} prev={pr.new_customers} money={false} foot={k.customers ? `${pct((k.new_customers / k.customers) * 100)} del totale` : ''} /></div>
          <div onClick={() => nav('/clienti?segment=DORMIENTE')} style={{ cursor: 'pointer' }}><Kpi label="Base clienti" value={num(d.base.b2c)} foot={`${num(d.base.recurring)} ricorrenti · ${num(d.base.dormant)} dormienti · ${num(d.base.consent)} con consenso marketing`} /></div>
          <div onClick={() => nav('/richiami')} style={{ cursor: 'pointer' }}><Kpi label="Richiami in scadenza (30 gg)" value={num(d.recalls.due_30)} foot={`${num(d.recalls.overdue)} già scaduti · esami periodici da riproporre`} /></div>
        </div>

        <div className="grid" style={{ marginTop: 16, gridTemplateColumns: '2fr 1fr' }}>
          <Card title="Andamento mensile" actions={<span className="small muted">fatturato B2C e B2B · nuovi pazienti</span>}>
            <Trend data={trend} keys={[{ key: 'b2c', label: 'B2C', color: C.teal }, { key: 'b2b', label: 'B2B', color: C.mauve }]} lines={[{ key: 'new_customers', label: 'Nuovi pazienti', color: C.purple, dash: true }]} />
          </Card>
          <Card title="Promozione del mese" actions={promo && <Link className="btn sm ghost" to={`/promozioni/${promo.id}`}>Apri</Link>}>
            {promo ? <>
              <div className="claimbox"><div className="small" style={{ color: 'var(--blue)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700 }}>{MONTHS[promo.month - 1]} {promo.year} · {promo.name}</div><div className="big">{promo.claim || '(claim da definire)'}</div></div>
              <div style={{ marginTop: 12 }}>
                {[['Prenotazioni', promo.tickets, target.bookings, false], ['Fatturato', promo.revenue, target.revenue, true], ['Pazienti', promo.customers, target.new_customers, false]].map(([l, v, t, m]) => (
                  <div key={l} style={{ marginBottom: 8 }}><div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><span className="muted">{l}</span><span className="strong">{m ? eur0(v) : num(v)}{t ? <span className="muted"> / {m ? eur0(t) : num(t)}</span> : ''}</span></div>{t ? <Progress value={v} max={t} /> : null}</div>
                ))}
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, marginTop: 10 }}><span className="muted">Materiali esposti in sede</span><span className="strong">{promo.exposure_ok}/{promo.exposure_total}</span></div><Progress value={promo.exposure_ok} max={promo.exposure_total} />
              </div>
            </> : <Empty>Nessuna promozione pianificata per questo mese. <Link to="/promozioni">Apri il calendario</Link>.</Empty>}
          </Card>
        </div>

        <div className="grid g3" style={{ marginTop: 16 }}>
          <Card title="Fatturato per linea">
            <Donut size={190} data={d.by_line.map((x, i) => ({ name: x.label, value: Number(x.revenue), color: LINE_COLORS[i % LINE_COLORS.length] }))} money onClick={() => nav('/prodotti')} />
            <Legend items={d.by_line.map((x, i) => ({ label: `${x.label} ${eurShortPct(x.revenue, k.revenue)}`, color: LINE_COLORS[i % LINE_COLORS.length] }))} />
          </Card>
          <Card title="Sedi per fatturato" actions={<span className="small muted">clicca per filtrare</span>}>
            <HBars data={d.by_site.map((x) => ({ ...x, id: x.label, value: Number(x.revenue) }))} money keys={[{ key: 'value', label: 'Fatturato', color: C.teal }]} onClick={(row) => nav(`/vendite?site_name=${encodeURIComponent(row.label)}`)} labelWidth={200} />
          </Card>
          <Card title="Come prenotano e come pagano">
            <div className="subhead" style={{ marginTop: 0 }}>Canale di prenotazione</div>
            <HBars data={d.by_channel.map((x) => ({ label: CHANNEL[x.label] || x.label, value: Number(x.tickets) }))} keys={[{ key: 'value', label: 'Accettazioni', color: C.blue }]} labelWidth={150} height={Math.max(100, d.by_channel.length * 26 + 20)} />
            <div className="subhead">Regime di pagamento</div>
            <HBars data={d.by_payment.map((x) => ({ label: PAYMENT[x.label] || x.label, value: Number(x.revenue) }))} money keys={[{ key: 'value', label: 'Fatturato', color: C.mauve }]} labelWidth={150} height={Math.max(100, d.by_payment.length * 26 + 20)} />
          </Card>
        </div>

        <div className="grid g3" style={{ marginTop: 16 }}>
          <Card title="Chi sono i pazienti" actions={<Link className="btn sm ghost" to="/clienti">Profilazione</Link>}>
            <div className="subhead" style={{ marginTop: 0 }}>Per sesso (fatturato)</div>
            <Donut size={150} data={d.by_sex.map((x) => ({ name: SEX[x.label] || 'n.d.', value: Number(x.revenue), color: x.label === 'F' ? C.teal : x.label === 'M' ? C.blue : C.grey }))} money onClick={(x) => nav(`/clienti?sex=${x.name === 'Donna' ? 'F' : x.name === 'Uomo' ? 'M' : ''}`)} />
            <Legend items={d.by_sex.map((x) => ({ label: `${SEX[x.label] || 'n.d.'} ${num(x.customers)}`, color: x.label === 'F' ? C.teal : x.label === 'M' ? C.blue : C.grey }))} />
            <div className="subhead">Per fascia di età (pazienti)</div>
            <VBars data={d.by_age.map((x) => ({ label: x.label, value: Number(x.customers) }))} keys={[{ key: 'value', label: 'Pazienti', color: C.teal }]} height={160} onClick={(row) => { const [a, b] = String(row.label).replace('+', '-120').split('-'); nav(`/clienti?age_from=${a}&age_to=${b}`); }} />
            <div className="small muted">Età media della base clienti: {d.base.avg_age || '–'} anni.</div>
          </Card>
          <Card title="Da dove vengono" actions={<span className="small muted">residenza · fatturato</span>}>
            <div className="subhead" style={{ marginTop: 0 }}>Province</div>
            <HBars data={d.by_province.map((x) => ({ label: x.label, value: Number(x.revenue), customers: x.customers }))} money keys={[{ key: 'value', label: 'Fatturato', color: C.teal }]} labelWidth={60} height={Math.max(100, d.by_province.length * 24 + 20)} onClick={(row) => nav(`/clienti?province=${row.label}`)} />
            <div className="subhead">Comuni</div>
            <ol className="ranklist">{d.by_city.slice(0, 10).map((x, i) => <li key={x.label} className="click" onClick={() => nav(`/clienti?city=${encodeURIComponent(x.label.replace(/ \(\w+\)$/, ''))}`)} style={{ cursor: 'pointer' }}><span className="n">{i + 1}</span><span className="lbl">{x.label}</span><span className="small muted">{num(x.customers)} paz.</span><span className="v">{eur0(x.revenue)}</span></li>)}</ol>
          </Card>
          <Card title="Quando vengono">
            <div className="subhead" style={{ marginTop: 0 }}>Giorno della settimana (accettazioni)</div>
            <VBars data={d.by_weekday.map((x) => ({ label: WEEKDAYS[x.label] || x.label, value: Number(x.tickets) }))} keys={[{ key: 'value', label: 'Accettazioni', color: C.blue }]} height={150} />
            <div className="subhead">Fascia oraria</div>
            <VBars data={d.by_hour.filter((x) => x.label != null).map((x) => ({ label: `${x.label}`, value: Number(x.tickets) }))} keys={[{ key: 'value', label: 'Accettazioni', color: C.teal }]} height={150} />
          </Card>
        </div>

        <div className="grid g2" style={{ marginTop: 16 }}>
          <Card title="Prestazioni che funzionano di più" flush actions={<Link className="btn sm ghost" to="/prodotti">Tutte le prestazioni</Link>}>
            <ProductTable rows={d.top_products} nav={nav} />
          </Card>
          <Card title="Prestazioni che funzionano di meno" flush actions={<span className="small muted">tra quelle vendute nel periodo</span>}>
            <ProductTable rows={d.bottom_products} nav={nav} />
          </Card>
        </div>

        <div className="grid g3" style={{ marginTop: 16 }}>
          <Card title="Campagne in corso" flush actions={<Link className="btn sm ghost" to="/campagne">Tutte</Link>}>
            {d.campaigns.length ? <table className="t"><thead><tr><th>Campagna</th><th className="num">Speso</th><th className="num">Ricavi</th></tr></thead><tbody>{d.campaigns.map((c) => <tr key={c.id} className="click" onClick={() => nav(`/campagne/${c.id}`)}><td><div className="strong">{c.name}</div><div className="small muted">{c.channel} · {itDate(c.start_date)}{c.end_date ? ` – ${itDate(c.end_date)}` : ''}</div></td><td className="num">{eur0(c.spent ?? c.budget)}</td><td className="num strong">{eur0(c.revenue)}</td></tr>)}</tbody></table> : <Empty>Nessuna campagna attiva</Empty>}
          </Card>
          <Card title="Esposizione in sede" actions={<Link className="btn sm ghost" to="/esposizione">Book retail</Link>}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Materiali conformi</span><span className="strong">{d.exposure.ok}/{d.exposure.total}</span></div>
            <Progress value={d.exposure.ok} max={d.exposure.total} />
            <p className="small muted" style={{ marginTop: 10 }}>{d.exposure.issues} material{d.exposure.issues === 1 ? 'e' : 'i'} da sostituire o non conform{d.exposure.issues === 1 ? 'e' : 'i'} · {d.exposure.sites_with_issues} sed{d.exposure.sites_with_issues === 1 ? 'e' : 'i'} con interventi aperti.</p>
          </Card>
          <Card title="Top clienti B2B" flush actions={<Link className="btn sm ghost" to="/clienti/b2b">Elenco B2B</Link>}>
            {d.top_b2b.length ? <table className="t"><thead><tr><th>Azienda</th><th className="num">Prestazioni</th><th className="num">Fatturato</th></tr></thead><tbody>{d.top_b2b.slice(0, 8).map((c) => <tr key={c.id} className="click" onClick={() => nav(`/clienti/${c.id}`)}><td className="strong">{c.label}</td><td className="num">{num(c.items)}</td><td className="num">{eur0(c.revenue)}</td></tr>)}</tbody></table> : <Empty>Nessuna vendita B2B nel periodo</Empty>}
          </Card>
        </div>
      </>}
    </div>
  );
}

const LINE_COLORS = [C.teal, C.blue, C.mauve, C.green, C.gold, C.grey];
const eurShortPct = (v, tot) => (tot ? `${Math.round((Number(v) / Number(tot)) * 100)}%` : '');

function ProductTable({ rows, nav }) {
  if (!rows.length) return <Empty>Nessuna vendita nel periodo</Empty>;
  return (
    <div className="table-wrap"><table className="t"><thead><tr><th>Prestazione</th><th className="num">Q.tà</th><th className="num">Fatturato</th><th className="num">Δ</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.id} className="click" onClick={() => nav(`/prodotti?open=${x.id}`)}><td><div className="strong">{x.label}</div><div className="small muted">{x.code} · {x.line_name}</div></td><td className="num">{num(x.items)}</td><td className="num strong">{eur0(x.revenue)}</td><td className="num"><Delta value={delta(x.revenue, x.revenue_prev)} /></td></tr>)}</tbody></table></div>
  );
}
