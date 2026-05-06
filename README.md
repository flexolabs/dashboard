# FlexoLabs Financial Dashboard

A lightweight, static, light-theme dashboard for Flexo Labs that reads live data from published Google Sheets tabs.

## Live data source

The dashboard uses the public Google Visualization endpoint for the published spreadsheet and loads these tabs by `gid`:

| Dashboard section | Sheet tab | gid |
| --- | --- | --- |
| Company PnL | Company PnL | `62657854` |
| Revenue | Monthly Revenue | `527351239` |
| Expenses | Monthly Expenses | `701838879` |
| Salaries | Salaries | `1002409884` |
| Cash In | Monthly Cash Inn | `1655649787` |

## Hosting

This project is plain HTML/CSS/JavaScript. Upload these files to any static hosting or cPanel public folder:

- `index.html`
- `styles.css`
- `app.js`

No build step is required.

## Local preview

```bash
python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173/>.

## Notes

- The Google Sheet tabs must remain published to the web.
- The dashboard refreshes data on page load, when the **Refresh** button is clicked, and every 10 minutes after that.
- If sheet column names change, update the parser mappings in `app.js`.
