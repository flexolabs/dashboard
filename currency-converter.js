const SPENDING_RATE = 300;
const EARNING_RATE = 270;
const CONNECT_PACKAGE_COST = 90;
const CONNECTS_PER_PACKAGE = 600;
const COST_PER_CONNECT_USD = CONNECT_PACKAGE_COST / CONNECTS_PER_PACKAGE;
const COST_PER_CONNECT_PKR = COST_PER_CONNECT_USD * SPENDING_RATE;

function toPKR(usd, isSpending = false) {
  return Number(usd || 0) * (isSpending ? SPENDING_RATE : EARNING_RATE);
}

function toUSD(pkr, isSpending = false) {
  return Number(pkr || 0) / (isSpending ? SPENDING_RATE : EARNING_RATE);
}

function formatCurrency(value, currency = 'usd', isSpending = false, compact = false) {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const options = {
    maximumFractionDigits: compact ? 1 : currency === 'usd' ? 0 : 0,
    minimumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  };

  if (currency === 'pkr') {
    return `Rs ${new Intl.NumberFormat('en-PK', options).format(numericValue)}`;
  }

  return new Intl.NumberFormat('en-US', {
    ...options,
    style: 'currency',
    currency: 'USD',
  }).format(numericValue);
}

function formatDualCurrency(usdValue, isSpending = false) {
  const usd = Number(usdValue || 0);
  return {
    usd: formatCurrency(usd, 'usd', isSpending),
    pkr: formatCurrency(toPKR(usd, isSpending), 'pkr', isSpending),
  };
}

window.FlexoCurrency = {
  SPENDING_RATE,
  EARNING_RATE,
  CONNECT_PACKAGE_COST,
  CONNECTS_PER_PACKAGE,
  COST_PER_CONNECT_USD,
  COST_PER_CONNECT_PKR,
  toPKR,
  toUSD,
  formatCurrency,
  formatDualCurrency,
};
