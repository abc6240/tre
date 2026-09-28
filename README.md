# Team Rockets Exchange — showcase site

A dark-luxury showcase for a premium Pokémon collection, with **live prices synced from
Collectr** on every page load. There is no cart and no checkout — every purchase happens
in Instagram DMs.

- **Live site:** https://abc6240.github.io/tre/
- **Instagram:** https://www.instagram.com/teamrocketsexchange/
- **Listed price:** Collectr market price **+ 10%**, rounded **up** to the whole dollar.
- **Full inventory:** https://app.getcollectr.com/showcase/profile/@teamrocketsexchange

Plain HTML/CSS/JS. No frameworks, no build step for the site itself. One small
Cloudflare Worker holds your Collectr API key so it never reaches the browser.

---

## Contents

1. [How the price sync works](#1-how-the-price-sync-works)
2. [Deploy the site (GitHub Pages)](#2-deploy-the-site-github-pages)
3. [Deploy the price Worker](#3-deploy-the-price-worker-step-by-step)
4. [The five things you must fill in](#4-the-five-things-you-must-fill-in)
5. [Everyday jobs](#5-everyday-jobs)
6. [Local preview & tests](#6-local-preview--tests)
7. [File map](#7-file-map)

---

## 1. How the price sync works

```
browser ──GET /prices?ids=…──► Cloudflare Worker ──► Collectr API
   ▲                                  │  (holds the API key, caches 10 min)
   └──────── { prices: { id: { market } } } ─────────┘
```

1. The page renders **instantly** using `fallbackMarket` from `data/products.js`,
   with the price shimmering and the note reading "Updating…".
2. It also reads the last good response from `localStorage`, so a returning
   visitor sees real prices with no flicker at all.
3. It asks the Worker for every real `collectrId` (5-second timeout).
4. Prices are **patched in place** — no re-render, no layout shift — and the
   status line switches to *"Live prices · synced from Collectr · updated 3 min ago"*.
5. If the Worker is down or times out, every card keeps its fallback price and
   the status line says *"Prices last updated 2026-09-27"* instead.

A price can never render as `$0`, `NaN` or blank at any point — bad upstream values are
rejected and the fallback is kept.

**The maths lives in exactly one file, `shared/price.mjs`,** and is imported by the
browser, the Worker and the update tool. That is deliberate: if three copies each did
their own rounding, customers would eventually see two different prices for one card.

---

## 2. Deploy the site (GitHub Pages)

Already live. To publish a change:

```bash
git add -A
git commit -m "Describe the change"
git push
```

GitHub Pages redeploys itself in about a minute. Nothing to build.

---

## 3. Deploy the price Worker (step by step)

You need a free Cloudflare account. Total time: about 10 minutes.
Open **PowerShell** in this folder and run the commands in order.

### Step 1 — get your Collectr API key

Log in to Collectr, find your API settings, and copy the key. Keep it somewhere safe.
**Never paste it into any file in this repo** — that is what the Worker secret is for.

### Step 2 — install Wrangler (Cloudflare's tool)

```powershell
npm install -g wrangler
```

Check it worked:

```powershell
wrangler --version
```

### Step 3 — log in to Cloudflare

```powershell
wrangler login
```

A browser window opens. Click **Allow**.

### Step 4 — fill in the four Collectr details

Open **`worker/collectr-proxy.js`**. Near the top there is a banner marked
`ADAPTER — THE ONLY COLLECTR-SPECIFIC CODE IN THIS FILE`. Fill in the four `TODO`s
using your Collectr API docs:

| TODO | What to put | Example |
| --- | --- | --- |
| 1 | API base URL | `const COLLECTR_API_BASE = "https://api.collectr.com/v1";` |
| 2 | Auth header name **and** how the key is presented | `{ name: "Authorization", value: "Bearer " + apiKey }` |
| 3 | Endpoint path for one product id | `"/cards/" + encodeURIComponent(id) + "/prices"` |
| 4 | Where the market price sits in the JSON | `const COLLECTR_MARKET_PATH = "data.market";` |

Nothing else in the Worker or the site needs to change.

> If TODO 4 is left unset the Worker will **not** silently return blank prices — every
> id comes back in `errors` with *"market-price path is not configured yet"*.

### Step 5 — put your product ids on the allowlist

Still in `worker/collectr-proxy.js`, find `PRODUCT_IDS` and paste the same ids you used
in `data/products.js`:

```js
const PRODUCT_IDS = ["1234567", "2345678", "3456789"];
```

Without this the Worker refuses every request, so nobody can spend your Collectr quota.

### Step 6 — set the two secrets

```powershell
cd worker
wrangler secret put COLLECTR_API_KEY
```
Paste your Collectr API key when prompted and press Enter. It is stored encrypted on
Cloudflare and never written to disk.

```powershell
wrangler secret put ADMIN_TOKEN
```
Invent a long random password (this is what unlocks `?fresh=1`). Save it somewhere.

### Step 7 — deploy

```powershell
wrangler deploy
```

It prints your Worker URL:

```
https://tre-collectr-proxy.<your-subdomain>.workers.dev
```

### Step 8 — test it

```powershell
curl "https://tre-collectr-proxy.<your-subdomain>.workers.dev/prices?ids=1234567"
```

You want to see `"prices":{"1234567":{"market":123.45}}`. If you see an `errors` array,
read the message — it names the exact problem (bad key, bad path, id not allowlisted).

### Step 9 — point the site at it

Open **`data/products.js`** and set:

```js
const TRE_CONFIG = {
  PRICE_API: "https://tre-collectr-proxy.<your-subdomain>.workers.dev/prices",
  MARKUP: 1.10,
  CURRENCY: "USD",
};
```

Then commit and push (section 2). The status line under **Inventory** should now read
*"Live prices · synced from Collectr"* within a few seconds of loading.

---

## 4. The five things you must fill in

| # | Where | What | Done when |
| --- | --- | --- | --- |
| 1 | `worker/collectr-proxy.js` — TODO 1–4 | Collectr base URL, auth header, endpoint path, market-price path | `curl` test returns a `market` number |
| 2 | `worker/collectr-proxy.js` — `PRODUCT_IDS` | Every collectrId you use | Worker stops returning `rejected` |
| 3 | Cloudflare secrets | `COLLECTR_API_KEY` and `ADMIN_TOKEN` | `wrangler secret list` shows both |
| 4 | `data/products.js` — `TRE_CONFIG.PRICE_API` | Your deployed Worker URL | Status line reads *"Live prices"* |
| 5 | `data/products.js` — `collectrId` on all 18 products | Each card's Collectr id (currently `"TODO"`) | Every card updates from the network |

Until #5 is done, cards with `collectrId: "TODO"` are skipped by the sync and simply
keep their fallback price — the site never breaks and never shows a wrong number.

---

## 5. Everyday jobs

**Add or edit a card** — edit `data/products.js` only. Copy a block, change the values.
Fields: `slug` (matches the image filename), `name`, `set`, `number`, `category`
(`Graded`/`Vintage`/`Modern`/`Sealed`), `grade`, `collectrId`, `fallbackMarket`,
optional `badge`, `featured`. Then add the same id to `PRODUCT_IDS` in the Worker.

**Add a product photo** — put your file at `assets/products/<slug>.jpg`, then update the
`src` in `assets/js/main.js` (function `imageFor`) to point at `.jpg` instead of the
placeholder SVG. Until then the branded placeholder SVG is the product image.

**Refresh the offline fallback prices** (do this weekly):

```bash
node tools/update-fallback.js --dry-run   # preview
node tools/update-fallback.js             # rewrite data/products.js
git add data/products.js && git commit -m "Refresh fallback prices" && git push
```

**Force an instant refresh** (bypasses the 10-minute cache):

```bash
curl "https://<your-worker>.workers.dev/prices?ids=1234567&fresh=1&token=<ADMIN_TOKEN>"
```

**Change the markup** — one number, `MARKUP` in `data/products.js`. The Worker imports
the same maths, so the site and the tool always agree.

---

## 6. Local preview & tests

```bash
node tools/serve.js                      # → http://localhost:5173
node tools/test-prices.mjs               # 78 checks: price maths + Worker handler
node tools/qa.js http://localhost:5173   # 88 checks in a real browser
```

`test-prices.mjs` stubs the Collectr adapter, so it verifies batching, the allowlist,
the 10-minute cache, the admin-gated `?fresh=1`, partial failures and the CORS rules
**without needing any credentials**. `qa.js` covers layout, filtering, sorting, the
lightbox, keyboard support, 360px mobile, and the full sync path against a mock Worker
(including what happens when the Worker is dead).

Both exit non-zero on failure, so they work as a pre-deploy gate.

---

## 7. File map

```
index.html                     markup, meta tags, both grids, lightbox
assets/css/style.css           the whole design system (tokens at the top)
assets/js/main.js              rendering, live price sync, filters, sort, lightbox
shared/price.mjs               THE price maths — markup, rounding, validation
data/products.js               ← your catalog + config (the file you edit)
worker/collectr-proxy.js       Cloudflare Worker: the only thing holding your API key
worker/wrangler.toml           Worker config
tools/update-fallback.js       refresh fallbackMarket from the live Worker
tools/test-prices.mjs          78 checks (maths + Worker)
tools/qa.js                    88 browser checks
tools/serve.js                 local preview server
assets/products/_placeholders/ the product images (one SVG per product slug)
assets/brand/                  monogram + favicon
fixture.html                   test-only page used by tools/qa.js (noindex)
```

### Notes

- **The API key is never in this repo.** It lives as an encrypted Worker secret. The
  browser only ever talks to your Worker, and the Worker only answers your site and
  `localhost`.
- **Pricing** is Collectr market + 10%, rounded up to the dollar, calculated in integer
  cents so floating-point noise can never add a phantom dollar.
- **Fan-styled. Not affiliated with or endorsed by Nintendo, Creatures Inc.,
  GAME FREAK, or The Pokémon Company.** No official logos or Pokéball marks are used.
