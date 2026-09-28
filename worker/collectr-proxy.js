/* ============================================================================
   COLLECTR PRICE PROXY — Cloudflare Worker
   ----------------------------------------------------------------------------
   The ONLY place that talks to Collectr. Its whole job:

       GET /prices?ids=a,b,c
       ->  { "updated": "...", "source": "collectr",
             "prices": { "a": { "market": 123.45 } }, "errors": [] }

   Why a Worker at all: GitHub Pages is static and the repo is public, so the
   Collectr API key cannot live in the site. It lives here as an encrypted
   Worker secret and never reaches the browser.

   Deploy steps are in the main README (section "Deploy the price Worker").
   ========================================================================== */

import { parseAmount, parsePricesPayload } from "../shared/price.mjs";

/* ==========================================================================
   ▼▼▼  ADAPTER — THE ONLY COLLECTR-SPECIFIC CODE IN THIS FILE  ▼▼▼
   --------------------------------------------------------------------------
   Everything below this banner is the one place that knows Collectr's shape.
   Fill in the four TODOs from your Collectr API docs. Nothing else in this
   file (or the site) needs to change when you do.

   IMPORTANT: I have deliberately NOT guessed your API's URL, header name,
   endpoint path or response field. Those are marked TODO and will throw a
   clear error in the Worker log until you fill them in.
   ========================================================================== */

/* TODO 1/4 — API base URL. Example shape only; replace with the real one:
   const COLLECTR_API_BASE = "https://api.collectr.com/v1";                  */
const COLLECTR_API_BASE = "TODO_COLLECTR_API_BASE_URL";

/* TODO 2/4 — auth header. Set BOTH the header name and how the key is
   presented. Common shapes:
     { name: "Authorization", value: `Bearer ${key}` }
     { name: "X-API-Key",     value: key }
     { name: "x-api-key",     value: key }                                   */
function collectrAuthHeader(apiKey) {
  return {
    name: "TODO_AUTH_HEADER_NAME",          // e.g. "Authorization"
    value: "TODO_AUTH_HEADER_VALUE",        // e.g. `Bearer ${apiKey}`
  };
}

/* TODO 3/4 — endpoint path for a single product id. Example shapes only:
     (id) => `/cards/${encodeURIComponent(id)}/prices`
     (id) => `/products/${encodeURIComponent(id)}?market=us`               */
function collectrPriceUrl(id) {
  return (
    COLLECTR_API_BASE.replace(/\/+$/, "") +
    "/TODO_ENDPOINT_PATH/" + encodeURIComponent(id)
  );
}

/* TODO 4/4 — where the market price sits in the JSON response.
   The dotted path is read at request time so it can also be overridden with the
   COLLECTR_MARKET_PATH variable (handy for testing, and it means an unset path
   fails LOUDLY in the logs instead of silently returning no prices).
   Example paths:
     "data.market"            -> { "data": { "market": 123.45 } }
     "prices.market.value"    -> { "prices": { "market": { "value": 123.45 } } }
     "marketPrice"            -> { "marketPrice": 123.45 }                     */
const COLLECTR_MARKET_PATH = "TODO_MARKET_FIELD";   // <-- set this one

function readPath(obj, dottedPath) {
  if (!dottedPath || dottedPath === "TODO_MARKET_FIELD") {
    throw new Error(
      "Collectr market-price path is not configured yet — set " +
      "COLLECTR_MARKET_PATH in this Worker (see TODO 4/4)."
    );
  }
  return String(dottedPath).split(".").reduce(function (acc, key) {
    return acc == null ? undefined : acc[key];
  }, obj);
}

function collectrMarketField(json, env) {
  const configured = (env && env.COLLECTR_MARKET_PATH) || COLLECTR_MARKET_PATH;
  return readPath(json, configured);
}

/**
 * Fetch one market price from Collectr.
 * @returns {Promise<{market:number}|null>} null = a valid answer of "no price"
 * @throws  {Error} on network failure / non-OK response — becomes an "errors" entry
 */
async function fetchCollectrPrice(id, env) {
  const apiKey = env && env.COLLECTR_API_KEY;
  if (!apiKey) throw new Error("COLLECTR_API_KEY secret is not set");

  const header = collectrAuthHeader(apiKey);
  const res = await upstreamFetch(resolveUpstreamUrl(id), {
    headers: {
      Accept: "application/json",
      [header.name]: header.value,
    },
    /* Never let one slow ID hold the whole batch open indefinitely. */
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error("Collectr responded " + res.status + " for id " + id);
  }

  const json = await res.json();
  const market = parseAmount(collectrMarketField(json, env));
  return market === null ? null : { market: market };
}

/* ==========================================================================
   ▲▲▲  END OF COLLECTR-SPECIFIC CODE  ▲▲▲
   ========================================================================== */

/* ---------- Test seams (used by tools/test-prices.mjs) ----------
   These are no-ops in production: they only let the offline test harness point
   the adapter at a stub instead of the real Collectr endpoint, so the Worker's
   batching, caching and error handling can be verified without credentials. */
function normalizeBase(base) {
  return String(base).replace(/\/+$/, "");
}
function resolveUpstreamUrl(id) {
  if (testApiBase) return normalizeBase(testApiBase) + "/prices/" + encodeURIComponent(id);
  return collectrPriceUrl(id);
}
let testApiBase = "";
let testFetch = null;
export function __testing(options) {
  if (options && "apiBase" in options) testApiBase = options.apiBase;
  if (options && "fetch" in options) testFetch = options.fetch;
}
/* The adapter calls this instead of global fetch, so tests can intercept. */
function upstreamFetch(url, init) {
  return (testFetch || fetch)(url, init);
}
/* Read-only view of the allowlist for the test harness. */
export function __productIds() {
  return PRODUCT_IDS.slice();
}
/* Let tests stand in for the allowlist. */
export function __setProductIds(ids) {
  PRODUCT_IDS.length = 0;
  Array.prototype.push.apply(PRODUCT_IDS, ids);
}

/* ---------- Allowlist: strangers cannot spend your Collectr quota ----------
   Paste every collectrId you use in data/products.js. The Worker refuses any
   id that is not on this list. Add ids here as you add products. */
const PRODUCT_IDS = [
  // "1234567",   <- replace with real Collectr ids
];

/* ---------- Config ---------- */
const ALLOWED_ORIGINS = [
  "https://abc6240.github.io",   // the live site
  "http://localhost:5173",       // local preview (tools/serve.js)
  "http://localhost:5177",
];
const CACHE_SECONDS = 600;       // 10 minutes, as specified
const MAX_IDS = 100;
const CACHE_PREFIX = "https://collectr-proxy.internal/prices?";

/* Localhost on any port, so `node tools/serve.js 8080` still works. */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return true;
  try {
    const u = new URL(origin);
    return (u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.protocol === "http:";
  } catch (e) {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, request, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        /* Match the edge cache TTL so browsers also hold it briefly. */
        "Cache-Control": status === 200 ? "public, max-age=" + CACHE_SECONDS : "no-store",
      },
      corsHeaders(request),
      extra || {}
    ),
  });
}

/* Constant-time-ish compare so the admin token is not trivially guessable. */
function tokenMatches(provided, expected) {
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function parseIds(searchParams) {
  const raw = searchParams.get("ids") || "";
  const seen = {};
  const valid = [];
  const rejected = [];
  raw.split(",").forEach(function (piece) {
    const id = piece.trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    if (PRODUCT_IDS.indexOf(id) === -1) rejected.push(id);
    else valid.push(id);
  });
  return { valid: valid.slice(0, MAX_IDS), rejected: rejected };
}

async function buildPrices(ids, env) {
  const settled = await Promise.allSettled(
    ids.map(function (id) { return fetchCollectrPrice(id, env); })
  );

  const prices = {};
  const errors = [];
  let failed = 0;

  settled.forEach(function (result, i) {
    const id = ids[i];
    if (result.status === "fulfilled") {
      if (result.value) prices[id] = { market: result.value.market };
      return;
    }
    failed++;
    errors.push({
      id: id,
      message: String((result.reason && result.reason.message) || result.reason || "unknown error"),
    });
  });

  const body = {
    updated: new Date().toISOString(),
    source: "collectr",
    prices: prices,
    errors: errors,
  };
  /* Only cache a clean sweep. A partial failure must not be frozen for 10
     minutes, or one flaky Collectr call would poison every page load. */
  return { body: body, cacheable: failed === 0 };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, request);
    }
    if (url.pathname !== "/prices" && url.pathname !== "/") {
      return json({ error: "not_found", hint: "GET /prices?ids=ID1,ID2" }, 404, request);
    }

    /* ---- force-refresh, admin only ---- */
    const wantFresh = url.searchParams.get("fresh") === "1";
    if (wantFresh) {
      const provided = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
      if (!tokenMatches(provided, env && env.ADMIN_TOKEN)) {
        return json({ error: "forbidden", hint: "?fresh=1 needs a valid admin token" }, 403, request);
      }
    }

    const parsed = parseIds(url.searchParams);
    if (!parsed.valid.length) {
      return json(
        {
          updated: new Date().toISOString(),
          source: "collectr",
          prices: {},
          errors: [],
          rejected: parsed.rejected,
          hint: parsed.rejected.length
            ? "None of those ids are on the Worker allowlist."
            : "Pass ?ids=ID1,ID2 — and add your ids to PRODUCT_IDS in the Worker.",
        },
        200,
        request
      );
    }

    /* ---- edge cache lookup (keyed by the sorted id list) ---- */
    const cacheKey = new Request(CACHE_PREFIX + parsed.valid.slice().sort().join(","));
    const cache = typeof caches !== "undefined" ? caches.default : null;

    if (cache && !wantFresh) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const body = await hit.text();
        return new Response(body, {
          status: 200,
          headers: Object.assign(
            { "Content-Type": "application/json; charset=utf-8", "X-Cache": "HIT" },
            corsHeaders(request)
          ),
        });
      }
    }

    const { body, cacheable } = await buildPrices(parsed.valid, env);
    if (parsed.rejected.length) body.rejected = parsed.rejected;

    const response = json(body, 200, request, { "X-Cache": wantFresh ? "BYPASS" : "MISS" });

    if (cache && cacheable) {
      const toCache = new Response(JSON.stringify(body), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=" + CACHE_SECONDS,
        },
      });
      const put = cache.put(cacheKey, toCache);
      if (ctx && ctx.waitUntil) ctx.waitUntil(put);
      else await put;
    }

    return request.method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  },
};
