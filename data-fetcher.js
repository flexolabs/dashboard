// Google Sheets published CSV URLs
const SHEET_URLS = {
  salaries:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=1002409884&single=true&output=csv',
  expenses:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=701838879&single=true&output=csv',
  cashInn:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=1879112264&single=true&output=csv',
  revenue:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=527351239&single=true&output=csv',
  pnl:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=62657854&single=true&output=csv'
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const _cache = {};

async function fetchCSV(url) {
  const now = Date.now();
  if (_cache[url] && now - _cache[url].ts < CACHE_TTL) {
    return _cache[url].data;
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text = await resp.text();
  const result = Papa.parse(text, { header: false, skipEmptyLines: true });
  _cache[url] = { ts: now, data: result.data };
  return result.data;
}

function findColIndex(headers, ...candidates) {
  const lower = headers.map(h => String(h).toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.findIndex(h => h.includes(c.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Returns found index or fallback default index
function col(headers, defaultIdx, ...candidates) {
  const found = findColIndex(headers, ...candidates);
  return found >= 0 ? found : defaultIdx;
}

// ─── Salaries ──────────────────────────────────────────────────────────────
async function fetchSalaries() {
  const rows = await fetchCSV(SHEET_URLS.salaries);
  if (!rows.length) return [];
  const headers = rows[0];
  const nameIdx   = col(headers, 0, 'name', 'employee', 'staff');
  const salaryIdx = col(headers, 1, 'salary', 'amount', 'monthly');
  const roleIdx   = findColIndex(headers, 'role', 'designation', 'position', 'title');

  return rows.slice(1)
    .filter(r => r[nameIdx] && String(r[nameIdx]).trim())
    .map(r => ({
      name:   String(r[nameIdx]).trim(),
      salary: parseNumber(r[salaryIdx]),
      role:   roleIdx >= 0 ? String(r[roleIdx] || '').trim() : ''
    }))
    .filter(e => e.name && e.salary > 0);
}

// ─── Monthly Expenses ───────────────────────────────────────────────────────
async function fetchExpenses() {
  const rows = await fetchCSV(SHEET_URLS.expenses);
  if (!rows.length) return [];
  const headers = rows[0];
  const monthIdx   = col(headers, 0, 'month', 'date', 'period');
  const expenseIdx = col(headers, 1, 'expense', 'description', 'item', 'name');
  const amtPKRIdx  = findColIndex(headers, 'pkr', 'amount pkr', 'cost pkr', 'rs');
  const amtUSDIdx  = findColIndex(headers, 'usd', 'amount usd', 'cost usd', '$');
  const amtIdx     = amtPKRIdx >= 0 ? amtPKRIdx : (amtUSDIdx >= 0 ? amtUSDIdx : col(headers, 2, 'amount', 'cost', 'total'));
  const categoryIdx = findColIndex(headers, 'category', 'type', 'group');
  const statusIdx   = findColIndex(headers, 'status', 'paid', 'state');

  return rows.slice(1)
    .filter(r => r[expenseIdx] && String(r[expenseIdx]).trim())
    .map(r => {
      const amtRaw = parseNumber(r[amtIdx]);
      const isPKR  = amtPKRIdx >= 0;
      const amtPKR = isPKR ? amtRaw : toPKR(amtRaw, true);
      const amtUSD = isPKR ? toUSD(amtRaw, true) : amtRaw;
      return {
        month:    String(r[monthIdx] || '').trim(),
        expense:  String(r[expenseIdx]).trim(),
        amtPKR,
        amtUSD,
        category: categoryIdx >= 0 ? String(r[categoryIdx] || '').trim() : inferCategory(String(r[expenseIdx]).trim()),
        status:   statusIdx >= 0 ? String(r[statusIdx] || '').trim() : ''
      };
    })
    .filter(e => e.expense && (e.amtPKR > 0 || e.amtUSD > 0));
}

function inferCategory(name) {
  const n = name.toLowerCase();
  if (/connect|upwork|bid/i.test(n)) return 'Marketing';
  if (/salary|payroll|staff|wage/i.test(n)) return 'Salaries';
  if (/rent|office|electric|util|water|maid|bill/i.test(n)) return 'Office';
  if (/internet|wifi|data|mobile|phone|sim/i.test(n)) return 'Internet/Comms';
  if (/apollo|instantly|zoom|domain|godaddy|host|tool|software|sub|license/i.test(n)) return 'Tools & Software';
  if (/ads|facebook|google ad|marketing|social|follower/i.test(n)) return 'Marketing';
  return 'Other';
}

// ─── Monthly Cash Inn ────────────────────────────────────────────────────────
async function fetchCashInn() {
  const rows = await fetchCSV(SHEET_URLS.cashInn);
  if (!rows.length) return [];
  const headers = rows[0];

  // Attempt header-based detection, fallback to spec column indices
  const dateIdx       = col(headers, 0, 'date', 'month', 'period');
  const clientIdx     = col(headers, 1, 'client', 'customer', 'company');
  const projectIdx    = col(headers, 2, 'project', 'service', 'description');
  const typeIdx       = findColIndex(headers, 'type', 'front', 'upsell', 'sale type');
  // Spec: Gross Sales = col G (index 6)
  const grossSalesIdx = col(headers, 6, 'gross', 'gross sale', 'revenue', 'amount');
  // Spec: Agent = col I (index 8), AG Comm = col J (9), TL = col K (10), TL Comm = col L (11)
  const agentColIdx   = col(headers, 8,  'agent', 'bidder', 'sales rep');
  const agentCommIdx  = col(headers, 9,  'ag. comm', 'agent comm', 'ag comm', 'commission');
  const tlColIdx      = col(headers, 10, 'tl', 'team lead', 'tl name');
  const tlCommColIdx  = col(headers, 11, 'tl. comm', 'tl comm', 'tl commission');

  // Currency of gross sales — look for a currency column or assume USD
  const currencyIdx = findColIndex(headers, 'currency', 'curr');

  return rows.slice(1)
    .filter(r => r.some(c => String(c).trim()))
    .map(r => {
      const grossRaw  = parseNumber(r[grossSalesIdx]);
      const curr      = currencyIdx >= 0 ? String(r[currencyIdx] || 'USD').toUpperCase() : 'USD';
      const grossUSD  = curr === 'PKR' ? toUSD(grossRaw, false) : grossRaw;
      const grossPKR  = curr === 'PKR' ? grossRaw : toPKR(grossRaw, false);
      const projectName = String(r[projectIdx] || '').trim();
      const saleType  = typeIdx >= 0
        ? String(r[typeIdx] || '').toLowerCase()
        : (/upsell|up-sell|upgrade/i.test(projectName) ? 'upsell' : 'front');

      return {
        date:       String(r[dateIdx] || '').trim(),
        client:     String(r[clientIdx] || '').trim(),
        project:    projectName,
        grossUSD,
        grossPKR,
        saleType,
        agent:      String(r[agentColIdx] || '').trim(),
        agentComm:  parseNumber(r[agentCommIdx]),
        tl:         String(r[tlColIdx] || '').trim(),
        tlComm:     parseNumber(r[tlCommColIdx]),
        currency:   curr
      };
    })
    .filter(r => r.client || r.grossUSD > 0);
}

// ─── Monthly Revenue ─────────────────────────────────────────────────────────
async function fetchRevenue() {
  const rows = await fetchCSV(SHEET_URLS.revenue);
  if (!rows.length) return [];
  const headers = rows[0];
  const monthIdx  = col(headers, 0, 'month', 'date', 'period');
  const revUSDIdx = findColIndex(headers, 'usd', 'revenue usd', 'rev usd');
  const revPKRIdx = findColIndex(headers, 'pkr', 'revenue pkr', 'rev pkr', 'rs');
  const revIdx    = revUSDIdx >= 0 ? revUSDIdx : (revPKRIdx >= 0 ? revPKRIdx : col(headers, 1, 'revenue', 'total', 'amount'));
  const yearIdx   = findColIndex(headers, 'year');

  return rows.slice(1)
    .filter(r => r[monthIdx] && String(r[monthIdx]).trim())
    .map(r => {
      const raw = parseNumber(r[revIdx]);
      const isPKR = revPKRIdx >= 0 && revUSDIdx < 0;
      const revUSD = isPKR ? toUSD(raw, false) : raw;
      const revPKR = isPKR ? raw : toPKR(raw, false);
      return {
        month:  String(r[monthIdx]).trim(),
        year:   yearIdx >= 0 ? String(r[yearIdx] || '').trim() : extractYear(String(r[monthIdx])),
        revUSD,
        revPKR
      };
    })
    .filter(r => r.month && (r.revUSD > 0 || r.revPKR > 0));
}

// ─── Company PnL ─────────────────────────────────────────────────────────────
async function fetchPnL() {
  const rows = await fetchCSV(SHEET_URLS.pnl);
  if (!rows.length) return [];
  const headers = rows[0];
  const monthIdx  = col(headers, 0, 'month', 'date', 'period');
  const revIdx    = col(headers, 1, 'revenue', 'income', 'total rev');
  const expIdx    = col(headers, 2, 'expense', 'cost', 'total exp');
  const profitIdx = col(headers, 3, 'profit', 'net', 'p&l', 'pnl');
  const yearIdx    = findColIndex(headers, 'year');

  return rows.slice(1)
    .filter(r => r[monthIdx] && String(r[monthIdx]).trim())
    .map(r => {
      const rev  = parseNumber(r[revIdx]);
      const exp  = parseNumber(r[expIdx]);
      const prof = profitIdx >= 0 && r[profitIdx] ? parseNumber(r[profitIdx]) : rev - exp;
      return {
        month:   String(r[monthIdx]).trim(),
        year:    yearIdx >= 0 ? String(r[yearIdx] || '').trim() : extractYear(String(r[monthIdx])),
        revenue: rev,
        expenses: exp,
        profit:  prof,
        margin:  rev > 0 ? (prof / rev) * 100 : 0
      };
    })
    .filter(r => r.month);
}

// ─── Master load ─────────────────────────────────────────────────────────────
async function loadAllData() {
  const results = await Promise.allSettled([
    fetchSalaries(),
    fetchExpenses(),
    fetchCashInn(),
    fetchRevenue(),
    fetchPnL()
  ]);

  const errors = [];
  const [salaries, expenses, cashInn, revenue, pnl] = results.map((r, i) => {
    if (r.status === 'rejected') {
      const names = ['Salaries', 'Expenses', 'Cash Inn', 'Revenue', 'PnL'];
      errors.push(`${names[i]}: ${r.reason?.message || r.reason}`);
      return [];
    }
    return r.value;
  });

  return { salaries, expenses, cashInn, revenue, pnl, errors };
}

function extractYear(monthStr) {
  const m = monthStr.match(/\b(20\d{2})\b/);
  return m ? m[1] : '';
}

function normalizeClientName(name) {
  if (!name) return '';
  const suffixes = ['seo', 'ads', 'hosting', 'proto', 'web', 'design', 'smm', 'ppc', 'dev', 'app'];
  let normalized = name.trim();
  for (const suffix of suffixes) {
    normalized = normalized.replace(new RegExp(`\\s+${suffix}$`, 'i'), '');
  }
  return normalized.trim();
}

function groupByMonth(rows, dateField = 'date') {
  const map = {};
  for (const r of rows) {
    const key = extractMonthKey(r[dateField]);
    if (!map[key]) map[key] = [];
    map[key].push(r);
  }
  return map;
}

function extractMonthKey(dateStr) {
  if (!dateStr) return 'Unknown';
  // Try to parse common formats: "Jan 2025", "2025-01", "January 2025", "01/2025"
  const s = String(dateStr).trim();
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  // "MMM YYYY" or "Month YYYY"
  const m1 = s.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (m1) {
    const mIdx = monthNames.indexOf(m1[1].toLowerCase().slice(0, 3));
    if (mIdx >= 0) return `${m1[2]}-${String(mIdx + 1).padStart(2, '0')}`;
  }

  // "YYYY-MM" or "YYYY/MM"
  const m2 = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}`;

  // "MM/YYYY"
  const m3 = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m3) return `${m3[2]}-${m3[1].padStart(2, '0')}`;

  // Full date "YYYY-MM-DD" or "MM/DD/YYYY"
  const m4 = s.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (m4) return `${m4[1]}-${m4[2]}`;

  const m5 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m5) return `${m5[3]}-${m5[1].padStart(2, '0')}`;

  return s;
}

function sortMonthKeys(keys) {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function monthKeyToLabel(key) {
  const [year, month] = key.split('-');
  if (!year || !month) return key;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month, 10) - 1] || ''} ${year}`;
}

function invalidateCacheAll() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}
