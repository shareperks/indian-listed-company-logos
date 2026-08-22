# Indian Listed Company Logos API

An Express API that serves SVG logos for NSE and BSE listed companies, addressed by ISIN.

```text
https://{domain}/logo/{isin}/icon.svg
```

## Run

```bash
npm install
npm start        # http://localhost:4180
npm run dev      # same, with --watch
```

Set `PORT` to change the port: `PORT=8080 npm start`.

Opening the root URL in a browser serves an HTML page documenting the API, with live example icons.

## Endpoints

| Route | Returns |
| --- | --- |
| `GET /` | HTML usage docs |
| `GET /logo/{isin}/icon.svg` | The logo as `image/svg+xml`, plus `X-Logo-Ticker` (e.g. `NSE:TCS`) — or `default.svg` with `X-Logo-Fallback` when the ISIN is unknown |
| `GET /logo/{isin}.json` | Company metadata for that ISIN and the icon URL |
| `GET /health` | `{ "status": "ok", "logos": 3156, "generatedAt": "..." }` |

## Use it

```html
<img src="https://your-domain/logo/INE002A01018/icon.svg" alt="Reliance logo" width="32" height="32" loading="lazy" />
```

```js
// Always resolves — a company with no logo gets the placeholder, not a 404.
const iconUrl = (isin) => `https://your-domain/logo/${isin}/icon.svg`;

// Only if you need to tell the real logo from the placeholder:
const res = await fetch(iconUrl("INE467B01029"));
const isPlaceholder = res.headers.has("X-Logo-Fallback");
```

```bash
curl -O https://your-domain/logo/INE002A01018/icon.svg
```

## Behaviour

- ISIN is case-insensitive and validated against `^[A-Z]{2}[A-Z0-9]{9}[0-9]$`.
- **`/icon.svg` always returns an image.** An unknown or malformed ISIN gets `default.svg` with `200` and an `X-Logo-Fallback` header (`logo_not_found` or `invalid_isin`), cached for an hour rather than a day so a newly indexed company shows up quickly. An `<img>` pointed at any ISIN therefore never breaks.
- `/logo/{isin}.json` reports misses honestly — `400 invalid_isin` or `404 logo_not_found` — so use it when you need to distinguish a real logo from the placeholder.
- Logo and metadata responses send `Access-Control-Allow-Origin: *` and cache for one day.
- When an ISIN is listed on both exchanges the NSE logo wins, so a URL always returns the same file.
- The ISIN index is built once at startup from `data/logos.json`, so restart after rebuilding data.

## Docker

```bash
docker build -t logo_api .
docker run -d --name logo_api --init -p 4180:4180 -e PORT=4180 logo_api
```

The image runs as the non-root `node` user and carries a `HEALTHCHECK` that polls `/health`. Only runtime files are copied in — `tools/` and `data/logo_metadata.full.json` are excluded by `.dockerignore`.

## Deployment

`.github/workflows/deploy.yml` builds the image, pushes it to GHCR, and redeploys over SSH on every push to `main`/`master` that touches the app, the logos, or the Docker files. It also runs on `workflow_dispatch`; tag pushes (`v*`) build and push but do not deploy, so `:latest` always matches the default branch.

Required secrets:

| Secret | Scope | Purpose |
| --- | --- | --- |
| `DEPLOY_HOST` | Deploy environment | SSH host |
| `DEPLOY_USER` | Deploy environment | SSH user |
| `DEPLOY_SSH_PASSWORD` | Deploy environment | SSH password (swap the step to `key:` for key-only hosts) |
| `DEPLOY_SSH_PORT` | Deploy environment | Optional, defaults to `22` |
| `PORT` | Deploy environment | Optional, defaults to `4180` |

`GITHUB_TOKEN` handles GHCR auth, so no registry secret is needed. The deploy step pulls `:latest`, replaces the container, prunes superseded images, then polls `/health` for up to 60s — if the container does not come up the job prints the last 50 log lines and fails. An optional `/opt/logo_api/.env` on the server is passed through with `--env-file`.

## Contents

- `server/` — the Express app (`index.mjs`) and the landing page (`home.html`)
- `Dockerfile`, `.dockerignore` — container build
- `.github/workflows/deploy.yml` — build, push to GHCR, deploy over SSH
- `nse/`, `bse/` — 3156 SVG logos
- `default.svg` — placeholder served when an ISIN has no logo
- `data/logos.json` — the lookup index, generated from `data/logo_metadata.full.json`
- `tools/` — data build, validation, and scraping scripts

## Refresh the data

```bash
./tools/scrape_logo_metadata.py --refresh
npm run build:data
npm run validate
```

## Data Source

Metadata was built from TradingView's India scanner endpoint and the SVG filenames. The `oneLine` field is derived from scraped sector and industry metadata.

## Trademark Notice

Company logos and trademarks belong to their respective owners. This repository is an index for discovery and download convenience; review each company's brand usage rules before production use.
