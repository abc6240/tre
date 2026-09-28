/* ============================================================================
   PRICE PIPELINE TESTS — no network, no credentials, no test framework.
       node tools/test-prices.mjs
   ----------------------------------------------------------------------------
   Verifies the three places price maths lives, plus the Worker's real handler:
     A. shared/price.mjs     rounding, markup, formatting, payload validation
     B. worker handler       CORS, allowlist, cache, fresh-token, partial errors
     C. data/products.js     catalog shape and the fallback/no-$0 guarantee
   Exits non-zero on failure so it can gate a deploy.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

import {
  listedPrice, formatUSD, parseAmount, parsePricesPayload, relativeTime, shortDate,
} from "../shared/price.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log("PASS  " + name); }
  else { failures.push(name); console.log("FAIL  " + name + (detail !== undefined ? "  — " + detail : "")); }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), "got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected));
}

/* ==========================================================================
   A. shared/price.mjs
   ========================================================================== */
console.log("\n— A. price maths —");
eq("9974 market @1.10 -> $10,972 (ceil)", listedPrice(9974, 1.1), 10972);
eq("3999 market @1.10 -> $4,399", listedPrice(3999, 1.1), 4399);
eq("rounds UP, never down (30 -> 33)", listedPrice(30, 1.1), 33);
eq("float noise cannot inflate a clean price (20.45 -> 23)", listedPrice(20.45, 1.1), 23);
eq("a real remainder still rounds up (10.01 -> 12)", listedPrice(10.01, 1.1), 12);
eq("never rounds a whole dollar down (100 -> 110)", listedPrice(100, 1.1), 110);
eq("tiny market still yields at least $1", listedPrice(0.01, 1.1), 1);
eq("string market is coerced", listedPrice("27", 1.1), 30);
eq("float drift does not appear", listedPrice(2294, 1.1), 2524);
eq("0 market is refused (no $0 cards)", listedPrice(0, 1.1), null);
eq("negative market is refused", listedPrice(-5, 1.1), null);
eq("NaN market is refused", listedPrice(NaN, 1.1), null);
eq("null market is refused", listedPrice(null, 1.1), null);
eq("garbage market is refused", listedPrice("n/a", 1.1), null);
eq("missing market is refused", listedPrice(undefined, 1.1), null);

eq("formatUSD drops cents", formatUSD(10972), "$10,972");
eq("formatUSD never prints NaN", formatUSD(NaN), "—");
eq("parseAmount reads a plain number", parseAmount(12.5), 12.5);
eq("parseAmount reads a money string", parseAmount("$1,234.56"), 1234.56);
eq("parseAmount rejects junk", parseAmount("n/a"), null);

const good = parsePricesPayload({ updated: "2026-01-01T00:00:00Z", source: "collectr", prices: { a: { market: 5 }, b: { market: 0 }, c: { market: "x" } } });
eq("payload keeps good prices", Object.keys(good.prices).join(","), "a");
eq("payload drops zero/junk entries", good.prices.b === undefined && good.prices.c === undefined, true);
ok("payload parses a valid date", isFinite(Date.parse(good.updated)));
eq("malformed payload returns null", parsePricesPayload({ nope: 1 }), null);
eq("null payload returns null", parsePricesPayload(null), null);
eq("relativeTime reads minutes", relativeTime(new Date(Date.now() - 180000).toISOString()), "3 min ago");
eq("relativeTime handles bad input", relativeTime("not-a-date"), null);
ok("shortDate is YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(shortDate("2026-01-05T10:00:00Z")));

/* ==========================================================================
   C. catalog (loaded first — the Worker tests reuse its ids)
   ========================================================================== */
console.log("\n— C. catalog —");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(ROOT, "data", "products.js"), "utf8"), sandbox);
const CATALOG = sandbox.window.TRE_DATA;
const PROD = CATALOG.PRODUCTS;

eq("18 products", PROD.length, 18);
eq("8 featured", PROD.filter((p) => p.featured).length, 8);
ok("every product has a slug/name/set/category/grade", PROD.every((p) => p.slug && p.name && p.set && p.category && p.grade));
ok("every product has a numeric fallbackMarket or a TODO id is allowed to", PROD.every((p) => typeof p.fallbackMarket === "number" && p.fallbackMarket > 0));
ok("no product can render $0 or NaN", PROD.every((p) => { const v = listedPrice(p.fallbackMarket, CATALOG.CONFIG.MARKUP); return Number.isFinite(v) && v >= 1; }));
ok("categories are the four agreed drawers", PROD.every((p) => CATALOG.CATEGORIES.includes(p.category)));
ok("every product declares collectrId", PROD.every((p) => typeof p.collectrId === "string"));
ok("slugs are unique", new Set(PROD.map((p) => p.slug)).size === PROD.length);
ok("a placeholder SVG exists for every slug", PROD.every((p) => {
  try { readFileSync(path.join(ROOT, "assets/products/_placeholders", p.slug + ".svg")); return true; }
  catch (e) { return false; }
}));
eq("markup is 1.10", CATALOG.CONFIG.MARKUP, 1.1);
ok("PRICE_API is a URL-shaped string", /^https?:\/\//.test(CATALOG.CONFIG.PRICE_API));
eq("instagram link points at the profile", CATALOG.INSTAGRAM_URL, "https://www.instagram.com/teamrocketsexchange/");

/* ==========================================================================
   B. the Worker's real handler, with the Collectr adapter stubbed
   ========================================================================== */
console.log("\n— B. worker —");
const worker = await import("../worker/collectr-proxy.js");

/* Build a tiny in-memory cache that mimics the Workers Cache API. */
function makeCache() {
  const store = new Map();
  return {
    puts: 0,
    async match(req) {
      const hit = store.get(req.url);
      return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
    },
    async put(req, res) {
      this.puts++;
      store.set(req.url, { body: await res.text(), headers: res.headers });
    },
  };
}

const IDS = ["9001", "9002", "9003", "9004"];
worker.__setProductIds(IDS.concat(["9005"]));

/* Stub Collectr: 9002 fails (500), 9005 answers but with no usable price. */
function stubFetch(behaviour) {
  return async (url) => {
    const id = decodeURIComponent(String(url).split("/").pop());
    const mode = behaviour[id] || "ok";
    if (mode === "http500") return new Response("boom", { status: 500 });
    if (mode === "noprice") return Response.json({ data: { market: null } });
    const market = { "9001": 9974, "9002": 3999, "9003": 100, "9004": 30, "9005": 50 }[id];
    return Response.json({ data: { market: market } });
  };
}

const DEFAULT_ENV = {
  COLLECTR_API_KEY: "test-key",
  ADMIN_TOKEN: "s3cret",
  /* stands in for TODO 4/4 while the real Collectr path is unknown */
  COLLECTR_MARKET_PATH: "data.market",
};

async function callWorker(url, env, cache, init) {
  const g = globalThis;
  const hadCaches = "caches" in g;
  const prevCaches = g.caches;
  g.caches = cache ? { default: cache } : undefined;
  try {
    return await worker.default.fetch(new Request(url, init), env || DEFAULT_ENV, {});
  } finally {
    if (hadCaches) g.caches = prevCaches; else delete g.caches;
  }
}

/* B1 — preflight + CORS */
{
  const res = await callWorker("https://w.dev/prices?ids=9001", null, null, { method: "OPTIONS", headers: { Origin: "https://abc6240.github.io" } });
  eq("OPTIONS preflight is 204", res.status, 204);
  eq("allowed origin is echoed", res.headers.get("Access-Control-Allow-Origin"), "https://abc6240.github.io");
  const bad = await callWorker("https://w.dev/prices?ids=9001", null, null, { headers: { Origin: "https://evil.example" } });
  eq("unknown origin gets NO allow-origin header", bad.headers.get("Access-Control-Allow-Origin"), null);
  const local = await callWorker("https://w.dev/prices?ids=9001", null, null, { headers: { Origin: "http://localhost:8080" } });
  eq("localhost on any port is allowed", local.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");
}

/* B2 — happy path, price shape and no-store-on-error */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({}) });
  const cache = makeCache();
  const res = await callWorker("https://w.dev/prices?ids=9001,9003,9004", null, cache);
  const body = await res.json();
  eq("200 on success", res.status, 200);
  eq("source is labelled", body.source, "collectr");
  ok("updated is an ISO timestamp", isFinite(Date.parse(body.updated)));
  eq("market for 9001", body.prices["9001"].market, 9974);
  eq("errors array is empty", body.errors.length, 0);
  eq("10-minute browser cache", res.headers.get("Cache-Control"), "public, max-age=600");
  eq("clean response was cached", cache.puts, 1);

  const hit = await callWorker("https://w.dev/prices?ids=9004,9003,9001", null, cache);
  eq("cache key ignores id order (HIT)", hit.headers.get("X-Cache"), "HIT");
  eq("cache really was reused", cache.puts, 1);
}

/* B3 — a single failure must not sink the batch, and must not be cached */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({ "9002": "http500" }) });
  const cache = makeCache();
  const res = await callWorker("https://w.dev/prices?ids=9001,9002,9003", null, cache);
  const body = await res.json();
  eq("still 200 with a partial failure", res.status, 200);
  eq("good ids still priced", Object.keys(body.prices).sort().join(","), "9001,9003");
  eq("failed id reported", body.errors.length + ":" + body.errors[0].id, "1:9002");
  ok("failure message mentions the status", /500/.test(body.errors[0].message), body.errors[0].message);
  eq("partial failure is NOT cached", cache.puts, 0);
}

/* B4 — a valid "no price" answer is not an error */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({ "9005": "noprice" }) });
  const cache = makeCache();
  const body = await (await callWorker("https://w.dev/prices?ids=9001,9005", null, cache)).json();
  eq("null market is omitted, not zeroed", body.prices["9005"], undefined);
  eq("null market is not an error", body.errors.length, 0);
  eq("a clean sweep is still cacheable", cache.puts, 1);
}

/* B5 — allowlist */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({}) });
  const body = await (await callWorker("https://w.dev/prices?ids=9001,6666,7777", null, makeCache())).json();
  eq("unknown ids are refused", body.rejected.sort().join(","), "6666,7777");
  eq("known id still served alongside", Object.keys(body.prices).join(","), "9001");
  const empty = await (await callWorker("https://w.dev/prices?ids=6666", null, makeCache())).json();
  eq("all-unknown request yields no prices", Object.keys(empty.prices).length, 0);
  eq("...and explains why", /allowlist/i.test(empty.hint), true);
}

/* B6 — ?fresh=1 is admin-gated */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({}) });
  const noToken = await callWorker("https://w.dev/prices?ids=9001&fresh=1", { COLLECTR_API_KEY: "k", ADMIN_TOKEN: "s3cret" }, makeCache());
  eq("fresh without a token is 403", noToken.status, 403);
  const badToken = await callWorker("https://w.dev/prices?ids=9001&fresh=1&token=wrong", { COLLECTR_API_KEY: "k", ADMIN_TOKEN: "s3cret" }, makeCache());
  eq("fresh with a wrong token is 403", badToken.status, 403);
  const cache = makeCache();
  const goodToken = await callWorker("https://w.dev/prices?ids=9001&fresh=1&token=s3cret", { COLLECTR_API_KEY: "k", ADMIN_TOKEN: "s3cret" }, cache);
  eq("fresh with the right token succeeds", goodToken.status, 200);
  eq("...and bypasses the cache", goodToken.headers.get("X-Cache"), "BYPASS");
  const header = await callWorker("https://w.dev/prices?ids=9001&fresh=1", { COLLECTR_API_KEY: "k", ADMIN_TOKEN: "s3cret" }, makeCache(), { headers: { "x-admin-token": "s3cret" } });
  eq("admin token also accepted as a header", header.status, 200);
}

/* B7 — missing secret degrades cleanly instead of throwing */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({}) });
  const body = await (await callWorker("https://w.dev/prices?ids=9001", {}, makeCache())).json();
  eq("no API key -> no prices", Object.keys(body.prices).length, 0);
  ok("no API key -> explained in errors", /COLLECTR_API_KEY/.test(body.errors[0].message), body.errors[0].message);
}

/* B7b — an unconfigured market path must fail loudly, never silently */
{
  worker.__testing({ apiBase: "https://stub.local", fetch: stubFetch({}) });
  const body = await (await callWorker("https://w.dev/prices?ids=9001",
    { COLLECTR_API_KEY: "k", COLLECTR_MARKET_PATH: "TODO_MARKET_FIELD" }, makeCache())).json();
  eq("unset market path -> no prices", Object.keys(body.prices).length, 0);
  ok("unset market path -> explicit error, not a silent blank",
    /market-price path is not configured/i.test(body.errors[0].message), body.errors[0].message);
  const wrongPath = await (await callWorker("https://w.dev/prices?ids=9001",
    { COLLECTR_API_KEY: "k", COLLECTR_MARKET_PATH: "data.nope.deep" }, makeCache())).json();
  eq("wrong market path -> no fabricated price", Object.keys(wrongPath.prices).length, 0);
}

/* B8 — routing and methods */
{
  eq("unknown path is 404", (await callWorker("https://w.dev/nope", null, makeCache())).status, 404);
  eq("POST is 405", (await callWorker("https://w.dev/prices?ids=9001", null, makeCache(), { method: "POST" })).status, 405);
  const noIds = await (await callWorker("https://w.dev/prices", null, makeCache())).json();
  eq("no ids -> empty, not an error", Object.keys(noIds.prices).length + noIds.errors.length, 0);
}

/* ==========================================================================
   summary
   ========================================================================== */
console.log("\n" + (passed + failures.length - failures.length) + " checks, " + failures.length + " failing");
console.log(`${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log("\nFailing:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
