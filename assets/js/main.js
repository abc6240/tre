/* ============================================================================
   TEAM ROCKETS EXCHANGE — site behaviour
   ----------------------------------------------------------------------------
   ES module. No dependencies, no build step.

   Reads:  window.TRE_DATA  (data/products.js — catalog + config)
   Prices: shared/price.mjs (same maths the Cloudflare Worker uses)

   The price lifecycle, in order:
     1. paint every card from fallbackMarket, marked "updating…" (shimmer)
     2. if localStorage has a newer recent sync, paint that instead
     3. fetch the Worker once for every real collectrId (5s timeout)
     4. patch prices IN PLACE — no re-render, so there is no layout shift and
        the entrance animations never replay
     5. on failure keep whatever we had and say "Prices last updated <date>"
   A price is never blank, $0 or NaN at any point.
   ========================================================================== */

import {
  listedPrice, formatUSD, parsePricesPayload, relativeTime, shortDate,
} from "../../shared/price.mjs";

const D = window.TRE_DATA || {};
const PRODUCTS = D.PRODUCTS || [];
const CATEGORIES = D.CATEGORIES || [];
const CONFIG = D.CONFIG || { PRICE_API: "", MARKUP: 1.1, CURRENCY: "USD" };
const IG = D.INSTAGRAM_URL || "https://www.instagram.com/teamrocketsexchange/";
const COLLECTR = D.COLLECTR_URL || "https://app.getcollectr.com/showcase/profile/@teamrocketsexchange";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const imageFor = (p) => "assets/products/_placeholders/" + p.slug + ".svg";
const isPlaceholderApi = (url) => !url || !/^https?:\/\//.test(url) || /YOUR-WORKER/i.test(url);

/* ==========================================================================
   1. PRICE STATE
   ========================================================================== */
/* slug -> array of {card, price, note}. A product can appear in BOTH grids at
   once, so each slug maps to every live instance of it and a price patch
   updates all of them. Keying by slug alone would leave one grid stale. */
const nodes = new Map();

/* ==========================================================================
   1. PRICE STATE
   ========================================================================== */
const prices = { live: {}, updated: null, synced: false, offline: true };

/* The best market number we have for a product right now. */
function effectiveMarket(p) {
  const live = prices.live[p.collectrId];
  if (live && typeof live.market === "number") return live.market;
  return p.fallbackMarket;
}
function priceOf(p) {
  const value = listedPrice(effectiveMarket(p), CONFIG.MARKUP);
  return value === null ? null : formatUSD(value);
}
const isPending = (p) => prices.offline || !prices.live[p.collectrId];

function syncLabel() {
  if (prices.synced && prices.updated) {
    const rel = relativeTime(prices.updated);
    return "Live prices · synced from Collectr · updated " + (rel || "just now");
  }
  return "Prices last updated " + shortDate(prices.updated || Date.now());
}

/* ==========================================================================
   2. RENDER — built once at boot; prices are patched afterwards
   ========================================================================== */
function dmLink(p) {
  const msg = "Hi Team Rockets Exchange! I'm interested in the " + p.name +
    " (" + p.set + (p.number ? " " + p.number : "") + ")" +
    (p.grade && p.grade !== "Raw" ? " — " + p.grade : "") +
    ". Is it still available?";
  return IG + "?text=" + encodeURIComponent(msg);
}
function altFor(p) {
  const bits = [p.name];
  if (p.set) bits.push(p.set + (p.number ? " " + p.number : ""));
  const line = bits.join(" — ");
  return p.grade && p.grade !== "Raw" ? line + ", " + p.grade : line;
}

/* Grade chip text. "Raw" and "Sealed" describe the product, not a slab label,
   so they get softer treatment in the chip styling. */
function gradeLabel(p) {
  return p.grade || "";
}

function cardHTML(p, lazy) {
  const state = prices.offline ? "pending" : (prices.live[p.collectrId] ? "live" : "pending");
  const price = priceOf(p) || "—";
  return '' +
    '<article class="card" data-slug="' + esc(p.slug) + '">' +
      '<button class="card-open" type="button" data-open="' + esc(p.slug) + '" aria-label="View details for ' + esc(p.name) + '"><span>View details</span></button>' +

      '<div class="card-media">' +
        '<img src="' + esc(imageFor(p)) + '" alt="' + esc(altFor(p)) + '" width="630" height="880"' +
          (lazy ? ' loading="lazy"' : ' fetchpriority="high"') + ' decoding="async" />' +
        '<span class="holo" aria-hidden="true"></span>' +
        '<span class="spot" aria-hidden="true"></span>' +
        (p.badge ? '<span class="badge">' + esc(p.badge) + "</span>" : "") +
        (gradeLabel(p) ? '<span class="grade-chip' + (p.grade === "Raw" || p.grade === "Sealed" ? " is-soft" : "") + '">' + esc(gradeLabel(p)) + "</span>" : "") +
      '</div>' +

      '<div class="card-body">' +
        '<p class="card-set">' + esc(p.set) + (p.number ? " · " + esc(p.number) : "") + "</p>" +
        '<h3 class="card-name">' + esc(p.name) + "</h3>" +
        '<div class="card-price-wrap">' +
          '<span class="price" data-price="' + esc(p.slug) + '" data-state="' + state + '"' +
            (state === "pending" ? ' aria-label="Price updating"' : "") + ">" + esc(price) + "</span>" +
          '<span class="price-note" data-note>' + (state === "pending" ? "Updating…" : "Final price confirmed in DMs") + "</span>" +
        "</div>" +
        '<div class="card-foot">' +
          '<a class="card-cta" href="' + esc(dmLink(p)) + '" target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></svg>' +
            "DM to buy</a>" +
        "</div>" +
      "</div>" +
    "</article>";
}

function renderGrid(el, list, eagerFirst) {
  if (!el) return;
  el.innerHTML = list.map(function (p, i) {
    return cardHTML(p, !(eagerFirst && i === 0));
  }).join("");

  /* Register every instance so price patches can reach all of them. */
  $$(".card", el).forEach(function (card) {
    const slug = card.getAttribute("data-slug");
    if (!nodes.has(slug)) nodes.set(slug, []);
    nodes.get(slug).push({
      card: card,
      price: $("[data-price]", card),
      note: $("[data-note]", card),
    });
  });

  if (canHover && !reduceMotion) $$(".card", el).forEach(attachPointerFX);
}

function featuredList() {
  const f = PRODUCTS.filter((p) => p.featured);
  return f.length ? f : PRODUCTS.slice();
}

/* ==========================================================================
   3. SORTING + FILTERING (inventory grid)
   ========================================================================== */
const inv = { filter: "All", sort: "featured" };

function inventoryList() {
  let list = inv.filter === "All" ? PRODUCTS.slice() : PRODUCTS.filter((p) => p.category === inv.filter);

  if (inv.sort === "price-desc") {
    list.sort((a, b) => (listedPrice(effectiveMarket(b), CONFIG.MARKUP) || 0) - (listedPrice(effectiveMarket(a), CONFIG.MARKUP) || 0));
  } else if (inv.sort === "price-asc") {
    list.sort((a, b) => (listedPrice(effectiveMarket(a), CONFIG.MARKUP) || 0) - (listedPrice(effectiveMarket(b), CONFIG.MARKUP) || 0));
  } else {
    /* Featured: featured items first, then the catalog order. */
    list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  }
  return list;
}

let inventoryShown = [];

function paintInventory() {
  const grid = $('[data-grid="inventory"]');
  inventoryShown = inventoryList();
  renderGrid(grid, inventoryShown, false);
  const empty = $("[data-empty]");
  if (empty) empty.hidden = inventoryShown.length !== 0;
  revealNow(inventoryShown);
  animIn(grid);
}

/* ==========================================================================
   4. PRICE PATCHING — no re-render, so nothing shifts
   ========================================================================== */
function paintCard(p) {
  const entries = nodes.get(p.slug);
  if (!entries || !entries.length) return;
  const money = priceOf(p) || "—";
  /* "Updating…" is only honest while a fetch is actually in flight. Once we
     have settled — live or offline — the note reverts to the DM caveat. */
  const pending = !prices.offline && isPending(p);
  const fetching = !prices.offline && !prices.synced;

  /* drop instances whose grid has since been re-rendered */
  const live = entries.filter((e) => document.contains(e.card));
  nodes.set(p.slug, live);

  live.forEach(function (entry) {
    if (!entry.price) return;
    entry.price.classList.toggle("is-syncing", pending);
    entry.price.textContent = money;
    entry.price.setAttribute("data-state", pending ? "pending" : "live");
    if (pending) entry.price.setAttribute("aria-label", "Price updating");
    else entry.price.removeAttribute("aria-label");
    if (entry.note) entry.note.textContent = fetching ? "Updating…" : "Final price confirmed in DMs";
  });
}

function paintAllPrices() {
  PRODUCTS.forEach(paintCard);
  paintStatus();
  paintCategoryFrom();
  paintLightboxPrice();
}

function paintStatus() {
  const el = $("[data-price-status]");
  const text = $("[data-price-status-text]");
  if (!el || !text) return;
  el.setAttribute("data-state", prices.synced ? "live" : (prices.offline ? "offline" : "stale"));
  text.textContent = syncLabel();
}

/* "from $X" on each category tile = lowest live price in that drawer */
function paintCategoryFrom() {
  CATEGORIES.forEach(function (cat) {
    const out = $('[data-cat-price="' + cat + '"]');
    if (!out) return;
    const list = PRODUCTS.filter((p) => p.category === cat);
    let min = null;
    list.forEach(function (p) {
      const v = listedPrice(effectiveMarket(p), CONFIG.MARKUP);
      if (v !== null && (min === null || v < min)) min = v;
    });
    out.textContent = min === null ? "—" : "from " + formatUSD(min);
  });
}

/* ==========================================================================
   5. LIVE SYNC
   ========================================================================== */
const LS_KEY = "tre.prices.v1";
const LS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const payload = parsePricesPayload(parsed && parsed.payload);
    if (!payload || !payload.updated) return null;
    const age = Date.now() - Date.parse(payload.updated);
    if (!isFinite(age) || age > LS_MAX_AGE_MS) return null;   /* too stale to trust */
    return payload;
  } catch (e) {
    return null;                                              /* private mode, quota, junk */
  }
}
function writeCache(payload) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ payload: payload, at: Date.now() }));
  } catch (e) { /* storage disabled — the site still works */ }
}

function applyPayload(payload, synced) {
  prices.live = payload.prices || {};
  prices.updated = payload.updated || new Date().toISOString();
  prices.synced = !!synced;
  prices.offline = false;
}

async function fetchPrices() {
  if (isPlaceholderApi(CONFIG.PRICE_API)) {
    /* No Worker configured yet: keep the offline fallback and say so. Never
       fire a request at a URL we know is a placeholder. */
    prices.offline = true;
    paintAllPrices();
    return;
  }

  const ids = PRODUCTS.map((p) => p.collectrId).filter((id) => id && id !== "TODO");
  if (!ids.length) {
    prices.offline = true;
    paintAllPrices();
    return;
  }

  const controller = new AbortController();
  /* 5s by default (CONFIG.FETCH_TIMEOUT_MS lets the test fixture shorten it) */
  const timeoutMs = Number(CONFIG.FETCH_TIMEOUT_MS) > 0 ? Number(CONFIG.FETCH_TIMEOUT_MS) : 5000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = CONFIG.PRICE_API + (CONFIG.PRICE_API.indexOf("?") === -1 ? "?" : "&") + "ids=" + encodeURIComponent(ids.join(","));
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("price API responded " + res.status);

    const payload = parsePricesPayload(await res.json());
    if (!payload) throw new Error("price API returned an unusable payload");

    const got = Object.keys(payload.prices).length;
    if (!got) {
      /* Worker answered but recognised none of our ids — keep fallbacks and
         surface the reason rather than pretending we synced. */
      prices.offline = got === 0 && (payload.errors || []).length > 0;
      if (prices.offline) { paintAllPrices(); return; }
    }
    applyPayload(payload, true);
    writeCache(payload);
  } catch (e) {
    /* timeout, offline, CORS, bad JSON — all end up here */
    prices.synced = false;
    prices.offline = true;
  } finally {
    clearTimeout(timer);
  }
  paintAllPrices();
}

/* ==========================================================================
   6. CATEGORY TILES
   ========================================================================== */
function buildCategories() {
  const wrap = $("[data-cat-grid]");
  if (!wrap) return;
  const IMG = {
    Graded: "charizard-base-set",
    Vintage: "blastoise-base-set",
    Modern: "umbreon-vmax",
    Sealed: "evolving-skies-booster-box",
  };
  wrap.innerHTML = CATEGORIES.map(function (cat) {
    const list = PRODUCTS.filter((p) => p.category === cat);
    const n = list.length;
    const src = "assets/products/_placeholders/" + (IMG[cat] || list[0].slug) + ".svg";
    const label = cat + " — view " + n + (n === 1 ? " piece" : " pieces");
    return '' +
      '<button class="cat-card" type="button" data-cat="' + esc(cat) + '" aria-label="' + esc(label) + '">' +
        '<span class="cat-thumb">' +
          '<img src="' + esc(src) + '" alt="' + esc(cat) + " — " + esc(n) + ' pieces in the vault" width="630" height="880" loading="lazy" decoding="async" />' +
          '<span class="cat-count">' + n + (n === 1 ? " piece" : " pieces") + "</span>" +
        "</span>" +
        '<span class="cat-body">' +
          '<span class="cat-name">' + esc(cat) + "</span>" +
          '<span class="cat-price" data-cat-price="' + esc(cat) + '">—</span>' +
          '<span class="cat-link">View drawer' +
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>' +
          "</span>" +
        "</span>" +
      "</button>";
  }).join("");
}

/* ==========================================================================
   7. FILTER CHIPS + SORT
   ========================================================================== */
function buildChips() {
  const row = $("[data-chips]");
  if (!row) return;
  const options = [{ id: "All", n: PRODUCTS.length }].concat(
    CATEGORIES.map((c) => ({ id: c, n: PRODUCTS.filter((p) => p.category === c).length }))
  );
  row.innerHTML = options.map(function (o) {
    return '<button class="chip" type="button" data-filter="' + esc(o.id) + '" aria-pressed="' +
      (o.id === inv.filter ? "true" : "false") + '">' + esc(o.id) +
      '<span class="chip-count">' + o.n + "</span></button>";
  }).join("");

  row.addEventListener("click", function (e) {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    inv.filter = chip.getAttribute("data-filter");
    $$("[data-filter]", row).forEach(function (c) {
      c.setAttribute("aria-pressed", c.getAttribute("data-filter") === inv.filter ? "true" : "false");
    });
    paintInventory();
  });
}

/* ==========================================================================
   8. LIGHTBOX
   ========================================================================== */
const lb = $("[data-lightbox]");
const panel = $("[data-lb-panel]");
let lbList = [];
let lbIndex = -1;
let lastFocus = null;
let zoomed = false;

function openLightbox(slug, list) {
  if (!lb) return;
  lbList = list && list.length ? list : PRODUCTS.slice();
  lbIndex = lbList.findIndex((p) => p.slug === slug);
  if (lbIndex < 0) lbIndex = 0;

  const active = document.activeElement;
  lastFocus = active && active !== document.body && active !== document.documentElement ? active : null;

  paintLightbox();
  lb.hidden = false;
  document.body.classList.add("is-locked");
  const close = $(".lightbox-close", lb);
  if (close) close.focus();
}

function paintLightbox() {
  const p = lbList[lbIndex];
  if (!p) return;
  setZoom(false);

  const img = $("[data-lb-img]", lb);
  img.alt = altFor(p);
  img.src = imageFor(p);

  $("[data-lb-name]", lb).textContent = p.name;
  $("[data-lb-set]", lb).textContent = p.set + (p.number ? " · " + p.number : "");
  const meta = $("[data-lb-meta]", lb);
  meta.textContent = p.badge ? p.badge : "";
  meta.hidden = !p.badge;

  row("[data-lb-grade-row]", "[data-lb-grade]", p.grade);
  row("[data-lb-cat-row]", "[data-lb-cat]", p.category);
  $("[data-lb-avail]", lb).textContent = "Available — ask in DM";
  $("[data-lb-source]", lb).textContent = isPending(p) ? "Collectr market + 10% (offline estimate)" : "Collectr market + 10%, live";

  const dm = $("[data-lb-dm]", lb);
  if (dm) dm.setAttribute("href", dmLink(p));

  const prev = $("[data-lb-prev]", lb);
  const next = $("[data-lb-next]", lb);
  const single = lbList.length < 2;
  if (prev) prev.disabled = single;
  if (next) next.disabled = single;

  paintLightboxPrice();
}
function paintLightboxPrice() {
  const p = lbList[lbIndex];
  const out = $("[data-lb-price]", lb);
  if (p && out) out.textContent = priceOf(p) || "—";
}
function row(rowSel, valSel, value) {
  const r = $(rowSel, lb);
  if (!r) return;
  r.hidden = !value;
  if (value) $(valSel, lb).textContent = value;
}
function setZoom(on) {
  zoomed = !!on;
  const btn = $("[data-lb-zoom]", lb);
  if (!btn) return;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Zoom out of the card image" : "Zoom in on the card image");
}
function stepLightbox(dir) {
  if (lbList.length < 2) return;
  lbIndex = (lbIndex + dir + lbList.length) % lbList.length;
  paintLightbox();
}
function closeLightbox() {
  if (!lb || lb.hidden) return;
  lb.hidden = true;
  document.body.classList.remove("is-locked");
  setZoom(false);
  if (lastFocus && document.contains(lastFocus) && lastFocus.focus) {
    lastFocus.focus({ preventScroll: true });
    if (document.activeElement !== lastFocus) lastFocus.focus();
  }
  lastFocus = null;
  lbIndex = -1;
}
function trapFocus(e) {
  if (!panel) return;
  const items = $$('a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])', panel)
    .filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ==========================================================================
   9. POINTER FX — spotlight, gentle tilt, holo wash (desktop, motion-safe)
   ========================================================================== */
function attachPointerFX(card) {
  const spot = $(".spot", card);
  const holo = $(".holo", card);
  if (!spot || !holo) return;
  let rect = null, raf = null, px = 0.5, py = 0.5;

  function paint() {
    raf = null;
    card.style.transform = "perspective(1000px) rotateX(" + ((0.5 - py) * 6).toFixed(2) +
      "deg) rotateY(" + ((px - 0.5) * 8).toFixed(2) + "deg) translateY(-5px)";
    spot.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
    spot.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    holo.style.setProperty("--hx", (px * 100).toFixed(1) + "%");
    holo.style.setProperty("--hy", (py * 100).toFixed(1) + "%");
  }
  card.addEventListener("pointerenter", function () { rect = card.getBoundingClientRect(); });
  card.addEventListener("pointermove", function (e) {
    if (!rect) rect = card.getBoundingClientRect();
    px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (!raf) raf = requestAnimationFrame(paint);
  });
  card.addEventListener("pointerleave", function () {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    card.style.transform = "";
    rect = null;
  });
  window.addEventListener("resize", function () { rect = null; }, { passive: true });
}

/* ==========================================================================
   10. MOTION HELPERS
   ========================================================================== */
function animIn(root) {
  $$(".card", root).forEach(function (c, i) {
    if (reduceMotion) { c.classList.add("is-in"); return; }
    c.style.animationDelay = Math.min(i * 40, 320) + "ms";
    requestAnimationFrame(function () { c.classList.add("is-in"); });
  });
}
function revealNow(list) {
  $$("[data-reveal]").forEach(function (el) {
    if (reduceMotion) { el.classList.add("is-in"); return; }
    const io = el._io;
    if (io) io.observe(el);
  });
}
function reveals() {
  const items = $$("[data-reveal]");
  items.forEach(function (el) {
    const d = el.getAttribute("data-reveal-delay");
    if (d) el.style.setProperty("--reveal-delay", d + "ms");
  });
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add("is-in"); io.unobserve(entry.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  $$("[data-reveal]").forEach(function (el) { el._io = io; io.observe(el); });
}

/* ==========================================================================
   11. HEADER / NAV / LINKS
   ========================================================================== */
function closeNav() {
  const toggle = $("[data-nav-toggle]");
  const nav = $("#primaryNav");
  if (nav && nav.classList.contains("is-open")) {
    nav.classList.remove("is-open");
    if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open menu"); }
  }
}

function wireStaticLinks() {
  $$("[data-ig]").forEach(function (a) { a.setAttribute("href", IG); });
  $$("[data-collectr]").forEach(function (a) { a.setAttribute("href", COLLECTR); });
  const year = $("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
}

/* ==========================================================================
   12. BOOT
   ========================================================================== */
function bind() {
  /* card detail via one delegated listener per grid */
  $$("[data-grid]").forEach(function (grid) {
    const isInv = grid.getAttribute("data-grid") === "inventory";
    grid.addEventListener("click", function (e) {
      const open = e.target.closest("[data-open]");
      if (open) openLightbox(open.getAttribute("data-open"), isInv ? inventoryShown : featuredList());
    });
  });

  const sort = $("[data-sort]");
  if (sort) sort.addEventListener("change", function () { inv.sort = sort.value; paintInventory(); });

  $$("[data-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      inv.filter = btn.getAttribute("data-cat");
      $$("[data-filter]").forEach(function (c) {
        c.setAttribute("aria-pressed", c.getAttribute("data-filter") === inv.filter ? "true" : "false");
      });
      paintInventory();
      const invSection = $("#inventory");
      if (invSection) invSection.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  if (lb) {
    $$("[data-lightbox-close]", lb).forEach((el) => el.addEventListener("click", closeLightbox));
    const prev = $("[data-lb-prev]", lb);
    const next = $("[data-lb-next]", lb);
    const zoom = $("[data-lb-zoom]", lb);
    if (prev) prev.addEventListener("click", () => stepLightbox(-1));
    if (next) next.addEventListener("click", () => stepLightbox(1));
    if (zoom) zoom.addEventListener("click", () => setZoom(!zoomed));

    let x0 = null;
    panel.addEventListener("touchstart", (e) => { x0 = e.changedTouches[0].clientX; }, { passive: true });
    panel.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45 && !zoomed) stepLightbox(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeLightbox(); closeNav(); return; }
    if (!lb || lb.hidden) return;
    if (e.key === "Tab") { trapFocus(e); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepLightbox(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); stepLightbox(1); }
  });

  const toggle = $("[data-nav-toggle]");
  const nav = $("#primaryNav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    $$("a", nav).forEach((a) => a.addEventListener("click", closeNav));
  }

  const header = $("[data-header]");
  const sticky = $("[data-sticky-dm]");
  const onScroll = function () {
    const y = window.scrollY || document.documentElement.scrollTop;
    if (header) header.classList.toggle("is-stuck", y > 20);
    if (sticky) sticky.classList.toggle("is-visible", y > 420);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function boot() {
  $$("[data-monogram]").forEach(function (el) { el.innerHTML = monogramSVG(el.getAttribute("data-monogram")); });
  wireStaticLinks();
  buildCategories();
  buildChips();

  /* 1 — immediate paint from fallbackMarket (or a fresher local sync) */
  const cached = readCache();
  if (cached) applyPayload(cached, false);
  else prices.offline = true;

  renderGrid($('[data-grid="featured"]'), featuredList(), true);
  paintInventory();
  paintAllPrices();
  animIn($('[data-grid="featured"]'));

  bind();
  reveals();

  /* 2 — go get live prices */
  fetchPrices();
}

/* The monogram, inlined so it needs no extra request. */
function monogramSVG(size) {
  const s = parseInt(size, 10) || 64;
  const uid = "m" + s + Math.random().toString(36).slice(2, 7);
  return '' +
    '<svg viewBox="0 0 120 120" width="' + s + '" height="' + s + '" role="img" aria-label="Team Rockets Exchange monogram" focusable="false">' +
      '<defs>' +
        '<linearGradient id="' + uid + 'g" x1="14%" y1="0%" x2="86%" y2="100%">' +
          '<stop offset="0%" stop-color="#f4e6c4"/><stop offset="38%" stop-color="#d8b672"/>' +
          '<stop offset="72%" stop-color="#a8873f"/><stop offset="100%" stop-color="#e8d5a8"/>' +
        '</linearGradient>' +
        '<radialGradient id="' + uid + 'f" cx="50%" cy="34%" r="62%">' +
          '<stop offset="0%" stop-color="#d8b672" stop-opacity=".2"/>' +
          '<stop offset="100%" stop-color="#d8b672" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<circle cx="60" cy="60" r="55" fill="none" stroke="url(#' + uid + 'g)" stroke-width="1.1" opacity=".75"/>' +
      '<circle cx="60" cy="60" r="47.5" fill="url(#' + uid + 'f)" stroke="#c1121f" stroke-opacity=".5" stroke-width=".9"/>' +
      /* orbital ticks — a quiet nod to the villain motif */
      '<path d="M60 5.5v6M60 108.5v6M5.5 60h6M108.5 60h6" stroke="url(#' + uid + 'g)" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' +
      '<g fill="none" stroke="url(#' + uid + 'g)" stroke-linecap="square" stroke-linejoin="miter">' +
        '<path d="M46.5 89V39.5h15.2c6.1 0 10.1 3.6 10.1 9.2 0 4.4-2.4 7.6-6.4 8.8L76.5 89" stroke-width="6.2"/>' +
        '<path d="M59.5 57.5h5.6" stroke-width="6.2"/>' +
      '</g>' +
      '<path d="M80.5 81.5 89 91" stroke="#c1121f" stroke-width="2" stroke-linecap="round" opacity=".9"/>' +
    '</svg>';
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
