import { Router } from 'express';
import { one, many } from '../db.js';
import { ah } from '../lib/util.js';
import { Params } from '../lib/access.js';
import { getSettings } from './admin.js';

const r = Router();

function period(query) {
  const to = query.to || new Date().toISOString().slice(0, 10);
  const from = query.from || `${to.slice(0, 4)}-01-01`;
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const prevTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(from).getTime() - days * 86400000).toISOString().slice(0, 10);
  return { from, to, days, prevFrom, prevTo };
}
function scope(query, p) {
  const w = [];
  if (query.site_id) w.push(`s.site_id=${p.add(Number(query.site_id))}`);
  if (query.kind === 'B2B') w.push('s.b2b_customer_id IS NOT NULL'); else if (query.kind === 'B2C') w.push('s.customer_id IS NOT NULL');
  if (query.line_id) w.push(`s.product_id IN (SELECT id FROM products WHERE line_id=${p.add(Number(query.line_id))})`);
  return w.length ? `AND ${w.join(' AND ')}` : '';
}

r.get('/summary', ah(async (req, res) => {
  const settings = await getSettings();
  const { from, to, days, prevFrom, prevTo } = period(req.query);
  // ogni query costruisce i propri parametri (PostgreSQL rifiuta i parametri non referenziati)
  const ctx = (prev = false) => { const p = new Params(); const F = p.add(from); const T = p.add(to); const PF = prev ? p.add(prevFrom) : null; const PT = prev ? p.add(prevTo) : null; return { p, F, T, PF, PT, sc: scope(req.query, p) }; };
  const bands = (settings.age_bands || '0-17,18-29,30-44,45-59,60-74,75+').split(',').map((x) => x.trim());
  const bandSql = `CASE WHEN c.birth_date IS NULL THEN 'n.d.' ${bands.map((b) => { const [lo, hi] = b.includes('+') ? [Number(b.replace('+', '')), 200] : b.split('-').map(Number); return `WHEN date_part('year', age(s.sale_date, c.birth_date)) BETWEEN ${lo} AND ${hi} THEN '${b}'`; }).join(' ')} ELSE 'n.d.' END`;

  const kpi = async (from_, to_) => { const pk = new Params(); const f = pk.add(from_); const t = pk.add(to_); const sck = scope(req.query, pk); return one(`SELECT coalesce(sum(s.net_amount),0) AS revenue, coalesce(sum(s.gross_amount),0) AS gross, coalesce(sum(s.discount),0) AS discount, count(DISTINCT (s.source, s.external_ref))::int AS tickets, sum(s.quantity)::int AS items,
      count(DISTINCT s.customer_id)::int AS customers, count(DISTINCT s.b2b_customer_id)::int AS b2b_customers,
      coalesce(sum(s.net_amount) FILTER (WHERE s.customer_id IS NOT NULL),0) AS revenue_b2c, coalesce(sum(s.net_amount) FILTER (WHERE s.b2b_customer_id IS NOT NULL),0) AS revenue_b2b,
      count(DISTINCT s.customer_id) FILTER (WHERE cu.first_visit BETWEEN ${f} AND ${t})::int AS new_customers,
      count(DISTINCT s.customer_id) FILTER (WHERE cu.first_visit < ${f})::int AS returning_customers
    FROM sales s LEFT JOIN customers cu ON cu.id=s.customer_id WHERE s.sale_date BETWEEN ${f} AND ${t} ${sck}`, pk.values); };
  const cur = await kpi(from, to); const prev = await kpi(prevFrom, prevTo);

  const tc = ctx();
  const trend = await many(`SELECT to_char(date_trunc('month', s.sale_date), 'YYYY-MM') AS month, coalesce(sum(s.net_amount) FILTER (WHERE s.customer_id IS NOT NULL),0) AS b2c, coalesce(sum(s.net_amount) FILTER (WHERE s.b2b_customer_id IS NOT NULL),0) AS b2b,
      count(DISTINCT (s.source, s.external_ref))::int AS tickets, count(DISTINCT s.customer_id)::int AS customers, count(DISTINCT s.customer_id) FILTER (WHERE date_trunc('month', cu.first_visit)=date_trunc('month', s.sale_date))::int AS new_customers
    FROM sales s LEFT JOIN customers cu ON cu.id=s.customer_id WHERE s.sale_date >= (${tc.F}::date - interval '12 months') AND s.sale_date <= ${tc.T} ${tc.sc} GROUP BY 1 ORDER BY 1`, tc.p.values);
  const group = (expr, join = '', order = 'revenue DESC', limit = 50) => { const { p, F, T, sc } = ctx(); return many(`SELECT ${expr} AS label, coalesce(sum(s.net_amount),0) AS revenue, count(DISTINCT (s.source, s.external_ref))::int AS tickets, count(DISTINCT coalesce(s.customer_id, s.b2b_customer_id))::int AS customers, sum(s.quantity)::int AS items
    FROM sales s ${join} WHERE s.sale_date BETWEEN ${F} AND ${T} ${sc} GROUP BY 1 ORDER BY ${order} LIMIT ${limit}`, p.values); };
  const [by_line, by_site, by_channel, by_payment, by_sex, by_age, by_province, by_city, by_weekday, by_hour, by_source, by_b2b_type] = await Promise.all([
    group('coalesce(pl.name, \'Altro\')', 'LEFT JOIN products pr ON pr.id=s.product_id LEFT JOIN product_lines pl ON pl.id=pr.line_id', 'min(pl.sort_order)'),
    group('st.name', 'JOIN sites st ON st.id=s.site_id'),
    group('coalesce(s.booking_channel, \'n.d.\')'),
    group('coalesce(s.payment_kind, \'n.d.\')'),
    group('coalesce(c.sex, \'n.d.\')', 'JOIN customers c ON c.id=s.customer_id'),
    group(bandSql, 'JOIN customers c ON c.id=s.customer_id', 'label'),
    group('coalesce(c.province, \'n.d.\')', 'JOIN customers c ON c.id=s.customer_id', 'revenue DESC', 12),
    group('coalesce(c.city, \'n.d.\') || coalesce(\' (\' || c.province || \')\', \'\')', 'JOIN customers c ON c.id=s.customer_id', 'revenue DESC', 15),
    group('extract(isodow FROM s.sale_date)::int', '', 'label'),
    group('extract(hour FROM s.sale_time)::int', '', 'label'),
    group('s.source'),
    group('coalesce(b.b2b_type, \'n.d.\')', 'JOIN customers b ON b.id=s.b2b_customer_id'),
  ]);
  const lim = Number(settings.top_products_limit || 15);
  const prodSql = (order) => { const { p, F, T, PF, PT, sc } = ctx(true); return many(`SELECT pr.id, pr.code, pr.description AS label, pl.name AS line_name, pl.color, coalesce(sum(s.net_amount),0) AS revenue, sum(s.quantity)::int AS items, count(DISTINCT coalesce(s.customer_id, s.b2b_customer_id))::int AS customers,
      coalesce(prev.revenue,0) AS revenue_prev
    FROM products pr LEFT JOIN product_lines pl ON pl.id=pr.line_id JOIN sales s ON s.product_id=pr.id AND s.sale_date BETWEEN ${F} AND ${T} ${sc}
    LEFT JOIN LATERAL (SELECT sum(x.net_amount) AS revenue FROM sales x WHERE x.product_id=pr.id AND x.sale_date BETWEEN ${PF} AND ${PT}) prev ON true
    GROUP BY pr.id, pl.name, pl.color, prev.revenue ORDER BY ${order} LIMIT ${lim}`, p.values); };
  const [top_products, bottom_products] = await Promise.all([prodSql('revenue DESC'), prodSql('revenue ASC')]);
  const { p, F, T, sc } = ctx();
  const top_b2b = await many(`SELECT b.id, b.company_name AS label, b.b2b_type, coalesce(sum(s.net_amount),0) AS revenue, count(DISTINCT (s.source, s.external_ref))::int AS tickets, sum(s.quantity)::int AS items FROM sales s JOIN customers b ON b.id=s.b2b_customer_id WHERE s.sale_date BETWEEN ${F} AND ${T} ${sc} GROUP BY b.id ORDER BY revenue DESC LIMIT 10`, p.values);
  const top_customers = await many(`SELECT c.id, c.last_name || ' ' || coalesce(c.first_name,'') AS label, c.city, coalesce(sum(s.net_amount),0) AS revenue, count(DISTINCT (s.source, s.external_ref))::int AS tickets FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.sale_date BETWEEN ${F} AND ${T} ${sc} GROUP BY c.id ORDER BY revenue DESC LIMIT 10`, p.values);

  const churn = Number(settings.churn_days || 540);
  const base = await one(`SELECT count(*) FILTER (WHERE kind='B2C')::int AS b2c, count(*) FILTER (WHERE kind='B2B')::int AS b2b, count(*) FILTER (WHERE kind='B2C' AND marketing_consent)::int AS consent,
      count(*) FILTER (WHERE kind='B2C' AND last_visit < CURRENT_DATE - interval '${churn} days')::int AS dormant,
      count(*) FILTER (WHERE kind='B2C' AND visits >= 2)::int AS recurring, round(avg(date_part('year', age(birth_date))) FILTER (WHERE kind='B2C' AND birth_date IS NOT NULL))::int AS avg_age
    FROM customers`);
  const recalls = await one(`SELECT count(*)::int AS due_30, count(*) FILTER (WHERE due < CURRENT_DATE)::int AS overdue FROM (SELECT s.customer_id, p.id, (max(s.sale_date) + (p.periodicity_months || ' months')::interval)::date AS due FROM sales s JOIN products p ON p.id=s.product_id WHERE s.customer_id IS NOT NULL AND p.periodicity_months IS NOT NULL GROUP BY s.customer_id, p.id) x
    WHERE due <= CURRENT_DATE + interval '30 days' AND NOT EXISTS (SELECT 1 FROM sales y WHERE y.customer_id=x.customer_id AND y.product_id=x.id AND y.sale_date > x.due - interval '2 months')`);
  const promo = await one(`SELECT p.id, p.name, p.claim, p.month, p.year, p.kpi_target, p.status, coalesce(r.revenue,0) AS revenue, coalesce(r.tickets,0) AS tickets, coalesce(r.customers,0) AS customers,
      (SELECT count(*)::int FROM exposure_items e WHERE e.promotion_id=p.id AND e.status='INSTALLATO') AS exposure_ok, (SELECT count(*)::int FROM exposure_items e WHERE e.promotion_id=p.id AND e.status<>'RIMOSSO') AS exposure_total
    FROM promotions p LEFT JOIN LATERAL (SELECT sum(net_amount) AS revenue, count(DISTINCT external_ref)::int AS tickets, count(DISTINCT customer_id)::int AS customers FROM sales WHERE promotion_id=p.id) r ON true
    WHERE p.year=date_part('year', CURRENT_DATE) AND p.month=date_part('month', CURRENT_DATE) AND p.status<>'ANNULLATA' ORDER BY p.id LIMIT 1`);
  const campaigns = await many(`SELECT c.id, c.name, c.channel, c.status, c.start_date, c.end_date, c.budget, c.spent, coalesce(r.revenue,0) AS revenue, coalesce(r.tickets,0) AS tickets FROM campaigns c LEFT JOIN LATERAL (SELECT sum(net_amount) AS revenue, count(DISTINCT external_ref)::int AS tickets FROM sales WHERE campaign_id=c.id) r ON true WHERE c.status='ATTIVA' OR (c.end_date >= CURRENT_DATE - 60 AND c.status<>'PIANIFICATA') ORDER BY c.start_date DESC LIMIT 8`);
  const exposure = await one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='INSTALLATO')::int AS ok, count(*) FILTER (WHERE status IN ('NON_CONFORME','DA_SOSTITUIRE'))::int AS issues, count(DISTINCT site_id) FILTER (WHERE status IN ('NON_CONFORME','DA_SOSTITUIRE','DA_INSTALLARE'))::int AS sites_with_issues FROM exposure_items WHERE status<>'RIMOSSO'`);
  const last_import = await one('SELECT created_at, source, dataset, rows_ok FROM import_batches ORDER BY created_at DESC LIMIT 1');
  const data_range = await one('SELECT min(sale_date) AS min, max(sale_date) AS max FROM sales');

  res.json({ period: { from, to, days, prevFrom, prevTo }, kpi: cur, prev, trend, by_line, by_site, by_channel, by_payment, by_sex, by_age, by_province, by_city, by_weekday, by_hour, by_source, by_b2b_type, top_products, bottom_products, top_b2b, top_customers, base, recalls, promo, campaigns, exposure, last_import, data_range, bands });
}));

// Richiami: clienti con esami periodici in scadenza (lista operativa per SMS/telefono)
r.get('/recalls', ah(async (req, res) => {
  const days = Number(req.query.days || 30);
  const rows = await many(`SELECT x.customer_id, c.last_name, c.first_name, c.phone, c.email, c.marketing_consent, c.home_site_id, st.name AS site_name, p.id AS product_id, p.code, p.description, x.last_date, x.due
    FROM (SELECT s.customer_id, p.id AS pid, max(s.sale_date) AS last_date, (max(s.sale_date) + (p.periodicity_months || ' months')::interval)::date AS due FROM sales s JOIN products p ON p.id=s.product_id WHERE s.customer_id IS NOT NULL AND p.periodicity_months IS NOT NULL GROUP BY s.customer_id, p.id) x
    JOIN customers c ON c.id=x.customer_id JOIN products p ON p.id=x.pid LEFT JOIN sites st ON st.id=c.home_site_id
    WHERE x.due <= CURRENT_DATE + ($1 || ' days')::interval AND x.due >= CURRENT_DATE - interval '120 days' ${req.query.site_id ? 'AND c.home_site_id=$2' : ''}
    ORDER BY x.due LIMIT 2000`, req.query.site_id ? [days, Number(req.query.site_id)] : [days]);
  res.json(rows);
}));

export default r;
