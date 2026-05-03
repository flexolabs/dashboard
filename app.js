// ─── Application State ────────────────────────────────────────────────────────
const state = {
  currency: 'USD',   // 'USD' or 'PKR' — always uppercase
  page:     'overview',
  data:     null,
  loading:  false
};

// ─── DOM shortcuts ────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const qsa = sel => document.querySelectorAll(sel);

// ─── Currency display helpers ─────────────────────────────────────────────────
// Primary value in selected currency
function fv(usd, pkr) {
  const v = state.currency === 'PKR' ? pkr : usd;
  const c = state.currency;
  return formatCurrency(v, c);
}
// Secondary value (opposite currency, compact)
function fvSub(usd, pkr) {
  if (state.currency === 'PKR') return formatCurrency(usd, 'USD', true);
  return formatCurrency(pkr, 'PKR', true);
}
// Active amount for charts (returns raw number)
function activeAmt(usd, pkr) {
  return state.currency === 'PKR' ? pkr : usd;
}

// ─── HTML escaping ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Stat card builder ────────────────────────────────────────────────────────
function statCard({ title, usd, pkr, change = null, sub = '', extraClass = '' }) {
  const isNeg = (usd || 0) < 0 || (pkr || 0) < 0;
  const chg = change !== null
    ? `<div class="stat-change ${change >= 0 ? 'positive' : 'negative'}">
         <span class="arrow">${change >= 0 ? '↑' : '↓'}</span>
         <span class="percentage">${Math.abs(change).toFixed(1)}%</span>
         <span class="label">vs last month</span>
       </div>`
    : '';
  return `
    <div class="stat-card ${isNeg ? 'negative-card' : ''} ${extraClass}">
      <div class="stat-header"><h3>${esc(title)}</h3></div>
      <div class="stat-value ${isNeg ? 'neg' : ''}">${fv(usd, pkr)}</div>
      <div class="stat-subtext">${fvSub(usd, pkr)}</div>
      ${sub ? `<div class="stat-subtitle">${sub}</div>` : ''}
      ${chg}
    </div>`;
}

// ─── Loading / Error ──────────────────────────────────────────────────────────
function showLoading(on) { $('loadingOverlay').style.display = on ? 'flex' : 'none'; }

function showError(msg) {
  $('errorBanner').style.display = 'flex';
  $('errorMessage').textContent  = msg;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  overview: 'Overview',
  upwork:   'Upwork ROI',
  clients:  'Client Analytics',
  team:     'Team Performance',
  expenses: 'Expense Breakdown',
  health:   'Financial Health'
};

function navigate(page) {
  if (state.page === page && state.data) return; // avoid re-render on same tab
  state.page = page;
  destroyAllCharts();

  qsa('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $('pageTitle').textContent = PAGE_TITLES[page] || page;

  // Collapse mobile sidebar
  if (window.innerWidth < 1024) $('sidebar').classList.remove('open');

  if (!state.data) {
    $('pageContent').innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
    return;
  }
  renderPage(page);
}

function renderPage(page) {
  if (!state.data) return;
  $('pageContent').innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
  // Small delay so spinner is visible before heavy DOM work
  setTimeout(() => {
    try {
      switch (page) {
        case 'overview': renderOverview(); break;
        case 'upwork':   renderUpwork();   break;
        case 'clients':  renderClients();  break;
        case 'team':     renderTeam();     break;
        case 'expenses': renderExpenses(); break;
        case 'health':   renderHealth();   break;
        default:         renderOverview();
      }
    } catch (err) {
      console.error('[FlexoDash] Render error:', err);
      $('pageContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Render Error</h3>
          <p>${esc(err.message)}</p>
          <button class="btn-primary" onclick="renderPage(state.page)">Retry</button>
        </div>`;
    }
  }, 0);
}

// ─── Monthly overview builder ─────────────────────────────────────────────────
// Returns map of "YYYY-MM" → { revUSD, revPKR, expUSD, expPKR }
// Priority: PnL > CashInn (revenue) + Expenses+Salaries (expenses)
function buildMonthly() {
  const { pnl, cashInn, expenses, salaries } = state.data;
  const map = {};

  const ensure = key => { if (!map[key]) map[key] = { revUSD:0, revPKR:0, expUSD:0, expPKR:0 }; };

  // 1. Seed from PnL (authoritative if present)
  for (const r of pnl) {
    const k = r.month; if (!k) continue;
    ensure(k);
    // PnL amounts — we don't know currency, assume PKR for Pakistani agency
    // If values look like USD (< 50000 for a company doing decent revenue), treat as USD
    const likelyUSD = r.revenue > 0 && r.revenue < 100_000;
    if (likelyUSD) {
      map[k].revUSD  = r.revenue;
      map[k].revPKR  = toPKR(r.revenue, false);
      map[k].expUSD  = r.expenses;
      map[k].expPKR  = toPKR(r.expenses, true);
    } else {
      map[k].revPKR  = r.revenue;
      map[k].revUSD  = toUSD(r.revenue, false);
      map[k].expPKR  = r.expenses;
      map[k].expUSD  = toUSD(r.expenses, true);
    }
  }

  // 2. Revenue from Cash Inn (USD — Upwork payments)
  for (const r of cashInn) {
    const k = r.date; if (!k) continue;
    ensure(k);
    if (!map[k].revUSD) { // only fill if PnL didn't provide it
      map[k].revUSD += r.grossUSD;
      map[k].revPKR += r.grossPKR;
    }
  }

  // 3. Expenses from Monthly Expenses sheet (usually PKR)
  const expByMonth = groupByMonth(expenses, e => e.month);
  for (const [k, rows] of Object.entries(expByMonth)) {
    ensure(k);
    if (!map[k].expPKR) { // only fill if PnL didn't provide it
      map[k].expPKR = rows.reduce((s, r) => s + r.amtPKR, 0);
      map[k].expUSD = rows.reduce((s, r) => s + r.amtUSD, 0);
    }
  }

  // 4. Salaries: add to every month that has any data
  // If salary rows have a month, add to that specific month; else add to all months.
  const salaryMonths = salaries.filter(s => s.month);
  const flatSalaries = salaries.filter(s => !s.month);
  const monthlyFlatPKR = flatSalaries.reduce((s, e) => s + e.salary, 0);
  const monthlyFlatUSD = toUSD(monthlyFlatPKR, true);

  for (const k of Object.keys(map)) {
    // Flat (no-month) salaries — add to every known month
    map[k].expPKR += monthlyFlatPKR;
    map[k].expUSD += monthlyFlatUSD;
  }
  for (const s of salaryMonths) {
    ensure(s.month);
    map[s.month].expPKR += s.salary;
    map[s.month].expUSD += toUSD(s.salary, true);
  }

  return map;
}

// ─── 1. OVERVIEW ─────────────────────────────────────────────────────────────
function renderOverview() {
  const { cashInn } = state.data;
  const monthly = buildMonthly();
  const months  = sortMonthKeys(Object.keys(monthly));

  const lastKey = months[months.length - 1] || '';
  const prevKey = months[months.length - 2] || '';
  const cur  = monthly[lastKey] || {};
  const prev = monthly[prevKey] || {};

  const revUSD  = cur.revUSD  || 0;
  const revPKR  = cur.revPKR  || toPKR(revUSD, false);
  const expUSD  = cur.expUSD  || 0;
  const expPKR  = cur.expPKR  || toPKR(expUSD, true);
  const profUSD = revUSD  - expUSD;
  const profPKR = revPKR  - expPKR;
  const margin  = revUSD > 0 ? (profUSD / revUSD * 100) : 0;

  const momRev  = prev.revUSD > 0 ? ((revUSD - prev.revUSD) / prev.revUSD * 100) : null;
  const momExp  = prev.expUSD > 0 ? ((expUSD - prev.expUSD) / prev.expUSD * 100) : null;
  const prevProf = (prev.revUSD || 0) - (prev.expUSD || 0);
  const momProf = prevProf !== 0 ? ((profUSD - prevProf) / Math.abs(prevProf) * 100) : null;

  // YTD
  const curYear  = lastKey.split('-')[0] || String(new Date().getFullYear());
  const ytdKeys  = months.filter(m => m.startsWith(curYear));
  const ytdRevUSD = ytdKeys.reduce((s,k) => s+(monthly[k]?.revUSD||0), 0);
  const ytdExpUSD = ytdKeys.reduce((s,k) => s+(monthly[k]?.expUSD||0), 0);

  // Chart data — last 12 months
  const last12  = months.slice(-12);
  const revData = last12.map(k => activeAmt(monthly[k]?.revUSD||0, monthly[k]?.revPKR||0));
  const expData = last12.map(k => activeAmt(monthly[k]?.expUSD||0, monthly[k]?.expPKR||0));
  const profData = last12.map(k => activeAmt(
    (monthly[k]?.revUSD||0) - (monthly[k]?.expUSD||0),
    (monthly[k]?.revPKR||0) - (monthly[k]?.expPKR||0)
  ));
  const labels12 = last12.map(monthKeyLabel);

  // YoY data
  const allYears = [...new Set(months.map(m => m.split('-')[0]))].filter(Boolean).sort().slice(-3);
  const moNums   = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const yoyLabels = MONTH_LABELS;

  // Top clients
  const clientMap = {};
  for (const r of cashInn) {
    const name = normalizeClientName(r.client) || 'Unknown';
    if (!clientMap[name]) clientMap[name] = { usd:0, pkr:0, count:0 };
    clientMap[name].usd += r.grossUSD;
    clientMap[name].pkr += r.grossPKR;
    clientMap[name].count++;
  }
  const top5 = Object.entries(clientMap).sort((a,b)=>b[1].usd-a[1].usd).slice(0,5);

  // Recent transactions
  const recent = [...cashInn]
    .filter(r => r.grossUSD > 0)
    .sort((a,b) => b.rawDate.localeCompare(a.rawDate))
    .slice(0, 10);

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      ${statCard({ title:'Total Revenue', usd:revUSD, pkr:revPKR, change:momRev,
        sub:`YTD: ${formatCurrency(ytdRevUSD,'USD',true)}` })}
      ${statCard({ title:'Total Expenses', usd:expUSD, pkr:expPKR, change:momExp,
        sub:`YTD: ${formatCurrency(ytdExpUSD,'USD',true)}` })}
      ${statCard({ title:'Net Profit', usd:profUSD, pkr:profPKR, change:momProf })}
      <div class="stat-card">
        <div class="stat-header"><h3>Profit Margin</h3></div>
        <div class="stat-value ${margin<0?'neg':margin<20?'text-warning':'pos'}">${margin.toFixed(1)}%</div>
        <div class="stat-subtext">Current month</div>
        <div class="stat-subtitle">Revenue: ${fv(revUSD, revPKR)}</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card wide">
        <div class="chart-header">
          <h2>Revenue vs Expenses</h2>
          <span class="chart-label">Last 12 months · ${state.currency}</span>
        </div>
        <div class="chart-body h280"><canvas id="revExpChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h2>Net Profit Trend</h2></div>
        <div class="chart-body h280"><canvas id="profitChart"></canvas></div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card full">
        <div class="chart-header">
          <h2>Year-over-Year Revenue</h2>
          <span class="chart-label">${allYears.join(' · ')}</span>
        </div>
        <div class="chart-body h240"><canvas id="yoyChart"></canvas></div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="list-card">
        <div class="list-header"><h2>Top 5 Clients by Revenue</h2></div>
        <div class="client-list">
          ${top5.map(([name,v],i) => `
            <div class="client-row">
              <div class="client-rank">${i+1}</div>
              <div class="client-avatar">${(name[0]||'?').toUpperCase()}</div>
              <div class="client-info">
                <div class="client-name">${esc(name)}</div>
                <div class="client-projects">${v.count} project${v.count!==1?'s':''}</div>
              </div>
              <div class="client-revenue">${fv(v.usd, v.pkr)}</div>
            </div>`).join('') || '<p class="empty">No client data loaded</p>'}
        </div>
      </div>

      <div class="list-card">
        <div class="list-header"><h2>Recent Transactions</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Client</th><th>Amount</th><th>Agent</th></tr></thead>
            <tbody>
              ${recent.map(r=>`
                <tr>
                  <td>${esc(r.rawDate)}</td>
                  <td><span class="client-tag">${esc(r.client||'N/A')}</span></td>
                  <td class="amount">${fv(r.grossUSD,r.grossPKR)}</td>
                  <td>${esc(r.agent||'—')}</td>
                </tr>`).join('')||'<tr><td colspan="4" class="empty">No transactions loaded</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Render charts after DOM update
  requestAnimationFrame(() => {
    createComboChart('revExpChart', labels12,
      [makeBarDataset('Revenue', revData, CHART_COLORS.black),
       makeBarDataset('Expenses', expData, CHART_COLORS.lightGray)], []);

    const profColor = (profData[profData.length-1]||0) >= 0 ? CHART_COLORS.success : CHART_COLORS.danger;
    createLineChart('profitChart', labels12,
      [makeLineDataset('Net Profit', profData, profColor, { fill:true })]);

    const yoyColors = [CHART_COLORS.black, CHART_COLORS.darkGray, CHART_COLORS.info];
    const yoyDatasets = allYears.map((yr, i) => {
      const data = moNums.map(mo => {
        const k = `${yr}-${mo}`;
        return activeAmt(monthly[k]?.revUSD||0, monthly[k]?.revPKR||0);
      });
      return makeBarDataset(yr, data, yoyColors[i] || CHART_COLORS.black);
    });
    createBarChart('yoyChart', yoyLabels, yoyDatasets);
  });
}

// ─── 2. UPWORK ROI ────────────────────────────────────────────────────────────
function renderUpwork() {
  const { cashInn, expenses } = state.data;

  const front   = cashInn.filter(r => r.saleType !== 'upsell');
  const upsells = cashInn.filter(r => r.saleType === 'upsell');

  const frontUSD = front.reduce((s,r)=>s+r.grossUSD,0);
  const frontPKR = front.reduce((s,r)=>s+r.grossPKR,0);
  const upUSD    = upsells.reduce((s,r)=>s+r.grossUSD,0);
  const upPKR    = upsells.reduce((s,r)=>s+r.grossPKR,0);
  const totUSD   = frontUSD + upUSD;
  const totPKR   = frontPKR + upPKR;

  // Connects from Monthly Expenses (filter by keyword "connect")
  const connectRows = expenses.filter(e => /connect/i.test(e.expense));
  const connPKR = connectRows.reduce((s,r)=>s+r.amtPKR,0);
  const connUSD = connectRows.reduce((s,r)=>s+r.amtUSD,0);
  const totalConnects = connPKR > 0 ? Math.round(connPKR / COST_PER_CONNECT_PKR) : 0;

  const roiPct       = connUSD > 0 ? ((totUSD - connUSD) / connUSD * 100) : 0;
  const costPerDollar = totUSD > 0 ? (connUSD / totUSD) : 0;
  const upworkFeeUSD  = totUSD * 0.10;
  const upworkFeePKR  = totPKR * 0.10;

  // Monthly trends
  const connByMonth = groupByMonth(connectRows, e => e.month);
  const cashByMonth = groupByMonth(cashInn,     r => r.date);
  const allMonths   = sortMonthKeys([...Object.keys(connByMonth), ...Object.keys(cashByMonth)]).slice(-12);
  const connTrend   = allMonths.map(m => connByMonth[m]?.reduce((s,r)=>s+r.amtUSD,0)||0);
  const revTrend    = allMonths.map(m => cashByMonth[m]?.reduce((s,r)=>s+r.grossUSD,0)||0);
  const labelsT     = allMonths.map(monthKeyLabel);

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      ${statCard({ title:'Front Sales Revenue', usd:frontUSD, pkr:frontPKR,
        sub:`${front.length} transactions` })}
      ${statCard({ title:'Upsell Revenue', usd:upUSD, pkr:upPKR,
        sub:`${upsells.length} transactions` })}
      ${statCard({ title:'Connects Cost', usd:connUSD, pkr:connPKR,
        sub:`Est. ${totalConnects.toLocaleString()} connects` })}
      <div class="stat-card ${roiPct>=0?'':'negative-card'}">
        <div class="stat-header"><h3>Overall ROI</h3></div>
        <div class="stat-value ${roiPct>=0?'pos':'neg'}">${roiPct.toFixed(0)}%</div>
        <div class="stat-subtext">Cost per $1 earned: ${formatCurrency(costPerDollar,'USD')}</div>
        <div class="stat-subtitle">Upwork 10% fee: ${fv(upworkFeeUSD, upworkFeePKR)}</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card wide">
        <div class="chart-header"><h2>Connects Cost vs Revenue (Monthly)</h2></div>
        <div class="chart-body h280"><canvas id="connTrendChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h2>Front Sales vs Upsells</h2></div>
        <div class="chart-body h280"><canvas id="salesSplitChart"></canvas></div>
      </div>
    </div>

    <div class="info-cards-row">
      <div class="info-box">
        <h3>Connects Analytics</h3>
        <div class="info-rows">
          <div class="info-row"><span>Total Connects (est.)</span><strong>${totalConnects.toLocaleString()}</strong></div>
          <div class="info-row"><span>Total Cost</span><strong>${fv(connUSD, connPKR)}</strong></div>
          <div class="info-row"><span>Revenue Generated</span><strong>${fv(totUSD, totPKR)}</strong></div>
          <div class="info-row"><span>ROI</span><strong class="${roiPct>=0?'text-success':'text-danger'}">${roiPct.toFixed(0)}%</strong></div>
          <div class="info-row"><span>Cost per $1 Earned</span><strong>${formatCurrency(costPerDollar,'USD')}</strong></div>
        </div>
      </div>
      <div class="info-box">
        <h3>Pricing Reference</h3>
        <div class="info-rows">
          <div class="info-row"><span>Package</span><strong>$${CONNECT_PACKAGE_COST_USD} = ${CONNECTS_PER_PACKAGE} connects</strong></div>
          <div class="info-row"><span>Per Connect</span><strong>$${COST_PER_CONNECT_USD} (Rs ${COST_PER_CONNECT_PKR})</strong></div>
          <div class="info-row"><span>Upwork Merchant Fee</span><strong>10% of every transaction</strong></div>
          <div class="info-row"><span>Fee This Period</span><strong>${fv(upworkFeeUSD, upworkFeePKR)}</strong></div>
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
            ${connectRows.length
              ? connectRows.map(r=>`
                <tr>
                  <td>${esc(r.month)}</td>
                  <td>${esc(r.expense)}</td>
                  <td class="amount">${formatCurrency(r.amtPKR,'PKR',true)}</td>
                  <td class="amount">${formatCurrency(r.amtUSD,'USD')}</td>
                  <td><span class="badge">${esc(r.status||'Paid')}</span></td>
                </tr>`).join('')
              : '<tr><td colspan="5" class="empty">No "connect" entries found in Expenses sheet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    createComboChart('connTrendChart', labelsT,
      [makeBarDataset('Connect Cost ($)', connTrend, CHART_COLORS.lightGray)],
      [makeLineDataset('Revenue ($)', revTrend, CHART_COLORS.black)]);

    createDoughnutChart('salesSplitChart',
      ['Front Sales', 'Upsells'],
      [frontUSD, upUSD],
      [CHART_COLORS.black, CHART_COLORS.medGray]);
  });
}

// ─── 3. CLIENTS ───────────────────────────────────────────────────────────────
function renderClients() {
  const { cashInn } = state.data;

  const clientMap = {};
  for (const r of cashInn) {
    const name = normalizeClientName(r.client) || 'Unknown';
    if (!clientMap[name]) clientMap[name] = { usd:0, pkr:0, count:0, dates:[], projects:[] };
    clientMap[name].usd += r.grossUSD;
    clientMap[name].pkr += r.grossPKR;
    clientMap[name].count++;
    if (r.rawDate) clientMap[name].dates.push(r.rawDate);
    if (r.project) clientMap[name].projects.push(r.project);
  }

  const clients = Object.entries(clientMap).map(([name,v]) => ({
    name,
    usd:   v.usd,
    pkr:   v.pkr,
    count: v.count,
    avgUSD: v.count ? v.usd/v.count : 0,
    first: v.dates.sort()[0] || '',
    last:  v.dates.sort().slice(-1)[0] || ''
  })).sort((a,b)=>b.usd-a.usd);

  const top10 = clients.slice(0,10);

  // Service distribution
  const svcMap = {};
  for (const r of cashInn) {
    const s = inferService(r.project || r.client || '');
    svcMap[s] = (svcMap[s]||0) + r.grossUSD;
  }
  const svcE = Object.entries(svcMap).sort((a,b)=>b[1]-a[1]);

  // Active / churned
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth()-3);
  const isActive = c => { const d=new Date(c.last); return !isNaN(d) && d>=cutoff; };

  const totalUSD = cashInn.reduce((s,r)=>s+r.grossUSD,0);
  const totalPKR = cashInn.reduce((s,r)=>s+r.grossPKR,0);
  const avgUSD   = cashInn.length ? totalUSD/cashInn.length : 0;
  const avgPKR   = cashInn.length ? totalPKR/cashInn.length : 0;

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-header"><h3>Total Clients</h3></div>
        <div class="stat-value">${clients.length}</div><div class="stat-subtext">All time</div></div>
      <div class="stat-card"><div class="stat-header"><h3>Active Clients</h3></div>
        <div class="stat-value pos">${clients.filter(isActive).length}</div><div class="stat-subtext">Last 3 months</div></div>
      <div class="stat-card"><div class="stat-header"><h3>Churned Clients</h3></div>
        <div class="stat-value neg">${clients.filter(c=>!isActive(c)).length}</div><div class="stat-subtext">No activity 3+ months</div></div>
      ${statCard({ title:'Avg Project Value', usd:avgUSD, pkr:avgPKR,
        sub:`${cashInn.length} total transactions` })}
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header"><h2>Service Distribution</h2></div>
        <div class="chart-body h280"><canvas id="svcChart"></canvas></div>
      </div>
      <div class="chart-card wide">
        <div class="chart-header">
          <h2>Top 10 Clients — Revenue</h2>
          <span class="chart-label">${state.currency}</span>
        </div>
        <div class="chart-body h280"><canvas id="clientsChart"></canvas></div>
      </div>
    </div>

    <div class="chart-card full">
      <div class="list-header"><h2>Client Lifetime Value</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Client</th><th>Revenue</th><th>Projects</th>
            <th>Avg Value</th><th>First</th><th>Last</th><th>Status</th></tr></thead>
          <tbody>
            ${clients.slice(0,30).map((c,i)=>`
              <tr>
                <td>${i+1}</td>
                <td><div class="client-mini">
                  <div class="client-avatar sm">${(c.name[0]||'?').toUpperCase()}</div>
                  ${esc(c.name)}</div></td>
                <td class="amount">${fv(c.usd,c.pkr)}</td>
                <td>${c.count}</td>
                <td class="amount">${fv(c.avgUSD,toPKR(c.avgUSD,false))}</td>
                <td>${esc(c.first||'—')}</td>
                <td>${esc(c.last||'—')}</td>
                <td><span class="badge ${isActive(c)?'badge-success':'badge-danger'}">${isActive(c)?'Active':'Churned'}</span></td>
              </tr>`).join('')||'<tr><td colspan="8" class="empty">No client data loaded</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    createDoughnutChart('svcChart', svcE.map(([k])=>k), svcE.map(([,v])=>v), MULTI_COLORS);
    createHorizontalBarChart('clientsChart',
      top10.map(c=>c.name),
      top10.map(c=>activeAmt(c.usd,c.pkr)),
      CHART_COLORS.black);
  });
}

function inferService(name) {
  const n = String(name).toLowerCase();
  if (/seo/i.test(n))                               return 'SEO';
  if (/ads|ppc|google ad|fb ad|meta ad/i.test(n))   return 'Paid Ads';
  if (/web|website|wordpress|woo/i.test(n))          return 'Web Design';
  if (/host/i.test(n))                               return 'Hosting';
  if (/social|smm|instagram|twitter/i.test(n))       return 'Social Media';
  if (/design|brand|logo|graphic/i.test(n))          return 'Design';
  if (/email|newsletter/i.test(n))                   return 'Email Marketing';
  if (/app|mobile/i.test(n))                         return 'App Dev';
  return 'Other';
}

// ─── 4. TEAM ──────────────────────────────────────────────────────────────────
function renderTeam() {
  const { cashInn, salaries } = state.data;

  // Bidder leaderboard
  const agMap = {};
  for (const r of cashInn) {
    const a = r.agent || ''; if (!a.trim()) continue;
    if (!agMap[a]) agMap[a] = { usd:0, pkr:0, comm:0, count:0 };
    agMap[a].usd  += r.grossUSD;
    agMap[a].pkr  += r.grossPKR;
    agMap[a].comm += r.agentComm;
    agMap[a].count++;
  }
  const agents = Object.entries(agMap)
    .map(([name,v])=>({name,...v, avg:v.count?v.usd/v.count:0}))
    .sort((a,b)=>b.usd-a.usd);

  // TL performance
  const tlMap = {};
  for (const r of cashInn) {
    const t = r.tl || ''; if (!t.trim()) continue;
    if (!tlMap[t]) tlMap[t] = { usd:0, pkr:0, comm:0, count:0 };
    tlMap[t].usd  += r.grossUSD;
    tlMap[t].pkr  += r.grossPKR;
    tlMap[t].comm += r.tlComm;
    tlMap[t].count++;
  }
  const tls = Object.entries(tlMap)
    .map(([name,v])=>({name,...v}))
    .sort((a,b)=>b.usd-a.usd);

  // Salary vs revenue
  const revByAgent = {};
  for (const r of cashInn) {
    const k = (r.agent||'').toLowerCase().trim();
    if (!k) continue;
    revByAgent[k] = (revByAgent[k]||0) + r.grossPKR;
  }
  const salaryAnalysis = salaries.map(s => {
    const k = s.name.toLowerCase().trim();
    const revPKR = revByAgent[k] || 0;
    const ratio  = s.salary > 0 ? revPKR / s.salary : 0;
    return { name:s.name, salary:s.salary, revPKR, ratio, role:s.role };
  }).sort((a,b)=>b.ratio-a.ratio);

  const totalRev = cashInn.reduce((s,r)=>s+r.grossUSD,0);
  const headcount = salaries.length || agents.length || 1;

  const ratioClass  = r => r>=3?'badge-success':r>=2?'badge-warning':'badge-danger';

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-header"><h3>Team Size</h3></div>
        <div class="stat-value">${salaries.length}</div><div class="stat-subtext">In payroll</div></div>
      <div class="stat-card"><div class="stat-header"><h3>Active Bidders</h3></div>
        <div class="stat-value">${agents.length}</div><div class="stat-subtext">With recorded sales</div></div>
      <div class="stat-card"><div class="stat-header"><h3>Agent Commissions</h3></div>
        <div class="stat-value">${formatCurrency(agents.reduce((s,a)=>s+a.comm,0),'PKR',true)}</div>
        <div class="stat-subtext">Total paid out</div></div>
      ${statCard({ title:'Revenue per Person', usd:totalRev/headcount, pkr:toPKR(totalRev/headcount,false),
        sub:'Average' })}
    </div>

    <div class="charts-row">
      <div class="chart-card wide">
        <div class="chart-header">
          <h2>Bidder Leaderboard</h2>
          <span class="chart-label">${state.currency}</span>
        </div>
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
        ${agents.length ? agents.map((a,i)=>`
          <div class="agent-row">
            <div class="rank-badge">#${i+1}</div>
            <div class="client-avatar">${(a.name[0]||'?').toUpperCase()}</div>
            <div class="agent-info">
              <div class="agent-name">${esc(a.name)}</div>
              <div class="agent-meta">${a.count} projects · Comm: ${formatCurrency(a.comm,'PKR',true)}</div>
            </div>
            <div class="agent-rev">${fv(a.usd,a.pkr)}</div>
          </div>`).join('')
        : '<p class="empty">No agent/bidder data found in Cash Inn sheet (check column I)</p>'}
      </div>

      <div class="list-card">
        <div class="list-header"><h2>Salary vs Revenue</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Employee</th><th>Role</th><th>Salary (PKR)</th><th>Revenue</th><th>Ratio</th></tr></thead>
            <tbody>
              ${salaryAnalysis.length
                ? salaryAnalysis.map(s=>`
                    <tr>
                      <td>${esc(s.name)}</td>
                      <td>${esc(s.role||'—')}</td>
                      <td class="amount">${formatCurrency(s.salary,'PKR',true)}</td>
                      <td class="amount ${s.revPKR>0?'text-success':'text-secondary'}">${formatCurrency(s.revPKR,'PKR',true)}</td>
                      <td><span class="badge ${ratioClass(s.ratio)}">${s.ratio.toFixed(1)}x</span></td>
                    </tr>`).join('')
                : '<tr><td colspan="5" class="empty">No salary data loaded</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="legend-row">
          <span class="badge badge-success">≥3x</span> Excellent &nbsp;
          <span class="badge badge-warning">2–3x</span> Good &nbsp;
          <span class="badge badge-danger">&lt;2x</span> Review
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    if (agents.length) {
      createHorizontalBarChart('bidderChart',
        agents.map(a=>a.name),
        agents.map(a=>activeAmt(a.usd,a.pkr)),
        CHART_COLORS.black);
    }
    if (tls.length) {
      createHorizontalBarChart('tlChart',
        tls.map(t=>t.name),
        tls.map(t=>activeAmt(t.usd,t.pkr)),
        CHART_COLORS.darkGray);
    }
  });
}

// ─── 5. EXPENSES ──────────────────────────────────────────────────────────────
function renderExpenses() {
  const { expenses, salaries } = state.data;

  // Build category map
  const catMap = {};
  for (const e of expenses) {
    const cat = e.category || 'Other';
    if (!catMap[cat]) catMap[cat] = { pkr:0, usd:0, count:0 };
    catMap[cat].pkr += e.amtPKR;
    catMap[cat].usd += e.amtUSD;
    catMap[cat].count++;
  }

  // Add salary total as a category
  const totalSalPKR = salaries.reduce((s,e)=>s+e.salary,0);
  if (totalSalPKR > 0) {
    catMap['Salaries'] = catMap['Salaries'] || { pkr:0, usd:0, count:0 };
    catMap['Salaries'].pkr += totalSalPKR;
    catMap['Salaries'].usd += toUSD(totalSalPKR, true);
    catMap['Salaries'].count += salaries.length;
  }

  const catE = Object.entries(catMap).sort((a,b)=>b[1].pkr-a[1].pkr);
  const totalExpPKR = catE.reduce((s,[,v])=>s+v.pkr,0);
  const totalExpUSD = catE.reduce((s,[,v])=>s+v.usd,0);

  // Monthly trend (last 12)
  const expByMonth = groupByMonth(expenses, e=>e.month);
  const months12   = sortMonthKeys(Object.keys(expByMonth)).slice(-12);
  const trendData  = months12.map(m => expByMonth[m]?.reduce((s,r)=>s+r.amtUSD,0)||0);
  const trendLabels = months12.map(monthKeyLabel);

  // Connects
  const connects   = expenses.filter(e => /connect/i.test(e.expense));
  const connTotPKR = connects.reduce((s,r)=>s+r.amtPKR,0);
  const connByMonth = groupByMonth(connects, e=>e.month);

  const catIcons = { 'Salaries':'👥','Tools & Software':'🛠','Office':'🏢',
    'Marketing':'📣','Internet/Comms':'🌐','Other':'📦' };

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      ${catE.slice(0,4).map(([cat,v])=>`
        <div class="stat-card">
          <div class="stat-header"><h3>${catIcons[cat]||'💰'} ${esc(cat)}</h3></div>
          <div class="stat-value">${fv(v.usd,v.pkr)}</div>
          <div class="stat-subtext">${v.count} item${v.count!==1?'s':''} · ${totalExpPKR>0?((v.pkr/totalExpPKR)*100).toFixed(1):0}% of total</div>
        </div>`).join('')}
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header"><h2>Category Breakdown</h2></div>
        <div class="chart-body h280"><canvas id="expCatChart"></canvas></div>
      </div>
      <div class="chart-card wide">
        <div class="chart-header"><h2>Monthly Expense Trend (USD)</h2></div>
        <div class="chart-body h280"><canvas id="expTrendChart"></canvas></div>
      </div>
    </div>

    <div class="bottom-row">
      <div class="list-card">
        <div class="list-header">
          <h2>All Categories</h2>
          <span class="header-meta">${fv(totalExpUSD,totalExpPKR)}</span>
        </div>
        ${catE.map(([cat,v])=>`
          <div class="expense-row">
            <div class="expense-cat-icon">${catIcons[cat]||'💰'}</div>
            <div class="expense-info">
              <div class="expense-name">${esc(cat)}</div>
              <div class="expense-bar-wrap">
                <div class="expense-bar" style="width:${totalExpPKR>0?Math.min(v.pkr/totalExpPKR*100,100).toFixed(1):0}%"></div>
              </div>
            </div>
            <div class="expense-amount">${fv(v.usd,v.pkr)}</div>
          </div>`).join('')||'<p class="empty">No expense data loaded</p>'}
      </div>

      <div class="list-card">
        <div class="list-header"><h2>Connects Deep Dive</h2></div>
        <div class="info-rows">
          <div class="info-row"><span>Total Spent (All Time)</span><strong>${formatCurrency(connTotPKR,'PKR',true)}</strong></div>
          <div class="info-row"><span>Connects Bought (est.)</span><strong>${Math.round(connTotPKR/COST_PER_CONNECT_PKR).toLocaleString()}</strong></div>
          <div class="info-row"><span>Cost per Connect</span><strong>Rs ${COST_PER_CONNECT_PKR} / $${COST_PER_CONNECT_USD}</strong></div>
        </div>
        <br>
        <table class="data-table">
          <thead><tr><th>Month</th><th>Amount (PKR)</th><th>Connects (est.)</th></tr></thead>
          <tbody>
            ${sortMonthKeys(Object.keys(connByMonth)).slice(-12).map(m=>{
              const tot = connByMonth[m].reduce((s,r)=>s+r.amtPKR,0);
              return `<tr><td>${monthKeyLabel(m)}</td><td class="amount">${formatCurrency(tot,'PKR',true)}</td>
                <td>${Math.round(tot/COST_PER_CONNECT_PKR).toLocaleString()}</td></tr>`;
            }).join('')||'<tr><td colspan="3" class="empty">No connect data</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="chart-card full">
      <div class="list-header"><h2>Expense Detail (first 50)</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Month</th><th>Expense</th><th>Category</th><th>PKR</th><th>USD</th><th>Status</th></tr></thead>
          <tbody>
            ${expenses.slice(0,50).map(e=>`
              <tr>
                <td>${esc(e.month)}</td>
                <td>${esc(e.expense)}</td>
                <td><span class="badge">${esc(e.category)}</span></td>
                <td class="amount">${formatCurrency(e.amtPKR,'PKR',true)}</td>
                <td class="amount">${formatCurrency(e.amtUSD,'USD')}</td>
                <td><span class="badge badge-success">${esc(e.status||'Paid')}</span></td>
              </tr>`).join('')||'<tr><td colspan="6" class="empty">No expenses loaded</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    createDoughnutChart('expCatChart', catE.map(([k])=>k), catE.map(([,v])=>v.pkr), MULTI_COLORS);
    createLineChart('expTrendChart', trendLabels,
      [makeLineDataset('Total Expenses (USD)', trendData, CHART_COLORS.danger, { fill:true })]);
  });
}

// ─── 6. FINANCIAL HEALTH ──────────────────────────────────────────────────────
function renderHealth() {
  const { cashInn } = state.data;
  const monthly  = buildMonthly();
  const months   = sortMonthKeys(Object.keys(monthly));
  const last3    = months.slice(-3);
  const last6    = months.slice(-6);
  const last12   = months.slice(-12);

  const avg = (keys, field) => {
    const vals = keys.map(k => monthly[k]?.[field]||0);
    return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
  };

  const avgRevUSD = avg(last3,'revUSD');
  const avgExpUSD = avg(last3,'expUSD');
  const latestKey = months[months.length-1] || '';
  const latestRev = monthly[latestKey]?.revUSD || 0;
  const latestExp = monthly[latestKey]?.expUSD || 0;
  const latestProfit = latestRev - latestExp;
  const opExpRatio   = latestRev > 0 ? (latestExp/latestRev*100) : 0;

  // Exchange rate impact
  const totRevUSD    = cashInn.reduce((s,r)=>s+r.grossUSD,0);
  const receivedPKR  = totRevUSD * EARNING_RATE;
  const spendEquivPKR = totRevUSD * SPENDING_RATE;
  const diffLoss     = spendEquivPKR - receivedPKR;
  const diffPct      = spendEquivPKR > 0 ? (diffLoss/spendEquivPKR*100) : 0;

  // Trend calculation (linear regression slope)
  const trend = arr => {
    if (arr.length < 2) return 0;
    const n = arr.length, sumX = n*(n-1)/2;
    const sumY  = arr.reduce((a,b)=>a+b,0);
    const sumXY = arr.reduce((s,y,i)=>s+i*y,0);
    const sumX2 = arr.reduce((s,_,i)=>s+i*i,0);
    return (n*sumXY - sumX*sumY)/(n*sumX2 - sumX*sumX);
  };

  const revLast6 = last6.map(k=>monthly[k]?.revUSD||0);
  const expLast6 = last6.map(k=>monthly[k]?.expUSD||0);
  const revSlope = trend(revLast6);
  const expSlope = trend(expLast6);

  // Projection — 3 future months
  const futureKeys = [1,2,3].map(i => {
    const base = months[months.length-1] || `${new Date().getFullYear()}-01`;
    const [yr,mo] = base.split('-').map(Number);
    const d = new Date(yr, mo-1+i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  });
  const projLabels = [...last6.map(monthKeyLabel), ...futureKeys.map(monthKeyLabel)];
  const projRev    = [...revLast6, ...futureKeys.map((_,i)=>Math.max(0,avgRevUSD+revSlope*(i+1)))];
  const projExp    = [...expLast6, ...futureKeys.map((_,i)=>Math.max(0,avgExpUSD+expSlope*(i+1)))];
  const projProfit = projRev.map((r,i)=>r-projExp[i]);

  $('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header"><h3>Avg Monthly Burn Rate</h3></div>
        <div class="stat-value">${formatCurrency(avgExpUSD,'USD',true)}</div>
        <div class="stat-subtext">Based on last 3 months</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Break-even Point</h3></div>
        <div class="stat-value">${formatCurrency(avgExpUSD,'USD',true)}</div>
        <div class="stat-subtext">Revenue needed / month</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Operating Expense Ratio</h3></div>
        <div class="stat-value ${opExpRatio>80?'neg':opExpRatio>60?'text-warning':'pos'}">${opExpRatio.toFixed(1)}%</div>
        <div class="stat-subtext">Expenses ÷ Revenue</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><h3>Net Profit (Latest Month)</h3></div>
        <div class="stat-value ${latestProfit>=0?'pos':'neg'}">${formatCurrency(latestProfit,'USD',true)}</div>
        <div class="stat-subtext">${latestRev>0?((latestProfit/latestRev)*100).toFixed(1):0}% margin</div>
      </div>
    </div>

    <div class="chart-card full">
      <div class="chart-header">
        <h2>Cash Flow Projection — Next 3 Months</h2>
        <span class="chart-label">Dashed area = projection</span>
      </div>
      <div class="chart-body h300"><canvas id="projChart"></canvas></div>
    </div>

    <div class="info-cards-row">
      <div class="info-box wide">
        <h3>Exchange Rate Impact Analysis</h3>
        <div class="info-rows">
          <div class="info-row"><span>Total Revenue Earned (USD)</span>
            <strong>${formatCurrency(totRevUSD,'USD')}</strong></div>
          <div class="info-row"><span>PKR Received (@ Rs ${EARNING_RATE}/$)</span>
            <strong>${formatCurrency(receivedPKR,'PKR',true)}</strong></div>
          <div class="info-row"><span>Spending Equivalent (@ Rs ${SPENDING_RATE}/$)</span>
            <strong>${formatCurrency(spendEquivPKR,'PKR',true)}</strong></div>
          <div class="info-row danger">
            <span>Rate Differential Loss</span>
            <strong class="text-danger">− ${formatCurrency(diffLoss,'PKR',true)} (${diffPct.toFixed(1)}%)</strong>
          </div>
        </div>
        <div class="notice-badge">
          💡 You earn at Rs ${EARNING_RATE}/$ but spend at Rs ${SPENDING_RATE}/$,
          creating a ${diffPct.toFixed(1)}% value gap on every dollar earned.
        </div>
      </div>

      <div class="info-box">
        <h3>3-Month Trend Summary</h3>
        <div class="info-rows">
          <div class="info-row"><span>Avg Monthly Revenue</span><strong>${formatCurrency(avgRevUSD,'USD',true)}</strong></div>
          <div class="info-row"><span>Avg Monthly Expenses</span><strong>${formatCurrency(avgExpUSD,'USD',true)}</strong></div>
          <div class="info-row"><span>Avg Monthly Profit</span>
            <strong class="${avgRevUSD-avgExpUSD>=0?'text-success':'text-danger'}">${formatCurrency(avgRevUSD-avgExpUSD,'USD',true)}</strong></div>
          <div class="info-row"><span>Revenue Momentum</span>
            <strong class="${revSlope>=0?'text-success':'text-danger'}">${revSlope>=0?'↑':'↓'} ${formatCurrency(Math.abs(revSlope),'USD',true)}/mo</strong></div>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    const splitIdx = revLast6.length; // where actual ends and projection begins
    // Split projection visually: actual bars solid, projected bars semi-transparent
    createComboChart('projChart', projLabels,
      [
        makeBarDataset('Revenue',  projRev,    projRev.map((_,i)=>i<splitIdx?CHART_COLORS.black:CHART_COLORS.black+'66')),
        makeBarDataset('Expenses', projExp,    projExp.map((_,i)=>i<splitIdx?CHART_COLORS.lightGray:CHART_COLORS.lightGray+'88'))
      ],
      [makeLineDataset('Net Profit', projProfit, CHART_COLORS.success, {
        borderDash: projProfit.map((_,i)=>i>=splitIdx?[6,3]:[]),
        pointStyle:  projProfit.map((_,i)=>i>=splitIdx?'triangle':'circle')
      })]);
  });
}

// ─── Currency Toggle ──────────────────────────────────────────────────────────
function setupCurrencyToggle() {
  qsa('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Always store UPPERCASE so comparisons work
      state.currency = btn.dataset.currency.toUpperCase();
      qsa('.toggle-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.currency.toUpperCase() === state.currency));
      renderPage(state.page);
    });
  });
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function setupSidebar() {
  qsa('.nav-item').forEach(item =>
    item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.page); }));

  $('mobileMenuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', e => {
    if (window.innerWidth < 1024 &&
        !$('sidebar').contains(e.target) &&
        !$('mobileMenuBtn').contains(e.target)) {
      $('sidebar').classList.remove('open');
    }
  });
}

// ─── Table search ─────────────────────────────────────────────────────────────
function setupSearch() {
  $('searchInput').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    qsa('.data-table tbody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ─── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  if (state.loading) return;
  state.loading = true;
  showLoading(true);
  $('errorBanner').style.display = 'none';

  try {
    const data = await loadAllData();
    state.data  = data;

    console.log('[FlexoDash] Data summary:',
      'salaries:', data.salaries.length,
      'expenses:', data.expenses.length,
      'cashInn:',  data.cashInn.length,
      'revenue:',  data.revenue.length,
      'pnl:',      data.pnl.length
    );

    if (data.errors.length) {
      showError('Some sheets failed: ' + data.errors.join('; ') +
        '. Check browser console (F12) for details.');
    }

    $('lastUpdated').textContent = new Date().toLocaleTimeString();
    renderPage(state.page);
  } catch (err) {
    console.error('[FlexoDash] Fatal load error:', err);
    showError('Failed to load data: ' + err.message + ' — Check F12 console.');
    showLoading(false);
    $('pageContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Data Loading Failed</h3>
        <p>${esc(err.message)}</p>
        <p style="font-size:12px;color:#6B7280">Open browser console (F12) for details.</p>
        <button class="btn-primary" onclick="loadData()">Retry</button>
      </div>`;
  } finally {
    state.loading = false;
    showLoading(false);
  }
}

// ─── Refresh button ───────────────────────────────────────────────────────────
$('refreshBtn').addEventListener('click', () => { invalidateCacheAll(); loadData(); });

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  setupSidebar();
  setupCurrencyToggle();
  setupSearch();
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
