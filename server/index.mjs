import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4180);
const HOST = process.env.HOST || "0.0.0.0";
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

// Companies shown as live examples on the landing page.
const DEMO_ISINS = [
  "INE002A01018",
  "INE467B01029",
  "INE040A01034",
  "INE009A01021",
  "INE154A01025",
  "INE062A01020",
  "INE397D01024",
];

const manifest = JSON.parse(await readFile(path.join(ROOT, "data/logos.json"), "utf8"));
const defaultLogo = await readFile(path.join(ROOT, "default.svg"), "utf8");

const byIsin = new Map();
for (const logo of manifest.logos) {
  const isin = String(logo.isin || "").toUpperCase();
  if (!isin) continue;
  const existing = byIsin.get(isin);
  // Same ISIN can be listed on both exchanges; prefer NSE for a stable answer.
  if (!existing || (existing.exchange !== "NSE" && logo.exchange === "NSE")) {
    byIsin.set(isin, logo);
  }
}

const homeTemplate = await buildHomeTemplate();
const homeByBase = new Map();

async function buildHomeTemplate() {
  const demo = DEMO_ISINS.map((isin) => byIsin.get(isin))
    .filter(Boolean)
    .map(
      (logo) =>
        `<a href="/logo/${logo.isin}/icon.svg">` +
        `<img src="/logo/${logo.isin}/icon.svg" alt="${escapeHtml(logo.company)} logo" width="28" height="28" />` +
        `<span>${escapeHtml(logo.ticker)}<small>${logo.isin}</small></span></a>`,
    )
    .join("");

  const generated = manifest.generatedAt
    ? new Date(manifest.generatedAt).toISOString().slice(0, 10)
    : "unknown";

  const html = await readFile(path.join(ROOT, "server/home.html"), "utf8");
  return html
    .replaceAll("__COUNT__", String(byIsin.size))
    .replaceAll("__GENERATED__", generated)
    .replace("__DEMO__", demo);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
}

function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function lookup(raw) {
  const isin = String(raw || "").trim().toUpperCase();
  if (!ISIN_PATTERN.test(isin)) {
    return { isin, error: { status: 400, body: { error: "invalid_isin", isin, expected: "12 characters, e.g. INE467B01029" } } };
  }
  const logo = byIsin.get(isin);
  if (!logo) {
    return { isin, error: { status: 404, body: { error: "logo_not_found", isin } } };
  }
  return { isin, logo };
}

// The icon route always answers with an image so an <img> tag never breaks; a shorter
// TTL keeps the placeholder from sticking around once a company is added to the index.
function sendDefaultLogo(res, reason) {
  res.type("image/svg+xml");
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=3600");
  res.set("X-Logo-Fallback", reason);
  res.send(defaultLogo);
}

const app = express();
app.disable("x-powered-by");
app.set("etag", "strong");

app.get("/", (req, res) => {
  const base = baseUrl(req);
  let page = homeByBase.get(base);
  if (!page) {
    page = homeTemplate.replaceAll("__BASE__", escapeHtml(base));
    homeByBase.set(base, page);
  }
  res.type("html").set("Cache-Control", "public, max-age=300").send(page);
});

app.get("/favicon.svg", (req, res) => {
  res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(ROOT, "favicon.svg"));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", logos: byIsin.size, generatedAt: manifest.generatedAt });
});

app.get("/logo/:isin/icon.svg", (req, res, next) => {
  const { logo, error } = lookup(req.params.isin);
  if (!logo) {
    sendDefaultLogo(res, error.body.error);
    return;
  }

  const filePath = path.resolve(ROOT, logo.file);
  if (!filePath.startsWith(ROOT + path.sep)) {
    sendDefaultLogo(res, "invalid_logo_path");
    return;
  }

  res.type("image/svg+xml");
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.set("X-Logo-Ticker", `${logo.exchange}:${logo.ticker}`);
  res.sendFile(filePath, (sendError) => {
    if (!sendError) return;
    if (sendError.code === "ENOENT") {
      res.removeHeader("X-Logo-Ticker");
      sendDefaultLogo(res, "logo_file_missing");
      return;
    }
    next(sendError);
  });
});

// Unlike the icon route this reports misses honestly, so clients can tell a real
// logo from the placeholder.
app.get("/logo/:isin.json", (req, res) => {
  const { logo, error } = lookup(req.params.isin);
  res.set("Access-Control-Allow-Origin", "*");
  if (!logo) {
    res.status(error.status).json(error.body);
    return;
  }

  res.set("Cache-Control", "public, max-age=86400");
  res.json({ ...logo, icon: `${baseUrl(req)}/logo/${logo.isin}/icon.svg` });
});

app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.originalUrl, docs: baseUrl(req) });
});

const server = app.listen(PORT, HOST);

// Express fires the listen callback even when the bind fails, so trust the event instead.
server.on("listening", () => {
  console.log(`logo api listening on http://localhost:${PORT} (${byIsin.size} logos)`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Free it, or start on another: PORT=4181 npm start`);
  } else if (error.code === "EACCES") {
    console.error(`Port ${PORT} requires elevated privileges. Use a port above 1023: PORT=4181 npm start`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

// Containers stop with SIGTERM; close the listener so `docker stop` does not wait out its timeout.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
