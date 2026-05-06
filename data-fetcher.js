const SHEET_SOURCES = {
  salaries: {
    label: 'Salaries',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=1002409884&single=true&output=csv',
  },
  expenses: {
    label: 'Monthly Expenses',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=701838879&single=true&output=csv',
  },
  cashInn: {
    label: 'Monthly Cash Inn',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=1879112264&single=true&output=csv',
  },
  revenue: {
    label: 'Monthly Revenue',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=527351239&single=true&output=csv',
  },
  pnl: {
    label: 'Company PnL',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ/pub?gid=62657854&single=true&output=csv',
  },
};

const CACHE_KEY = 'flexolabs-dashboard-cache-v1';
const CACHE_TTL = 5 * 60 * 1000;

function parseCSV(csvText) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map((header, index) => header || `Column ${index + 1}`);
  return rows.slice(1).map((values) => headers.reduce((entry, header, index) => {
    entry[header] = values[index] || '';
    return entry;
  }, {}));
}

function getCachedData() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.payload;
  } catch (error) {
    console.warn('Unable to read dashboard cache', error);
  }
  return null;
}

function setCachedData(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), payload }));
  } catch (error) {
    console.warn('Unable to save dashboard cache', error);
  }
}

async function fetchSheet(key, source) {
  const response = await fetch(source.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${source.label} failed with ${response.status}`);
  const text = await response.text();
  return { key, label: source.label, rows: parseCSV(text), fetchedAt: new Date().toISOString() };
}

async function loadDashboardData({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = getCachedData();
    if (cached) return { ...cached, fromCache: true };
  }

  const entries = await Promise.all(
    Object.entries(SHEET_SOURCES).map(async ([key, source]) => fetchSheet(key, source))
  );

  const payload = entries.reduce((data, sheet) => {
    data[sheet.key] = sheet.rows;
    data.meta[sheet.key] = { label: sheet.label, rows: sheet.rows.length, fetchedAt: sheet.fetchedAt };
    return data;
  }, { meta: {} });

  setCachedData(payload);
  return { ...payload, fromCache: false };
}

window.FlexoData = { SHEET_SOURCES, parseCSV, loadDashboardData, CACHE_TTL };
