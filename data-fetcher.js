// ─── Sheet URLs ───────────────────────────────────────────────────────────────
const SHEET_URLS = {
  salaries: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=1002409884&single=true&output=csv',
  expenses: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=701838879&single=true&output=csv',
  cashInn:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=1879112264&single=true&output=csv',
  revenue:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=527351239&single=true&output=csv',
  pnl:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=62657854&single=true&output=csv'
};

// ─── Cache ────────────────────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;
const _cache    = {};

function invalidateCacheAll() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

// ─── Robust CSV parser (no external dependency required) ──────────────────────
function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

async function fetchCSV(url) {
  const now = Date.now();
  if (_cache[url] && now - _cache[url].ts < CACHE_TTL) return _cache[url].data;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();

  // Use PapaParse if available, fall back to custom parser
  let rows;
  if (typeof Papa !== 'undefined') {
    rows = Papa.parse(text, { skipEmptyLines: true }).data;
  } else {
    rows = parseCSV(text);
  }

  _cache[url] = { ts: now, data: rows };
  console.log(`[FlexoDash] Loaded ${rows.length} rows from ${url.slice(-20)}`);
  console.log(`[FlexoDash] Headers:`, rows[0]);
  if (rows.length > 1) console.log(`[FlexoDash] Row 1 sample:`, rows[1]);
  if (rows.length > 2) console.log(`[FlexoDash] Row 2 sample:`, rows[2]);
  return rows;
}

// ─── Number parsing ──────────────────────────────────────────────────────────
// Strips Rs, PKR, $, commas, spaces; handles (negative) parentheses
function num(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  const negative = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/\(|\)/g, '')                // remove parens
        .replace(/Rs\.?/gi, '')              // Rs or Rs.
        .replace(/PKR/gi, '')               // PKR
        .replace(/\$/g, '')                 // $
        .replace(/,/g, '')                  // thousands commas
        .replace(/\s/g, '')                 // spaces
        .trim();
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negative ? -n : n;
}

// ─── Column finder ────────────────────────────────────────────────────────────
// Returns first column index whose header includes any candidate (case-insensitive)
// Falls back to `fallback` if none found
function colIdx(headers, fallback, ...candidates) {
  const lower = headers.map(h => String(h).toLowerCase().trim());
  for (const c of candidates) {
    const i = lower.findIndex(h => h.includes(c.toLowerCase()));
    if (i !== -1) return i;
  }
  return fallback;
}

// ─── Month key utilities ──────────────────────────────────────────────────────
const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Returns "YYYY-MM" or the original string if unparseable
function toMonthKey(raw) {
  if (!raw) return '';
  const s = String(raw).trim();

  // Already "YYYY-MM"
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  // "YYYY-MM-DD" or "YYYY/MM/DD"
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}`;

  // "DD-MM-YYYY" or "DD/MM/YYYY"
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}`;

  // "MM/YYYY" or "MM-YYYY"
  const my = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (my) return `${my[2]}-${my[1].padStart(2,'0')}`;

  // "Month YYYY"  e.g. "January 2025", "Jan 2025", "JAN 2025"
  const monYear = s.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (monYear) {
    const mi = MONTH_NAMES.indexOf(monYear[1].toLowerCase().slice(0,3));
    if (mi !== -1) return `${monYear[2]}-${String(mi+1).padStart(2,'0')}`;
  }

  // "YYYY Month"  e.g. "2025 Jan"
  const yearMon = s.match(/^(\d{4})\s+([a-zA-Z]+)$/);
  if (yearMon) {
    const mi = MONTH_NAMES.indexOf(yearMon[2].toLowerCase().slice(0,3));
    if (mi !== -1) return `${yearMon[1]}-${String(mi+1).padStart(2,'0')}`;
  }

  // "Month-YYYY" e.g. "Jan-2025"
  const monDashYear = s.match(/^([a-zA-Z]+)-(\d{4})$/);
  if (monDashYear) {
    const mi = MONTH_NAMES.indexOf(monDashYear[1].toLowerCase().slice(0,3));
    if (mi !== -1) return `${monDashYear[2]}-${String(mi+1).padStart(2,'0')}`;
  }

  // "YYYY" only — treat as January of that year
  if (/^\d{4}$/.test(s)) return `${s}-01`;

  // Month name only, e.g. "January" → current year
  const monOnly = s.match(/^([a-zA-Z]+)$/);
  if (monOnly) {
    const mi = MONTH_NAMES.indexOf(monOnly[1].toLowerCase().slice(0,3));
    if (mi !== -1) return `${new Date().getFullYear()}-${String(mi+1).padStart(2,'0')}`;
  }

  return s; // give up, return as-is
}

function monthKeyLabel(key) {
  const [yr, mo] = String(key).split('-');
  if (!yr || !mo) return key;
  const label = MONTH_LABELS[parseInt(mo, 10) - 1];
  return label ? `${label} ${yr}` : key;
}

function sortMonthKeys(keys) {
  return [...new Set(keys)].filter(Boolean).sort((a,b) => a.localeCompare(b));
}

function groupByMonth(rows, getKey) {
  const map = {};
  for (const r of rows) {
    const k = toMonthKey(getKey(r));
    if (!k) continue;
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  return map;
}

// ─── Client name normaliser ───────────────────────────────────────────────────
function normalizeClientName(name) {
  if (!name) return '';
  const suffixes = ['\\s+seo','\\s+ads','\\s+hosting','\\s+proto','\\s+web','\\s+design',
                    '\\s+smm','\\s+ppc','\\s+dev','\\s+app','\\s+email','\\s+social'];
  let n = String(name).trim();
  for (const s of suffixes) n = n.replace(new RegExp(s + '$', 'i'), '');
  return n.trim();
}

// ─── Is a row "empty" (all cells blank)? ──────────────────────────────────────
function rowEmpty(r) {
  return !r || r.every(c => !String(c).trim());
}

// ─── SALARIES ─────────────────────────────────────────────────────────────────
async function fetchSalaries() {
  const rows = await fetchCSV(SHEET_URLS.salaries);
  if (rows.length < 2) return [];
  const h = rows[0];

  const nameCol   = colIdx(h, 0, 'name', 'employee', 'staff', 'person');
  const salaryCol = colIdx(h, 1, 'salary', 'amount', 'monthly', 'net', 'pay', 'pkr');
  const roleCol   = colIdx(h, -1, 'role', 'designation', 'position', 'title', 'dept');
  const monthCol  = colIdx(h, -1, 'month', 'date', 'period');

  console.log('[FlexoDash] Salaries cols → name:', nameCol, 'salary:', salaryCol, 'role:', roleCol, 'month:', monthCol);

  return rows.slice(1).filter(r => !rowEmpty(r)).map(r => ({
    name:   String(r[nameCol] || '').trim(),
    salary: num(r[salaryCol]),
    role:   roleCol >= 0 ? String(r[roleCol] || '').trim() : '',
    month:  monthCol >= 0 ? toMonthKey(r[monthCol]) : ''
  })).filter(e => e.name && e.salary > 0);
}

// ─── MONTHLY EXPENSES ─────────────────────────────────────────────────────────
async function fetchExpenses() {
  const rows = await fetchCSV(SHEET_URLS.expenses);
  if (rows.length < 2) return [];
  const h = rows[0];

  const monthCol  = colIdx(h, 0, 'month', 'date', 'period');
  const nameCol   = colIdx(h, 1, 'expense', 'description', 'item', 'name', 'particular');
  const pkrCol    = colIdx(h, -1, 'pkr', 'rs', 'rupee', 'amount pkr', 'cost pkr');
  const usdCol    = colIdx(h, -1, 'usd', 'dollar', 'amount usd', 'cost usd', '$');
  const amtCol    = pkrCol >= 0 ? pkrCol : (usdCol >= 0 ? usdCol : colIdx(h, 2, 'amount', 'cost', 'total', 'value'));
  const catCol    = colIdx(h, -1, 'category', 'type', 'group', 'head');
  const statusCol = colIdx(h, -1, 'status', 'paid', 'state', 'remark');

  console.log('[FlexoDash] Expenses cols → month:', monthCol, 'name:', nameCol, 'amt:', amtCol, '(pkr?', pkrCol >= 0, ')');

  return rows.slice(1).filter(r => !rowEmpty(r)).map(r => {
    const rawAmt = num(r[amtCol]);
    // If column is explicitly PKR, keep as PKR. If USD, convert. If ambiguous, assume PKR (Pakistani agency).
    const isPKR = usdCol < 0; // treat as PKR unless we found a USD column
    const amtPKR = isPKR ? rawAmt : toPKR(rawAmt, true);
    const amtUSD = isPKR ? toUSD(rawAmt, true) : rawAmt;
    const expName = String(r[nameCol] || '').trim();
    return {
      month:    toMonthKey(r[monthCol]),
      expense:  expName,
      amtPKR,
      amtUSD,
      category: catCol >= 0 && r[catCol] ? String(r[catCol]).trim() : inferCategory(expName),
      status:   statusCol >= 0 ? String(r[statusCol] || '').trim() : 'Paid'
    };
  }).filter(e => e.expense && (e.amtPKR > 0 || e.amtUSD > 0));
}

function inferCategory(name) {
  const n = String(name).toLowerCase();
  if (/connect|bid/i.test(n))                                       return 'Marketing';
  if (/salary|payroll|staff|wage|pay/i.test(n))                     return 'Salaries';
  if (/rent|office|electric|util|water|maid|bill|generator/i.test(n)) return 'Office';
  if (/internet|wifi|data|mobile|phone|sim|ptcl/i.test(n))          return 'Internet/Comms';
  if (/apollo|instantly|zoom|domain|godaddy|tool|software|sub|license|gsuite|slack/i.test(n)) return 'Tools & Software';
  if (/ads|facebook|google ad|marketing|social|follower|instagram/i.test(n)) return 'Marketing';
  return 'Other';
}

// ─── MONTHLY CASH INN ─────────────────────────────────────────────────────────
async function fetchCashInn() {
  const rows = await fetchCSV(SHEET_URLS.cashInn);
  if (rows.length < 2) return [];
  const h = rows[0];

  // Column mapping – spec: G=gross(6), I=agent(8), J=agcomm(9), K=tl(10), L=tlcomm(11)
  const dateCol    = colIdx(h, 0,  'date', 'month', 'period');
  const clientCol  = colIdx(h, 1,  'client', 'customer', 'company', 'buyer');
  const projectCol = colIdx(h, 2,  'project', 'service', 'description', 'work');
  const typeCol    = colIdx(h, -1, 'type', 'sale type', 'category', 'front', 'upsell');
  const grossCol   = colIdx(h, 6,  'gross', 'gross sale', 'gross amount', 'revenue', 'amount');
  const agentCol   = colIdx(h, 8,  'agent', 'bidder', 'sales', 'rep');
  const agCommCol  = colIdx(h, 9,  'ag. comm', 'agent comm', 'ag comm', 'agent commission');
  const tlCol      = colIdx(h, 10, 'tl', 'team lead', 'team leader');
  const tlCommCol  = colIdx(h, 11, 'tl. comm', 'tl comm', 'tl commission');
  const currCol    = colIdx(h, -1, 'currency', 'curr', 'cur');

  console.log('[FlexoDash] CashInn cols → date:', dateCol, 'client:', clientCol, 'gross:', grossCol, 'agent:', agentCol, 'tl:', tlCol);

  return rows.slice(1).filter(r => !rowEmpty(r)).map(r => {
    const grossRaw   = num(r[grossCol]);
    // Detect currency: explicit column > $ prefix in cell > assume USD (Upwork revenue)
    let currency = 'USD';
    if (currCol >= 0 && r[currCol]) {
      currency = String(r[currCol]).trim().toUpperCase().includes('PKR') ? 'PKR' : 'USD';
    } else if (String(r[grossCol] || '').includes('Rs') || String(r[grossCol] || '').includes('PKR')) {
      currency = 'PKR';
    }
    const grossUSD = currency === 'PKR' ? toUSD(grossRaw, false) : grossRaw;
    const grossPKR = currency === 'PKR' ? grossRaw : toPKR(grossRaw, false);

    const project  = String(r[projectCol] || '').trim();
    let saleType   = 'front';
    if (typeCol >= 0 && r[typeCol]) {
      saleType = /upsell|up.?sell|upgrade/i.test(r[typeCol]) ? 'upsell' : 'front';
    } else if (/upsell|up.?sell|upgrade/i.test(project)) {
      saleType = 'upsell';
    }

    return {
      date:      toMonthKey(r[dateCol]),
      rawDate:   String(r[dateCol] || '').trim(),
      client:    String(r[clientCol] || '').trim(),
      project,
      grossUSD,
      grossPKR,
      saleType,
      agent:     String(r[agentCol] || '').trim(),
      agentComm: num(r[agCommCol]),
      tl:        String(r[tlCol] || '').trim(),
      tlComm:    num(r[tlCommCol])
    };
  }).filter(r => r.grossUSD > 0 || r.client);
}

// ─── MONTHLY REVENUE ──────────────────────────────────────────────────────────
async function fetchRevenue() {
  const rows = await fetchCSV(SHEET_URLS.revenue);
  if (rows.length < 2) return [];
  const h = rows[0];

  const monthCol  = colIdx(h, 0, 'month', 'date', 'period');
  const usdCol    = colIdx(h, -1, 'usd', 'dollar', 'revenue usd', '$');
  const pkrCol    = colIdx(h, -1, 'pkr', 'rs', 'revenue pkr', 'rupee');
  // If neither explicit: fall back to col 1, assumed PKR for Pakistani agency
  const amtCol    = usdCol >= 0 ? usdCol : (pkrCol >= 0 ? pkrCol : colIdx(h, 1, 'revenue', 'total', 'amount', 'value'));
  const isPKR     = usdCol < 0;

  console.log('[FlexoDash] Revenue cols → month:', monthCol, 'amt:', amtCol, 'isPKR:', isPKR);

  return rows.slice(1).filter(r => !rowEmpty(r) && r[monthCol]).map(r => {
    const raw    = num(r[amtCol]);
    const revUSD = isPKR ? toUSD(raw, false) : raw;
    const revPKR = isPKR ? raw : toPKR(raw, false);
    return {
      month: toMonthKey(r[monthCol]),
      revUSD,
      revPKR
    };
  }).filter(r => r.month && (r.revUSD > 0 || r.revPKR > 0));
}

// ─── COMPANY PnL ──────────────────────────────────────────────────────────────
async function fetchPnL() {
  const rows = await fetchCSV(SHEET_URLS.pnl);
  if (rows.length < 2) return [];
  const h = rows[0];

  const monthCol  = colIdx(h, 0, 'month', 'date', 'period');
  const revCol    = colIdx(h, 1, 'revenue', 'income', 'sales', 'total rev', 'gross');
  const expCol    = colIdx(h, 2, 'expense', 'cost', 'expenditure', 'total exp');
  const profCol   = colIdx(h, 3, 'profit', 'net', 'p&l', 'pnl', 'net profit');

  console.log('[FlexoDash] PnL cols → month:', monthCol, 'rev:', revCol, 'exp:', expCol, 'profit:', profCol);

  return rows.slice(1).filter(r => !rowEmpty(r) && r[monthCol]).map(r => {
    const rev  = num(r[revCol]);
    const exp  = num(r[expCol]);
    const prof = r[profCol] ? num(r[profCol]) : (rev - exp);
    return {
      month:    toMonthKey(r[monthCol]),
      revenue:  rev,
      expenses: exp,
      profit:   prof,
      margin:   rev > 0 ? (prof / rev * 100) : 0
    };
  }).filter(r => r.month);
}

// ─── Master load ──────────────────────────────────────────────────────────────
async function loadAllData() {
  const results = await Promise.allSettled([
    fetchSalaries(),
    fetchExpenses(),
    fetchCashInn(),
    fetchRevenue(),
    fetchPnL()
  ]);

  const names  = ['Salaries', 'Expenses', 'CashInn', 'Revenue', 'PnL'];
  const errors = [];
  const [salaries, expenses, cashInn, revenue, pnl] = results.map((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[FlexoDash] ${names[i]} failed:`, r.reason);
      errors.push(`${names[i]}: ${r.reason?.message || r.reason}`);
      return [];
    }
    console.log(`[FlexoDash] ${names[i]}: ${r.value.length} records`);
    return r.value;
  });

  return { salaries, expenses, cashInn, revenue, pnl, errors };
}
