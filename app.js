const { toPKR, toUSD, formatCurrency, COST_PER_CONNECT_USD, COST_PER_CONNECT_PKR, CONNECT_PACKAGE_COST, CONNECTS_PER_PACKAGE } = window.FlexoCurrency;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const state = {
  currency: 'usd',
  page: 'overview',
  query: '',
  raw: null,
  model: null,
};

function getValue(row, candidates, fallbackIndex = null) {
  const keys = Object.keys(row || {});
  const direct = candidates.find((candidate) => keys.some((key) => key.toLowerCase().trim() === candidate.toLowerCase()));
  if (direct) return row[keys.find((key) => key.toLowerCase().trim() === direct.toLowerCase())];
  const fuzzy = keys.find((key) => candidates.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase())));
  if (fuzzy) return row[fuzzy];
  if (fallbackIndex !== null) return row[keys[fallbackIndex]];
  return '';
}

function numeric(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value || '').replace(/[^0-9.-]/g, '');
  return Number.parseFloat(cleaned) || 0;
}

function parseDate(value, fallbackMonth = '') {
  const input = String(value || fallbackMonth || '').trim();
  if (!input) return null;
  const date = new Date(input);
  if (!Number.isNaN(date.getTime())) return date;
  const month = MONTHS.findIndex((m) => input.toLowerCase().includes(m.toLowerCase()));
  const year = input.match(/20\d{2}/)?.[0] || new Date().getFullYear();
  return month >= 0 ? new Date(Number(year), month, 1) : null;
}

function monthKey(date) {
  if (!date) return 'Unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  if (key === 'Unknown') return 'Unknown';
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function normalizeClientName(name) {
  const suffixes = ['seo', 'ads', 'hosting', 'proto', 'web', 'design'];
  let normalized = String(name || 'Unknown Client').trim().toLowerCase();
  suffixes.forEach((suffix) => {
    normalized = normalized.replace(new RegExp(`\\s+${suffix}$`, 'i'), '');
  });
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function serviceFromName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('seo')) return 'SEO';
  if (lower.includes('ads') || lower.includes('ppc')) return 'Ads';
  if (lower.includes('hosting')) return 'Hosting';
  if (lower.includes('web') || lower.includes('design')) return 'Web Design';
  return 'Others';
}

function getRevenueUSD(row) {
  const gross = numeric(getValue(row, ['Gross Sales', 'Gross Sale', 'Revenue', 'Amount', 'Cash In', 'Total'], 6));
  return gross > 100000 ? toUSD(gross, false) : gross;
}

function getExpenseUSD(row) {
  const amount = numeric(getValue(row, ['Cost', 'Amount', 'Expense Amount', 'PKR', 'Total'], 2));
  return amount > 10000 ? toUSD(amount, true) : amount;
}

function groupByMonth(rows, amountGetter, dateCandidates = ['Date', 'Month']) {
  const grouped = new Map();
  rows.forEach((row) => {
    const date = parseDate(getValue(row, dateCandidates), getValue(row, ['Month'], 0));
    const key = monthKey(date);
    grouped.set(key, (grouped.get(key) || 0) + amountGetter(row));
  });
  return grouped;
}

function lastKeys(map, count = 12) {
  return [...map.keys()].filter((key) => key !== 'Unknown').sort().slice(-count);
}

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function convertAmount(usd, isSpending = false) {
  return state.currency === 'usd' ? usd : toPKR(usd, isSpending);
}

function money(usd, isSpending = false, compact = false) {
  return formatCurrency(convertAmount(usd, isSpending), state.currency, isSpending, compact);
}

function buildModel(raw) {
  const revenueRows = [...(raw.revenue || []), ...(raw.cashInn || [])].filter((row) => getRevenueUSD(row) > 0);
  const expenseRows = raw.expenses || [];
  const salaryRows = raw.salaries || [];
  const revenueByMonth = groupByMonth(revenueRows, getRevenueUSD);
  const expenseByMonth = groupByMonth(expenseRows, getExpenseUSD);
  const salaryMonthlyUSD = salaryRows.reduce((sum, row) => {
    const amount = numeric(getValue(row, ['Salary', 'Amount', 'Monthly Salary', 'Pay'], 2));
    return sum + (amount > 10000 ? toUSD(amount, true) : amount);
  }, 0);
  const recentMonth = [...new Set([...revenueByMonth.keys(), ...expenseByMonth.keys()].filter((k) => k !== 'Unknown'))].sort().pop() || monthKey(new Date());
  const previousMonth = [...new Set([...revenueByMonth.keys(), ...expenseByMonth.keys()].filter((k) => k !== 'Unknown'))].sort().slice(-2)[0] || recentMonth;
  const clients = new Map();
  revenueRows.forEach((row) => {
    const rawName = getValue(row, ['Client', 'Client Name', 'Project', 'Project Name', 'Name'], 1) || 'Unknown Client';
    const name = normalizeClientName(rawName);
    const date = parseDate(getValue(row, ['Date', 'Month']), getValue(row, ['Month'], 0));
    const revenue = getRevenueUSD(row);
    const current = clients.get(name) || { name, projects: 0, revenue: 0, first: date, last: date, services: new Set() };
    current.projects += 1;
    current.revenue += revenue;
    current.first = !current.first || (date && date < current.first) ? date : current.first;
    current.last = !current.last || (date && date > current.last) ? date : current.last;
    current.services.add(serviceFromName(rawName));
    clients.set(name, current);
  });
  const serviceDistribution = revenueRows.reduce((acc, row) => {
    const service = serviceFromName(getValue(row, ['Client', 'Project', 'Project Name', 'Name'], 1));
    acc[service] = (acc[service] || 0) + getRevenueUSD(row);
    return acc;
  }, {});
  const connectExpenses = expenseRows.filter((row) => /connect/i.test(JSON.stringify(row)));
  const connectsCostUSD = connectExpenses.reduce((sum, row) => sum + getExpenseUSD(row), 0);
  const connectsUsed = Math.round(connectsCostUSD / COST_PER_CONNECT_USD);
  const totalRevenue = [...revenueByMonth.values()].reduce((a, b) => a + b, 0);
  const totalExpenses = [...expenseByMonth.values()].reduce((a, b) => a + b, 0) + salaryMonthlyUSD;
  return {
    revenueRows,
    expenseRows,
    salaryRows,
    revenueByMonth,
    expenseByMonth,
    salaryMonthlyUSD,
    recentMonth,
    previousMonth,
    totalRevenue,
    totalExpenses,
    clients: [...clients.values()].sort((a, b) => b.revenue - a.revenue),
    serviceDistribution,
    connectExpenses,
    connectsCostUSD,
    connectsUsed,
    meta: raw.meta || {},
  };
}

function statCard(title, usd, isSpending, previousUsd = 0, suffix = '') {
  const change = pctChange(usd, previousUsd);
  const positive = title.includes('Expenses') ? change <= 0 : change >= 0;
  return `<div class="stat-card">
    <div class="stat-header"><h3>${title}</h3><button class="menu-btn">⋮</button></div>
    <div><div class="stat-value">${suffix ? `${usd.toFixed(1)}${suffix}` : money(usd, isSpending)}</div>
    <div class="stat-subtext">${suffix ? 'Current operating metric' : `${formatCurrency(usd, 'usd')} · ${formatCurrency(toPKR(usd, isSpending), 'pkr')}`}</div></div>
    <div class="stat-change ${positive ? 'positive' : 'negative'}"><span>${change >= 0 ? '↑' : '↓'}</span><strong>${Math.abs(change).toFixed(1)}%</strong><span class="label">vs last month</span></div>
  </div>`;
}

function pageTitle(title, text) {
  return `<div class="page-title"><div><h2>${title}</h2><p>${text}</p></div><div class="export-actions"><button id="exportCsv">Export CSV</button></div></div>`;
}

function renderOverview() {
  const m = state.model;
  const keys = lastKeys(new Map([...m.revenueByMonth, ...m.expenseByMonth]), 12);
  const currentRevenue = m.revenueByMonth.get(m.recentMonth) || 0;
  const currentExpenses = (m.expenseByMonth.get(m.recentMonth) || 0) + m.salaryMonthlyUSD;
  const prevRevenue = m.revenueByMonth.get(m.previousMonth) || 0;
  const prevExpenses = (m.expenseByMonth.get(m.previousMonth) || 0) + m.salaryMonthlyUSD;
  const profit = currentRevenue - currentExpenses;
  const margin = currentRevenue ? (profit / currentRevenue) * 100 : 0;
  document.getElementById('pageRoot').innerHTML = `${pageTitle('Executive Overview', `Live data through ${monthLabel(m.recentMonth)} with YTD business performance.`)}
    <div class="grid stat-grid">
      ${statCard('Total Revenue', currentRevenue, false, prevRevenue)}
      ${statCard('Total Expenses', currentExpenses, true, prevExpenses)}
      ${statCard('Net Profit', profit, false, prevRevenue - prevExpenses)}
      ${statCard('Profit Margin', margin, false, prevRevenue ? ((prevRevenue - prevExpenses) / prevRevenue) * 100 : 0, '%')}
    </div>
    <div class="grid two-col" style="margin-top:18px">
      <div class="chart-card"><div class="chart-header"><h2>Revenue vs Expenses Trend</h2><select class="period-select"><option>Last 12 Months</option></select></div><div class="chart-body"><canvas id="revExpChart"></canvas></div></div>
      <div class="chart-card"><div class="chart-header"><h2>Monthly Profit Trend</h2></div><div class="chart-body"><canvas id="profitChart"></canvas></div></div>
      <div class="chart-card"><div class="chart-header"><h2>Year-over-Year Revenue</h2></div><div class="chart-body"><canvas id="yoyChart"></canvas></div></div>
      <div class="card"><div class="section-header"><h3>Top 5 Clients by Revenue</h3><span class="pill">Normalized</span></div>${clientList(m.clients.slice(0, 5))}</div>
      <div class="card" style="grid-column:1/-1"><div class="section-header"><h3>Recent Transactions</h3><span class="pill">Last 10 cash-in rows</span></div>${transactionsTable(m.revenueRows.slice(-10).reverse())}</div>
    </div>`;
  const revenue = keys.map((k) => convertAmount(m.revenueByMonth.get(k) || 0));
  const expenses = keys.map((k) => convertAmount((m.expenseByMonth.get(k) || 0) + m.salaryMonthlyUSD, true));
  const labels = keys.map(monthLabel);
  FlexoCharts.renderRevenueExpenseChart('revExpChart', labels, revenue, expenses, state.currency);
  FlexoCharts.renderLineChart('profitChart', labels, revenue.map((r, i) => r - expenses[i]), 'Profit', profit >= 0 ? '#10B981' : '#EF4444', state.currency);
  const years = { 2024: Array(12).fill(0), 2025: Array(12).fill(0), 2026: Array(12).fill(0) };
  m.revenueByMonth.forEach((value, key) => { const [y, mo] = key.split('-').map(Number); if (years[y]) years[y][mo - 1] = convertAmount(value); });
  FlexoCharts.renderGroupedBarChart('yoyChart', MONTHS, years, state.currency);
}

function matchesQuery(item) {
  if (!state.query) return true;
  return JSON.stringify(item || '').toLowerCase().includes(state.query);
}

function clientList(clients) {
  const visibleClients = clients.filter(matchesQuery);
  return `<div class="list">${visibleClients.map((client) => `<div class="list-item"><div class="avatar">${client.name[0] || 'C'}</div><div><div class="item-title">${client.name}</div><div class="item-meta">${client.projects} projects · Avg ${money(client.revenue / Math.max(client.projects, 1))}</div></div><strong>${money(client.revenue)}</strong></div>`).join('') || '<p class="item-meta">No client data found.</p>'}</div>`;
}

function transactionsTable(rows) {
  const visibleRows = rows.filter(matchesQuery);
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Client / Project</th><th>Agent</th><th>Gross Sales</th></tr></thead><tbody>${visibleRows.map((row) => `<tr><td>${getValue(row, ['Date', 'Month'], 0)}</td><td>${getValue(row, ['Client', 'Project', 'Project Name', 'Name'], 1)}</td><td>${getValue(row, ['Agent', 'AG', 'Bidder'], 8)}</td><td>${money(getRevenueUSD(row))}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderUpwork() {
  const m = state.model;
  const front = m.revenueRows.filter((r) => /front|sale|new/i.test(JSON.stringify(r))).reduce((s, r) => s + getRevenueUSD(r), 0);
  const upsell = m.revenueRows.filter((r) => /upsell|up sell|recurring/i.test(JSON.stringify(r))).reduce((s, r) => s + getRevenueUSD(r), 0);
  const revenue = front + upsell || m.totalRevenue;
  const roi = m.connectsCostUSD ? ((revenue - m.connectsCostUSD) / m.connectsCostUSD) * 100 : 0;
  document.getElementById('pageRoot').innerHTML = `${pageTitle('Upwork ROI', 'Connect spend, front sales, upsells, and ROI from live cash-in and expense rows.')}
    <div class="grid stat-grid">${statCard('Front Sales Revenue', front, false)}${statCard('Upsell Revenue', upsell, false)}${statCard('Connects Spent', m.connectsCostUSD, true)}${statCard('Overall ROI', roi, false, 0, '%')}</div>
    <div class="grid two-col" style="margin-top:18px"><div class="card"><h3>Connects Analytics</h3>${metric('Total Connects Used', `${m.connectsUsed.toLocaleString()} connects`)}${metric('Total Cost', `${formatCurrency(m.connectsCostUSD, 'usd')} (${formatCurrency(toPKR(m.connectsCostUSD, true), 'pkr')})`)}${metric('Revenue Generated', `${money(revenue)} (${formatCurrency(toPKR(revenue), 'pkr')})`)}${metric('ROI', `${roi.toFixed(1)}%`)}${metric('Cost per Dollar Earned', `$${(m.connectsCostUSD / Math.max(revenue, 1)).toFixed(2)}`)}<div class="notice">Package: $${CONNECT_PACKAGE_COST} = ${CONNECTS_PER_PACKAGE} connects · Per connect: $${COST_PER_CONNECT_USD.toFixed(2)} (Rs ${COST_PER_CONNECT_PKR.toFixed(0)})</div></div>
    <div class="chart-card"><div class="chart-header"><h2>Connects Spend Trend</h2></div><div class="chart-body"><canvas id="connectChart"></canvas></div></div>
    <div class="card"><h3>Front Sales vs Upsells</h3>${metric('Front Revenue', money(front))}${metric('Front ROI', `${(front / Math.max(m.connectsCostUSD, 1) * 100).toFixed(1)}%`)}${metric('Upsell Revenue', money(upsell))}${metric('Upsell ROI', `${(upsell / Math.max(m.connectsCostUSD, 1) * 100).toFixed(1)}%`)}<p class="notice">Note: Upwork charges 10% merchant fee on all transactions.</p></div>
    <div class="card"><h3>Expense Detail - Connects</h3>${expenseTable(m.connectExpenses)}</div></div>`;
  const spendByMonth = groupByMonth(m.connectExpenses, getExpenseUSD);
  const keys = lastKeys(spendByMonth, 12);
  FlexoCharts.renderLineChart('connectChart', keys.map(monthLabel), keys.map((k) => convertAmount(spendByMonth.get(k) || 0, true)), 'Connect Spend', '#000000', state.currency);
}

function metric(label, value) { return `<div class="metric-line"><span>${label}</span><strong>${value}</strong></div>`; }
function expenseTable(rows) { const visibleRows = rows.filter(matchesQuery); return `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Expense</th><th>Cost PKR</th><th>Cost USD</th><th>Status</th></tr></thead><tbody>${visibleRows.map((r) => { const usd = getExpenseUSD(r); return `<tr><td>${getValue(r, ['Month', 'Date'], 0)}</td><td>${getValue(r, ['Expense', 'Name', 'Description'], 1)}</td><td>${formatCurrency(toPKR(usd, true), 'pkr')}</td><td>${formatCurrency(usd, 'usd')}</td><td><span class="pill">Tracked</span></td></tr>`; }).join('')}</tbody></table></div>`; }

function renderClients() {
  const m = state.model;
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3);
  document.getElementById('pageRoot').innerHTML = `${pageTitle('Client Analytics', 'Normalized client lifetime value, service distribution, and active/churned status.')}
    <div class="grid two-col"><div class="card"><div class="section-header"><h3>Top 10 Clients</h3><span class="pill">All time</span></div>${clientList(m.clients.slice(0,10))}</div><div class="chart-card"><div class="chart-header"><h2>Service Distribution</h2></div><div class="chart-body"><canvas id="serviceChart"></canvas></div></div><div class="card" style="grid-column:1/-1"><h3>Client Lifetime Value</h3><div class="table-wrap"><table><thead><tr><th>Client</th><th>First Project</th><th>Last Project</th><th>Total Revenue</th><th>Status</th></tr></thead><tbody>${m.clients.map((c) => `<tr><td>${c.name}</td><td>${c.first ? c.first.toLocaleDateString() : '—'}</td><td>${c.last ? c.last.toLocaleDateString() : '—'}</td><td>${money(c.revenue)}</td><td><span class="pill ${c.last && c.last >= cutoff ? 'positive' : 'negative'}">${c.last && c.last >= cutoff ? 'Active' : 'Churned'}</span></td></tr>`).join('')}</tbody></table></div></div></div>`;
  FlexoCharts.renderDoughnutChart('serviceChart', Object.keys(m.serviceDistribution), Object.values(m.serviceDistribution).map((v) => convertAmount(v)));
}

function renderTeam() {
  const m = state.model;
  const agents = aggregatePeople(m.revenueRows, ['Agent', 'AG', 'Bidder'], 8, ['AG. Comm', 'Agent Comm', 'Commission'], 9);
  const tls = aggregatePeople(m.revenueRows, ['TL', 'Team Lead'], 10, ['TL. Comm', 'TL Commission'], 11);
  const max = Math.max(...agents.map((a) => a.revenue), 1);
  document.getElementById('pageRoot').innerHTML = `${pageTitle('Team Performance', 'Bidder leaderboard, TL commissions, and salary-to-revenue productivity.')}
    <div class="grid two-col"><div class="card"><h3>Bidder Leaderboard</h3><div class="list">${agents.map((a, i) => `<div class="list-item"><div class="avatar">#${i+1}</div><div><div class="item-title">${a.name}</div><div class="item-meta">${a.projects} wins · Avg ${money(a.revenue / Math.max(a.projects,1))} · Comm ${money(a.commission)}</div><div class="progress"><span style="width:${(a.revenue / max) * 100}%"></span></div></div><strong>${money(a.revenue)}</strong></div>`).join('')}</div></div><div class="card"><h3>TL Performance</h3>${tls.map((t) => metric(t.name, `${money(t.revenue)} revenue · ${money(t.commission)} comm`)).join('')}</div><div class="card" style="grid-column:1/-1"><h3>Salary vs Revenue Analysis</h3>${salaryTable(m.salaryRows, agents)}</div></div>`;
}

function aggregatePeople(rows, nameFields, nameIndex, commFields, commIndex) {
  const map = new Map();
  rows.forEach((row) => {
    const name = getValue(row, nameFields, nameIndex) || 'Unassigned';
    const current = map.get(name) || { name, revenue: 0, commission: 0, projects: 0 };
    current.revenue += getRevenueUSD(row);
    current.commission += numeric(getValue(row, commFields, commIndex));
    current.projects += 1;
    map.set(name, current);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function salaryTable(salaries, agents) {
  return `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Monthly Salary</th><th>Revenue</th><th>Profitability Ratio</th></tr></thead><tbody>${salaries.map((s) => { const name = getValue(s, ['Name', 'Employee', 'Agent'], 0); const salaryRaw = numeric(getValue(s, ['Salary', 'Amount', 'Monthly Salary'], 2)); const salary = salaryRaw > 10000 ? toUSD(salaryRaw, true) : salaryRaw; const person = agents.find((a) => a.name.toLowerCase().includes(String(name).toLowerCase()) || String(name).toLowerCase().includes(a.name.toLowerCase())); const ratio = (person?.revenue || 0) / Math.max(salary, 1); const cls = ratio > 3 ? 'positive' : ratio >= 2 ? 'warning' : 'negative'; return `<tr><td>${name}</td><td>${money(salary, true)}</td><td>${money(person?.revenue || 0)}</td><td><span class="pill ${cls}">${ratio.toFixed(1)}x</span></td></tr>`; }).join('')}</tbody></table></div>`;
}

function renderExpenses() {
  const m = state.model;
  const categories = categorizeExpenses(m.expenseRows);
  document.getElementById('pageRoot').innerHTML = `${pageTitle('Expense Breakdown', 'Category-wise spending, tool ROI, and connects deep dive.')}
    <div class="grid stat-grid">${Object.entries(categories).slice(0,4).map(([name, value]) => statCard(name, value, true)).join('')}</div><div class="grid two-col" style="margin-top:18px"><div class="chart-card"><div class="chart-header"><h2>Expense Trend</h2></div><div class="chart-body"><canvas id="expenseTrend"></canvas></div></div><div class="card"><h3>Tool ROI Analysis</h3>${Object.entries(categories).map(([k,v]) => metric(k, money(v,true))).join('')}</div><div class="card" style="grid-column:1/-1"><h3>Connects Deep Dive</h3>${metric('Total spent on connects', money(m.connectsCostUSD,true))}${metric('Estimated connects bought', `${m.connectsUsed.toLocaleString()} connects`)}${expenseTable(m.connectExpenses)}</div></div>`;
  const byMonth = groupByMonth(m.expenseRows, getExpenseUSD);
  const keys = lastKeys(byMonth, 12);
  FlexoCharts.renderLineChart('expenseTrend', keys.map(monthLabel), keys.map((k) => convertAmount((byMonth.get(k) || 0) + m.salaryMonthlyUSD, true)), 'Expenses', '#EF4444', state.currency);
}

function categorizeExpenses(rows) {
  const cats = { Salaries: state.model.salaryMonthlyUSD, 'Tools & Software': 0, Office: 0, Marketing: 0, 'Internet/Communication': 0, Other: 0 };
  rows.forEach((row) => {
    const text = JSON.stringify(row).toLowerCase(); const usd = getExpenseUSD(row);
    if (/apollo|instantly|zoom|domain|godaddy|hosting|software|tool/.test(text)) cats['Tools & Software'] += usd;
    else if (/rent|bill|water|electric|maid|office/.test(text)) cats.Office += usd;
    else if (/connect|ads|marketing|social|followers/.test(text)) cats.Marketing += usd;
    else if (/internet|phone|communication/.test(text)) cats['Internet/Communication'] += usd;
    else cats.Other += usd;
  });
  return cats;
}

function renderHealth() {
  const m = state.model;
  const months = Math.max(lastKeys(m.expenseByMonth, 12).length, 1);
  const burn = m.totalExpenses / months;
  const cash = m.totalRevenue - m.totalExpenses;
  const runway = cash > 0 ? cash / Math.max(burn, 1) : 0;
  const ratio = m.totalRevenue ? (m.totalExpenses / m.totalRevenue) * 100 : 0;
  const received = toPKR(m.totalRevenue, false); const spendEquivalent = toPKR(m.totalRevenue, true); const loss = spendEquivalent - received;
  document.getElementById('pageRoot').innerHTML = `${pageTitle('Financial Health', 'Burn rate, runway, exchange-rate impact, and forward cash-flow projection.')}
    <div class="grid stat-grid">${statCard('Burn Rate', burn, true)}${statCard('Runway', runway, false, 0, ' mo')}${statCard('Break-even Point', burn, false)}${statCard('OpEx Ratio', ratio, false, 0, '%')}</div><div class="grid two-col" style="margin-top:18px"><div class="card"><h3>Exchange Rate Impact Analysis</h3>${metric('Total Revenue Earned', formatCurrency(m.totalRevenue,'usd'))}${metric('PKR Received (@ 270)', formatCurrency(received,'pkr'))}${metric('Equivalent if Spent (@ 300)', formatCurrency(spendEquivalent,'pkr'))}${metric('Rate Differential Loss', `${formatCurrency(loss,'pkr')} (${((loss / Math.max(spendEquivalent,1))*100).toFixed(1)}%)`)}</div><div class="chart-card"><div class="chart-header"><h2>Cash Flow Projection</h2></div><div class="chart-body"><canvas id="projectionChart"></canvas></div></div></div>`;
  const recentKeys = lastKeys(m.revenueByMonth, 3); const avgRev = recentKeys.reduce((s,k)=>s+(m.revenueByMonth.get(k)||0),0)/Math.max(recentKeys.length,1); const avgExp = burn;
  FlexoCharts.renderRevenueExpenseChart('projectionChart', ['Next 1', 'Next 2', 'Next 3'], [1,2,3].map(()=>convertAmount(avgRev)), [1,2,3].map(()=>convertAmount(avgExp,true)), state.currency);
}

function renderCurrentPage() {
  if (!state.model) return;
  ({ overview: renderOverview, upwork: renderUpwork, clients: renderClients, team: renderTeam, expenses: renderExpenses, health: renderHealth }[state.page])();
  document.getElementById('exportCsv')?.addEventListener('click', exportCsv);
}

function exportCsv() {
  const rows = state.model.revenueRows;
  const csv = rows.map((row) => Object.values(row).map((v) => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'flexolabs-export.csv'; a.click(); URL.revokeObjectURL(url);
}

function debounce(fn, delay = 250) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }

async function init(forceRefresh = false) {
  const status = document.getElementById('statusBar');
  status.className = 'status-bar loading'; status.textContent = 'Loading live Google Sheets data...';
  try {
    state.raw = await FlexoData.loadDashboardData({ forceRefresh });
    state.model = buildModel(state.raw);
    status.className = 'status-bar';
    status.textContent = `${state.raw.fromCache ? 'Cached' : 'Live'} data loaded · ${Object.values(state.raw.meta).map((m) => `${m.label}: ${m.rows}`).join(' · ')}`;
    renderCurrentPage();
  } catch (error) {
    status.className = 'status-bar error';
    status.textContent = `Unable to load Google Sheets data. ${error.message}`;
  }
}

document.querySelectorAll('.toggle-btn').forEach((button) => button.addEventListener('click', () => {
  state.currency = button.dataset.currency;
  document.querySelectorAll('.toggle-btn').forEach((btn) => btn.classList.toggle('active', btn === button));
  renderCurrentPage();
}));
document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => {
  state.page = button.dataset.page;
  document.querySelectorAll('.nav-link').forEach((btn) => btn.classList.toggle('active', btn === button));
  document.getElementById('sidebar').classList.remove('open');
  renderCurrentPage();
}));
document.getElementById('hamburger').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('refreshBtn').addEventListener('click', () => init(true));
document.getElementById('globalSearch').addEventListener('input', debounce((event) => { state.query = event.target.value.toLowerCase(); renderCurrentPage(); }));

init();
