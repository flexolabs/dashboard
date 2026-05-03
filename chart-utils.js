// Chart.js theme defaults
const CHART_COLORS = {
  black:       '#000000',
  darkGray:    '#374151',
  medGray:     '#9CA3AF',
  lightGray:   '#E5E7EB',
  success:     '#10B981',
  danger:      '#EF4444',
  warning:     '#F59E0B',
  info:        '#3B82F6',
  purple:      '#8B5CF6',
  pink:        '#EC4899',
  orange:      '#F97316',
  teal:        '#14B8A6',
  indigo:      '#6366F1',
  rose:        '#F43F5E'
};

const MULTI_COLORS = [
  CHART_COLORS.black,
  CHART_COLORS.darkGray,
  CHART_COLORS.medGray,
  CHART_COLORS.info,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
  CHART_COLORS.orange,
  CHART_COLORS.teal
];

const _instances = {};

function destroyChart(id) {
  if (_instances[id]) {
    _instances[id].destroy();
    delete _instances[id];
  }
}

function destroyAllCharts() {
  Object.keys(_instances).forEach(destroyChart);
}

Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#6B7280';
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 16;

function baseOptions(extraY = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#000',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#9CA3AF' }
      },
      y: {
        grid: { color: '#F3F4F6' },
        border: { display: false, dash: [4, 4] },
        ticks: { color: '#9CA3AF', ...extraY.ticks },
        ...extraY
      }
    }
  };
}

function createBarChart(id, labels, datasets, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...baseOptions(),
      ...opts,
      plugins: { ...baseOptions().plugins, ...(opts.plugins || {}) }
    }
  });
  _instances[id] = chart;
  return chart;
}

function createLineChart(id, labels, datasets, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      ...baseOptions(),
      ...opts,
      plugins: { ...baseOptions().plugins, ...(opts.plugins || {}) }
    }
  });
  _instances[id] = chart;
  return chart;
}

function createComboChart(id, labels, barDatasets, lineDatasets, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const datasets = [
    ...barDatasets.map(d => ({ ...d, type: 'bar' })),
    ...lineDatasets.map(d => ({ ...d, type: 'line' }))
  ];
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...baseOptions(),
      ...opts,
      plugins: { ...baseOptions().plugins, ...(opts.plugins || {}) }
    }
  });
  _instances[id] = chart;
  return chart;
}

function createDoughnutChart(id, labels, data, colors = MULTI_COLORS, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { padding: 16 } },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: '#000',
          bodyColor: '#374151',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8
        }
      },
      ...opts
    }
  });
  _instances[id] = chart;
  return chart;
}

function createHorizontalBarChart(id, labels, data, color = CHART_COLORS.black, opts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: color,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: '#000',
          bodyColor: '#374151',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { color: '#9CA3AF' } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: '#374151' } }
      },
      ...opts
    }
  });
  _instances[id] = chart;
  return chart;
}

function makeBarDataset(label, data, color = CHART_COLORS.black, extra = {}) {
  return {
    label,
    data,
    backgroundColor: color,
    borderRadius: 4,
    borderSkipped: false,
    ...extra
  };
}

function makeLineDataset(label, data, color = CHART_COLORS.success, extra = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '20',
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: false,
    ...extra
  };
}
