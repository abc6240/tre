#!/usr/bin/env node
/* ============================================================================
   REFRESH THE OFFLINE FALLBACK PRICES
   ----------------------------------------------------------------------------
   Calls your deployed price Worker and rewrites every `fallbackMarket` in
   data/products.js with the current Collectr market price.

       node tools/update-fallback.js                  # uses PRICE_API from products.js
       node tools/update-fallback.js --dry-run        # show what would change
       node tools/update-fallback.js --url https://tre-collectr-proxy.you.workers.dev/prices
       node tools/update-fallback.js --token XYZ      # adds ?fresh=1 to bypass the edge cache

   Why this exists: fallbackMarket is what visitors see for the first few
   hundred milliseconds of a page load (and what they keep seeing if the
   Worker is ever down). Running this weekly keeps that number honest.

   The edit is deliberately surgical — only the digits after `fallbackMarket:`
   are replaced, so every comment and the file's formatting survive intact.
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "products.js");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};

const DRY_RUN = has("--dry-run");
const FORCE_FRESH = has("--token") || has("--fresh");
const TIMEOUT_MS = 20000;

function fail(message) {
  console.error("\n✗ " + message + "\n");
  process.exit(1);
}

(async function main() {
  if (!fs.existsSync(DATA_FILE)) fail("data/products.js not found — run this from the repo root.");

  let source = fs.readFileSync(DATA_FILE, "utf8");

  /* ---------------------------------------------------------------- config --
     Read PRICE_API and MARKUP straight out of products.js by evaluating it in
     a sandbox, so there is exactly one place these values live. */
  const vm = require("vm");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const TRE = sandbox.window.TRE_DATA;
  if (!TRE || !TRE.PRODUCTS) fail("data/products.js did not expose TRE_DATA.PRODUCTS.");

  const config = TRE.CONFIG || {};
  const apiUrl = valueOf("--url") || config.PRICE_API;
  const markup = Number(config.MARKUP) || 1.1;

  if (!apiUrl || /YOUR-WORKER/i.test(apiUrl)) {
    fail(
      "No Worker URL configured.\n" +
      "  Set PRICE_API in data/products.js to your deployed Worker, or pass\n" +
      "  --url https://tre-collectr-proxy.<you>.workers.dev/prices"
    );
  }

  const products = TRE.PRODUCTS;
  const ids = products.map((p) => p.collectrId).filter((id) => id && id !== "TODO");

  console.log("Team Rockets Exchange — fallback price refresh");
  console.log("  worker : " + apiUrl);
  console.log("  markup : " + markup + "x  (displayed price = market × markup, rounded up)");
  console.log("  items  : " + products.length + " in the catalog, " + ids.length + " with a collectrId\n");

  if (!ids.length) {
    fail(
      "No product has a real collectrId yet.\n" +
      "  Fill in the `collectrId` values in data/products.js, add the same ids to\n" +
      "  PRODUCT_IDS in worker/collectr-proxy.js, then run this again."
    );
  }

  /* ----------------------------------------------------------------- fetch -- */
  let url = apiUrl + (apiUrl.indexOf("?") === -1 ? "?" : "&") + "ids=" + encodeURIComponent(ids.join(","));
  if (FORCE_FRESH) {
    const token = valueOf("--token");
    if (!token) fail("--token needs a value (your ADMIN_TOKEN secret).");
    url += "&fresh=1&token=" + encodeURIComponent(token);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let payload;
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) fail("Worker responded HTTP " + res.status + " " + res.statusText + "\n  " + url);
    payload = await res.json();
  } catch (e) {
    fail("Could not reach the Worker: " + (e && e.message ? e.message : e) + "\n  " + url);
  } finally {
    clearTimeout(timer);
  }

  if (!payload || typeof payload !== "object" || !payload.prices) {
    fail("Worker returned an unexpected payload (no `prices` object).");
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    console.log("  ! the Worker reported " + payload.errors.length + " failed id(s):");
    payload.errors.slice(0, 5).forEach((e) => console.log("      " + e.id + ": " + e.message));
    console.log("");
  }
  if (Array.isArray(payload.rejected) && payload.rejected.length) {
    console.log("  ! " + payload.rejected.length + " id(s) are not on the Worker allowlist:");
    console.log("      " + payload.rejected.slice(0, 8).join(", "));
    console.log("      Add them to PRODUCT_IDS in worker/collectr-proxy.js.\n");
  }

  /* --------------------------------------------------------------- rewrite -- */
  let updated = 0;
  let unchanged = 0;
  const missed = [];

  products.forEach(function (p) {
    const entry = payload.prices[p.collectrId];
    const market = entry && Number(entry.market);

    if (!entry || !isFinite(market) || market <= 0) {
      missed.push(p.slug + " (" + p.collectrId + ")");
      return;
    }
    if (market === p.fallbackMarket) { unchanged++; return; }

    /* Surgical replacement: find this product's slug, then its fallbackMarket
       within the same object literal. Leaves all comments untouched. */
    const anchor = source.indexOf('slug: "' + p.slug + '"');
    if (anchor === -1) { missed.push(p.slug + " (slug not found in file)"); return; }

    const re = /fallbackMarket:\s*[0-9]+(\.[0-9]+)?/;
    const slice = source.slice(anchor);
    const match = re.exec(slice);
    if (!match) { missed.push(p.slug + " (no fallbackMarket field)"); return; }

    const start = anchor + match.index;
    const replacement = "fallbackMarket: " + market;
    const before = source.slice(0, start);
    const after = source.slice(start + match[0].length);
    source = before + replacement + after;

    const shown = Math.ceil(Math.round(market * 100 * markup) / 100);
    console.log(
      "  " + (p.slug + " ").padEnd(30, ".") +
      " $" + p.fallbackMarket + " -> $" + market +
      "   (listed $" + shown + ")"
    );
    updated++;
  });

  console.log("");
  console.log("  " + updated + " updated, " + unchanged + " already current" + (missed.length ? ", " + missed.length + " skipped" : ""));
  if (missed.length) {
    console.log("  skipped: " + missed.slice(0, 10).join(", "));
    if (missed.length > 10) console.log("           ...and " + (missed.length - 10) + " more");
  }

  if (!updated) {
    console.log("\nNothing to write — the fallback prices already match the market.\n");
    return;
  }
  if (DRY_RUN) {
    console.log("\n--dry-run: data/products.js was NOT modified.\n");
    return;
  }

  fs.writeFileSync(DATA_FILE, source, "utf8");
  console.log("\n✓ data/products.js updated.");
  console.log("  Commit and push to publish:\n");
  console.log("    git add data/products.js && git commit -m \"Refresh fallback prices\" && git push\n");
})().catch(function (e) {
  fail(e && e.stack ? e.stack : String(e));
});
