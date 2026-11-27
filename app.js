'use strict';
/* Family Money — personal finance tracker (vanilla JS + Supabase + Chart.js) */

const C = window.APP_CONFIG || {};
const sb = /^https?:\/\//.test(C.SUPABASE_URL || '') ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const money = n => inr.format(Math.round(+n || 0));
const short = n => { n = +n || 0; const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(2) + 'Cr'; if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(2) + 'L'; if (a >= 1e3) return s + '₹' + (a / 1e3).toFixed(1) + 'k'; return s + '₹' + Math.round(a); };
const pct = n => (isFinite(n) ? Math.round(n * 100) : 0) + '%';
const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ymOf = d => String(d).slice(0, 7);
const addMonths = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad(m)}`; };
const monthName = (ym, long) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' });
const dayLabel = d => { const t = today(); if (d === t) return 'Today'; const y = new Date(); y.setDate(y.getDate() - 1); if (d === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return 'Yesterday'; return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const inc = (o, k, v) => { o[k] = (o[k] || 0) + v; };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PALETTE = ['#7c8cff', '#2ee59d', '#ff8f5a', '#5ac8fa', '#ff6fae', '#ffd56b', '#a78bfa', '#22d3ee', '#fb7185', '#a3e635', '#f472b6', '#94a3b8'];

function toast(msg, type = '') { const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + type; clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', 2600); }
function loading(on) { $('#loader').classList.toggle('show', !!on); }

/* ---------- state ---------- */
const TABLES = ['people', 'categories', 'methods', 'transactions', 'investments', 'chitties', 'loans'];
const S = {
  d: Object.fromEntries(TABLES.map(t => [t, []])),
  month: ymOf(today()), view: 'home',
  f: { q: '', type: '', person: '', cat: '', method: '', month: ymOf(today()) },
  range: 6, rtab: 'charts', wtab: 'inv',
};
const M = { cat: new Map(), meth: new Map(), ppl: new Map(), inv: new Map(), chit: new Map(), loan: new Map() };
function indexData() {
  M.cat = new Map(S.d.categories.map(x => [x.id, x]));
  M.meth = new Map(S.d.methods.map(x => [x.id, x]));
  M.ppl = new Map(S.d.people.map(x => [x.id, x]));
  M.inv = new Map(S.d.investments.map(x => [x.id, x]));
  M.chit = new Map(S.d.chitties.map(x => [x.id, x]));
  M.loan = new Map(S.d.loans.map(x => [x.id, x]));
}
const sortTx = () => S.d.transactions.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
const personName = id => id ? (M.ppl.get(id)?.name || '—') : 'Joint';
const personColor = id => id ? (M.ppl.get(id)?.color || '#7c8cff') : '#ffb547';

async function fetchAll(t) {
  let all = [], from = 0; const step = 1000;
  for (;;) {
    let q = sb.from(t).select('*').range(from, from + step - 1);
    q = t === 'transactions' ? q.order('date', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at');
    const { data, error } = await q; if (error) throw error;
    all = all.concat(data); if (data.length < step) break; from += step;
  }
  return all;
}
async function loadAll(silent) {
  if (!silent) loading(true);
  try { const res = await Promise.all(TABLES.map(fetchAll)); TABLES.forEach((t, i) => S.d[t] = res[i]); sortTx(); indexData();
    const st = await sb.from('app_settings').select('*'); S.settings = Object.fromEntries((st.data || []).map(r => [r.key, r.value])); }
  catch (e) { toast(e.message || 'Load failed', 'err'); }
  finally { loading(false); }
}
async function save(table, row) {
  const { id, ...rest } = row;
  const q = id ? sb.from(table).update(rest).eq('id', id).select().single() : sb.from(table).insert(rest).select().single();
  const { data, error } = await q;
  if (error) { toast(error.message, 'err'); throw error; }
  const arr = S.d[table]; const i = arr.findIndex(x => x.id === data.id);
  if (i >= 0) arr[i] = data; else arr.unshift(data);
  if (table === 'transactions') sortTx();
  indexData(); return data;
}
async function removeRow(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { toast(error.message, 'err'); throw error; }
  S.d[table] = S.d[table].filter(x => x.id !== id); indexData();
}

/* ---------- domain ---------- */
const TYPES = {
  expense: { label: 'Expense', icon: '💸', sign: -1, color: '#ff6b81' },
  income: { label: 'Income', icon: '💰', sign: 1, color: '#2ee59d' },
  investment: { label: 'Invest', icon: '📈', sign: -1, color: '#7c8cff' },
  chitty: { label: 'Chitty', icon: '🪙', sign: -1, color: '#ffb547' },
  emi: { label: 'Loan EMI', icon: '🏦', sign: -1, color: '#ff8f5a' },
  cc_bill: { label: 'Card Bill', icon: '💳', sign: -1, color: '#5ac8fa' },
  chitty_payout: { label: 'Chitty Payout', icon: '🎯', sign: 1, color: '#ffd56b' },
  withdrawal: { label: 'Redeem', icon: '↩️', sign: 1, color: '#a0e7ff' },
};
const INV_KINDS = { stock: 'Stocks', mf: 'Mutual Fund', fd: 'FD / RD', gold: 'Gold', ppf: 'PPF / EPF', nps: 'NPS', savings: 'Savings / Emergency', other: 'Other' };
const METH_KINDS = { cash: 'Cash', upi: 'UPI', wallet: 'Wallet', card: 'Credit Card', bank: 'Bank' };
const METH_ICON = { cash: '💵', upi: '📲', wallet: '👛', card: '💳', bank: '🏦' };

const txInMonth = ym => S.d.transactions.filter(t => ymOf(t.date) === ym);

function agg(list) {
  const a = { income: 0, expense: 0, invest: 0, chitty: 0, emi: 0, principal: 0, interest: 0, payout: 0, withdraw: 0, ccbill: 0,
    byCat: {}, byPerson: {}, incByPerson: {}, saveByPerson: {}, byMethod: {}, byGroup: { need: 0, want: 0 }, count: 0, smallCount: 0, smallSum: 0 };
  for (const t of list) {
    const v = +t.amount || 0, pk = t.person_id || 'joint';
    switch (t.type) {
      case 'income': a.income += v; inc(a.incByPerson, pk, v); break;
      case 'expense': {
        a.expense += v; a.count++; inc(a.byCat, t.category_id || 'none', v); inc(a.byPerson, pk, v); inc(a.byMethod, t.method_id || 'none', v);
        a.byGroup[M.cat.get(t.category_id)?.grp === 'need' ? 'need' : 'want'] += v;
        if (v <= 200) { a.smallCount++; a.smallSum += v; } break;
      }
      case 'investment': a.invest += v; inc(a.saveByPerson, pk, v); break;
      case 'chitty': a.chitty += v; inc(a.saveByPerson, pk, v); break;
      case 'emi': { const p = Math.min(v, +t.principal_part || 0); a.emi += v; a.principal += p; a.interest += v - p; inc(a.byCat, 'interest', v - p); inc(a.byPerson, pk, v - p); inc(a.saveByPerson, pk, p); a.byGroup.need += v - p; break; }
      case 'chitty_payout': a.payout += v; inc(a.saveByPerson, pk, -v); break;
      case 'withdrawal': a.withdraw += v; inc(a.saveByPerson, pk, -v); break;
      case 'cc_bill': a.ccbill += v; break;
    }
  }
  a.consumption = a.expense + a.interest;
  a.indirect = a.invest + a.chitty + a.principal - a.payout - a.withdraw;
  a.total = a.income - a.consumption;
  a.direct = a.total - a.indirect;
  a.rate = a.income ? a.total / a.income : 0;
  a.outflow = a.expense + a.invest + a.chitty + a.emi;
  return a;
}
const catName = id => id === 'interest' ? 'Loan Interest' : id === 'none' ? 'Uncategorised' : (M.cat.get(id)?.name || 'Deleted');
const catIcon = id => id === 'interest' ? '🏦' : (M.cat.get(id)?.icon || '📦');
const catColor = (id, i = 0) => id === 'interest' ? '#ff8f5a' : (M.cat.get(id)?.color || PALETTE[i % PALETTE.length]);

function refTotals() {
  const r = {};
  for (const t of S.d.transactions) {
    if (!t.ref_id) continue;
    const o = r[t.ref_id] || (r[t.ref_id] = { inv: 0, wd: 0, chit: 0, chitN: 0, payout: 0, prin: 0, intr: 0, emiN: 0, lastDate: null });
    const v = +t.amount || 0;
    if (t.type === 'investment') o.inv += v;
    else if (t.type === 'withdrawal') o.wd += v;
    else if (t.type === 'chitty') { o.chit += v; o.chitN++; }
    else if (t.type === 'chitty_payout') o.payout += v;
    else if (t.type === 'emi') { const p = Math.min(v, +t.principal_part || 0); o.prin += p; o.intr += v - p; o.emiN++; }
    if (!o.lastDate || t.date > o.lastDate) o.lastDate = t.date;
  }
  return r;
}
function nper(rate, emi, p) { const r = rate / 1200; if (p <= 0) return 0; if (!emi) return null; if (!r) return Math.ceil(p / emi); const x = 1 - r * p / emi; if (x <= 0) return null; return Math.ceil(-Math.log(x) / Math.log(1 + r)); }
function wealth() {
  const R = refTotals(); const z = { inv: 0, wd: 0, chit: 0, chitN: 0, payout: 0, prin: 0, intr: 0, emiN: 0 };
  const inv = S.d.investments.map(i => { const o = R[i.id] || z; const invested = (+i.opening_invested || 0) + o.inv - o.wd; const cur = i.current_value != null ? +i.current_value : invested; return { ...i, invested, cur, gain: cur - invested, gainPct: invested > 0 ? (cur - invested) / invested : 0, lastDate: o.lastDate }; });
  const chit = S.d.chitties.map(c => { const o = R[c.id] || z; const paid = (+c.opening_paid || 0) + o.chit; const n = (+c.opening_months || 0) + o.chitN; const remainingN = Math.max(0, (+c.months || 0) - n); const asset = c.closed ? 0 : paid - o.payout; return { ...c, paid, n, remainingN, received: o.payout, asset, remainingAmt: remainingN * (+c.installment || 0), lastDate: o.lastDate }; });
  const loans = S.d.loans.map(l => { const o = R[l.id] || z; const paidP = (+l.opening_principal_paid || 0) + o.prin; const out = l.closed ? 0 : Math.max(0, (+l.principal || 0) - paidP); return { ...l, paidP, out, interestPaid: o.intr, emiN: o.emiN, monthsLeft: nper(+l.rate, +l.emi, out), progress: l.principal > 0 ? Math.min(1, paidP / l.principal) : 0, lastDate: o.lastDate }; });
  const cards = S.d.methods.filter(m => m.kind === 'card').map(m => { let due = +m.opening_due || 0, spent = 0, paid = 0; for (const t of S.d.transactions) { if (t.method_id !== m.id) continue; if (t.type === 'expense') { due += +t.amount; spent += +t.amount; } else if (t.type === 'cc_bill') { due -= +t.amount; paid += +t.amount; } } return { ...m, due, spent, paid }; });
  const tInv = sum(inv, x => x.cur), tInvested = sum(inv, x => x.invested), tChit = sum(chit, x => x.asset), tLoan = sum(loans, x => x.out), tCard = sum(cards, x => Math.max(0, x.due));
  return { inv, chit, loans, cards, tInv, tInvested, tChit, tLoan, tCard, assets: tInv + Math.max(0, tChit), liab: tLoan + tCard + Math.max(0, -tChit), net: tInv + tChit - tLoan - tCard };
}
function emiSplit(loanId, amount, excludeTxId) {
  const l = M.loan.get(loanId); if (!l) return { principal: amount, interest: 0, out: 0 };
  let paidP = +l.opening_principal_paid || 0;
  for (const t of S.d.transactions) if (t.type === 'emi' && t.ref_id === loanId && t.id !== excludeTxId) paidP += Math.min(+t.amount, +t.principal_part || 0);
  const out = Math.max(0, (+l.principal || 0) - paidP);
  const interest = Math.round(out * (+l.rate || 0) / 1200);
  const principal = Math.max(0, Math.min(out, amount - interest));
  return { principal, interest: amount - principal, out };
}

/* ---------- suggestions ---------- */
function suggestions(ym) {
  const out = [], push = (lvl, icon, title, text) => out.push({ lvl, icon, title, text });
  const cur = agg(txInMonth(ym));
  const prevs = [1, 2, 3].map(i => agg(txInMonth(addMonths(ym, -i))));
  const prevWithData = prevs.filter(p => p.income || p.expense);
  const avg = k => prevWithData.length ? sum(prevWithData, p => p[k]) / prevWithData.length : 0;
  const W = wealth();

  if (!cur.income && !cur.expense) { push('', '📝', 'Nothing recorded yet', `Add salaries and expenses for ${monthName(ym, true)} to unlock insights.`); return out; }
  if (!cur.income) push('warn', '💼', 'No income added', 'Add both salaries for this month so savings rate and suggestions are accurate.');
  else if (cur.rate < 0) push('bad', '🚨', 'Spending more than earning', `You spent ${money(-cur.total)} more than you earned this month. Look at the top categories below and pause non-essential spending.`);
  else if (cur.rate < 0.2) push('warn', '📉', `Savings rate ${pct(cur.rate)} — below 20%`, `Aim for at least 20–30%. Saving ${money(cur.income * 0.2 - cur.total)} more this month gets you to 20%.`);
  else if (cur.rate >= 0.35) push('good', '🏆', `Great! Savings rate ${pct(cur.rate)}`, `You kept ${money(cur.total)} of ${money(cur.income)} this month. Move idle cash into your SIP / FD so it keeps growing.`);
  else push('good', '👍', `Healthy savings rate ${pct(cur.rate)}`, `On track. Pushing to 35% would add ${money(cur.income * 0.35 - cur.total)} more each month.`);

  if (prevWithData.length && cur.income) {
    const pr = prevs[0].income ? prevs[0].rate : null;
    if (pr != null) { const d = cur.rate - pr; if (Math.abs(d) >= 0.05) push(d > 0 ? 'good' : 'warn', d > 0 ? '📈' : '📉', `Savings rate ${d > 0 ? 'up' : 'down'} ${Math.abs(Math.round(d * 100))} pts vs last month`, d > 0 ? 'Nice improvement — keep the momentum.' : 'Check what changed against last month in Reports.'); }
  }

  // category spikes
  const spikes = [];
  for (const [cid, v] of Object.entries(cur.byCat)) {
    const pAvg = prevWithData.length ? sum(prevWithData, p => p.byCat[cid] || 0) / prevWithData.length : 0;
    if (pAvg > 0 && v > pAvg * 1.3 && v - pAvg > 1000) spikes.push({ cid, v, pAvg });
  }
  spikes.sort((a, b) => (b.v - b.pAvg) - (a.v - a.pAvg)).slice(0, 3).forEach(s =>
    push('warn', catIcon(s.cid), `${catName(s.cid)} up ${Math.round((s.v / s.pAvg - 1) * 100)}%`, `${money(s.v)} this month vs ${money(s.pAvg)} average of the previous months.`));

  // budgets
  for (const c of S.d.categories) {
    if (c.kind !== 'expense' || !c.budget) continue; const v = cur.byCat[c.id] || 0;
    if (v > c.budget) push('bad', c.icon, `${c.name} over budget`, `${money(v)} spent vs ${money(c.budget)} budget (${money(v - c.budget)} over).`);
    else if (v > c.budget * 0.85 && ym === ymOf(today())) push('warn', c.icon, `${c.name} near budget`, `${pct(v / c.budget)} of ${money(c.budget)} used.`);
  }

  // 50/30/20
  if (cur.income) {
    const wantsShare = cur.byGroup.want / cur.income, needsShare = cur.byGroup.need / cur.income;
    if (wantsShare > 0.3) push('warn', '🎯', `Wants are ${pct(wantsShare)} of income`, `The 50/30/20 rule suggests ≤30% for wants. Trimming ${money(cur.byGroup.want - cur.income * 0.3)} gets you there.`);
    if (needsShare > 0.6) push('warn', '🏠', `Needs are ${pct(needsShare)} of income`, 'Fixed costs are high. Review rent, subscriptions, insurance and loan interest.');
    const emiShare = cur.emi / cur.income;
    if (emiShare > 0.4) push('bad', '🏦', `EMIs take ${pct(emiShare)} of income`, 'Above 40% is risky. Avoid new loans and consider prepaying the costliest one.');
    else if (emiShare > 0.25) push('warn', '🏦', `EMIs take ${pct(emiShare)} of income`, 'Try to keep total EMIs under 25–30% of income.');
  }

  // credit card usage
  const cardIds = new Set(S.d.methods.filter(m => m.kind === 'card').map(m => m.id));
  const cardSpend = sum(Object.entries(cur.byMethod).filter(([k]) => cardIds.has(k)), ([, v]) => v);
  if (cur.expense && cardSpend / cur.expense > 0.5) push('', '💳', `${pct(cardSpend / cur.expense)} of spending on credit card`, 'Fine for rewards — but always pay the full bill. Card interest is ~36–42% a year.');
  const dueCards = W.cards.filter(c => c.due > 0);
  if (dueCards.length) push('warn', '💳', `Card dues ${money(sum(dueCards, c => c.due))}`, dueCards.map(c => `${c.name}: ${money(c.due)}`).join(' · ') + '. Record the bill payment as "Card Bill" when paid.');

  // invest discipline
  if (cur.income && cur.invest + cur.chitty === 0) push('warn', '🌱', 'No investment this month', 'Even a small SIP keeps the habit. Automate it on salary day.');
  const sipTotal = sum(S.d.investments, i => +i.monthly_sip || 0);
  if (sipTotal && cur.invest < sipTotal * 0.9 && ym !== ymOf(today())) push('warn', '📆', 'SIPs missed?', `Planned SIPs total ${money(sipTotal)} but only ${money(cur.invest)} recorded.`);

  // emergency fund
  const avgCons = (avg('consumption') * prevWithData.length + cur.consumption) / (prevWithData.length + 1);
  const liquid = sum(W.inv.filter(i => ['fd', 'savings'].includes(i.kind)), i => i.cur);
  if (avgCons > 0) {
    const months = liquid / avgCons;
    if (months < 3) push('bad', '🛟', `Emergency fund covers ${months.toFixed(1)} months`, `Build ${money(avgCons * 6 - liquid)} more in FD / savings to reach a 6-month safety net (${money(avgCons * 6)}).`);
    else if (months < 6) push('warn', '🛟', `Emergency fund covers ${months.toFixed(1)} months`, `Target is 6 months (${money(avgCons * 6)}). ${money(avgCons * 6 - liquid)} to go.`);
    else push('good', '🛟', `Emergency fund: ${months.toFixed(1)} months`, 'Solid safety net. Extra cash can go to long-term equity.');
  }

  // costly loans
  W.loans.filter(l => l.out > 0 && +l.rate >= 11).sort((a, b) => b.rate - a.rate).slice(0, 2).forEach(l =>
    push('', '⚡', `Prepay ${l.name} (${l.rate}%)`, `Outstanding ${money(l.out)}. Any spare money here earns a guaranteed ${l.rate}% — better than most FDs.`));

  // small payments leak
  if (cur.smallCount >= 25) push('', '☕', `${cur.smallCount} small payments = ${money(cur.smallSum)}`, 'UPI/wallet small spends add up. Check snacks, rides and delivery fees.');

  // projection
  const totals = [cur, ...prevWithData].filter(p => p.income);
  if (totals.length >= 2) { const m = sum(totals, p => p.total) / totals.length; push('', '🔮', `At this pace: ${short(m * 12)} / year`, `Average monthly savings ${money(m)} → about ${short(m * 60)} in 5 years before any returns.`); }

  const top = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1])[0];
  if (top && cur.consumption) push('', catIcon(top[0]), `Biggest spend: ${catName(top[0])}`, `${money(top[1])} — ${pct(top[1] / cur.consumption)} of this month's spending.`);
  return out;
}

/* ---------- charts ---------- */
let charts = [];
function killCharts() { charts.forEach(c => c.destroy()); charts = []; }
function mkChart(el, cfg) {
  if (!el || !window.Chart) return;
  Chart.defaults.color = css('--muted'); Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif"; Chart.defaults.borderColor = css('--line');
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${money(c.raw)}` } } } }, cfg.options || {});
  charts.push(new Chart(el, cfg));
}
function donut(el, labels, data, colors) {
  mkChart(el, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] }, options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${money(c.raw)}` } } } } });
}
const axisMoney = { ticks: { callback: v => short(v) }, grid: { color: 'rgba(128,140,180,.12)' } };

/* ---------- views ---------- */
const VIEWS = { home: 'Home', activity: 'Activity', wealth: 'Wealth', reports: 'Reports', settings: 'Settings' };
function go(v) { S.view = v; $$('.nav a[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === v)); render(); window.scrollTo({ top: 0 }); }
function render() {
  killCharts();
  $('#viewTitle').textContent = VIEWS[S.view];
  const h = new Date().getHours(); $('#greet').textContent = h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  const fn = { home: viewHome, activity: viewActivity, wealth: viewWealth, reports: viewReports, settings: viewSettings }[S.view];
  $('#view').innerHTML = fn(); const after = fn.after; if (after) after();
}
function monthNav(key = 'month') {
  return `<div class="month-nav"><button data-mn="-1" data-key="${key}" aria-label="Previous month">‹</button><b>${monthName(S[key] || S.f.month, true)}</b><button data-mn="1" data-key="${key}" aria-label="Next month">›</button></div>`;
}
function txItem(t) {
  const T = TYPES[t.type] || TYPES.expense; let title = '', icon = T.icon, sub = [];
  if (t.type === 'expense' || t.type === 'income') { title = catName(t.category_id || 'none'); icon = catIcon(t.category_id); }
  else if (t.type === 'investment' || t.type === 'withdrawal') title = (M.inv.get(t.ref_id)?.name || 'Investment');
  else if (t.type === 'chitty' || t.type === 'chitty_payout') title = (M.chit.get(t.ref_id)?.name || 'Chitty');
  else if (t.type === 'emi') title = (M.loan.get(t.ref_id)?.name || 'Loan') + ' EMI';
  else if (t.type === 'cc_bill') title = (M.meth.get(t.method_id)?.name || 'Card') + ' bill';
  if (!['expense', 'income'].includes(t.type)) sub.push(T.label);
  sub.push(personName(t.person_id));
  if (t.method_id && t.type !== 'cc_bill') sub.push(M.meth.get(t.method_id)?.name || '');
  if (t.note) sub.push(t.note);
  const sign = T.sign > 0 ? '+' : '−', cls = t.type === 'income' ? 'good' : t.type === 'expense' ? '' : 'dim';
  const extra = t.type === 'emi' && t.principal_part != null ? `<small>Principal ${short(t.principal_part)}</small>` : '';
  return `<div class="item" data-tx="${t.id}"><div class="ic" style="background:${T.color}22">${icon}</div><div class="mid"><div class="t">${esc(title)}</div><div class="sub">${esc(sub.filter(Boolean).join(' · '))}</div></div><div class="amt num ${cls}">${sign}${money(t.amount)}${extra}</div></div>`;
}
function legendRows(entries, total) {
  return `<div class="legend">${entries.map(e => `<div class="r"><span class="dot" style="background:${e.color}"></span><span>${esc(e.label)}</span><b>${money(e.v)}</b><span class="dim" style="width:40px;text-align:right">${pct(total ? e.v / total : 0)}</span></div>`).join('')}</div>`;
}

/* HOME */
function viewHome() {
  const ym = S.month, a = agg(txInMonth(ym)), W = wealth();
  const cats = Object.entries(a.byCat).sort((x, y) => y[1] - x[1]);
  const topCats = cats.slice(0, 6).map(([k, v], i) => ({ label: catName(k), v, color: catColor(k, i) }));
  if (cats.length > 6) topCats.push({ label: 'Others', v: sum(cats.slice(6), x => x[1]), color: '#64748b' });
  const budgets = S.d.categories.filter(c => c.kind === 'expense' && c.budget > 0);
  const tips = suggestions(ym).filter(t => t.lvl).slice(0, 3);
  const recent = txInMonth(ym).slice(0, 6);
  viewHome.after = () => {
    if (topCats.length) donut($('#cDonut'), topCats.map(x => x.label), topCats.map(x => x.v), topCats.map(x => x.color));
    const months = [...Array(6)].map((_, i) => addMonths(ym, i - 5)); const ag = months.map(m => agg(txInMonth(m)));
    mkChart($('#cTrend'), { type: 'bar', data: { labels: months.map(m => monthName(m)), datasets: [
      { label: 'Income', data: ag.map(x => x.income), backgroundColor: '#2ee59d', borderRadius: 6, maxBarThickness: 18 },
      { label: 'Spent', data: ag.map(x => x.consumption), backgroundColor: '#ff6b81', borderRadius: 6, maxBarThickness: 18 },
      { label: 'Saved', data: ag.map(x => x.total), type: 'line', borderColor: '#7c8cff', backgroundColor: '#7c8cff', tension: .35, pointRadius: 3 }] },
      options: { scales: { y: axisMoney, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
  };
  return `${monthNav()}
  <div class="card hero">
    <div class="l">Total saved in ${monthName(ym, true)}</div>
    <div class="big num">${money(a.total)}</div>
    <span class="pill">${a.income ? `Savings rate ${pct(a.rate)}` : 'Add income to see savings rate'}</span>
    <div class="row"><div>Direct (cash left)<b class="num">${money(a.direct)}</b></div><div>Indirect (invest + chitty + loan principal)<b class="num">${money(a.indirect)}</b></div></div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l"><span class="dot" style="background:var(--good)"></span>Income</div><div class="v num">${short(a.income)}</div><div class="s">${Object.entries(a.incByPerson).map(([k, v]) => `${esc(personName(k === 'joint' ? null : k))} ${short(v)}`).join(' · ') || '—'}</div></div>
    <div class="kpi"><div class="l"><span class="dot" style="background:var(--bad)"></span>Spent</div><div class="v num">${short(a.consumption)}</div><div class="s">${a.count} expenses${a.interest ? ` + ${short(a.interest)} interest` : ''}</div></div>
    <div class="kpi"><div class="l"><span class="dot" style="background:var(--accent)"></span>Invested</div><div class="v num">${short(a.invest + a.chitty)}</div><div class="s">SIP/stocks ${short(a.invest)} · Chitty ${short(a.chitty)}</div></div>
    <div class="kpi"><div class="l"><span class="dot" style="background:#ff8f5a"></span>EMIs</div><div class="v num">${short(a.emi)}</div><div class="s">Principal ${short(a.principal)}</div></div>
  </div>
  <div class="grid g2-lg">
    <div class="card"><h4>Where the money went</h4>${topCats.length ? `<div class="chart-box donut"><canvas id="cDonut"></canvas></div>${legendRows(topCats, a.consumption)}` : `<div class="empty"><div class="e">🧾</div>No expenses this month</div>`}</div>
    <div class="card"><h4>Last 6 months</h4><div class="chart-box tall"><canvas id="cTrend"></canvas></div></div>
  </div>
  <div class="grid g2-lg">
    <div class="card"><h4>Net worth <a data-go="wealth">Details ›</a></h4>
      <div style="font-size:28px;font-weight:800" class="num ${W.net < 0 ? 'bad' : ''}">${money(W.net)}</div>
      <div class="kpis" style="margin-top:12px;grid-template-columns:1fr 1fr">
        <div><div class="muted" style="font-size:12px">Investments</div><b class="num">${short(W.tInv)}</b> <span class="${W.tInv - W.tInvested >= 0 ? 'good' : 'bad'}" style="font-size:12px">${W.tInvested ? (W.tInv - W.tInvested >= 0 ? '▲' : '▼') + pct(Math.abs(W.tInv - W.tInvested) / W.tInvested) : ''}</span></div>
        <div><div class="muted" style="font-size:12px">Chitty (net paid)</div><b class="num">${short(W.tChit)}</b></div>
        <div><div class="muted" style="font-size:12px">Loans outstanding</div><b class="num bad">${short(W.tLoan)}</b></div>
        <div><div class="muted" style="font-size:12px">Card dues</div><b class="num ${W.tCard > 0 ? 'warn' : ''}">${short(W.tCard)}</b></div>
      </div></div>
    <div class="card"><h4>Smart insights <a data-go="reports" data-rtab="insights">All ›</a></h4>${tips.length ? tips.map(tipHtml).join('') : '<div class="muted">No alerts — looking good! 🎉</div>'}</div>
  </div>
  ${budgets.length ? `<div class="card"><h4>Budgets</h4>${budgets.map(c => { const v = a.byCat[c.id] || 0, p = v / c.budget; return `<div class="brow"><div class="top"><span>${c.icon} ${esc(c.name)}</span><span class="num ${p > 1 ? 'bad' : p > .85 ? 'warn' : 'muted'}">${short(v)} / ${short(c.budget)}</span></div><div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${p > 1 ? 'var(--bad)' : p > .85 ? 'var(--warn)' : c.color || 'var(--accent)'}"></i></div></div>`; }).join('')}</div>` : ''}
  <div class="card"><h4>Recent <a data-go="activity">See all ›</a></h4>${recent.length ? `<div class="list">${recent.map(txItem).join('')}</div>` : `<div class="empty"><div class="e">✨</div>Tap <b>+</b> to add your first entry</div>`}</div>`;
}
const tipHtml = t => `<div class="tip ${t.lvl}"><div class="ti">${t.icon}</div><div><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div></div>`;

/* ACTIVITY */
function viewActivity() {
  const f = S.f;
  let list = S.d.transactions.filter(t => (!f.month || ymOf(t.date) === f.month) && (!f.type || t.type === f.type) && (!f.cat || t.category_id === f.cat) && (!f.method || t.method_id === f.method) && (!f.person || (f.person === 'joint' ? !t.person_id : t.person_id === f.person)));
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(t => [t.note, catName(t.category_id || 'none'), M.inv.get(t.ref_id)?.name, M.chit.get(t.ref_id)?.name, M.loan.get(t.ref_id)?.name, String(t.amount)].join(' ').toLowerCase().includes(q)); }
  const inSum = sum(list.filter(t => TYPES[t.type]?.sign > 0), t => t.amount), outSum = sum(list.filter(t => TYPES[t.type]?.sign < 0), t => t.amount);
  const groups = []; let cur = null;
  for (const t of list) { if (!cur || cur.d !== t.date) { cur = { d: t.date, items: [] }; groups.push(cur); } cur.items.push(t); }
  const opt = (arr, sel, all) => `<option value="">${all}</option>` + arr.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<div class="month-nav"><button data-amn="-1">‹</button><b>${f.month ? monthName(f.month, true) : 'All time'}</b><button data-amn="1">›</button></div>
  <div class="filters">
    <input id="fq" placeholder="🔍 Search notes, category, amount…" value="${esc(f.q)}" />
    <select data-f="type">${opt(Object.entries(TYPES).map(([k, v]) => [k, v.label]), f.type, 'All types')}</select>
    <select data-f="person">${opt([...S.d.people.map(p => [p.id, p.name]), ['joint', 'Joint']], f.person, 'Everyone')}</select>
    <select data-f="cat">${opt(S.d.categories.map(c => [c.id, `${c.icon} ${c.name}`]), f.cat, 'All categories')}</select>
    <select data-f="method">${opt(S.d.methods.map(m => [m.id, m.name]), f.method, 'All methods')}</select>
  </div>
  <div class="sumline"><span>${list.length} entries</span><span><b class="good num">+${short(inSum)}</b> · <b class="bad num">−${short(outSum)}</b> ${f.month ? `· <a style="color:var(--accent);cursor:pointer" id="allTime">All time</a>` : `· <a style="color:var(--accent);cursor:pointer" id="thisMonth">This month</a>`}</span></div>
  <div class="card" style="padding:8px 12px">${groups.length ? groups.map(g => `<div class="day-head"><span>${dayLabel(g.d)}</span><span>${(() => { const o = sum(g.items.filter(t => t.type === 'expense'), t => t.amount); return o ? '−' + short(o) : ''; })()}</span></div><div class="list">${g.items.map(txItem).join('')}</div>`).join('') : `<div class="empty"><div class="e">🔎</div>No entries match</div>`}</div>
  <div style="display:flex;gap:8px"><button class="btn sm" id="exportXlsx">📊 Export Excel</button><button class="btn sm ghost" id="exportCsv">⬇️ CSV</button></div>`;
}
viewActivity.after = () => {};

/* WEALTH */
function viewWealth() {
  const W = wealth(), t = S.wtab;
  const tabs = [['inv', '📈 Investments'], ['chit', '🪙 Chitty'], ['loan', '🏦 Loans'], ['card', '💳 Cards']];
  let body = '';
  if (t === 'inv') {
    const byKind = {}; W.inv.forEach(i => inc(byKind, i.kind, i.cur));
    const kinds = Object.entries(byKind).filter(x => x[1] > 0).map(([k, v], i) => ({ label: INV_KINDS[k], v, color: PALETTE[i] }));
    viewWealth.after = () => { if (kinds.length) donut($('#cInv'), kinds.map(k => k.label), kinds.map(k => k.v), kinds.map(k => k.color)); };
    body = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="l">Invested</div><div class="v num">${short(W.tInvested)}</div></div><div class="kpi"><div class="l">Current</div><div class="v num">${short(W.tInv)}</div></div><div class="kpi"><div class="l">Gain</div><div class="v num ${W.tInv - W.tInvested >= 0 ? 'good' : 'bad'}">${short(W.tInv - W.tInvested)}</div></div></div>
    ${kinds.length ? `<div class="card"><h4>Allocation</h4><div class="chart-box donut"><canvas id="cInv"></canvas></div>${legendRows(kinds, W.tInv)}</div>` : ''}
    <button class="btn primary" data-new="inv">+ Add investment / holding</button>
    <div class="wlist">${W.inv.map(i => `<div class="wcard" data-edit-inv="${i.id}"><div class="h"><div><div class="n">${esc(i.name)}</div><div class="meta">${INV_KINDS[i.kind]} · ${esc(personName(i.person_id))}${i.monthly_sip ? ` · SIP ${short(i.monthly_sip)}/mo` : ''}</div></div><span class="tag ${i.gain >= 0 ? 'good' : 'bad'}">${i.gain >= 0 ? '▲' : '▼'} ${pct(Math.abs(i.gainPct))}</span></div><div class="vals"><div>Invested<b class="num">${short(i.invested)}</b></div><div>Current<b class="num">${short(i.cur)}</b></div><div>Gain<b class="num ${i.gain >= 0 ? 'good' : 'bad'}">${short(i.gain)}</b></div></div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" data-quick="investment" data-ref="${i.id}">+ Add money</button><button class="btn sm" data-upd-val="${i.id}">Update value</button></div></div>`).join('') || '<div class="empty"><div class="e">📈</div>Add your stocks, mutual funds, FDs, gold…</div>'}</div>`;
  } else if (t === 'chit') {
    viewWealth.after = null;
    body = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="l">Total paid</div><div class="v num">${short(sum(W.chit, c => c.paid))}</div></div><div class="kpi"><div class="l">Received</div><div class="v num">${short(sum(W.chit, c => c.received))}</div></div><div class="kpi"><div class="l">Still to pay</div><div class="v num">${short(sum(W.chit.filter(c => !c.closed), c => c.remainingAmt))}</div></div></div>
    <button class="btn primary" data-new="chit">+ Add chitty</button>
    <div class="wlist">${W.chit.map(c => `<div class="wcard" data-edit-chit="${c.id}"><div class="h"><div><div class="n">${esc(c.name)}</div><div class="meta">${esc(c.foreman || 'Chitty')} · ${esc(personName(c.person_id))} · ${short(c.installment)}/mo</div></div><span class="tag">${c.closed ? 'Closed' : c.auctioned ? 'Auction taken' : 'Running'}</span></div>
      <div class="brow"><div class="top"><span class="muted">${c.n} / ${c.months} months</span><span class="num">${short(c.total_value)} chitty</span></div><div class="bar"><i style="width:${c.months ? Math.min(100, c.n / c.months * 100) : 0}%;background:var(--warn)"></i></div></div>
      <div class="vals"><div>Paid<b class="num">${short(c.paid)}</b></div><div>Received<b class="num">${short(c.received)}</b></div><div>Balance to pay<b class="num">${short(c.remainingAmt)}</b></div></div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" data-quick="chitty" data-ref="${c.id}">+ Pay installment</button><button class="btn sm" data-quick="chitty_payout" data-ref="${c.id}">🎯 Got payout</button></div></div>`).join('') || '<div class="empty"><div class="e">🪙</div>Add your KSFE / local chitties here</div>'}</div>`;
  } else if (t === 'loan') {
    viewWealth.after = null;
    body = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="l">Outstanding</div><div class="v num bad">${short(W.tLoan)}</div></div><div class="kpi"><div class="l">Monthly EMI</div><div class="v num">${short(sum(W.loans.filter(l => l.out > 0), l => l.emi))}</div></div><div class="kpi"><div class="l">Interest paid</div><div class="v num">${short(sum(W.loans, l => l.interestPaid))}</div></div></div>
    <button class="btn primary" data-new="loan">+ Add loan</button>
    <div class="wlist">${W.loans.map(l => `<div class="wcard" data-edit-loan="${l.id}"><div class="h"><div><div class="n">${esc(l.name)}</div><div class="meta">${esc(l.lender || 'Loan')} · ${esc(personName(l.person_id))} · ${l.rate}% · EMI ${short(l.emi)}</div></div><span class="tag">${l.out <= 0 ? '✅ Closed' : l.monthsLeft ? `${l.monthsLeft} mo left` : ''}</span></div>
      <div class="brow"><div class="top"><span class="muted">Repaid ${pct(l.progress)}</span><span class="num">${short(l.principal)}</span></div><div class="bar"><i style="width:${l.progress * 100}%;background:var(--good)"></i></div></div>
      <div class="vals"><div>Outstanding<b class="num bad">${short(l.out)}</b></div><div>Principal paid<b class="num">${short(l.paidP)}</b></div><div>Interest paid<b class="num">${short(l.interestPaid)}</b></div></div>
      ${l.out > 0 ? `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" data-quick="emi" data-ref="${l.id}">+ Pay EMI</button></div>` : ''}</div>`).join('') || '<div class="empty"><div class="e">🏦</div>Add home, car, gold or personal loans</div>'}</div>`;
  } else {
    viewWealth.after = null;
    body = `<div class="hint">Card swipes are added as normal <b>Expenses</b> with the card as payment method. When you pay the bill, add a <b>Card Bill</b> entry — it reduces the due without counting the spend twice.</div>
    <div class="wlist">${W.cards.map(c => `<div class="wcard"><div class="h"><div><div class="n">💳 ${esc(c.name)}</div><div class="meta">Spent ${short(c.spent)} · Paid ${short(c.paid)}</div></div><span class="tag ${c.due > 0 ? 'warn' : 'good'}">${c.due > 0 ? 'Due' : 'Clear'}</span></div><div style="font-size:24px;font-weight:800;margin-top:8px" class="num">${money(c.due)}</div>${c.due > 0 ? `<div style="margin-top:10px"><button class="btn sm" data-quick="cc_bill" data-method="${c.id}" data-amount="${Math.round(c.due)}">Pay bill</button></div>` : ''}</div>`).join('') || '<div class="empty"><div class="e">💳</div>Add a payment method of type "Credit Card" in Settings</div>'}</div>`;
  }
  return `<div class="card hero"><div class="l">Family net worth</div><div class="big num">${money(W.net)}</div><div class="row"><div>Assets<b class="num">${money(W.assets)}</b></div><div>Liabilities<b class="num">${money(W.liab)}</b></div></div></div>
  <div class="seg">${tabs.map(([k, l]) => `<button data-wtab="${k}" class="${k === t ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`;
}

/* REPORTS */
function rangeMonths() {
  const end = ymOf(today());
  if (S.range === 'fy') { const [y, m] = end.split('-').map(Number); const start = `${m >= 4 ? y : y - 1}-04`; const out = []; for (let x = start; x <= end; x = addMonths(x, 1)) out.push(x); return out; }
  if (S.range === 'all') { const first = S.d.transactions.length ? ymOf(S.d.transactions[S.d.transactions.length - 1].date) : end; const out = []; for (let x = first; x <= end; x = addMonths(x, 1)) out.push(x); return out.slice(-60); }
  return [...Array(S.range)].map((_, i) => addMonths(end, i - S.range + 1));
}
function viewReports() {
  const tabs = `<div class="seg"><button data-rtab="charts" class="${S.rtab === 'charts' ? 'on' : ''}">📊 Charts</button><button data-rtab="insights" class="${S.rtab === 'insights' ? 'on' : ''}">💡 Insights</button><button data-rtab="table" class="${S.rtab === 'table' ? 'on' : ''}">📅 Monthly table</button></div>`;
  if (S.rtab === 'insights') {
    viewReports.after = null;
    const a = agg(txInMonth(S.month)), tips = suggestions(S.month);
    return `${tabs}${monthNav()}
    <div class="card"><h4>Savings breakdown — ${monthName(S.month, true)}</h4>
      <table class="table"><tbody>
      <tr><td>Income</td><td class="num good">${money(a.income)}</td></tr>
      <tr><td>− Expenses</td><td class="num">${money(a.expense)}</td></tr>
      <tr><td>− Loan interest</td><td class="num">${money(a.interest)}</td></tr>
      <tr><th style="text-align:left;color:var(--text)">= Total saved</th><th class="num" style="color:var(--text)">${money(a.total)} (${pct(a.rate)})</th></tr>
      <tr><td class="muted">&nbsp;&nbsp;↳ Indirect: investments</td><td class="num">${money(a.invest - a.withdraw)}</td></tr>
      <tr><td class="muted">&nbsp;&nbsp;↳ Indirect: chitty (net)</td><td class="num">${money(a.chitty - a.payout)}</td></tr>
      <tr><td class="muted">&nbsp;&nbsp;↳ Indirect: loan principal repaid</td><td class="num">${money(a.principal)}</td></tr>
      <tr><td class="muted">&nbsp;&nbsp;↳ Direct: cash left in bank/hand</td><td class="num">${money(a.direct)}</td></tr>
      </tbody></table></div>
    <div class="card"><h4>50 / 30 / 20 check</h4>${a.income ? [['Needs', a.byGroup.need, .5, '#5b8cff'], ['Wants', a.byGroup.want, .3, '#ff6fae'], ['Savings', a.total, .2, '#2ee59d']].map(([l, v, tg, c]) => `<div class="brow"><div class="top"><span>${l} <span class="dim">(target ${l === 'Savings' ? '≥' : '≤'}${tg * 100}%)</span></span><span class="num">${short(v)} · ${pct(v / a.income)}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, v / a.income * 100))}%;background:${c}"></i></div></div>`).join('') : '<div class="muted">Add income for this month.</div>'}<p class="dim" style="font-size:12px;margin:8px 0 0">Mark each category as Need or Want in Settings.</p></div>
    <div class="card"><h4>Suggestions</h4>${tips.map(tipHtml).join('')}</div>`;
  }
  const months = rangeMonths(), ags = months.map(m => agg(txInMonth(m)));
  const ranges = `<div class="seg">${[[3, '3M'], [6, '6M'], [12, '12M'], ['fy', 'This FY'], ['all', 'All']].map(([k, l]) => `<button data-range="${k}" class="${S.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const all = agg(months.flatMap(txInMonth));
  if (S.rtab === 'table') {
    viewReports.after = null;
    return `${tabs}${ranges}<div class="card scroll-x"><table class="table"><thead><tr><th>Month</th><th>Income</th><th>Spent</th><th>Invested</th><th>EMI</th><th>Saved</th><th>Rate</th></tr></thead><tbody>
    ${months.map((m, i) => { const a = ags[i]; return `<tr><td>${monthName(m)}</td><td class="num">${short(a.income)}</td><td class="num">${short(a.consumption)}</td><td class="num">${short(a.invest + a.chitty)}</td><td class="num">${short(a.emi)}</td><td class="num ${a.total < 0 ? 'bad' : 'good'}">${short(a.total)}</td><td class="num">${a.income ? pct(a.rate) : '—'}</td></tr>`; }).reverse().join('')}
    <tr><th>Total</th><th class="num">${short(all.income)}</th><th class="num">${short(all.consumption)}</th><th class="num">${short(all.invest + all.chitty)}</th><th class="num">${short(all.emi)}</th><th class="num">${short(all.total)}</th><th class="num">${all.income ? pct(all.rate) : '—'}</th></tr></tbody></table></div>`;
  }
  const cats = Object.entries(all.byCat).sort((a, b) => b[1] - a[1]);
  const catE = cats.slice(0, 8).map(([k, v], i) => ({ id: k, label: catName(k), v, color: catColor(k, i) }));
  const methE = Object.entries(all.byMethod).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: M.meth.get(k)?.name || 'Not set', v, color: PALETTE[(i + 3) % PALETTE.length] }));
  const pKeys = [...S.d.people.map(p => p.id), 'joint'];
  const topExp = months.flatMap(txInMonth).filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 8);
  viewReports.after = () => {
    const labels = months.map(m => monthName(m));
    mkChart($('#rFlow'), { type: 'bar', data: { labels, datasets: [
      { label: 'Income', data: ags.map(a => a.income), backgroundColor: '#2ee59d', borderRadius: 5, maxBarThickness: 16 },
      { label: 'Spent', data: ags.map(a => a.consumption), backgroundColor: '#ff6b81', borderRadius: 5, maxBarThickness: 16 },
      { label: 'Invested', data: ags.map(a => a.indirect), backgroundColor: '#7c8cff', borderRadius: 5, maxBarThickness: 16 }] },
      options: { scales: { y: axisMoney, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
    mkChart($('#rRate'), { type: 'line', data: { labels, datasets: [{ label: 'Savings rate', data: ags.map(a => a.income ? Math.round(a.rate * 100) : null), borderColor: '#5ce1e6', backgroundColor: 'rgba(92,225,230,.15)', fill: true, tension: .35, pointRadius: 3, spanGaps: true }] },
      options: { scales: { y: { ticks: { callback: v => v + '%' }, grid: { color: 'rgba(128,140,180,.12)' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw}%` } } } } });
    if (catE.length) donut($('#rCat'), catE.map(c => c.label), catE.map(c => c.v), catE.map(c => c.color));
    if (methE.length) donut($('#rMeth'), methE.map(c => c.label), methE.map(c => c.v), methE.map(c => c.color));
    mkChart($('#rPerson'), { type: 'bar', data: { labels: pKeys.map(k => personName(k === 'joint' ? null : k)), datasets: [
      { label: 'Earned', data: pKeys.map(k => all.incByPerson[k] || 0), backgroundColor: '#2ee59d', borderRadius: 6, maxBarThickness: 26 },
      { label: 'Spent', data: pKeys.map(k => all.byPerson[k] || 0), backgroundColor: '#ff6b81', borderRadius: 6, maxBarThickness: 26 },
      { label: 'Invested', data: pKeys.map(k => all.saveByPerson[k] || 0), backgroundColor: '#7c8cff', borderRadius: 6, maxBarThickness: 26 }] },
      options: { scales: { y: axisMoney, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
    const top5 = catE.slice(0, 5);
    mkChart($('#rCatTrend'), { type: 'bar', data: { labels, datasets: top5.map(c => ({ label: c.label, data: ags.map(a => a.byCat[c.id] || 0), backgroundColor: c.color, borderRadius: 3, maxBarThickness: 22 })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ...axisMoney } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
    const ym = S.month, days = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), daily = Array(days).fill(0);
    txInMonth(ym).filter(t => t.type === 'expense').forEach(t => daily[+t.date.slice(8, 10) - 1] += +t.amount);
    mkChart($('#rDaily'), { type: 'bar', data: { labels: daily.map((_, i) => i + 1), datasets: [{ label: 'Spent', data: daily, backgroundColor: '#ff8f5a', borderRadius: 4 }] }, options: { scales: { y: axisMoney, x: { grid: { display: false } } } } });
    mkChart($('#rGroup'), { type: 'doughnut', data: { labels: ['Needs', 'Wants'], datasets: [{ data: [all.byGroup.need, all.byGroup.want], backgroundColor: ['#5b8cff', '#ff6fae'], borderWidth: 0 }] }, options: { cutout: '68%', plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${money(c.raw)}` } } } } });
  };
  return `${tabs}${ranges}
  <div class="kpis"><div class="kpi"><div class="l">Income</div><div class="v num">${short(all.income)}</div><div class="s">avg ${short(all.income / months.length)}/mo</div></div><div class="kpi"><div class="l">Spent</div><div class="v num">${short(all.consumption)}</div><div class="s">avg ${short(all.consumption / months.length)}/mo</div></div><div class="kpi"><div class="l">Saved</div><div class="v num good">${short(all.total)}</div><div class="s">${all.income ? pct(all.rate) + ' rate' : '—'}</div></div><div class="kpi"><div class="l">Indirect savings</div><div class="v num">${short(all.indirect)}</div><div class="s">invest + chitty + principal</div></div></div>
  <div class="grid g2-lg">
    <div class="card span2"><h4>Cash flow by month</h4><div class="chart-box tall"><canvas id="rFlow"></canvas></div></div>
    <div class="card"><h4>Spending by category</h4>${catE.length ? `<div class="chart-box donut"><canvas id="rCat"></canvas></div>${legendRows(catE, all.consumption)}` : '<div class="empty">No data</div>'}</div>
    <div class="card"><h4>Payment methods</h4>${methE.length ? `<div class="chart-box donut"><canvas id="rMeth"></canvas></div>${legendRows(methE, all.expense)}` : '<div class="empty">No data</div>'}</div>
    <div class="card"><h4>Person-wise</h4><div class="chart-box"><canvas id="rPerson"></canvas></div></div>
    <div class="card"><h4>Savings rate trend</h4><div class="chart-box"><canvas id="rRate"></canvas></div></div>
    <div class="card span2"><h4>Top categories over time</h4><div class="chart-box tall"><canvas id="rCatTrend"></canvas></div></div>
    <div class="card"><h4>Daily spend — ${monthName(S.month, true)}</h4>${monthNav()}<div class="chart-box" style="margin-top:10px"><canvas id="rDaily"></canvas></div></div>
    <div class="card"><h4>Needs vs Wants</h4><div class="chart-box"><canvas id="rGroup"></canvas></div></div>
    <div class="card span2"><h4>Biggest expenses</h4><div class="list">${topExp.map(txItem).join('') || '<div class="empty">No data</div>'}</div></div>
  </div>`;
}

/* SETTINGS */
function viewSettings() {
  viewSettings.after = null;
  const theme = localStorage.getItem('fm-theme') || 'dark';
  return `<div class="card"><h4>People <a data-new="person">+ Add</a></h4><div class="list">${S.d.people.map(p => `<div class="item" data-edit-person="${p.id}"><div class="ic" style="background:${p.color}33">👤</div><div class="mid"><div class="t">${esc(p.name)}</div></div><span class="dim">Edit ›</span></div>`).join('')}<div class="item" style="cursor:default"><div class="ic">👨‍👩‍👧</div><div class="mid"><div class="t">Joint</div><div class="sub">Shared / common entries (always available)</div></div></div></div></div>
  <div class="card"><h4>Expense categories <a data-new="cat" data-kind="expense">+ Add</a></h4><div class="list">${S.d.categories.filter(c => c.kind === 'expense').map(catRow).join('')}</div></div>
  <div class="card"><h4>Income categories <a data-new="cat" data-kind="income">+ Add</a></h4><div class="list">${S.d.categories.filter(c => c.kind === 'income').map(catRow).join('')}</div></div>
  <div class="card"><h4>Payment methods <a data-new="method">+ Add</a></h4><div class="list">${S.d.methods.map(m => `<div class="item" data-edit-method="${m.id}"><div class="ic">${METH_ICON[m.kind]}</div><div class="mid"><div class="t">${esc(m.name)}</div><div class="sub">${METH_KINDS[m.kind]}</div></div><span class="dim">Edit ›</span></div>`).join('')}</div></div>
  ${notifCard()}
  <div class="card"><h4>App</h4><div class="form">
    <div class="row2"><button class="btn" id="themeBtn">${theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}</button><button class="btn" id="pwBtn">🔑 Change password</button></div>
    <button class="btn primary" id="excelBtn">📊 Export to Excel (.xlsx)</button>
    <div class="row2"><button class="btn" id="backupBtn">💾 Backup (JSON)</button><button class="btn" id="csvAllBtn">⬇️ All entries CSV</button></div>
    <button class="btn danger" id="logoutBtn">Log out</button>
    <p class="dim" style="font-size:12px;margin:0">Tip: on your phone, open this site in Chrome/Safari and choose <b>Add to Home screen</b> to use it like an app.</p>
  </div></div>`;
}
function notifCard() {
  const st = S.settings || {}, topic = st.ntfy_topic;
  if (!topic) return '';
  const on = st.notify_on_add !== 'false', rem = st.daily_reminder !== 'false';
  return `<div class="card"><h4>🔔 Notifications</h4><div class="form">
    <div class="hint"><b>One-time setup on each phone:</b><br>1. Install the free <b>ntfy</b> app (<a style="color:var(--accent)" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a> · <a style="color:var(--accent)" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a>).<br>2. Tap <b>+</b> → Subscribe to topic → enter the topic below (server: ntfy.sh).</div>
    <div class="row2" style="align-items:end"><label>Your private topic<input readonly value="${esc(topic)}" id="topicInp"></label><button class="btn" id="copyTopic">📋 Copy</button></div>
    <label class="check"><input type="checkbox" id="nOnAdd" ${on ? 'checked' : ''}> Notify both phones when an entry is added</label>
    <label class="check"><input type="checkbox" id="nDaily" ${rem ? 'checked' : ''}> Daily 9 PM reminder with today's summary</label>
    <button class="btn" id="testNotif">Send test notification</button>
    <p class="dim" style="font-size:12px;margin:0">Keep the topic private — anyone who knows it can see these alerts.</p>
  </div></div>`;
}
async function setSetting(key, value) { const { error } = await sb.from('app_settings').upsert({ key, value }); if (error) return toast(error.message, 'err'); S.settings[key] = value; toast('Saved ✓'); }
async function exportExcel() {
  loading(true);
  try {
    if (!window.XLSX) await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
    const X = window.XLSX, wb = X.utils.book_new(), W = wealth();
    const add = (name, rows, widths) => { const ws = X.utils.json_to_sheet(rows); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
    add('Transactions', S.d.transactions.map(t => ({ Date: t.date, Type: TYPES[t.type]?.label, Amount: +t.amount, Category: t.category_id ? catName(t.category_id) : '', 'Payment method': M.meth.get(t.method_id)?.name || '', Person: personName(t.person_id), 'Linked to': (M.inv.get(t.ref_id) || M.chit.get(t.ref_id) || M.loan.get(t.ref_id))?.name || '', 'Principal part': t.principal_part != null ? +t.principal_part : '', Note: t.note || '' })), [11, 13, 11, 20, 16, 10, 22, 13, 30]);
    const months = [...new Set(S.d.transactions.map(t => ymOf(t.date)))].sort().reverse();
    add('Monthly summary', months.map(m => { const a = agg(txInMonth(m)); return { Month: monthName(m, true), Income: a.income, Expenses: a.expense, 'Loan interest': a.interest, Invested: a.invest - a.withdraw, Chitty: a.chitty - a.payout, 'EMI total': a.emi, 'Principal repaid': a.principal, 'Total saved': a.total, 'Direct saving': a.direct, 'Indirect saving': a.indirect, 'Savings rate %': a.income ? Math.round(a.rate * 100) : '' }; }), [16, 11, 11, 12, 11, 11, 11, 14, 12, 13, 14, 13]);
    const catRows = []; months.forEach(m => { const a = agg(txInMonth(m)); Object.entries(a.byCat).forEach(([k, v]) => catRows.push({ Month: monthName(m, true), Category: catName(k), Amount: v })); });
    add('Category by month', catRows, [16, 22, 12]);
    add('Investments', W.inv.map(i => ({ Name: i.name, Type: INV_KINDS[i.kind], Owner: personName(i.person_id), Invested: i.invested, 'Current value': i.cur, Gain: i.gain, 'Gain %': Math.round(i.gainPct * 1000) / 10, 'Monthly SIP': i.monthly_sip || '' })), [26, 16, 10, 12, 14, 12, 8, 12]);
    add('Chitty', W.chit.map(c => ({ Name: c.name, Foreman: c.foreman || '', Owner: personName(c.person_id), 'Chitty value': +c.total_value, Installment: +c.installment, 'Months paid': c.n, 'Total months': c.months, Paid: c.paid, Received: c.received, 'Balance to pay': c.remainingAmt, Status: c.closed ? 'Closed' : c.auctioned ? 'Auction taken' : 'Running' })), [22, 14, 10, 12, 11, 11, 11, 11, 11, 13, 13]);
    add('Loans', W.loans.map(l => ({ Name: l.name, Lender: l.lender || '', Borrower: personName(l.person_id), Amount: +l.principal, 'Rate %': +l.rate, EMI: +l.emi, 'Principal repaid': l.paidP, Outstanding: l.out, 'Interest paid': l.interestPaid, 'Months left': l.monthsLeft ?? '' })), [20, 14, 10, 12, 8, 10, 14, 12, 12, 11]);
    add('Cards', W.cards.map(c => ({ Card: c.name, Spent: c.spent, 'Bills paid': c.paid, 'Current due': c.due })), [20, 12, 12, 12]);
    X.writeFile(wb, `family-money-${today()}.xlsx`); toast('Excel downloaded ✓');
  } catch (e) { toast('Excel export failed', 'err'); } finally { loading(false); }
}
const catRow = c => `<div class="item" data-edit-cat="${c.id}"><div class="ic" style="background:${c.color}22">${c.icon}</div><div class="mid"><div class="t">${esc(c.name)}</div><div class="sub">${c.kind === 'expense' ? (c.grp === 'need' ? 'Need' : 'Want') : 'Income'}${c.budget ? ` · Budget ${short(c.budget)}/mo` : ''}</div></div><span class="dim">Edit ›</span></div>`;

/* ---------- sheet (modal) ---------- */
function openSheet(title, html, mount) {
  $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html; $('#sheet').classList.remove('hidden');
  document.body.style.overflow = 'hidden'; if (mount) mount($('#sheetBody'));
}
function closeSheet() { $('#sheet').classList.add('hidden'); document.body.style.overflow = ''; }
const peopleOpts = sel => S.d.people.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('') + `<option value="" ${!sel ? 'selected' : ''}>Joint</option>`;
const chipsHtml = (name, items, sel) => `<div class="chips" data-chips="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === sel ? 'on' : ''}">${l}</button>`).join('')}</div><input type="hidden" name="${name}" value="${sel || ''}">`;
function wireChips(root) {
  $$('[data-chips]', root).forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; $$('button', box).forEach(x => x.classList.remove('on')); b.classList.add('on');
    const inp = root.querySelector(`input[name="${box.dataset.chips}"]`); inp.value = b.dataset.v; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }));
}

/* Transaction form */
function txForm(tx = {}, preset = {}) {
  const t = { type: 'expense', date: today(), person_id: S.lastPerson ?? S.d.people[0]?.id ?? null, method_id: S.lastMethod || S.d.methods.find(m => m.kind === 'upi')?.id, ...preset, ...tx };
  const isEdit = !!tx.id;
  const typeChips = Object.entries(TYPES).map(([k, v]) => [k, `${v.icon} ${v.label}`]);
  openSheet(isEdit ? 'Edit entry' : 'Add entry', `<form class="form" id="txf">
    ${chipsHtml('type', typeChips, t.type)}
    <input class="amount-input num" name="amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="₹0" value="${t.amount ?? ''}" required>
    <div id="txDyn"></div>
    <div class="row2"><label>Date<input type="date" name="date" value="${t.date}" required></label><label>Who<select name="person_id">${peopleOpts(t.person_id)}</select></label></div>
    <label>Note<input name="note" placeholder="Optional — e.g. Lulu mall, Swiggy" value="${esc(t.note || '')}"></label>
    <div class="actions">${isEdit ? '<button type="button" class="btn danger" id="txDel">Delete</button>' : ''}<button class="btn primary" type="submit">${isEdit ? 'Save' : 'Add'}</button></div>
  </form>`, root => {
    wireChips(root); const f = $('#txf', root); const dyn = $('#txDyn', root);
    const renderDyn = () => {
      const type = f.type.value, cats = S.d.categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'));
      const methOpts = (filter, sel) => S.d.methods.filter(filter).map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${METH_ICON[m.kind]} ${esc(m.name)}</option>`).join('');
      let h = '';
      if (type === 'expense' || type === 'income') {
        const sel = t.category_id && cats.some(c => c.id === t.category_id) ? t.category_id : cats[0]?.id;
        h += `<label>Category</label>${chipsHtml('category_id', cats.map(c => [c.id, `${c.icon} ${esc(c.name)}`]), sel)}`;
        h += `<label>${type === 'income' ? 'Received in' : 'Paid via'}<select name="method_id">${methOpts(m => type === 'expense' || m.kind !== 'card', t.method_id)}</select></label>`;
      } else if (type === 'investment' || type === 'withdrawal') {
        h += S.d.investments.length ? `<label>Investment<select name="ref_id">${S.d.investments.map(i => `<option value="${i.id}" ${i.id === t.ref_id ? 'selected' : ''}>${esc(i.name)} (${INV_KINDS[i.kind]})</option>`).join('')}</select></label>` : `<div class="hint">Create the investment first in <b>Wealth → Investments</b>.</div>`;
        h += type === 'investment' ? `<label class="check"><input type="checkbox" name="bumpValue" checked> Also add this amount to current value</label>` : `<label class="check"><input type="checkbox" name="bumpValue" checked> Also reduce current value</label>`;
      } else if (type === 'chitty' || type === 'chitty_payout') {
        h += S.d.chitties.length ? `<label>Chitty<select name="ref_id">${S.d.chitties.map(c => `<option value="${c.id}" ${c.id === t.ref_id ? 'selected' : ''}>${esc(c.name)} — ${short(c.installment)}/mo</option>`).join('')}</select></label>` : `<div class="hint">Create the chitty first in <b>Wealth → Chitty</b>.</div>`;
        if (type === 'chitty_payout') h += `<div class="hint">Record the amount you received after auction / at the end.</div>`;
      } else if (type === 'emi') {
        h += S.d.loans.length ? `<label>Loan<select name="ref_id">${S.d.loans.map(l => `<option value="${l.id}" ${l.id === t.ref_id ? 'selected' : ''}>${esc(l.name)} — EMI ${short(l.emi)}</option>`).join('')}</select></label><div class="hint" id="emiHint"></div>` : `<div class="hint">Create the loan first in <b>Wealth → Loans</b>.</div>`;
      } else if (type === 'cc_bill') {
        const cards = S.d.methods.filter(m => m.kind === 'card');
        h += cards.length ? `<label>Card paid<select name="method_id">${methOpts(m => m.kind === 'card', t.method_id)}</select></label><div class="hint">This clears card dues. It is not counted as spending (the swipes already were).</div>` : `<div class="hint">Add a Credit Card payment method in Settings first.</div>`;
      }
      dyn.innerHTML = h; wireChips(dyn);
      const refSel = f.querySelector('[name=ref_id]');
      if (refSel && !isEdit && !f.amount.value) {
        const fillAmt = () => { if (type === 'emi') f.amount.value = M.loan.get(refSel.value)?.emi || ''; if (type === 'chitty') f.amount.value = M.chit.get(refSel.value)?.installment || ''; if (type === 'investment') f.amount.value = M.inv.get(refSel.value)?.monthly_sip || ''; };
        fillAmt(); refSel.addEventListener('change', () => { f.amount.value = ''; fillAmt(); updEmi(); });
      }
      if (refSel && ['investment', 'chitty', 'emi', 'withdrawal', 'chitty_payout'].includes(type) && !isEdit) {
        const owner = (M.inv.get(refSel.value) || M.chit.get(refSel.value) || M.loan.get(refSel.value))?.person_id; f.person_id.value = owner || '';
        refSel.addEventListener('change', () => { const o = (M.inv.get(refSel.value) || M.chit.get(refSel.value) || M.loan.get(refSel.value))?.person_id; f.person_id.value = o || ''; });
      }
      updEmi();
    };
    const updEmi = () => { const hint = $('#emiHint', root); const r = f.querySelector('[name=ref_id]'); if (!hint || !r) return; const s = emiSplit(r.value, +f.amount.value || 0, tx.id); hint.innerHTML = `Outstanding ${money(s.out)} → <b>Interest ${money(s.interest)}</b> · <b>Principal ${money(s.principal)}</b>`; };
    f.type.addEventListener('change', () => { if (!isEdit) f.amount.value = ''; renderDyn(); });
    f.amount.addEventListener('input', updEmi);
    renderDyn();
    if (!isEdit) setTimeout(() => f.amount.focus(), 250);
    if (isEdit) $('#txDel', root).onclick = async () => { if (!confirm('Delete this entry?')) return; loading(true); try { await removeRow('transactions', tx.id); closeSheet(); render(); toast('Deleted'); } finally { loading(false); } };
    f.onsubmit = async e => {
      e.preventDefault(); const type = f.type.value, amount = +f.amount.value;
      if (!(amount > 0)) return toast('Enter an amount', 'err');
      const row = { id: tx.id, type, amount, date: f.date.value, person_id: f.person_id.value || null, note: f.note.value.trim() || null, category_id: null, method_id: null, ref_id: null, principal_part: null };
      if (type === 'expense' || type === 'income') { row.category_id = f.category_id?.value || null; row.method_id = f.method_id?.value || null; }
      else if (type === 'cc_bill') { row.method_id = f.method_id?.value || null; if (!row.method_id) return toast('Pick a card', 'err'); }
      else { row.ref_id = f.ref_id?.value || null; if (!row.ref_id) return toast('Create it in Wealth first', 'err'); }
      if (type === 'emi') row.principal_part = emiSplit(row.ref_id, amount, tx.id).principal;
      loading(true);
      try {
        await save('transactions', row);
        if ((type === 'investment' || type === 'withdrawal') && f.bumpValue?.checked) {
          const inv = M.inv.get(row.ref_id); const prevAmt = isEdit && tx.ref_id === row.ref_id && tx.type === type ? +tx.amount : 0;
          if (inv) { const base = inv.current_value != null ? +inv.current_value : null; if (base != null) await save('investments', { id: inv.id, current_value: Math.max(0, base + (type === 'investment' ? 1 : -1) * (amount - prevAmt)), updated_at: new Date().toISOString() }); }
        }
        S.lastPerson = row.person_id; if (row.method_id && type === 'expense') S.lastMethod = row.method_id;
        closeSheet(); render(); toast(isEdit ? 'Saved ✓' : `${TYPES[type].label} added ✓`);
      } catch (_) {} finally { loading(false); }
    };
  });
}

/* Wealth forms */
function invForm(i = {}) {
  openSheet(i.id ? 'Edit investment' : 'New investment', `<form class="form" id="f">
    <label>Name<input name="name" required placeholder="e.g. Parag Parikh Flexi Cap, TCS shares, SBI FD" value="${esc(i.name || '')}"></label>
    <label>Type</label>${chipsHtml('kind', Object.entries(INV_KINDS), i.kind || 'mf')}
    <div class="row2"><label>Owner<select name="person_id">${peopleOpts(i.id ? i.person_id : S.d.people[0]?.id)}</select></label><label>Monthly SIP (optional)<input name="monthly_sip" type="number" inputmode="decimal" value="${i.monthly_sip ?? ''}"></label></div>
    <div class="row2"><label>Already invested (before app)<input name="opening_invested" type="number" inputmode="decimal" value="${i.opening_invested ?? ''}" placeholder="0"></label><label>Current value<input name="current_value" type="number" inputmode="decimal" value="${i.current_value ?? ''}" placeholder="Same as invested"></label></div>
    <div class="hint">Future SIPs / purchases: add them as <b>Invest</b> entries — the invested amount updates automatically. Update the current value whenever you check your app/broker.</div>
    <label>Note<input name="note" value="${esc(i.note || '')}"></label>
    <div class="actions">${i.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`, root => {
    wireChips(root); const f = $('#f', root);
    f.onsubmit = async e => { e.preventDefault(); loading(true); try { await save('investments', { id: i.id, name: f.name.value.trim(), kind: f.kind.value, person_id: f.person_id.value || null, monthly_sip: num(f.monthly_sip.value), opening_invested: num(f.opening_invested.value) || 0, current_value: num(f.current_value.value) ?? (i.id ? null : num(f.opening_invested.value)), note: f.note.value || null, updated_at: new Date().toISOString() }); closeSheet(); render(); toast('Saved ✓'); } catch (_) {} finally { loading(false); } };
    if (i.id) $('#del', root).onclick = () => delWithRefs('investments', i.id);
  });
}
function chitForm(c = {}) {
  openSheet(c.id ? 'Edit chitty' : 'New chitty', `<form class="form" id="f">
    <label>Name<input name="name" required placeholder="e.g. KSFE 5L chitty" value="${esc(c.name || '')}"></label>
    <div class="row2"><label>Foreman / company<input name="foreman" value="${esc(c.foreman || '')}" placeholder="KSFE, local…"></label><label>Owner<select name="person_id">${peopleOpts(c.id ? c.person_id : S.d.people[0]?.id)}</select></label></div>
    <div class="row2"><label>Chitty value (sala)<input name="total_value" type="number" inputmode="decimal" required value="${c.total_value ?? ''}"></label><label>Monthly installment<input name="installment" type="number" inputmode="decimal" required value="${c.installment ?? ''}"></label></div>
    <div class="row2"><label>Total months<input name="months" type="number" inputmode="numeric" required value="${c.months ?? ''}"></label><label>Start date<input name="start_date" type="date" value="${c.start_date || ''}"></label></div>
    <div class="row2"><label>Already paid (before app)<input name="opening_paid" type="number" inputmode="decimal" value="${c.opening_paid ?? ''}" placeholder="0"></label><label>Months already paid<input name="opening_months" type="number" inputmode="numeric" value="${c.opening_months ?? ''}" placeholder="0"></label></div>
    <label class="check"><input type="checkbox" name="auctioned" ${c.auctioned ? 'checked' : ''}> Auction already taken (pidichu)</label>
    <label class="check"><input type="checkbox" name="closed" ${c.closed ? 'checked' : ''}> Chitty finished / closed</label>
    <div class="actions">${c.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`, root => {
    const f = $('#f', root);
    f.onsubmit = async e => { e.preventDefault(); loading(true); try { await save('chitties', { id: c.id, name: f.name.value.trim(), foreman: f.foreman.value || null, person_id: f.person_id.value || null, total_value: +f.total_value.value || 0, installment: +f.installment.value || 0, months: +f.months.value || 0, start_date: f.start_date.value || null, opening_paid: num(f.opening_paid.value) || 0, opening_months: num(f.opening_months.value) || 0, auctioned: f.auctioned.checked, closed: f.closed.checked }); closeSheet(); render(); toast('Saved ✓'); } catch (_) {} finally { loading(false); } };
    if (c.id) $('#del', root).onclick = () => delWithRefs('chitties', c.id);
  });
}
function loanForm(l = {}) {
  openSheet(l.id ? 'Edit loan' : 'New loan', `<form class="form" id="f">
    <label>Name<input name="name" required placeholder="e.g. Home loan, Car loan" value="${esc(l.name || '')}"></label>
    <div class="row2"><label>Lender<input name="lender" value="${esc(l.lender || '')}" placeholder="SBI, HDFC…"></label><label>Borrower<select name="person_id">${peopleOpts(l.id ? l.person_id : S.d.people[0]?.id)}</select></label></div>
    <div class="row2"><label>Loan amount<input name="principal" type="number" inputmode="decimal" required value="${l.principal ?? ''}"></label><label>Interest % / year<input name="rate" type="number" inputmode="decimal" step="0.01" required value="${l.rate ?? ''}"></label></div>
    <div class="row2"><label>Tenure (months)<input name="tenure_months" type="number" inputmode="numeric" value="${l.tenure_months ?? ''}"></label><label>EMI<input name="emi" type="number" inputmode="decimal" value="${l.emi ?? ''}" placeholder="Auto from tenure"></label></div>
    <div class="row2"><label>Start date<input name="start_date" type="date" value="${l.start_date || ''}"></label><label>Principal already repaid<input name="opening_principal_paid" type="number" inputmode="decimal" value="${l.opening_principal_paid ?? ''}" placeholder="0"></label></div>
    <div class="hint" id="emiCalc">Tip: for an existing loan, enter "principal already repaid" = loan amount − current outstanding (from your bank app).</div>
    <label class="check"><input type="checkbox" name="closed" ${l.closed ? 'checked' : ''}> Loan closed</label>
    <div class="actions">${l.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`, root => {
    const f = $('#f', root);
    const calc = () => { const P = +f.principal.value, r = +f.rate.value / 1200, n = +f.tenure_months.value; if (P && n) { const e = r ? P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : P / n; f.emi.placeholder = 'Auto: ' + Math.round(e); return Math.round(e); } return null; };
    ['principal', 'rate', 'tenure_months'].forEach(n => f[n].addEventListener('input', calc)); calc();
    f.onsubmit = async e => { e.preventDefault(); const emi = num(f.emi.value) ?? calc() ?? 0; loading(true); try { await save('loans', { id: l.id, name: f.name.value.trim(), lender: f.lender.value || null, person_id: f.person_id.value || null, principal: +f.principal.value || 0, rate: +f.rate.value || 0, tenure_months: num(f.tenure_months.value), emi, start_date: f.start_date.value || null, opening_principal_paid: num(f.opening_principal_paid.value) || 0, closed: f.closed.checked }); closeSheet(); render(); toast('Saved ✓'); } catch (_) {} finally { loading(false); } };
    if (l.id) $('#del', root).onclick = () => delWithRefs('loans', l.id);
  });
}
async function delWithRefs(table, id) {
  const refs = S.d.transactions.filter(t => t.ref_id === id);
  if (!confirm(refs.length ? `Delete this and its ${refs.length} linked entries? This cannot be undone.` : 'Delete this? This cannot be undone.')) return;
  loading(true);
  try {
    if (refs.length) { const { error } = await sb.from('transactions').delete().eq('ref_id', id); if (error) throw error; S.d.transactions = S.d.transactions.filter(t => t.ref_id !== id); }
    await removeRow(table, id); closeSheet(); render(); toast('Deleted');
  } catch (e) { toast(e.message, 'err'); } finally { loading(false); }
}
function updValue(id) {
  const i = M.inv.get(id); const W = wealth().inv.find(x => x.id === id);
  openSheet('Update value', `<form class="form" id="f"><div class="hint">${esc(i.name)} · invested ${money(W.invested)}</div><input class="amount-input num" name="v" type="number" inputmode="decimal" value="${i.current_value ?? W.invested}" required><button class="btn primary">Update</button></form>`, root => {
    const f = $('#f', root); setTimeout(() => f.v.select(), 200);
    f.onsubmit = async e => { e.preventDefault(); loading(true); try { await save('investments', { id, current_value: +f.v.value, updated_at: new Date().toISOString() }); closeSheet(); render(); toast('Value updated ✓'); } catch (_) {} finally { loading(false); } };
  });
}

/* Settings forms */
const EMOJIS = ['🛒', '🏠', '🍽️', '⛽', '🚕', '💡', '📱', '🛍️', '💊', '📚', '🎬', '✈️', '🎁', '🛡️', '🧹', '💇', '📦', '👶', '🐶', '🏋️', '☕', '🍺', '🎮', '🔧', '🚗', '🏍️', '🙏', '💼', '🎉', '🏦', '📈', '💰', '🧾', '💻', '👗', '🎓'];
function catForm(c = {}, kind = 'expense') {
  c = { kind, grp: 'need', icon: '📦', color: PALETTE[S.d.categories.length % PALETTE.length], ...c };
  openSheet(c.id ? 'Edit category' : 'New category', `<form class="form" id="f">
    <label>Name<input name="name" required value="${esc(c.name || '')}"></label>
    <label>Icon</label>${chipsHtml('icon', EMOJIS.map(e => [e, e]), c.icon)}
    ${c.kind === 'expense' ? `<label>Type</label>${chipsHtml('grp', [['need', '🧱 Need (essential)'], ['want', '✨ Want (lifestyle)']], c.grp)}<label>Monthly budget (optional)<input name="budget" type="number" inputmode="decimal" value="${c.budget ?? ''}"></label>` : ''}
    <label>Colour<input name="color" type="color" value="${c.color}" style="height:44px;padding:4px"></label>
    <div class="actions">${c.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`, root => {
    wireChips(root); const f = $('#f', root);
    f.onsubmit = async e => { e.preventDefault(); loading(true); try { await save('categories', { id: c.id, name: f.name.value.trim(), kind: c.kind, icon: f.icon.value, grp: f.grp?.value || 'need', budget: f.budget ? num(f.budget.value) : null, color: f.color.value }); closeSheet(); render(); toast('Saved ✓'); } catch (_) {} finally { loading(false); } };
    if (c.id) $('#del', root).onclick = async () => { if (!confirm('Delete category? Entries keep their amounts but become "Uncategorised".')) return; loading(true); try { await removeRow('categories', c.id); S.d.transactions.forEach(t => { if (t.category_id === c.id) t.category_id = null; }); closeSheet(); render(); } finally { loading(false); } };
  });
}
function methodForm(m = {}) {
  m = { kind: 'upi', ...m };
  openSheet(m.id ? 'Edit payment method' : 'New payment method', `<form class="form" id="f">
    <label>Name<input name="name" required value="${esc(m.name || '')}" placeholder="e.g. GPay, HDFC Millennia, Paytm"></label>
    <label>Type</label>${chipsHtml('kind', Object.entries(METH_KINDS).map(([k, v]) => [k, `${METH_ICON[k]} ${v}`]), m.kind)}
    <label id="dueWrap">Current unpaid card due (when starting)<input name="opening_due" type="number" inputmode="decimal" value="${m.opening_due ?? ''}" placeholder="0"></label>
    <div class="actions">${m.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`, root => {
    wireChips(root); const f = $('#f', root); const tog = () => $('#dueWrap', root).style.display = f.kind.value === 'card' ? '' : 'none'; f.kind.addEventListener('change', tog); tog();
    f.onsubmit = async e => { e.preventDefault(); loading(true); try { await save('methods', { id: m.id, name: f.name.value.trim(), kind: f.kind.value, opening_due: f.kind.value === 'card' ? (num(f.opening_due.value) || 0) : 0 }); closeSheet(); render(); toast('Saved ✓'); } catch (_) {} finally { loading(false); } };
    if (m.id) $('#del', root).onclick = async () => { if (!confirm('Delete this payment method?')) return; loading(true); try { await removeRow('methods', m.id); S.d.transactions.forEach(t => { if (t.method_id === m.id) t.method_id = null; }); closeSheet(); render(); } finally { loading(false); } };
  });
}
function personForm(p = {}) {
  p = { color: '#5b8cff', ...p };
  openSheet(p.id ? 'Edit person' : 'Add person', `<form class="form" id="f"><label>Name<input name="name" required value="${esc(p.name || '')}"></label><label>Colour<input name="color" type="color" value="${p.color}" style="height:44px;padding:4px"></label>
    <div class="actions">${p.id ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`, root => {
    const f = $('#f', root);
    f.onsubmit = async e => { e.preventDefault(); loading(true); try { await save('people', { id: p.id, name: f.name.value.trim(), color: f.color.value }); closeSheet(); render(); toast('Saved ✓'); } catch (_) {} finally { loading(false); } };
    if (p.id) $('#del', root).onclick = async () => { if (!confirm('Delete person? Their entries become "Joint".')) return; loading(true); try { await removeRow('people', p.id); await loadAll(true); closeSheet(); render(); } finally { loading(false); } };
  });
}
function pwForm() {
  openSheet('Change password', `<form class="form" id="f"><label>New password<input name="p1" type="password" minlength="6" required autocomplete="new-password"></label><label>Repeat<input name="p2" type="password" minlength="6" required autocomplete="new-password"></label><button class="btn primary">Update password</button><p class="dim" style="font-size:12px;margin:0">You share one login, so tell each other the new password.</p></form>`, root => {
    const f = $('#f', root);
    f.onsubmit = async e => { e.preventDefault(); if (f.p1.value !== f.p2.value) return toast('Passwords do not match', 'err'); loading(true); const { error } = await sb.auth.updateUser({ password: f.p1.value }); loading(false); if (error) return toast(error.message, 'err'); closeSheet(); toast('Password changed ✓'); };
  });
}

/* ---------- export ---------- */
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function toCsv(list) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Amount', 'Category', 'Payment method', 'Person', 'Linked to', 'Principal part', 'Note']];
  list.forEach(t => rows.push([t.date, TYPES[t.type]?.label, t.amount, t.category_id ? catName(t.category_id) : '', M.meth.get(t.method_id)?.name || '', personName(t.person_id), (M.inv.get(t.ref_id) || M.chit.get(t.ref_id) || M.loan.get(t.ref_id))?.name || '', t.principal_part ?? '', t.note || '']));
  return rows.map(r => r.map(q).join(',')).join('\n');
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-view],[data-go],[data-mn],[data-amn],[data-tx],[data-wtab],[data-rtab],[data-range],[data-new],[data-quick],[data-upd-val],[data-edit-inv],[data-edit-chit],[data-edit-loan],[data-edit-cat],[data-edit-method],[data-edit-person],[data-close],#fab,#settingsBtn,#refreshBtn,#themeBtn,#pwBtn,#logoutBtn,#backupBtn,#csvAllBtn,#exportCsv,#excelBtn,#exportXlsx,#copyTopic,#testNotif,#allTime,#thisMonth');
  if (!el) return; const d = el.dataset;
  if (d.close !== undefined) return closeSheet();
  if (el.id === 'fab') return txForm();
  if (el.id === 'settingsBtn') return go('settings');
  if (el.id === 'refreshBtn') return loadAll().then(render).then(() => toast('Synced ✓'));
  if (el.id === 'themeBtn') { const t = (localStorage.getItem('fm-theme') || 'dark') === 'dark' ? 'light' : 'dark'; localStorage.setItem('fm-theme', t); applyTheme(); return render(); }
  if (el.id === 'pwBtn') return pwForm();
  if (el.id === 'logoutBtn') return sb.auth.signOut();
  if (el.id === 'backupBtn') return download(`family-money-backup-${today()}.json`, JSON.stringify(S.d, null, 2), 'application/json');
  if (el.id === 'excelBtn' || el.id === 'exportXlsx') return exportExcel();
  if (el.id === 'copyTopic') { navigator.clipboard?.writeText(S.settings.ntfy_topic); return toast('Topic copied ✓'); }
  if (el.id === 'testNotif') return fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic: S.settings.ntfy_topic, title: '✅ Family Money', message: 'Notifications are working!', tags: ['tada'], click: location.href.split('#')[0] }) }).then(r => toast(r.ok ? 'Test sent ✓' : 'Failed', r.ok ? '' : 'err')).catch(() => toast('Failed', 'err'));
  if (el.id === 'csvAllBtn') return download(`family-money-${today()}.csv`, toCsv(S.d.transactions), 'text/csv');
  if (el.id === 'exportCsv') { const tmp = S.view; return download(`family-money-${S.f.month || 'all'}.csv`, toCsv(S.d.transactions.filter(t => !S.f.month || ymOf(t.date) === S.f.month)), 'text/csv'); }
  if (el.id === 'allTime') { S.f.month = ''; return render(); }
  if (el.id === 'thisMonth') { S.f.month = ymOf(today()); return render(); }
  if (d.view) return go(d.view);
  if (d.go) { if (d.rtab) S.rtab = d.rtab; return go(d.go); }
  if (d.mn) { S.month = addMonths(S.month, +d.mn); return render(); }
  if (d.amn) { S.f.month = addMonths(S.f.month || ymOf(today()), +d.amn); return render(); }
  if (d.tx) { const t = S.d.transactions.find(x => x.id === d.tx); return t && txForm(t); }
  if (d.wtab) { S.wtab = d.wtab; return render(); }
  if (d.rtab) { S.rtab = d.rtab; return render(); }
  if (d.range) { S.range = isNaN(+d.range) ? d.range : +d.range; return render(); }
  if (d.quick) { e.stopPropagation(); const preset = { type: d.quick }; if (d.ref) preset.ref_id = d.ref; if (d.method) preset.method_id = d.method; if (d.amount) preset.amount = +d.amount; return txForm({}, preset); }
  if (d.updVal) { e.stopPropagation(); return updValue(d.updVal); }
  if (d.new === 'inv') return invForm(); if (d.new === 'chit') return chitForm(); if (d.new === 'loan') return loanForm();
  if (d.new === 'cat') return catForm({}, d.kind); if (d.new === 'method') return methodForm(); if (d.new === 'person') return personForm();
  if (d.editInv) return invForm(M.inv.get(d.editInv)); if (d.editChit) return chitForm(M.chit.get(d.editChit)); if (d.editLoan) return loanForm(M.loan.get(d.editLoan));
  if (d.editCat) return catForm(M.cat.get(d.editCat)); if (d.editMethod) return methodForm(M.meth.get(d.editMethod)); if (d.editPerson) return personForm(M.ppl.get(d.editPerson));
});
document.addEventListener('change', e => { if (e.target.id === 'nOnAdd') return setSetting('notify_on_add', String(e.target.checked)); if (e.target.id === 'nDaily') return setSetting('daily_reminder', String(e.target.checked)); const s = e.target.closest('[data-f]'); if (s) { S.f[s.dataset.f] = s.value; render(); } });
document.addEventListener('input', e => { if (e.target.id === 'fq') { S.f.q = e.target.value; clearTimeout(S._qt); S._qt = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = $('#fq'); q.focus(); q.setSelectionRange(pos, pos); }, 300); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.authed && Date.now() - (S.lastLoad || 0) > 60000) { S.lastLoad = Date.now(); loadAll(true).then(() => { if ($('#sheet').classList.contains('hidden')) render(); }); } });

function applyTheme() { const t = localStorage.getItem('fm-theme') || 'dark'; document.documentElement.dataset.theme = t; $('meta[name=theme-color]').content = t === 'dark' ? '#0b0f1a' : '#f3f5fb'; }

/* ---------- auth ---------- */
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const u = f.username.value.trim().toLowerCase();
  const email = u.includes('@') ? u : `${u}@${C.EMAIL_DOMAIN}`; $('#loginErr').textContent = ''; loading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password: f.password.value }); loading(false);
  if (error) $('#loginErr').textContent = error.message === 'Invalid login credentials' ? 'Wrong username or password' : error.message;
});
async function onAuth(session) {
  if (session) {
    if (S.authed) return; S.authed = true;
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    S.lastLoad = Date.now(); await loadAll(); render();
  } else {
    S.authed = false; $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); closeSheet();
  }
}
applyTheme();
if (!sb) { $('#login').classList.remove('hidden'); $('#loginErr').textContent = 'App not configured: set SUPABASE_URL and SUPABASE_ANON_KEY in config.js'; }
else {
  sb.auth.getSession().then(({ data }) => onAuth(data.session));
  sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'INITIAL_SESSION') onAuth(session); });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
