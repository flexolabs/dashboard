# FlexoLabs Financial Dashboard

A professional single-page financial dashboard for FlexoLabs, a digital agency. The dashboard fetches live CSV data from five published Google Sheets and turns revenue, expenses, cash-in, salary, and PnL rows into actionable business analytics.

## Features

- Live Google Sheets CSV fetching with a five-minute localStorage cache.
- Light lavender theme, white cards, black primary accents, subtle shadows, and responsive layout.
- Global USD/PKR toggle using separate earning and spending exchange rates.
- Overview metrics for revenue, expenses, net profit, margin, YTD context, top clients, and recent transactions.
- Upwork ROI analytics, including connects pricing at `$90 / 600` and `Rs 45` per connect.
- Client analytics with service-suffix normalization, lifetime value, active/churned status, and service distribution.
- Team performance leaderboard using cash-in agent and TL commission fields.
- Expense categorization for salaries, tools/software, office, marketing, communication, and connects.
- Financial health page with burn rate, runway, break-even, OpEx ratio, exchange-rate impact, and projections.
- Chart.js visualizations with responsive canvases and themed tooltips.
- CSV export for revenue/cash-in rows.

## File Structure

```text
dashboard/
├── index.html
├── styles.css
├── app.js
├── data-fetcher.js
├── currency-converter.js
├── chart-utils.js
└── README.md
```

## Running Locally

Because the app fetches published Google Sheets over HTTPS, run it from a local web server instead of opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Data Sources

The dashboard loads these published Google Sheets in CSV format:

1. Salaries
2. Monthly Expenses
3. Monthly Cash Inn
4. Monthly Revenue
5. Company PnL

The URLs are defined in `data-fetcher.js`.

## Financial Constants

- Spending rate: `300 PKR/USD`
- Earning rate: `270 PKR/USD`
- Connect package: `$90 = 600 connects`
- Cost per connect: `$0.15` / `Rs 45`

## Deployment

Upload the static files to Netlify, Vercel, GitHub Pages, or any static hosting provider. No build step is required.

## Troubleshooting Blank or Stuck Dashboard

If the page stays on "Loading live Google Sheets data..." or the tabs do not respond, make sure the latest branch files include all JavaScript files and not only `index.html`/`README.md`.

This version does not block the dashboard UI on the Chart.js CDN. The app loads controls first, then lazy-loads charts. Google Sheets requests also have a timeout and per-sheet fallback so one blocked sheet will not freeze the entire dashboard.

If live data still does not appear on a hosted domain, open the browser console and look for `FlexoLabs sheet load warnings`. Those warnings identify whether Google CSV or the CORS fallback was blocked by the hosting environment, browser extension, or network policy.
