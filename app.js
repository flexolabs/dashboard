const PUB_ID = '2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ';
const SHEETS = {
  salaries: { gid: '1002409884', label: 'Salaries' },
  expenses: { gid: '701838879', label: 'Monthly Expenses' },
  cash: { gid: '1655649787', label: 'Monthly Cash In' },
  revenue: { gid: '527351239', label: 'Monthly Revenue' },
  pnl: { gid: '62657854', label: 'Company PnL' },
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_ALIASES = new Map(MONTHS.flatMap((m, i) => [[m, i + 1], [m.toLowerCase(), i + 1], [monthName(i).toLowerCase(), i + 1]]));
const state = { raw: {}, data: {}, filters: { year: 'all', month: 'all' }, activeTable: 'pnlRows' };

const moneyPKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const moneyUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

window.addEventListener('DOMContentLoaded', () => {
  bindUI();
  state.data = sampleData();
  hydrateFilters();
  render();
  showStatus('Dashboard is ready. Syncing live Google Sheets in the background…');
  loadDashboard();
  setInterval(loadDashboard, 10 * 60 * 1000);
});

function bindUI() {
  document.getElementById('refreshBtn').addEventListener('click', loadDashboard);
  document.getElementById('yearFilter').addEventListener('change', (event) => {
    state.filters.year = event.target.value;
    render();
  });
  document.getElementById('monthFilter').addEventListener('change', (event) => {
    state.filters.month = event.target.value;
    render();
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      state.activeTable = tab.dataset.table;
      renderTable();
    });
  });
}

async function loadDashboard() {
  showStatus('Dashboard is visible. Updating numbers from published Google Sheets…');
  try {
    const results = await Promise.allSettled(Object.entries(SHEETS).map(async ([key, config]) => [key, await loadSheet(config.gid)]));
    const loaded = Object.fromEntries(results.filter((result) => result.status === 'fulfilled').map((result) => result.value));
    const failed = results.filter((result) => result.status === 'rejected');
    if (!Object.keys(loaded).length) throw new Error('All sheet tabs failed to load');
    state.raw = { ...state.raw, ...loaded };
    state.data = mergeWithFallback(transformData(state.raw), sampleData());
    hydrateFilters();
    render();
    document.getElementById('lastUpdated').textContent = `Synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (failed.length) {
      showStatus(`${Object.keys(loaded).length} sheet tabs synced. ${failed.length} tab(s) could not load, so fallback data remains visible for those sections.`);
    } else {
      hideStatus();
    }
  } catch (error) {
    console.error(error);
    state.data = sampleData();
    hydrateFilters();
    render();
    document.getElementById('lastUpdated').textContent = 'Live sync failed';
    showStatus(`Live Google Sheets could not be reached, but the dashboard is still visible with sample data. Check that every tab is published to web. ${error.message}`);
  }
}

function loadSheet(gid) {
  return new Promise((resolve, reject) => {
    const callback = `flexoSheet_${gid}_${Date.now()}`;
    const script = document.createElement('script');
    const timeout = setTimeout(() => cleanup(() => reject(new Error(`Timeout loading sheet gid ${gid}`))), 20000);
    window[callback] = (response) => cleanup(() => {
      if (!response || response.status === 'error' || !response.table) {
        reject(new Error(`Invalid Google Sheets response for gid ${gid}`));
        return;
      }
      resolve(gvizToRows(response.table));
    });
    script.onerror = () => cleanup(() => reject(new Error(`Network error loading sheet gid ${gid}`)));
    script.src = `https://docs.google.com/spreadsheets/d/e/${PUB_ID}/gviz/tq?gid=${gid}&headers=1&tqx=${encodeURIComponent(`version:0.7;out:json;responseHandler:${callback}`)}&cacheBust=${Date.now()}`;
    document.body.appendChild(script);
    function cleanup(done) {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      done();
    }
  });
}

function gvizToRows(table) {
  const headers = table.cols.map((col, index) => clean(col.label || col.id || `Column ${index + 1}`));
  return table.rows.map((row) => Object.fromEntries(headers.map((header, index) => {
    const cell = row.c[index];
    return [header || `Column ${index + 1}`, cell ? (cell.f ?? cell.v ?? '') : ''];
  })));
}


function mergeWithFallback(live, fallback) {
  return Object.fromEntries(Object.entries(fallback).map(([key, rows]) => [key, live[key] && live[key].length ? live[key] : rows]));
}

function sampleData() {
  return {
    pnlRows: [
      { year: 2025, month: 'JAN', monthNo: 1, Expense: 824620, Revenue: 894471, PnL: 69851 },
      { year: 2025, month: 'FEB', monthNo: 2, Expense: 635840, Revenue: 383412, PnL: -252428 },
      { year: 2025, month: 'MAR', monthNo: 3, Expense: 346305, Revenue: 100926, PnL: -245379 },
      { year: 2025, month: 'APR', monthNo: 4, Expense: 319650, Revenue: 795340, PnL: 475690 },
      { year: 2025, month: 'MAY', monthNo: 5, Expense: 629200, Revenue: 364268, PnL: -264932 },
      { year: 2025, month: 'JUN', monthNo: 6, Expense: 549900, Revenue: 185058, PnL: -364842 },
      { year: 2025, month: 'JUL', monthNo: 7, Expense: 730550, Revenue: 134190, PnL: -596360 },
      { year: 2025, month: 'AUG', monthNo: 8, Expense: 552700, Revenue: 402570, PnL: -150130 },
      { year: 2025, month: 'SEP', monthNo: 9, Expense: 549900, Revenue: 753300, PnL: 203400 },
      { year: 2025, month: 'OCT', monthNo: 10, Expense: 540300, Revenue: 918000, PnL: 377700 },
      { year: 2025, month: 'NOV', monthNo: 11, Expense: 321500, Revenue: 436590, PnL: 115090 },
      { year: 2025, month: 'DEC', monthNo: 12, Expense: 352100, Revenue: 517000, PnL: 164900 },
      { year: 2026, month: 'JAN', monthNo: 1, Expense: 542200, Revenue: 745200, PnL: 203000 },
      { year: 2026, month: 'FEB', monthNo: 2, Expense: 383800, Revenue: 800280, PnL: 416480 },
      { year: 2026, month: 'MAR', monthNo: 3, Expense: 540300, Revenue: 893700, PnL: 353400 },
      { year: 2026, month: 'APR', monthNo: 4, Expense: 564500, Revenue: 972000, PnL: 407500 },
    ],
    revenueRows: [
      { year: 2025, month: 'JAN', monthNo: 1, 'NET Income ($)': 3344, 'NET Income (pkr)': 892848 },
      { year: 2025, month: 'FEB', monthNo: 2, 'NET Income ($)': 1436, 'NET Income (pkr)': 383412 },
      { year: 2025, month: 'APR', monthNo: 4, 'NET Income ($)': 2979, 'NET Income (pkr)': 795393 },
      { year: 2025, month: 'SEP', monthNo: 9, 'NET Income ($)': 2790, 'NET Income (pkr)': 753300 },
      { year: 2025, month: 'OCT', monthNo: 10, 'NET Income ($)': 3400, 'NET Income (pkr)': 918000 },
      { year: 2026, month: 'JAN', monthNo: 1, 'NET Income ($)': 2760, 'NET Income (pkr)': 745200 },
    ],
    expenseRows: [
      { year: 2025, month: 'AUG', monthNo: 8, Expense: 'Office Rent', 'Pay Date': '15 August 2024', Cost: 'Rs40,000', Status: 'Paid', amount: 40000 },
      { year: 2025, month: 'AUG', monthNo: 8, Expense: 'Instantly', 'Pay Date': '13 August 2024', Cost: 'Rs17,000', Status: 'Paid', amount: 17000 },
      { year: 2025, month: 'SEP', monthNo: 9, Expense: 'Internet', 'Pay Date': '1 September 2024', Cost: 'Rs6,600', Status: 'Paid', amount: 6600 },
      { year: 2025, month: 'OCT', monthNo: 10, Expense: 'Bills (Water+KE)', 'Pay Date': '15 October 2024', Cost: 'Rs7,000', Status: 'Paid', amount: 7000 },
      { year: 2025, month: 'NOV', monthNo: 11, Expense: 'Salaries', 'Pay Date': '30 November 2024', Cost: 'Rs172,000', Status: 'Paid', amount: 172000 },
    ],
    salaryRows: [
      { year: 2025, month: 'OCT', monthNo: 10, Name: 'Ahmed Uddin', Position: 'PM & Email Marketing', 'Pay Date': '15 October 2024', Salary: 'Rs25,000', Commission: '', Bonus: '', Status: 'Paid', amount: 25000 },
      { year: 2025, month: 'OCT', monthNo: 10, Name: 'Moiz Shaikh', Position: 'Seller', 'Pay Date': '30 October 2024', Salary: 'Rs70,000', Commission: '', Bonus: '', Status: 'Paid', amount: 70000 },
      { year: 2025, month: 'NOV', monthNo: 11, Name: 'Sherry', Position: 'Upwork Bidder', 'Pay Date': '30 November 2024', Salary: 'Rs17,000', Commission: 'Rs18,000', Bonus: '', Status: 'Paid', amount: 17000 },
      { year: 2025, month: 'NOV', monthNo: 11, Name: 'Rafay', Position: 'Upwork Bidder', 'Pay Date': '30 November 2024', Salary: 'Rs14,000', Commission: '', Bonus: '', Status: 'Paid', amount: 14000 },
    ],
    cashRows: [
      { year: 2025, month: 'JAN', monthNo: 1, 'Proj. Name': 'Nesi Title', Platform: 'Upwork', Profile: 'shaarif', 'Total Sales': '$250', 'Gross Sales': '$225', Type: 'Front Sale', Agent: 'Sherry', 'Comm Pkr': 'Rs87,042', amount: 87042 },
      { year: 2025, month: 'FEB', monthNo: 2, 'Proj. Name': 'Senseexperience', Platform: 'Upwork', Profile: 'alishba', 'Total Sales': '$400', 'Gross Sales': '$360', Type: 'Front Sale', Agent: 'Rafay', 'Comm Pkr': 'Rs36,846', amount: 36846 },
      { year: 2025, month: 'APR', monthNo: 4, 'Proj. Name': 'Anchor M group', Platform: 'Upwork', Profile: 'salam', 'Total Sales': '$1,550', 'Gross Sales': '$1,395', Type: 'Front Sale', Agent: 'Sherry', 'Comm Pkr': 'Rs26,700', amount: 26700 },
      { year: 2025, month: 'AUG', monthNo: 8, 'Proj. Name': 'Kad3d SEO', Platform: 'Upwork', Profile: 'salam', 'Total Sales': '$850', 'Gross Sales': '$765', Type: 'Up Sale', Agent: 'No One', 'Comm Pkr': 'Rs50,997', amount: 50997 },
    ],
  };
}

function transformData(raw) {
  const pnlRows = parseSimpleMonthly(raw.pnl, ['Expense', 'Revenue', 'PnL']);
  const revenueRows = parseSimpleMonthly(raw.revenue, ['NET Income ($)', 'NET Income (pkr)']);
  const expenseRows = parseDetailRows(raw.expenses, {
    amountColumn: 'Cost', fields: ['Month', 'Expense', 'Pay Date', 'Cost', 'Status', 'Total pkr', 'Total $']
  });
  const salaryRows = parseDetailRows(raw.salaries, {
    amountColumn: 'Salary', fields: ['Month', 'Name', 'Position', 'Pay Date', 'Salary', 'Commission', 'Bonus', 'Status', 'Total Paid']
  });
  const cashRows = parseDetailRows(raw.cash, {
    amountColumn: 'Comm Pkr', fields: ['Month', 'Proj. Name', 'Platform', 'Profile', 'Total Sales', 'Fees (Merchant)', 'Gross Sales', 'Revenue', 'Type', 'Agent', 'Commissions', 'Comm Pkr']
  });
  return { pnlRows, revenueRows, expenseRows, salaryRows, cashRows };
}

function parseSimpleMonthly(rows, numericColumns) {
  let year = null;
  return rows.flatMap((row) => {
    const values = Object.values(row).map(clean).filter(Boolean);
    const yearValue = values.find((value) => /^20\d{2}$/.test(value));
    if (yearValue && !isMonth(row.Month)) {
      year = Number(yearValue);
      return [];
    }
    if (!isMonth(row.Month)) return [];
    return [{
      year,
      month: normalizeMonth(row.Month),
      monthNo: monthNumber(row.Month),
      ...Object.fromEntries(numericColumns.map((col) => [col, parseMoney(row[col])])),
    }];
  }).filter((row) => row.year);
}

function parseDetailRows(rows, config) {
  let currentMonth = '';
  let currentYear = null;
  return rows.flatMap((row) => {
    const values = Object.values(row).map(clean).filter(Boolean);
    const yearValue = values.find((value) => /^20\d{2}$/.test(value));
    if (yearValue && values.length <= 2) {
      currentYear = Number(yearValue);
      return [];
    }
    if (isMonth(row.Month)) currentMonth = normalizeMonth(row.Month);
    if (!currentYear && currentMonth && MONTHS.indexOf(currentMonth) >= 9) currentYear = 2024;
    if (currentYear === 2024 && currentMonth === 'JAN') currentYear = 2025;
    if (currentYear === 2025 && currentMonth === 'JAN' && values.includes('2026')) currentYear = 2026;
    const amount = parseMoney(row[config.amountColumn]);
    const hasContent = values.some((value) => !isMonth(value) && !/^20\d{2}$/.test(value));
    if (!currentMonth || !hasContent || (!amount && !values.length)) return [];
    const parsed = { year: currentYear, month: currentMonth, monthNo: monthNumber(currentMonth), amount };
    config.fields.forEach((field) => parsed[field] = row[field] ?? '');
    parsed.Month = currentMonth;
    return [parsed];
  });
}

function render() {
  const scoped = getScopedData();
  renderKpis(scoped);
  renderCharts(scoped);
  renderRanks(scoped);
  renderTable(scoped);
}

function getScopedData() {
  const match = (row) => (state.filters.year === 'all' || String(row.year) === state.filters.year) && (state.filters.month === 'all' || row.month === state.filters.month);
  return Object.fromEntries(Object.entries(state.data).map(([key, rows]) => [key, rows.filter(match)]));
}

function renderKpis(scoped) {
  const revenue = sum(scoped.pnlRows, 'Revenue') || sum(scoped.revenueRows, 'NET Income (pkr)');
  const expenses = sum(scoped.pnlRows, 'Expense') || sum(scoped.expenseRows, 'amount') + sum(scoped.salaryRows, 'amount');
  const profit = scoped.pnlRows.length ? sum(scoped.pnlRows, 'PnL') : revenue - expenses;
  const cash = sum(scoped.cashRows, 'amount');
  text('kpiRevenue', moneyPKR.format(revenue));
  text('kpiExpenses', moneyPKR.format(expenses));
  text('kpiProfit', moneyPKR.format(profit));
  text('kpiCash', moneyPKR.format(cash));
  document.querySelector('#kpiProfit').closest('.kpi').classList.toggle('positive', profit >= 0);
  document.querySelector('#kpiProfit').closest('.kpi').classList.toggle('negative', profit < 0);
  text('kpiRevenueSub', `${moneyUSD.format(sum(scoped.revenueRows, 'NET Income ($)'))} USD net income`);
  text('kpiProfitSub', `${scoped.pnlRows.length} PnL month${scoped.pnlRows.length === 1 ? '' : 's'}`);
}

function renderCharts(scoped) {
  const pnl = [...scoped.pnlRows].sort(byDate);
  text('pnlCount', `${pnl.length} months`);
  groupedBars('pnlChart', pnl, [
    { key: 'Revenue', className: 'revenue' },
    { key: 'Expense', className: 'expense' },
  ], moneyPKR);
  groupedBars('profitChart', pnl, [{ key: 'PnL', className: (value) => value >= 0 ? 'profit' : 'loss' }], moneyPKR, true);
  groupedBars('revenueChart', [...scoped.revenueRows].sort(byDate), [{ key: 'NET Income (pkr)', className: 'revenue' }], moneyPKR);
}

function groupedBars(id, rows, series, formatter, useAbs = false) {
  const host = document.getElementById(id);
  host.innerHTML = '';
  if (!rows.length) return host.appendChild(empty('No data for selected filters'));
  const max = Math.max(1, ...rows.flatMap((row) => series.map((item) => Math.abs(row[item.key] || 0))));
  rows.forEach((row) => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    series.forEach((item) => {
      const value = row[item.key] || 0;
      const bar = document.createElement('div');
      bar.className = `bar ${typeof item.className === 'function' ? item.className(value) : item.className}`;
      bar.style.height = `${Math.max(2, (Math.abs(value) / max) * 220)}px`;
      bar.title = `${row.month} ${row.year}: ${formatter.format(useAbs ? Math.abs(value) : value)}`;
      group.appendChild(bar);
    });
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = `${row.month} ${String(row.year).slice(2)}`;
    group.appendChild(label);
    host.appendChild(group);
  });
}

function renderRanks(scoped) {
  renderRank('expenseList', groupSum(scoped.expenseRows, 'Expense'), moneyPKR);
  renderRank('salaryList', groupSum(scoped.salaryRows, 'Name'), moneyPKR);
  const profileTotals = groupSum(scoped.cashRows, 'Profile');
  renderRank('profileList', profileTotals.length ? profileTotals : groupSum(scoped.cashRows, 'Platform'), moneyPKR);
}

function renderRank(id, items, formatter) {
  const host = document.getElementById(id);
  host.innerHTML = '';
  if (!items.length) return host.appendChild(empty('No data for selected filters'));
  const max = Math.max(...items.map((item) => item.total), 1);
  items.slice(0, 8).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'rank-item';
    row.innerHTML = `<div class="rank-row"><span>${escapeHtml(item.name || 'Uncategorized')}</span><span>${formatter.format(item.total)}</span></div><div class="track"><div class="fill" style="width:${Math.max(4, (item.total / max) * 100)}%"></div></div>`;
    host.appendChild(row);
  });
}

function renderTable(scoped = getScopedData()) {
  const table = document.getElementById('detailsTable');
  const rows = [...(scoped[state.activeTable] || [])].sort(byDate).slice(-40).reverse();
  const columnsByTable = {
    pnlRows: ['year', 'month', 'Expense', 'Revenue', 'PnL'],
    revenueRows: ['year', 'month', 'NET Income ($)', 'NET Income (pkr)'],
    expenseRows: ['year', 'month', 'Expense', 'Pay Date', 'Cost', 'Status'],
    salaryRows: ['year', 'month', 'Name', 'Position', 'Pay Date', 'Salary', 'Commission', 'Bonus', 'Status'],
    cashRows: ['year', 'month', 'Proj. Name', 'Platform', 'Profile', 'Total Sales', 'Gross Sales', 'Type', 'Agent', 'Comm Pkr'],
  };
  const columns = columnsByTable[state.activeTable];
  table.innerHTML = `<thead><tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td>${formatCell(row[col])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}">No rows for selected filters.</td></tr>`}</tbody>`;
}

function hydrateFilters() {
  const allRows = Object.values(state.data).flat();
  const years = [...new Set(allRows.map((row) => row.year).filter(Boolean))].sort();
  const yearFilter = document.getElementById('yearFilter');
  yearFilter.innerHTML = '<option value="all">All years</option>' + years.map((year) => `<option value="${year}">${year}</option>`).join('');
  yearFilter.value = years.includes(Number(state.filters.year)) ? state.filters.year : 'all';
  const monthFilter = document.getElementById('monthFilter');
  monthFilter.innerHTML = '<option value="all">All months</option>' + MONTHS.map((month) => `<option value="${month}">${month}</option>`).join('');
  monthFilter.value = state.filters.month;
}

function showStatus(message) { const el = document.getElementById('statusMessage'); el.textContent = message; el.classList.add('show'); }
function hideStatus() { document.getElementById('statusMessage').classList.remove('show'); }
function text(id, value) { document.getElementById(id).textContent = value; }
function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function parseMoney(value) { return Number(clean(value).replace(/[^0-9.-]/g, '')) || 0; }
function isMonth(value) { return MONTH_ALIASES.has(clean(value)) || MONTH_ALIASES.has(clean(value).toLowerCase()); }
function normalizeMonth(value) { const cleaned = clean(value); return MONTHS[(MONTH_ALIASES.get(cleaned) || MONTH_ALIASES.get(cleaned.toLowerCase()) || 1) - 1]; }
function monthNumber(value) { return MONTH_ALIASES.get(clean(value)) || MONTH_ALIASES.get(clean(value).toLowerCase()) || 0; }
function monthName(index) { return new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' }); }
function byDate(a, b) { return (a.year - b.year) || (a.monthNo - b.monthNo); }
function sum(rows, key) { return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0); }
function groupSum(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => grouped.set(clean(row[key]) || 'Uncategorized', (grouped.get(clean(row[key]) || 'Uncategorized') || 0) + (row.amount || 0)));
  return [...grouped.entries()].map(([name, total]) => ({ name, total })).filter((item) => item.total).sort((a, b) => b.total - a.total);
}
function empty(message) { const div = document.createElement('div'); div.className = 'empty'; div.textContent = message; return div; }
function escapeHtml(value) { return clean(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }
function formatCell(value) { return escapeHtml(value); }
