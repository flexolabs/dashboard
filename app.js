// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  currency: 'USD',
  page: 'overview',
  data: null,
  loading: false
};

// ─── DOM Helpers ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function showLoading(show) {
  $('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showError(msg) {
  $('errorBanner').style.display = 'flex';
  $('errorMessage').textContent = msg;
}

function displayVal(usd, pkr) {
  if (state.currency === 'PKR') return formatCurrency(pkr, 'PKR');
  return formatCurrency(usd, 'USD');
}

function displayValCompact(usd, pkr) {
  if (state.currency === 'PKR') return formatCurrency(pkr, 'PKR', true);
  return formatCurrency(usd, 'USD', true);
}

function displaySubVal(usd, pkr) {
  if (state.currency === 'PKR') return formatCurrency(usd, 'USD', true);
  return formatCurrency(pkr, 'PKR', true);
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function statCard(title, usd, pkr, change = null, subtitle = '') {
  const isNeg = (usd || 0) < 0;
  const changeHtml = change !== null
    ? `<div class="stat-change ${change >= 0 ? 'positive' : 'negative'}">
         <span class="arrow">${change >= 0 ? '↑' : '↓'}</span>
         <span class="percentage">${Math.abs(change).toFixed(1)}%</span>
         <span class="label">vs last month</span>
       </div>`
    : '';
  return `
    <div class="stat-card ${isNeg ? 'negative-card' : ''}">
      <div class="stat-header">
        <h3>${title}</h3>
      </div>
      <div class="stat-value">${displayVal(usd, pkr)}</div>
      <div class="stat-subtext">${displaySubVal(usd, pkr)}</div>
      ${subtitle ? `<div class="stat-subtitle">${subtitle}</div>` : ''}
      ${changeHtml}
    </div>`;
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function navigate(page) {
  state.page = page;
  destroyAllCharts();

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  const titles = {
    overview: 'Overview',
    upwork:   'Upwork ROI',
    clients:  'Client Analytics',
    team:     'Team Performance',
    expenses: 'Expense Breakdown',
    health:   'Financial Health'
  };
  $('pageTitle').textContent = titles[page] || page;

  const content = $('pageContent');
  content.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

  // Close sidebar on mobile
  if (window.innerWidth < 1024) {
    $('sidebar').classList.remove('open');
  }

  requestAnimationFrame(() => renderPage(page));
}

function renderPage(page) {
  if (!state.data) {
    $('pageContent').innerHTML = '<div class="empty-state"><p>Loading data…</p></div>';
    return;
  }
  const d = state.data;
  switch (page) {
    case 'overview':  renderOverview(d); break;
    case 'upwork':    renderUpwork(d);   break;
    case 'clients':   renderClients(d);  break;
    case 'team':      renderTeam(d);     break;
    case 'expenses':  renderExpenses(d); break;
    case 'health':    renderHealth(d);   break;
    default:          renderOverview(d);
  }
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function renderOverview(d) {
  const { pnl, cashInn, expenses, revenue } = d;

  // Use PnL if available, else derive from cash inn & expenses
  const monthlyData = buildMonthlyOverview(pnl, cashInn, expenses);
  const months = sortMonthKeys(Object.keys(monthlyData));
  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const cur  = monthlyData[lastMonth] || {};
  const prev = monthlyData[prevMonth] || {};

  const totalRevUSD = cur.revUSD || 0;
  const totalRevPKR = cur.revPKR || toPKR(totalRevUSD, false);
  const totalExpUSD = cur.expUSD || 0;
  const totalExpPKR = cur.expPKR || toPKR(totalExpUSD, true);
  const profitUSD   = totalRevUSD - totalExpUSD;
  const profitPKR   = totalRevPKR - totalExpPKR;
  const margin      = totalRevUSD > 0 ? (profitUSD / totalRevUSD) * 100 : 0;

  const revChange  = prev.revUSD > 0 ? ((totalRevUSD - prev.revUSD) / prev.revUSD * 100) : null;
  const expChange  = prev.expUSD > 0 ? ((totalExpUSD - prev.expUSD) / prev.expUSD * 100) : null;
  const profChange = prev.revUSD > 0 ? (((profitUSD - (prev.revUSD - prev.expUSD)) / Math.abs(prev.revUSD - prev.expUSD)) * 100) : null;

  // YTD
  const curYear = lastMonth ? lastMonth.split('-')[0] : String(new Date().getFullYear());
  const ytdMonths = months.filter(m => m.startsWith(curYear));
  const ytdRevUSD = ytdMonths.reduce((s, m) => s + (monthlyData[m]?.revUSD || 0), 0);
  const ytdExpUSD = ytdMonths.reduce((s, m) => s + (monthlyData[m]?.expUSD || 0), 0);

  // Top 5 clients from Cash Inn
  const clientMap = {};
  for (const r of cashInn) {
    const name = normalizeClientName(r.client) || 'Unknown';
    if (!clientMap[name]) clientMap[name] = { usd: 0, pkr: 0, count: 0 };
    clientMap[name].usd += r.grossUSD;
    clientMap[name].pkr += r.grossPKR;
    clientMap[name].count++;
  }
  const top5 = Object.entries(clientMap).sort((a, b) => b[1].usd - a[1].usd).slice(0, 5);

  // Recent transactions (last 10)
  const recent = [...cashInn].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  const last12 = months.slice(-12);
  const revData = last12.map(m => (monthlyData[m]?.revUSD || 0));
  const expData = last12.map(m => (monthlyData[m]?.expUSD || 0));
  const profData = last12.map(m => (monthlyData[m]?.revUSD || 0) - (monthlyData[m]?.expUSD || 0));
  const labels12 = last12.map(monthKeyToLabel);

  // YoY data
  const allYears = [...new Set(months.map(m => m.split('-')[0]))].sort();
  const yoyMonths = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const yoyLabels = yoyMonths.map(m => {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[parseInt(m, 10) - 1];
  });

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      ${statCard('Total Revenue', totalRevUSD, totalRevPKR, revChange,
        `YTD: ${formatCurrency(ytdRevUSD, 'USD', true)}`)}
      ${statCard('Total Expenses', totalExpUSD, totalExpPKR, expChange,
        `YTD: ${formatCurrency(ytdExpUSD, 'USD', true)}`)}
      ${statCard('Net Profit', profitUSD, profitPKR, profChange)}
      ${statCard('Profit Margin', margin, margin, null,
        `Current month`).replace(/<div class="stat-value">.*?<\/div>/, `<div class="stat-value ${margin < 0 ? 'neg' : 'pos'}">${margin.toFixed(1)}%</div>`)}
    </div>

    <div class="charts-row">
      <div class="chart-card wide">
        <div class="chart-header">
          <h2>Revenue vs Expenses</h2>
          <span class="chart-label">Last 12 months</span>
        </div>
        <div class="chart-body h280"><canvas id="revenueExpChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h2>Profit Trend</h2></div>
        <div class="chart-body h280"><canvas id="profitChart"></canvas></div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card full">
        <div class="chart-header">
          <h2>Year-over-Year Revenue</h2>
          <span class="chart-label">Monthly comparison</span>
        </div>
        <div class="chart-body h240"><canvas id="yoyChart"></canvas></div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="list-card">
        <div class="list-header"><h2>Top Clients by Revenue</h2></div>
        <div class="client-list">
          ${top5.map(([name, v], i) => `
            <div class="client-row">
              <div class="client-rank">${i + 1}</div>
              <div class="client-avatar">${(name[0] || '?').toUpperCase()}</div>
              <div class="client-info">
                <div class="client-name">${escHtml(name)}</div>
                <div class="client-projects">${v.count} project${v.count !== 1 ? 's' : ''}</div>
              </div>
              <div class="client-revenue">${displayVal(v.usd, v.pkr)}</div>
            </div>`).join('') || '<p class="empty">No client data available</p>'}
        </div>
      </div>

      <div class="list-card">
        <div class="list-header"><h2>Recent Transactions</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Client</th><th>Amount</th><th>Agent</th></tr></thead>
            <tbody>
              ${recent.map(r => `
                <tr>
                  <td>${escHtml(r.date)}</td>
                  <td><span class="client-tag">${escHtml(r.client || 'N/A')}</span></td>
                  <td class="amount">${displayVal(r.grossUSD, r.grossPKR)}</td>
                  <td>${escHtml(r.agent || '—')}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="empty">No transactions</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Charts
  requestAnimationFrame(() => {
    createComboChart('revenueExpChart', labels12,
      [makeBarDataset('Revenue', revData, CHART_COLORS.black),
       makeBarDataset('Expenses', expData, CHART_COLORS.lightGray)],
      [],
      { plugins: { legend: { position: 'top' } } }
    );

    const profColor = profData[profData.length - 1] >= 0 ? CHART_COLORS.success : CHART_COLORS.danger;
    createLineChart('profitChart', labels12,
      [makeLineDataset('Net Profit', profData, profColor, { fill: true })]);

    // YoY chart
    const yoyDatasets = allYears.slice(-3).map((year, i) => {
      const colors = [CHART_COLORS.black, CHART_COLORS.medGray, CHART_COLORS.info];
      const data = yoyMonths.map(m => {
        const key = `${year}-${m}`;
        return monthlyData[key]?.revUSD || 0;
      });
      return makeBarDataset(year, data, colors[i] || CHART_COLORS.black);
    });
    createBarChart('yoyChart', yoyLabels, yoyDatasets);
  });
}

function buildMonthlyOverview(pnl, cashInn, expenses) {
  const map = {};

  // From PnL sheet
  for (const r of pnl) {
    const key = extractMonthKey(r.month);
    if (!map[key]) map[key] = {};
    map[key].revUSD  = r.revenue;
    map[key].revPKR  = toPKR(r.revenue, false);
    map[key].expUSD  = r.expenses;
    map[key].expPKR  = toPKR(r.expenses, true);
    map[key].profitUSD = r.profit;
  }

  // Augment from Cash Inn (revenue) if PnL missing
  const cashByMonth = groupByMonth(cashInn, 'date');
  for (const [key, rows] of Object.entries(cashByMonth)) {
    if (!map[key]) map[key] = {};
    if (!map[key].revUSD) {
      map[key].revUSD = rows.reduce((s, r) => s + r.grossUSD, 0);
      map[key].revPKR = rows.reduce((s, r) => s + r.grossPKR, 0);
    }
  }

  // Augment from Expenses if PnL missing
  const expByMonth = groupByMonth(expenses, 'month');
  for (const [key, rows] of Object.entries(expByMonth)) {
    if (!map[key]) map[key] = {};
    if (!map[key].expUSD) {
      map[key].expPKR = rows.reduce((s, r) => s + r.amtPKR, 0);
      map[key].expUSD = rows.reduce((s, r) => s + r.amtUSD, 0);
    }
  }

  return map;
}

// ─── UPWORK ROI ───────────────────────────────────────────────────────────────
function renderUpwork(d) {
  const { cashInn, expenses } = d;

  const frontSales = cashInn.filter(r => r.saleType !== 'upsell');
  const upsells    = cashInn.filter(r => r.saleType === 'upsell');

  const frontUSD = frontSales.reduce((s, r) => s + r.grossUSD, 0);
  const frontPKR = frontSales.reduce((s, r) => s + r.grossPKR, 0);
  const upUSD    = upsells.reduce((s, r) => s + r.grossUSD, 0);
  const upPKR    = upsells.reduce((s, r) => s + r.grossPKR, 0);
  const totalUSD = frontUSD + upUSD;
  const totalPKR = frontPKR + upPKR;

  // Connects from expenses
  const connectRows = expenses.filter(e => /connect/i.test(e.expense));
  const totalConnectPKR = connectRows.reduce((s, r) => s + r.amtPKR, 0);
  const totalConnectUSD = connectRows.reduce((s, r) => s + r.amtUSD, 0);
  const totalConnects = totalConnectPKR > 0 ? Math.round(totalConnectPKR / COST_PER_CONNECT_PKR) : 0;

  const roiPct = totalConnectUSD > 0 ? ((totalUSD - totalConnectUSD) / totalConnectUSD * 100) : 0;
  const costPerDollar = totalUSD > 0 ? totalConnectUSD / totalUSD : 0;
  const upworkFee = totalUSD * 0.10;

  // Monthly connects trend
  const connectByMonth = groupByMonth(connectRows, 'month');
  const cashByMonth    = groupByMonth(cashInn, 'date');
  const allMonths = sortMonthKeys([...new Set([...Object.keys(connectByMonth), ...Object.keys(cashByMonth)])]).slice(-12);
  const connectTrend = allMonths.map(m => connectByMonth[m]?.reduce((s, r) => s + r.amtUSD, 0) || 0);
  const revTrend     = allMonths.map(m => cashByMonth[m]?.reduce((s, r) => s + r.grossUSD, 0) || 0);
  const labels = allMonths.map(monthKeyToLabel);

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      ${statCard('Front Sales Revenue', frontUSD, frontPKR)}
      ${statCard('Upsell Revenue', upUSD, upPKR)}
      ${statCard('Connects Cost', totalConnectUSD, totalConnectPKR, null,
        `${totalConnects.toLocaleString()} connects`)}
      <div class="stat-card ${roiPct >= 0 ? '' : 'negative-card'}">
        <div class="stat-header"><h3>Overall ROI</h3></div>
        <div class="stat-value ${roiPct >= 0 ? 'pos' : 'neg'}">${roiPct.toFixed(0)}%</div>
        <div class="stat-subtext">Cost per $1 earned: ${formatCurrency(costPerDollar, 'USD')}</div>
        <div class="stat-subtitle">10% Upwork fee: ${formatCurrency(upworkFee, 'USD', true)}</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card wide">
        <div class="chart-header"><h2>Connects Spend vs Revenue Trend</h2></div>
        <div class="chart-body h280"><canvas id="connectTrendChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h2>Front Sales vs Upsells</h2></div>
        <div class="chart-body h280"><canvas id="salesBreakdownChart"></canvas></div>
      </div>
    </div>

    <div class="info-cards-row">
      <div class="info-box">
        <h3>Connects Analytics</h3>
        <div class="info-rows">
          <div class="info-row"><span>Total Connects Used</span><strong>${totalConnects.toLocaleString()}</strong></div>
          <div class="info-row"><span>Total Cost</span><strong>${displayVal(totalConnectUSD, totalConnectPKR)}</strong></div>
          <div class="info-row"><span>Revenue Generated</span><strong>${displayVal(totalUSD, totalPKR)}</strong></div>
          <div class="info-row"><span>ROI</span><strong class="${roiPct >= 0 ? 'text-success' : 'text-danger'}">${roiPct.toFixed(0)}%</strong></div>
          <div class="info-row"><span>Cost per $1 Earned</span><strong>${formatCurrency(costPerDollar, 'USD')}</strong></div>
        </div>
      </div>
      <div class="info-box">
        <h3>Pricing Reference</h3>
        <div class="info-rows">
          <div class="info-row"><span>Package</span><strong>$90 = 600 connects</strong></div>
          <div class="info-row"><span>Per Connect</span><strong>$0.15 (Rs ${COST_PER_CONNECT_PKR})</strong></div>
          <div class="info-row"><span>Upwork Merchant Fee</span><strong>10% on all transactions</strong></div>
          <div class="info-row"><span>Fee This Period</span><strong>${formatCurrency(upworkFee, 'USD', true)}</strong></div>
        </div>
        <div class="notice-badge">⚠ Upwork charges 10% merchant fee on all transactions</div>
      </div>
    </div>

    <div class="chart-card full">
      <div class="list-header"><h2>Connects Expense Detail</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Month</th><th>Expense</th><th>Amount (PKR)</th><th>Amount (USD)</th><th>Status</th></tr></thead>
          <tbody>
            ${connectRows.map(r => `
              <tr>
                <td>${escHtml(r.month)}</td>
                <td>${escHtml(r.expense)}</td>
                <td class="amount">${formatCurrency(r.amtPKR, 'PKR', true)}</td>
                <td class="amount">${formatCurrency(r.amtUSD, 'USD')}</td>
                <td><span class="badge">${escHtml(r.status || 'Paid')}</span></td>
              </tr>`).join('') || '<tr><td colspan="5" class="empty">No connect expenses found</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    createComboChart('connectTrendChart', labels,
      [makeBarDataset('Connect Cost ($)', connectTrend, CHART_COLORS.lightGray)],
      [makeLineDataset('Revenue ($)', revTrend, CHART_COLORS.black)]);

    createDoughnutChart('salesBreakdownChart',
      ['Front Sales', 'Upsells'],
      [frontUSD, upUSD],
      [CHART_COLORS.black, CHART_COLORS.medGray]);
  });
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
function renderClients(d) {
  const { cashInn } = d;

  // Build client map
  const clientMap = {};
  for (const r of cashInn) {
    const name = normalizeClientName(r.client) || 'Unknown';
    if (!clientMap[name]) {
      clientMap[name] = { usd: 0, pkr: 0, count: 0, dates: [], projects: [] };
    }
    clientMap[name].usd += r.grossUSD;
    clientMap[name].pkr += r.grossPKR;
    clientMap[name].count++;
    if (r.date) clientMap[name].dates.push(r.date);
    if (r.project) clientMap[name].projects.push(r.project);
  }

  const clients = Object.entries(clientMap)
    .map(([name, v]) => ({
      name,
      usd: v.usd,
      pkr: v.pkr,
      count: v.count,
      avgUSD: v.count > 0 ? v.usd / v.count : 0,
      firstDate: v.dates.sort()[0] || '',
      lastDate:  v.dates.sort().reverse()[0] || '',
      projects: [...new Set(v.projects)].slice(0, 3)
    }))
    .sort((a, b) => b.usd - a.usd);

  const top10 = clients.slice(0, 10);

  // Service distribution
  const serviceMap = {};
  for (const r of cashInn) {
    const svc = inferService(r.project || r.client || '');
    serviceMap[svc] = (serviceMap[svc] || 0) + r.grossUSD;
  }
  const svcEntries = Object.entries(serviceMap).sort((a, b) => b[1] - a[1]);

  // Active vs churned
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  function isActive(lastDate) {
    if (!lastDate) return false;
    const d = new Date(lastDate);
    return !isNaN(d) && d >= threeMonthsAgo;
  }

  const activeClients  = clients.filter(c => isActive(c.lastDate));
  const churnedClients = clients.filter(c => !isActive(c.lastDate));

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header"><h3>Total Clients</h3></div>
        <div class="stat-value">${clients.length}</div>
        <div class="stat-subtext">All time</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Active Clients</h3></div>
        <div class="stat-value pos">${activeClients.length}</div>
        <div class="stat-subtext">Last 3 months</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Churned Clients</h3></div>
        <div class="stat-value neg">${churnedClients.length}</div>
        <div class="stat-subtext">No activity 3+ months</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Avg Project Value</h3></div>
        <div class="stat-value">${displayVal(
          cashInn.length > 0 ? cashInn.reduce((s, r) => s + r.grossUSD, 0) / cashInn.length : 0,
          cashInn.length > 0 ? cashInn.reduce((s, r) => s + r.grossPKR, 0) / cashInn.length : 0
        )}</div>
        <div class="stat-subtext">${cashInn.length} transactions</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header"><h2>Service Distribution</h2></div>
        <div class="chart-body h280"><canvas id="serviceChart"></canvas></div>
      </div>
      <div class="chart-card wide">
        <div class="chart-header"><h2>Top 10 Clients by Revenue</h2></div>
        <div class="chart-body h280"><canvas id="clientsChart"></canvas></div>
      </div>
    </div>

    <div class="chart-card full">
      <div class="list-header"><h2>Client Lifetime Value</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th><th>Client</th><th>Total Revenue</th>
              <th>Projects</th><th>Avg Value</th>
              <th>First Project</th><th>Last Project</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${clients.slice(0, 30).map((c, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><div class="client-mini"><div class="client-avatar sm">${(c.name[0]||'?').toUpperCase()}</div>${escHtml(c.name)}</div></td>
                <td class="amount">${displayVal(c.usd, c.pkr)}</td>
                <td>${c.count}</td>
                <td class="amount">${displayVal(c.avgUSD, toPKR(c.avgUSD, false))}</td>
                <td>${escHtml(c.firstDate || '—')}</td>
                <td>${escHtml(c.lastDate || '—')}</td>
                <td><span class="badge ${isActive(c.lastDate) ? 'badge-success' : 'badge-danger'}">${isActive(c.lastDate) ? 'Active' : 'Churned'}</span></td>
              </tr>`).join('') || '<tr><td colspan="8" class="empty">No client data</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    createDoughnutChart('serviceChart',
      svcEntries.map(([k]) => k),
      svcEntries.map(([, v]) => v),
      MULTI_COLORS);

    createHorizontalBarChart('clientsChart',
      top10.map(c => c.name),
      top10.map(c => state.currency === 'PKR' ? c.pkr : c.usd),
      CHART_COLORS.black);
  });
}

function inferService(name) {
  const n = name.toLowerCase();
  if (/seo/i.test(n)) return 'SEO';
  if (/ads|ppc|google ad|facebook ad|meta ad/i.test(n)) return 'Ads';
  if (/web|website|wordpress|woocommerce/i.test(n)) return 'Web Design';
  if (/host/i.test(n)) return 'Hosting';
  if (/social|smm|instagram|twitter|linkedin/i.test(n)) return 'Social Media';
  if (/design|brand|logo|graphic/i.test(n)) return 'Design';
  if (/email|newsletter/i.test(n)) return 'Email Marketing';
  if (/app|mobile|ios|android/i.test(n)) return 'App Dev';
  return 'Other';
}

// ─── TEAM ─────────────────────────────────────────────────────────────────────
function renderTeam(d) {
  const { cashInn, salaries } = d;

  // Bidder leaderboard
  const agentMap = {};
  for (const r of cashInn) {
    const agent = r.agent || 'Unknown';
    if (!agentMap[agent]) agentMap[agent] = { usd: 0, pkr: 0, comm: 0, count: 0 };
    agentMap[agent].usd += r.grossUSD;
    agentMap[agent].pkr += r.grossPKR;
    agentMap[agent].comm += r.agentComm;
    agentMap[agent].count++;
  }
  const agents = Object.entries(agentMap)
    .filter(([k]) => k && k !== 'Unknown' && k.trim())
    .map(([name, v]) => ({ name, ...v, avg: v.count > 0 ? v.usd / v.count : 0 }))
    .sort((a, b) => b.usd - a.usd);

  // TL performance
  const tlMap = {};
  for (const r of cashInn) {
    const tl = r.tl || 'Unknown';
    if (!tlMap[tl]) tlMap[tl] = { usd: 0, pkr: 0, comm: 0, count: 0 };
    tlMap[tl].usd   += r.grossUSD;
    tlMap[tl].pkr   += r.grossPKR;
    tlMap[tl].comm  += r.tlComm;
    tlMap[tl].count++;
  }
  const tls = Object.entries(tlMap)
    .filter(([k]) => k && k !== 'Unknown' && k.trim())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.usd - a.usd);

  // Salary vs revenue map
  const salaryByName = {};
  for (const s of salaries) {
    const key = s.name.toLowerCase().trim();
    salaryByName[key] = s.salary;
  }

  const totalRevByAgent = {};
  for (const r of cashInn) {
    const key = (r.agent || '').toLowerCase().trim();
    totalRevByAgent[key] = (totalRevByAgent[key] || 0) + r.grossPKR;
  }

  const salaryAnalysis = salaries.map(s => {
    const key = s.name.toLowerCase().trim();
    const revPKR = totalRevByAgent[key] || 0;
    const ratio = s.salary > 0 ? revPKR / s.salary : 0;
    return { name: s.name, salary: s.salary, revPKR, ratio, role: s.role };
  }).sort((a, b) => b.ratio - a.ratio);

  function ratioClass(r) {
    if (r >= 3) return 'text-success';
    if (r >= 2) return 'text-warning';
    return 'text-danger';
  }
  function ratioBadge(r) {
    if (r >= 3) return 'badge-success';
    if (r >= 2) return 'badge-warning';
    return 'badge-danger';
  }

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header"><h3>Total Team Members</h3></div>
        <div class="stat-value">${salaries.length || agents.length}</div>
        <div class="stat-subtext">In payroll/active bidders</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Total Agent Commissions</h3></div>
        <div class="stat-value">${formatCurrency(agents.reduce((s,a)=>s+a.comm,0), 'PKR', true)}</div>
        <div class="stat-subtext">${agents.length} agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Total TL Commissions</h3></div>
        <div class="stat-value">${formatCurrency(tls.reduce((s,t)=>s+t.comm,0), 'PKR', true)}</div>
        <div class="stat-subtext">${tls.length} team leads</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Revenue per Employee</h3></div>
        <div class="stat-value">${(() => {
          const totalRev = cashInn.reduce((s,r)=>s+r.grossUSD, 0);
          const count = salaries.length || 1;
          return displayVal(totalRev / count, toPKR(totalRev / count, false));
        })()}</div>
        <div class="stat-subtext">Average</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card wide">
        <div class="chart-header"><h2>Bidder Leaderboard</h2></div>
        <div class="chart-body h300"><canvas id="bidderChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h2>TL Revenue</h2></div>
        <div class="chart-body h300"><canvas id="tlChart"></canvas></div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="list-card">
        <div class="list-header"><h2>Bidder Rankings</h2></div>
        ${agents.length ? agents.map((a, i) => `
          <div class="agent-row">
            <div class="rank-badge">#${i+1}</div>
            <div class="client-avatar">${(a.name[0]||'?').toUpperCase()}</div>
            <div class="agent-info">
              <div class="agent-name">${escHtml(a.name)}</div>
              <div class="agent-meta">${a.count} projects · Comm: ${formatCurrency(a.comm,'PKR',true)}</div>
            </div>
            <div class="agent-rev">${displayVal(a.usd, a.pkr)}</div>
          </div>`).join('')
        : '<p class="empty">No agent data available</p>'}
      </div>

      <div class="list-card">
        <div class="list-header"><h2>Salary vs Revenue Analysis</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Employee</th><th>Role</th><th>Salary (PKR)</th><th>Revenue</th><th>Ratio</th></tr></thead>
            <tbody>
              ${salaryAnalysis.map(s => `
                <tr>
                  <td>${escHtml(s.name)}</td>
                  <td>${escHtml(s.role||'—')}</td>
                  <td class="amount">${formatCurrency(s.salary,'PKR',true)}</td>
                  <td class="amount ${s.revPKR>0?'text-success':'text-secondary'}">${formatCurrency(s.revPKR,'PKR',true)}</td>
                  <td><span class="badge ${ratioBadge(s.ratio)}">${s.ratio.toFixed(1)}x</span></td>
                </tr>`).join('') || '<tr><td colspan="5" class="empty">No salary data</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="legend-row">
          <span class="badge badge-success">≥3x</span> Great &nbsp;
          <span class="badge badge-warning">2–3x</span> Good &nbsp;
          <span class="badge badge-danger">&lt;2x</span> Needs review
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    if (agents.length) {
      createHorizontalBarChart('bidderChart',
        agents.map(a => a.name),
        agents.map(a => state.currency === 'PKR' ? a.pkr : a.usd),
        CHART_COLORS.black);
    }
    if (tls.length) {
      createHorizontalBarChart('tlChart',
        tls.map(t => t.name),
        tls.map(t => state.currency === 'PKR' ? t.pkr : t.usd),
        CHART_COLORS.darkGray);
    }
  });
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
function renderExpenses(d) {
  const { expenses, salaries } = d;

  // Category totals
  const catMap = {};
  for (const e of expenses) {
    const cat = e.category || 'Other';
    if (!catMap[cat]) catMap[cat] = { pkr: 0, usd: 0, count: 0, items: [] };
    catMap[cat].pkr += e.amtPKR;
    catMap[cat].usd += e.amtUSD;
    catMap[cat].count++;
    catMap[cat].items.push(e);
  }

  // Add salaries as category
  const totalSalaryPKR = salaries.reduce((s, e) => s + e.salary, 0);
  if (totalSalaryPKR > 0) {
    catMap['Salaries'] = catMap['Salaries'] || { pkr: 0, usd: 0, count: 0, items: [] };
    catMap['Salaries'].pkr += totalSalaryPKR;
    catMap['Salaries'].usd += toUSD(totalSalaryPKR, true);
    catMap['Salaries'].count += salaries.length;
  }

  const catEntries = Object.entries(catMap).sort((a, b) => b[1].pkr - a[1].pkr);
  const totalExpPKR = catEntries.reduce((s, [, v]) => s + v.pkr, 0);
  const totalExpUSD = catEntries.reduce((s, [, v]) => s + v.usd, 0);

  // Monthly trend
  const expByMonth = groupByMonth(expenses, 'month');
  const months = sortMonthKeys(Object.keys(expByMonth)).slice(-12);
  const monthlyTotals = months.map(m => expByMonth[m]?.reduce((s, r) => s + r.amtUSD, 0) || 0);
  const labels = months.map(monthKeyToLabel);

  // Stacked category data for last 6 months
  const last6 = months.slice(-6);
  const last6Labels = last6.map(monthKeyToLabel);
  const topCats = catEntries.slice(0, 5).map(([k]) => k);

  // Connects
  const connects = expenses.filter(e => /connect/i.test(e.expense));
  const connectsTotalPKR = connects.reduce((s, r) => s + r.amtPKR, 0);
  const connectsMonthly = groupByMonth(connects, 'month');

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      ${catEntries.slice(0, 4).map(([cat, v]) => `
        <div class="stat-card">
          <div class="stat-header"><h3>${escHtml(cat)}</h3></div>
          <div class="stat-value">${displayVal(v.usd, v.pkr)}</div>
          <div class="stat-subtext">${v.count} item${v.count !== 1 ? 's' : ''} · ${totalExpPKR > 0 ? ((v.pkr/totalExpPKR)*100).toFixed(1) : 0}% of total</div>
        </div>`).join('')}
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header"><h2>Category Breakdown</h2></div>
        <div class="chart-body h280"><canvas id="expCatChart"></canvas></div>
      </div>
      <div class="chart-card wide">
        <div class="chart-header"><h2>Monthly Expense Trend</h2></div>
        <div class="chart-body h280"><canvas id="expTrendChart"></canvas></div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="list-card">
        <div class="list-header">
          <h2>All Expense Categories</h2>
          <span class="header-meta">Total: ${displayVal(totalExpUSD, totalExpPKR)}</span>
        </div>
        ${catEntries.map(([cat, v]) => `
          <div class="expense-row">
            <div class="expense-cat-icon">${catIcon(cat)}</div>
            <div class="expense-info">
              <div class="expense-name">${escHtml(cat)}</div>
              <div class="expense-bar-wrap">
                <div class="expense-bar" style="width:${totalExpPKR>0?Math.min((v.pkr/totalExpPKR)*100,100):0}%"></div>
              </div>
            </div>
            <div class="expense-amount">${displayVal(v.usd, v.pkr)}</div>
          </div>`).join('') || '<p class="empty">No expense data</p>'}
      </div>

      <div class="list-card">
        <div class="list-header"><h2>Connects Deep Dive</h2></div>
        <div class="info-rows">
          <div class="info-row"><span>Total Spent (All Time)</span><strong>${formatCurrency(connectsTotalPKR,'PKR',true)}</strong></div>
          <div class="info-row"><span>Connects Bought (est.)</span><strong>${Math.round(connectsTotalPKR/COST_PER_CONNECT_PKR).toLocaleString()}</strong></div>
          <div class="info-row"><span>Cost per Connect</span><strong>Rs ${COST_PER_CONNECT_PKR} / $${COST_PER_CONNECT_USD}</strong></div>
        </div>
        <br>
        <table class="data-table">
          <thead><tr><th>Month</th><th>Amount (PKR)</th><th>Connects (est.)</th></tr></thead>
          <tbody>
            ${sortMonthKeys(Object.keys(connectsMonthly)).slice(-12).map(m => {
              const rows = connectsMonthly[m] || [];
              const totalPKR = rows.reduce((s,r)=>s+r.amtPKR,0);
              const est = Math.round(totalPKR / COST_PER_CONNECT_PKR);
              return `<tr>
                <td>${monthKeyToLabel(m)}</td>
                <td class="amount">${formatCurrency(totalPKR,'PKR',true)}</td>
                <td>${est.toLocaleString()}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="3" class="empty">No connect data</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="chart-card full">
      <div class="list-header"><h2>Expense Detail</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Month</th><th>Expense</th><th>Category</th><th>Amount (PKR)</th><th>Amount (USD)</th></tr></thead>
          <tbody>
            ${expenses.slice(0, 50).map(e => `
              <tr>
                <td>${escHtml(e.month)}</td>
                <td>${escHtml(e.expense)}</td>
                <td><span class="badge">${escHtml(e.category)}</span></td>
                <td class="amount">${formatCurrency(e.amtPKR,'PKR',true)}</td>
                <td class="amount">${formatCurrency(e.amtUSD,'USD')}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="empty">No expenses found</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    createDoughnutChart('expCatChart',
      catEntries.map(([k]) => k),
      catEntries.map(([,v]) => v.pkr),
      MULTI_COLORS);

    createLineChart('expTrendChart', labels,
      [makeLineDataset('Total Expenses (USD)', monthlyTotals, CHART_COLORS.danger, { fill: true })]);
  });
}

function catIcon(cat) {
  const icons = {
    'Salaries': '👥', 'Tools & Software': '🛠', 'Office': '🏢',
    'Marketing': '📣', 'Internet/Comms': '🌐', 'Other': '📦'
  };
  return icons[cat] || '💰';
}

// ─── FINANCIAL HEALTH ─────────────────────────────────────────────────────────
function renderHealth(d) {
  const { pnl, cashInn, expenses, salaries } = d;

  const monthly = buildMonthlyOverview(pnl, cashInn, expenses);
  const months  = sortMonthKeys(Object.keys(monthly));
  const last3   = months.slice(-3);
  const last12  = months.slice(-12);

  const avgRevUSD = last3.length > 0
    ? last3.reduce((s, m) => s + (monthly[m]?.revUSD || 0), 0) / last3.length : 0;
  const avgExpUSD = last3.length > 0
    ? last3.reduce((s, m) => s + (monthly[m]?.expUSD || 0), 0) / last3.length : 0;
  const burnRate  = avgExpUSD;
  const latestRev = monthly[months[months.length - 1]]?.revUSD || 0;
  const latestExp = monthly[months[months.length - 1]]?.expUSD || 0;
  const latestProfit = latestRev - latestExp;
  const opExpRatio = latestRev > 0 ? (latestExp / latestRev * 100) : 0;
  const breakEven = avgExpUSD;

  // Exchange rate impact
  const totalRevUSD = cashInn.reduce((s, r) => s + r.grossUSD, 0);
  const receivedPKR = totalRevUSD * EARNING_RATE;
  const spendEquivPKR = totalRevUSD * SPENDING_RATE;
  const rateDiffLoss = spendEquivPKR - receivedPKR;
  const rateDiffPct  = spendEquivPKR > 0 ? (rateDiffLoss / spendEquivPKR * 100) : 0;

  // Projection: last 3 months avg ± trend
  const last6 = months.slice(-6);
  const revLast6 = last6.map(m => monthly[m]?.revUSD || 0);
  const expLast6 = last6.map(m => monthly[m]?.expUSD || 0);
  const revTrend = calcTrend(revLast6);
  const expTrend = calcTrend(expLast6);

  const projMonths = [1, 2, 3].map(i => {
    const baseKey = months[months.length - 1] || '2025-12';
    const [yr, mo] = baseKey.split('-').map(Number);
    const d = new Date(yr, mo - 1 + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const projLabels = [...last6.map(monthKeyToLabel), ...projMonths.map(monthKeyToLabel)];
  const projRev = [...revLast6, ...projMonths.map((_, i) => Math.max(0, avgRevUSD + revTrend * (i + 1)))];
  const projExp = [...expLast6, ...projMonths.map((_, i) => Math.max(0, avgExpUSD + expTrend * (i + 1)))];

  // Revenue trend chart (last 12)
  const rev12 = last12.map(m => monthly[m]?.revUSD || 0);
  const exp12 = last12.map(m => monthly[m]?.expUSD || 0);
  const prof12 = last12.map(m => (monthly[m]?.revUSD || 0) - (monthly[m]?.expUSD || 0));

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header"><h3>Avg Monthly Burn Rate</h3></div>
        <div class="stat-value">${formatCurrency(burnRate, 'USD', true)}</div>
        <div class="stat-subtext">Based on last 3 months</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Break-even Point</h3></div>
        <div class="stat-value">${formatCurrency(breakEven, 'USD', true)}</div>
        <div class="stat-subtext">Revenue needed / month</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Operating Expense Ratio</h3></div>
        <div class="stat-value ${opExpRatio > 80 ? 'neg' : opExpRatio > 60 ? 'text-warning' : 'pos'}">${opExpRatio.toFixed(1)}%</div>
        <div class="stat-subtext">Expenses / Revenue</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Net Profit (Latest)</h3></div>
        <div class="stat-value ${latestProfit >= 0 ? 'pos' : 'neg'}">${formatCurrency(latestProfit, 'USD', true)}</div>
        <div class="stat-subtext">${latestRev > 0 ? ((latestProfit/latestRev)*100).toFixed(1) : 0}% margin</div>
      </div>
    </div>

    <div class="chart-card full">
      <div class="chart-header"><h2>Cash Flow Projection (Next 3 Months)</h2></div>
      <div class="chart-body h300"><canvas id="projectionChart"></canvas></div>
    </div>

    <div class="info-cards-row">
      <div class="info-box wide">
        <h3>Exchange Rate Impact Analysis</h3>
        <div class="info-rows">
          <div class="info-row"><span>Total Revenue Earned (USD)</span><strong>${formatCurrency(totalRevUSD,'USD')}</strong></div>
          <div class="info-row"><span>PKR Received (@ ${EARNING_RATE}/USD)</span><strong>${formatCurrency(receivedPKR,'PKR',true)}</strong></div>
          <div class="info-row"><span>Equivalent if Spent (@ ${SPENDING_RATE}/USD)</span><strong>${formatCurrency(spendEquivPKR,'PKR',true)}</strong></div>
          <div class="info-row danger">
            <span>Rate Differential Loss</span>
            <strong class="text-danger">Rs ${formatCurrency(rateDiffLoss,'PKR',true)} (${rateDiffPct.toFixed(1)}%)</strong>
          </div>
        </div>
        <div class="notice-badge">💡 Earning at Rs 270/$ but spending at Rs 300/$ creates a ${rateDiffPct.toFixed(1)}% value loss</div>
      </div>

      <div class="info-box">
        <h3>3-Month Trend Summary</h3>
        <div class="info-rows">
          <div class="info-row"><span>Avg Monthly Revenue</span><strong>${formatCurrency(avgRevUSD,'USD',true)}</strong></div>
          <div class="info-row"><span>Avg Monthly Expenses</span><strong>${formatCurrency(avgExpUSD,'USD',true)}</strong></div>
          <div class="info-row"><span>Avg Monthly Profit</span>
            <strong class="${avgRevUSD-avgExpUSD>=0?'text-success':'text-danger'}">${formatCurrency(avgRevUSD-avgExpUSD,'USD',true)}</strong></div>
          <div class="info-row"><span>Revenue Trend</span>
            <strong class="${revTrend>=0?'text-success':'text-danger'}">${revTrend>=0?'↑':'↓'} ${formatCurrency(Math.abs(revTrend),'USD',true)}/mo</strong></div>
        </div>
      </div>
    </div>

    <div class="chart-card full">
      <div class="chart-header"><h2>12-Month P&L Overview</h2></div>
      <div class="chart-body h280"><canvas id="pnlChart"></canvas></div>
    </div>`;

  requestAnimationFrame(() => {
    createComboChart('projectionChart', projLabels,
      [
        makeBarDataset('Revenue', projRev, CHART_COLORS.black),
        makeBarDataset('Expenses', projExp, CHART_COLORS.lightGray)
      ],
      [makeLineDataset('Profit', projRev.map((r, i) => r - projExp[i]), CHART_COLORS.success)],
      { plugins: { annotation: {} } }
    );

    createComboChart('pnlChart', last12.map(monthKeyToLabel),
      [
        makeBarDataset('Revenue', rev12, CHART_COLORS.black),
        makeBarDataset('Expenses', exp12, CHART_COLORS.lightGray)
      ],
      [makeLineDataset('Net Profit', prof12, CHART_COLORS.success)]);
  });
}

function calcTrend(data) {
  if (data.length < 2) return 0;
  const n = data.length;
  const sumX = n * (n - 1) / 2;
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = data.reduce((s, y, i) => s + i * y, 0);
  const sumX2 = data.reduce((s, _, i) => s + i * i, 0);
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

// ─── Currency Toggle ──────────────────────────────────────────────────────────
function setupCurrencyToggle() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currency = btn.dataset.currency;
      document.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.currency === state.currency);
      });
      renderPage(state.page);
    });
  });
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function setupSidebar() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  $('mobileMenuBtn').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
  });

  $('sidebarToggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('collapsed');
  });

  document.addEventListener('click', e => {
    if (window.innerWidth < 1024 && !$('sidebar').contains(e.target) && !$('mobileMenuBtn').contains(e.target)) {
      $('sidebar').classList.remove('open');
    }
  });
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadData() {
  if (state.loading) return;
  state.loading = true;
  showLoading(true);

  try {
    const data = await loadAllData();
    state.data = data;

    if (data.errors.length) {
      showError('Some sheets failed to load: ' + data.errors.join('; ') +
        '. Showing available data.');
    }

    $('lastUpdated').textContent = new Date().toLocaleTimeString();
    renderPage(state.page);
  } catch (err) {
    showError('Failed to load data: ' + err.message);
    $('pageContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Data Loading Failed</h3>
        <p>${escHtml(err.message)}</p>
        <button class="btn-primary" onclick="loadData()">Retry</button>
      </div>`;
  } finally {
    state.loading = false;
    showLoading(false);
  }
}

$('refreshBtn').addEventListener('click', () => {
  invalidateCacheAll();
  loadData();
});

// ─── Search (filter current page tables) ────────────────────────────────────
$('searchInput').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  document.querySelectorAll('.data-table tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

// ─── Utilities ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  setupSidebar();
  setupCurrencyToggle();
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
