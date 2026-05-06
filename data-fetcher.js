const GOOGLE_SHEET_ID = '2PACX-1vR679-Bh2vFV-O2gii6bfM1mECLQa7zmLw6IKYk8OwPJoJF6hmpKjKDW_9niulgIUdT4K5gCE7rlwiQ';

const SHEET_SOURCES = {
  salaries: {
    label: 'Salaries',
    gid: '1002409884',
  },
  expenses: {
    label: 'Monthly Expenses',
    gid: '701838879',
  },
  cashInn: {
    label: 'Monthly Cash Inn',
    gid: '1879112264',
  },
  revenue: {
    label: 'Monthly Revenue',
    gid: '527351239',
  },
  pnl: {
    label: 'Company PnL',
    gid: '62657854',
  },
};

Object.values(SHEET_SOURCES).forEach((source) => {
  source.url = `https://docs.google.com/spreadsheets/d/e/${GOOGLE_SHEET_ID}/pub?gid=${source.gid}&single=true&output=csv`;
});

const CACHE_KEY = 'flexolabs-dashboard-cache-v2';
const CACHE_TTL = 5 * 60 * 1000;
const REQUEST_TIMEOUT = 12000;

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

function createEmptyPayload() {
  return Object.keys(SHEET_SOURCES).reduce((payload, key) => {
    payload[key] = [];
    payload.meta[key] = {
      label: SHEET_SOURCES[key].label,
      rows: 0,
      fetchedAt: null,
      status: 'pending',
    };
    return payload;
  }, { meta: {}, errors: [] });
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

function timeoutSignal(timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return { controller, timer };
}

async function fetchTextWithTimeout(url, timeout = REQUEST_TIMEOUT) {
  const { controller, timer } = timeoutSignal(timeout);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      mode: 'cors',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error('empty response');
    if (/^\s*</.test(text)) throw new Error('received HTML instead of CSV');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function proxiedCsvUrl(url) {
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}

async function fetchSheet(key, source) {
  const attempts = [
    { name: 'Google CSV', url: source.url },
    { name: 'CORS proxy CSV', url: proxiedCsvUrl(source.url) },
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const text = await fetchTextWithTimeout(attempt.url);
      return {
        key,
        label: source.label,
        rows: parseCSV(text),
        fetchedAt: new Date().toISOString(),
        status: attempt.name,
      };
    } catch (error) {
      errors.push(`${attempt.name}: ${error.name === 'AbortError' ? 'request timed out' : error.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function loadDashboardData({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = getCachedData();
    if (cached) return { ...cached, fromCache: true };
  }

  const payload = createEmptyPayload();
  const results = await Promise.allSettled(
    Object.entries(SHEET_SOURCES).map(async ([key, source]) => fetchSheet(key, source))
  );

  results.forEach((result, index) => {
    const key = Object.keys(SHEET_SOURCES)[index];
    const source = SHEET_SOURCES[key];

    if (result.status === 'fulfilled') {
      const sheet = result.value;
      payload[sheet.key] = sheet.rows;
      payload.meta[sheet.key] = {
        label: sheet.label,
        rows: sheet.rows.length,
        fetchedAt: sheet.fetchedAt,
        status: sheet.status,
      };
      return;
    }

    payload.errors.push(`${source.label}: ${result.reason.message}`);
    payload.meta[key] = {
      label: source.label,
      rows: 0,
      fetchedAt: null,
      status: 'failed',
      error: result.reason.message,
    };
  });

  const loadedRows = Object.values(payload.meta).reduce((sum, sheet) => sum + sheet.rows, 0);
  if (loadedRows > 0) setCachedData(payload);
  return { ...payload, fromCache: false };
}

window.FlexoData = {
  SHEET_SOURCES,
  parseCSV,
  loadDashboardData,
  createEmptyPayload,
  CACHE_TTL,
  REQUEST_TIMEOUT,
};
