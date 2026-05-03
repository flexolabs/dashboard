// Currency conversion constants
const SPENDING_RATE = 300;  // PKR per USD (for expenses)
const EARNING_RATE = 270;   // PKR per USD (for revenue)

// Upwork Connects pricing
const CONNECT_PACKAGE_COST_USD = 90;
const CONNECTS_PER_PACKAGE = 600;
const COST_PER_CONNECT_USD = CONNECT_PACKAGE_COST_USD / CONNECTS_PER_PACKAGE; // 0.15
const COST_PER_CONNECT_PKR = COST_PER_CONNECT_USD * SPENDING_RATE; // 45

function toPKR(usd, isSpending = false) {
  if (typeof usd !== 'number' || isNaN(usd)) return 0;
  return usd * (isSpending ? SPENDING_RATE : EARNING_RATE);
}

function toUSD(pkr, isSpending = false) {
  if (typeof pkr !== 'number' || isNaN(pkr)) return 0;
  return pkr / (isSpending ? SPENDING_RATE : EARNING_RATE);
}

function formatCurrency(amount, currency = 'USD', compact = false) {
  if (typeof amount !== 'number' || isNaN(amount)) amount = 0;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (currency === 'USD') {
    if (compact) {
      if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(1) + 'M';
      if (abs >= 1_000) return sign + '$' + (abs / 1_000).toFixed(1) + 'K';
      return sign + '$' + abs.toFixed(0);
    }
    return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  } else {
    if (compact) {
      if (abs >= 1_000_000) return sign + 'Rs ' + (abs / 1_000_000).toFixed(1) + 'M';
      if (abs >= 1_000) return sign + 'Rs ' + (abs / 1_000).toFixed(1) + 'K';
      return sign + 'Rs ' + abs.toFixed(0);
    }
    return sign + 'Rs ' + abs.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}

function formatPercent(value, decimals = 1) {
  if (typeof value !== 'number' || isNaN(value)) return '0%';
  return (value >= 0 ? '+' : '') + value.toFixed(decimals) + '%';
}

function parseNumber(str) {
  if (typeof str === 'number') return isNaN(str) ? 0 : str;
  if (!str || str === '' || str === '-' || str === 'N/A') return 0;
  // Remove currency symbols, commas, spaces
  const cleaned = String(str).replace(/[$,\s]/g, '').replace(/Rs\.?/gi, '').replace(/PKR/gi, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
