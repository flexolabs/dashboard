const chartRegistry = new Map();

function destroyChart(id) {
  const chart = chartRegistry.get(id);
  if (chart) {
    chart.destroy();
    chartRegistry.delete(id);
  }
}

function chartCurrencyFormatter(value, currency) {
  return window.FlexoCurrency.formatCurrency(value, currency, false, true);
}

function baseOptions(currency = 'usd', stacked = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 650, easing: 'easeOutQuart' },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#6B7280' } },
      tooltip: {
        backgroundColor: '#000',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          label(context) {
            const label = context.dataset.label ? `${context.dataset.label}: ` : '';
            return `${label}${chartCurrencyFormatter(context.parsed.y ?? context.parsed, currency)}`;
          },
        },
      },
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { color: '#6B7280' } },
      y: {
        stacked,
        border: { display: false },
        grid: { color: '#EEF0F4' },
        ticks: { color: '#6B7280', callback: (value) => chartCurrencyFormatter(value, currency) },
      },
    },
  };
}

function renderChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return null;
  destroyChart(id);
  const chart = new Chart(canvas, config);
  chartRegistry.set(id, chart);
  return chart;
}

function renderRevenueExpenseChart(id, labels, revenue, expenses, currency) {
  return renderChart(id, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Revenue', data: revenue, backgroundColor: '#000', borderRadius: 8, maxBarThickness: 36 },
        { type: 'bar', label: 'Expenses', data: expenses, backgroundColor: '#D1D5DB', borderRadius: 8, maxBarThickness: 36 },
        { type: 'line', label: 'Net Profit', data: revenue.map((value, index) => value - expenses[index]), borderColor: '#10B981', backgroundColor: '#10B981', tension: 0.35, pointRadius: 3 },
      ],
    },
    options: baseOptions(currency),
  });
}

function renderLineChart(id, labels, data, label, color, currency) {
  return renderChart(id, {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: `${color}20`, fill: true, tension: 0.38, pointRadius: 3 }] },
    options: baseOptions(currency),
  });
}

function renderGroupedBarChart(id, labels, yearSeries, currency) {
  const palette = ['#000000', '#9CA3AF', '#D1D5DB'];
  return renderChart(id, {
    type: 'bar',
    data: {
      labels,
      datasets: Object.entries(yearSeries).map(([year, values], index) => ({
        label: year,
        data: values,
        backgroundColor: palette[index % palette.length],
        borderRadius: 8,
        maxBarThickness: 24,
      })),
    },
    options: baseOptions(currency),
  });
}

function renderDoughnutChart(id, labels, data) {
  return renderChart(id, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: ['#000', '#10B981', '#6B7280', '#D1D5DB', '#F59E0B'], borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
    },
  });
}

function renderStackedChart(id, labels, datasets, currency) {
  return renderChart(id, {
    type: 'line',
    data: { labels, datasets },
    options: baseOptions(currency, false),
  });
}

window.FlexoCharts = {
  destroyChart,
  renderRevenueExpenseChart,
  renderLineChart,
  renderGroupedBarChart,
  renderDoughnutChart,
  renderStackedChart,
};
