/* ============================================================================
   SHARED PRICE MODULE — the single source of truth for price maths.
   ----------------------------------------------------------------------------
   Imported by:
     assets/js/main.js            (browser, <script type="module">)
     worker/collectr-proxy.js     (Cloudflare Worker)
     tools/update-fallback.js     (Node)
     tools/test-prices.mjs        (test harness)

   Keeping this in ONE file is deliberate: if the browser, the proxy and the
   offline tool each did their own rounding they would eventually disagree and
   customers would see two different prices for the same card.
   ========================================================================== */

/* Listed price = market price + markup, rounded UP to the whole dollar.

   Done in integer cents on purpose. The naive `Math.ceil(market * markup)`
   overshoots by a dollar whenever the product lands a hair above a whole
   number in binary floating point — `Math.ceil(30 * 1.1)` is 34, not 33,
   because 30 * 1.1 is 33.000000000000004. Rounding to cents first removes
   that noise, so a clean product stays clean and a real remainder still
   rounds up. */
export function roundUpToDollar(value) {
  return Math.ceil(Number(value));
}

/* The number we show. Returns null for anything unusable (missing, zero,
   negative, NaN, Infinity, a string of junk) so a bad upstream value can never
   surface as US$0.00 or US$NaN. */
export function listedPrice(market, markup) {
  const m = typeof market === "string" ? Number(market) : market;
  const k = markup == null ? 1.1 : Number(markup);
  if (typeof m !== "number" || !isFinite(m) || m <= 0) return null;
  if (!isFinite(k) || k <= 0) return null;

  const cents = Math.round(m * 100 * k);      /* exact money, float noise gone */
  if (!isFinite(cents) || cents <= 0) return null;
  return Math.ceil(cents / 100);              /* then up to the whole dollar */
}

/* $10,972 — Intl with maximumFractionDigits: 0 as specified. */
export function formatUSD(amount) {
  if (typeof amount !== "number" || !isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (e) {
    return "$" + Math.round(amount);
  }
}

/* Parse a number out of an API payload that might be a number or a string
   like "$1,234.56". Returns null when there is nothing usable. */
export function parseAmount(value) {
  if (typeof value === "number") return isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

/* Validate the /prices response shape. Both the Worker (before caching) and
   the browser (before trusting a network or localStorage payload) call this,
   because a cached body is attacker-adjacent input too. */
export function parsePricesPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.prices || typeof raw.prices !== "object") return null;

  const prices = {};
  for (const id of Object.keys(raw.prices)) {
    const entry = raw.prices[id];
    if (!entry || typeof entry !== "object") continue;
    const market = parseAmount(entry.market);
    if (market === null) continue;              /* never propagate a bad price */
    prices[id] = { market: market };
  }

  const updated = typeof raw.updated === "string" ? raw.updated : null;
  return {
    updated: updated,
    source: typeof raw.source === "string" ? raw.source : "collectr",
    prices: prices,
    errors: Array.isArray(raw.errors) ? raw.errors.slice(0, 50) : [],
  };
}

/* "3 min ago" / "2 h ago" / "on 12 Mar 2025" */
export function relativeTime(iso, now) {
  const then = Date.parse(iso);
  if (!isFinite(then)) return null;
  const seconds = Math.max(0, Math.round(((now == null ? Date.now() : now) - then) / 1000));
  if (seconds < 45) return "just now";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return mins + " min ago";
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.round(hours / 24);
  if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
  return "on " + new Date(then).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/* Local YYYY-MM-DD, for the "Prices last updated <date>" fallback line. */
export function shortDate(value) {
  const t = typeof value === "number" ? value : Date.parse(value);
  const d = isFinite(t) ? new Date(t) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
