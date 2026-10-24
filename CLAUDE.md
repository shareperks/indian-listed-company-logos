# indian-listed-company-logos (logo_api)

Express API serving SVG/PNG/JPG logos for NSE and BSE listed companies, addressed by ISIN:
`/logo/{isin}/icon.svg`. Fallback: `default.svg`. Prod: https://company-logo.shareperks.in (port 4180).

- `nse/`, `bse/`: logo files. `data/`: generated index. `tools/`: data build/validation.
- `server/`: the Express app.
- Commands: `npm install` · `npm run build:data` · `npm run validate` · `npm run dev`.

After adding logos, run `build:data` then `validate` before committing. Push to `main` deploys.
