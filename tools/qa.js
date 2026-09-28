/* End-to-end browser check — drives the real page in headless Chrome.
     node tools/qa.js [url]
   Covers layout, filtering, sorting, lightbox, keyboard, mobile, and the live
   price pipeline (with the Worker stubbed at the network layer). Exits
   non-zero on failure so it can gate a deploy. */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
];
const url = process.argv[2] || "http://localhost:5177/";
const PORT = 9311;
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tre-qa-"));
const child = spawn(chrome, ["--headless=new","--disable-gpu","--hide-scrollbars","--no-first-run",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile], { stdio: "ignore" });

const get = (p) => new Promise((res, rej) =>
  http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail !== undefined && detail !== "" ? "  — " + detail : ""}`);
}
const section = (t) => console.log("\n— " + t + " —");

(async () => {
  let target;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await get("/json/list")).find((t) => t.type === "page"); } catch (_) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + " :: " + expr.slice(0, 90));
    return r.result.result.value;
  };
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");

  const consoleErrors = [];
  const failedRequests = [];
  const priceCalls = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") consoleErrors.push(m.params.entry.text);
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.text);
    if (m.method === "Network.responseReceived" && m.params.response.status >= 400) failedRequests.push({ status: m.params.response.status, url: m.params.response.url });
  });

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await sleep(4200);

  /* ===================== structure ===================== */
  section("structure");
  check("hero H1 present", await evalJS(`!!document.querySelector('h1')`));
  check("featured vault shows 8 cards", (await evalJS(`document.querySelectorAll('[data-grid=featured] .card').length`)) === 8, await evalJS(`document.querySelectorAll('[data-grid=featured] .card').length`));
  check("inventory shows all 18", (await evalJS(`document.querySelectorAll('[data-grid=inventory] .card').length`)) === 18);
  check("every card has a DM link", await evalJS(`[...document.querySelectorAll('.card-cta[href]')].every(a=>a.href.startsWith('https://www.instagram.com/teamrocketsexchange/'))`));
  check("DM deep link names the card", await evalJS(`document.querySelector('.card-cta').href.includes('Charizard')`));
  check("external links are noopener", await evalJS(`[...document.querySelectorAll('a[target=_blank]')].every(a=>/noopener/.test(a.rel))`));
  check("Collectr link present", await evalJS(`[...document.querySelectorAll('a')].some(a=>a.href.includes('app.getcollectr.com/showcase/profile/@teamrocketsexchange'))`));
  check("no cart / checkout CTA", !(await evalJS(`/add to (cart|bag)|view cart|proceed to (checkout|payment)|buy now/i.test(document.body.innerText)`)));
  check("sections in order", (await evalJS(`[...document.querySelectorAll('main > section')].map(s=>s.id||'closing').join(',')`)) === "hero,vault,inventory,categories,how,about,closing", await evalJS(`[...document.querySelectorAll('main > section')].map(s=>s.id||'closing').join(',')`));
  check("header has five anchors", (await evalJS(`[...document.querySelectorAll('#primaryNav a[href^="#"]')].map(a=>a.getAttribute('href')).join(',')`)) === "#vault,#inventory,#categories,#how,#about", await evalJS(`[...document.querySelectorAll('#primaryNav a[href^="#"]')].map(a=>a.getAttribute('href')).join(',')`));

  /* ===================== images ===================== */
  section("images & layout");
  await evalJS(`(async()=>{
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 500) { scrollTo(0, y); await new Promise(r=>setTimeout(r,110)); }
    scrollTo(0, 0);
    /* lazy images need a moment after they enter the viewport */
    await Promise.all([...document.images].map(i => (i.complete && i.naturalWidth) ? null
      : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
    await new Promise(r=>setTimeout(r, 600));
  })()`);
  const parsed = JSON.parse(await evalJS(`JSON.stringify([...document.querySelectorAll('.card-media img')].map(i=>({ok:i.complete&&i.naturalWidth>0, src:i.getAttribute('src')})))`));
  check("all card images resolved", parsed.every((i) => i.ok), parsed.filter((i) => !i.ok).map((i) => i.src).slice(0, 4).join(", "));
  check("cards use the 63:88 ratio", await evalJS(`[...document.querySelectorAll('.card-media')].every(m=>{const r=m.getBoundingClientRect();return Math.abs(r.width/r.height-63/88)<0.02;})`), await evalJS(`(()=>{const r=document.querySelector('.card-media').getBoundingClientRect();return (r.width/r.height).toFixed(3);})()`));
  check("only the first hero image is eager", await evalJS(`document.querySelectorAll('[data-grid=featured] .card-media img:not([loading=lazy])').length === 1`));
  check("alt text is descriptive", (await evalJS(`document.querySelector('.card-media img').alt`)) === "Charizard — Base Set Shadowless #4, PSA 9", await evalJS(`document.querySelector('.card-media img').alt`));

  /* ===================== prices ===================== */
  section("prices (no Worker configured)");
  const all = await evalJS(`[...document.querySelectorAll('.price')].map(p=>p.textContent.trim())`);
  check("every card shows a price", all.length === 26, all.length + " price nodes");
  check("no blank / NaN / $0 prices", all.every((t) => /^\$[1-9][\d,]*$/.test(t)), all.filter((t) => !/^\$[1-9][\d,]*$/.test(t)).join(", "));
  check("markup applied to fallback (9974 -> $10,972)", all.includes("$10,972"), all.slice(0, 3).join(" | "));
  check("each price carries the DM caveat", await evalJS(`[...document.querySelectorAll('.price-note')].every(n=>n.textContent.trim().length>0)`));
  check("status line admits the fallback", await evalJS(`/last updated/i.test(document.querySelector('[data-price-status-text]').textContent)`), await evalJS(`document.querySelector('[data-price-status-text]').textContent`));
  check("status reports offline", (await evalJS(`document.querySelector('[data-price-status]').getAttribute('data-state')`)) === "offline");
  check("placeholder API is never called", !(await evalJS(`performance.getEntriesByType('resource').some(e=>String(e.name).includes('YOUR-WORKER'))`)));
  check("category tiles show a from-price", await evalJS(`[...document.querySelectorAll('.cat-price')].every(e=>/^from \\$[1-9][\\d,]*$/.test(e.textContent.trim()))`), await evalJS(`[...document.querySelectorAll('.cat-price')].map(e=>e.textContent.trim()).join(' | ')`));
  check("price box is width-stable (tabular figures)", (await evalJS(`(()=>{const el=document.querySelector('.price');const w=el.getBoundingClientRect().width;el.textContent='$123,456';const w2=el.getBoundingClientRect().width;return Math.abs(w2-w);})()`)) === 0);
  check("space is reserved for the price line", (await evalJS(`document.querySelector('.card-price-wrap').getBoundingClientRect().height`)) >= 40);

  /* ===================== filtering & sorting ===================== */
  section("filtering & sorting");
  check("5 chips with counts", (await evalJS(`document.querySelectorAll('.chip').length`)) === 5, await evalJS(`[...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()).join(', ')`));
  const graded = await evalJS(`window.TRE_DATA.PRODUCTS.filter(p=>p.category==='Graded').length`);
  await evalJS(`document.querySelector('.chip[data-filter=Graded]').click()`);
  await sleep(700);
  check("chip filters the inventory", (await evalJS(`document.querySelectorAll('[data-grid=inventory] .card').length`)) === graded, `${await evalJS(`document.querySelectorAll('[data-grid=inventory] .card').length`)} of ${graded}`);
  check("pressed state moves", await evalJS(`document.querySelector('.chip[data-filter=Graded]').getAttribute('aria-pressed')==='true'`));
  check("featured grid unaffected by filter", (await evalJS(`document.querySelectorAll('[data-grid=featured] .card').length`)) === 8);
  await evalJS(`document.querySelector('.chip[data-filter=All]').click()`);
  await sleep(600);
  check("All restores 18 cards", (await evalJS(`document.querySelectorAll('[data-grid=inventory] .card').length`)) === 18);

  const desc = await evalJS(`(()=>{const s=document.querySelector('[data-sort]');s.value='price-desc';s.dispatchEvent(new Event('change'));return [...document.querySelectorAll('[data-grid=inventory] .price')].slice(0,3).map(e=>Number(e.textContent.replace(/[^0-9]/g,'')));})()`);
  check("price high→low sorts descending", desc[0] >= desc[1] && desc[1] >= desc[2], desc.join(" > "));
  const asc = await evalJS(`(()=>{const s=document.querySelector('[data-sort]');s.value='price-asc';s.dispatchEvent(new Event('change'));return [...document.querySelectorAll('[data-grid=inventory] .price')].slice(0,3).map(e=>Number(e.textContent.replace(/[^0-9]/g,'')));})()`);
  check("price low→high sorts ascending", asc[0] <= asc[1] && asc[1] <= asc[2], asc.join(" < "));
  await evalJS(`(()=>{const s=document.querySelector('[data-sort]');s.value='featured';s.dispatchEvent(new Event('change'));})()`);
  await sleep(500);
  check("featured sort leads with a featured card", await evalJS(`document.querySelector('[data-grid=inventory] .card').getAttribute('data-slug')==='charizard-base-set'`));

  /* ===================== card detail ===================== */
  section("card presentation");
  check("grade shows as a chip", (await evalJS(`document.querySelector('.grade-chip').textContent`)) === "PSA 9");
  check("Raw gets the quiet chip", await evalJS(`[...document.querySelectorAll('.grade-chip')].some(g=>g.classList.contains('is-soft') && g.textContent==='Raw')`));
  check("badge renders as a gold ribbon", (await evalJS(`document.querySelector('.badge').textContent`)) === "GRAIL");
  check("CTA invites a DM", (await evalJS(`document.querySelector('.card-cta').textContent.trim()`)) === "DM to buy");
  check("set and number shown together", await evalJS(`/Base Set Shadowless/i.test(document.querySelector('.card-set').textContent)`));
  check("hero slab fan has 3 slabs", (await evalJS(`document.querySelectorAll('.slab').length`)) === 3);
  check("hero trust bar has 3 points", (await evalJS(`document.querySelectorAll('.trust-bar li').length`)) === 3);
  check("category tiles are image-led", await evalJS(`[...document.querySelectorAll('.cat-card')].every(c=>c.querySelector('.cat-thumb img'))`));
  check("How to Buy is a 3-step timeline", (await evalJS(`document.querySelectorAll('.tl-step').length`)) === 3);

  /* ===================== lightbox ===================== */
  section("lightbox");
  await evalJS(`(()=>{const b=document.querySelector('[data-open]');b.focus();b.click();})()`);
  await sleep(800);
  check("opens on card click", await evalJS(`!document.querySelector('[data-lightbox]').hidden`));
  check("shows the right card", (await evalJS(`document.querySelector('[data-lb-name]').textContent`)) === "Charizard");
  check("shows grade, drawer and price", await evalJS(`document.querySelector('[data-lb-grade]').textContent==='PSA 9' && document.querySelector('[data-lb-cat]').textContent==='Graded' && /^\\$[1-9]/.test(document.querySelector('[data-lb-price]').textContent)`));
  check("price caveat is shown to the customer", await evalJS(`[...document.querySelectorAll('.price-note')].some(n=>/confirmed in DMs/i.test(n.textContent))`));
  check("DM link names the card", await evalJS(`document.querySelector('[data-lb-dm]').href.includes('Charizard')`));
  check("is a labelled modal", await evalJS(`document.querySelector('.lightbox-panel').getAttribute('aria-modal')==='true' && !!document.querySelector('.lightbox-panel').getAttribute('aria-labelledby')`));
  check("focus moves into the dialog", await evalJS(`document.activeElement.classList.contains('lightbox-close')`));
  check("body scroll is locked", await evalJS(`document.body.classList.contains('is-locked')`));

  await evalJS(`document.querySelector('[data-lb-zoom]').click()`);
  await sleep(500);
  check("zoom toggles on", await evalJS(`document.querySelector('[data-lb-zoom]').getAttribute('aria-pressed')==='true'`));
  await evalJS(`document.querySelector('[data-lb-zoom]').click()`);
  await sleep(400);

  check("ArrowRight moves to the next card", (await evalJS(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return new Promise(r=>setTimeout(()=>r(document.querySelector('[data-lb-name]').textContent),300));})()`)) === "Umbreon VMAX Alt Art");
  await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
  await sleep(400);
  check("ArrowLeft returns", (await evalJS(`document.querySelector('[data-lb-name]').textContent`)) === "Charizard");
  check("Tab is trapped in the dialog", await evalJS(`(()=>{const p=document.querySelector('[data-lb-panel]');const f=[...p.querySelectorAll('a[href],button:not([disabled])')].filter(e=>e.offsetParent!==null);const last=f[f.length-1];last.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));return document.activeElement===f[0];})()`));
  await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(600);
  check("Escape closes it", await evalJS(`document.querySelector('[data-lightbox]').hidden`));
  check("focus returns to the card", await evalJS(`document.activeElement.classList.contains('card-open')`));
  await evalJS(`document.querySelector('[data-open]').click()`);
  await sleep(500);
  await evalJS(`document.querySelector('.lightbox-scrim').click()`);
  await sleep(500);
  check("backdrop click closes it", await evalJS(`document.querySelector('[data-lightbox]').hidden`));

  /* ===================== header, sticky CTA, mobile ===================== */
  section("header & mobile");
  check("header gains the glass state", await evalJS(`(()=>{scrollTo(0,900);return new Promise(r=>setTimeout(()=>r(document.querySelector('.site-header').classList.contains('is-stuck')),400));})()`));
  check("sticky DM bar appears", await evalJS(`document.querySelector('.sticky-dm').classList.contains('is-visible')`));
  await evalJS(`scrollTo(0,0)`);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(700);
  check("hamburger on mobile", await evalJS(`getComputedStyle(document.querySelector('[data-nav-toggle]')).display!=='none'`));
  await evalJS(`document.querySelector('[data-nav-toggle]').click()`);
  await sleep(500);
  check("menu opens with aria-expanded", await evalJS(`document.querySelector('#primaryNav').classList.contains('is-open') && document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded')==='true'`));
  await evalJS(`document.querySelector('#primaryNav a[href="#inventory"]').click()`);
  await sleep(600);
  check("choosing a link closes the menu", await evalJS(`!document.querySelector('#primaryNav').classList.contains('is-open')`));

  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  check("no overflow at 360px", (await evalJS(`document.documentElement.scrollWidth - innerWidth`)) <= 0, await evalJS(`document.documentElement.scrollWidth - innerWidth`));
  check("360px gutter is 16px", (await evalJS(`getComputedStyle(document.querySelector('.shell')).paddingLeft`)) === "16px", await evalJS(`getComputedStyle(document.querySelector('.shell')).paddingLeft`));
  check("tap targets >= 44px", await evalJS(`[...document.querySelectorAll('.chip, .nav-toggle, .sticky-dm, .card-cta, .brand, .sort-select')].every(e=>e.getBoundingClientRect().height>=43.5)`), await evalJS(`[...document.querySelectorAll('.chip, .nav-toggle, .sticky-dm, .card-cta, .brand, .sort-select')].map(e=>Math.round(e.getBoundingClientRect().height)).join(',')`));

  /* ===================== live sync against a real mock Worker ============ */
  section("live price sync (mock Worker on 127.0.0.1:5199)");
  const mockCalls = [];
  const mock = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1:5199");
    mockCalls.push(u.search);
    const mode = (u.searchParams.get("ids") || "").indexOf("FAILME") !== -1 ? "fail" : "ok";
    const cors = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    };
    if (mode === "fail") {
      res.writeHead(500, cors).end(JSON.stringify({ error: "upstream down" }));
      return;
    }
    if (u.searchParams.get("ids") === "SLOW") { /* never answers — tests the timeout */
      return;
    }
    const ids = (u.searchParams.get("ids") || "").split(",").filter(Boolean);
    const prices = {};
    ids.forEach((id) => {
      if (id === "9001") prices[id] = { market: 12000 };   /* fallback is 9974 */
      if (id === "9002") prices[id] = { market: 2500 };    /* fallback is 3999 */
    });
    res.writeHead(200, cors).end(JSON.stringify({
      updated: new Date().toISOString(), source: "collectr", prices, errors: [],
    }));
  });
  await new Promise((r) => mock.listen(5199, "127.0.0.1", r));

  const fixture = url.replace(/\/$/, "") + "/fixture.html";
  await send("Page.navigate", { url: fixture });
  await sleep(3500);

  check("the Worker URL was called", mockCalls.length > 0, mockCalls[0] || "no call");
  check("request carries every real collectrId", /ids=[^&]*9001/.test(mockCalls[0] || ""), mockCalls[0] || "");
  check("TODO ids are skipped, not sent", !/TODO/.test(mockCalls[0] || ""));

  const pair = await evalJS(`(()=>{
    const g = document.querySelector('[data-grid=featured]');
    const byName = {};
    [...g.querySelectorAll('.card')].forEach(c => {
      byName[c.querySelector('.card-name').textContent] = {
        price: c.querySelector('.price').textContent.trim(),
        state: c.querySelector('.price').getAttribute('data-state'),
        note: c.querySelector('[data-note]').textContent.trim(),
      };
    });
    return JSON.stringify(byName);
  })()`);
  const cards = JSON.parse(pair);
  check("live price beats the fallback (12000 -> $13,200)", cards["Charizard"].price === "$13,200", cards["Charizard"].price);
  check("a lower live price also applies (2500 -> $2,750)", cards["Umbreon VMAX Alt Art"].price === "$2,750", cards["Umbreon VMAX Alt Art"].price);
  check("synced prices are marked live", cards["Charizard"].state === "live", cards["Charizard"].state);
  check("the caveat replaces 'Updating…'", /confirmed in DMs/i.test(cards["Charizard"].note), cards["Charizard"].note);
  check("unsynced cards keep their fallback", cards["Lugia"].price === "$3,053", cards["Lugia"].price);
  check("status line reports the sync", await evalJS(`/Live prices . synced from Collectr/i.test(document.querySelector('[data-price-status-text]').textContent)`), await evalJS(`document.querySelector('[data-price-status-text]').textContent`));
  check("status state is live", (await evalJS(`document.querySelector('[data-price-status]').getAttribute('data-state')`)) === "live");
  check("category from-price follows the live data", await evalJS(`[...document.querySelectorAll('.cat-price')].every(e=>/^from \\$[1-9][\\d,]*$/.test(e.textContent.trim()))`), await evalJS(`[...document.querySelectorAll('.cat-price')].map(e=>e.textContent.trim()).join(' | ')`));
  check("no $0 / NaN anywhere after sync", await evalJS(`[...document.querySelectorAll('.price')].every(p=>/^\\$[1-9][\\d,]*$/.test(p.textContent.trim()))`));
  check("a good payload was cached in localStorage", await evalJS(`!!window.localStorage.getItem('tre.prices.v1')`));

  /* reload: the cache should paint instantly and then re-sync */
  await send("Page.navigate", { url: fixture });
  await sleep(900);
  check("cached prices paint before the network answers", await evalJS(`document.querySelector('.price').textContent.trim() === '$13,200'`), await evalJS(`document.querySelector('.price').textContent.trim()`));
  await sleep(2600);
  check("still synced after the reload", (await evalJS(`document.querySelector('[data-price-status]').getAttribute('data-state')`)) === "live");

  /* failure path: Worker down must keep fallbacks, never blank or $0 */
  mock.close();
  await evalJS(`window.localStorage.clear()`);
  await send("Page.navigate", { url: fixture });
  await sleep(3500);
  const failedPrices = JSON.parse(await evalJS(`JSON.stringify([...document.querySelectorAll('.price')].map(p=>p.textContent.trim()))`));
  check("fallback prices survive a dead Worker", failedPrices.includes("$10,972"), failedPrices.slice(0, 3).join(", "));
  check("no blank / NaN / $0 on failure", failedPrices.every((t) => /^\$[1-9][\d,]*$/.test(t)), failedPrices.filter((t) => !/^\$[1-9][\d,]*$/.test(t)).join(", "));
  check("status falls back to the last-updated line", await evalJS(`/last updated/i.test(document.querySelector('[data-price-status-text]').textContent)`), await evalJS(`document.querySelector('[data-price-status-text]').textContent`));
  check("status state is not live", (await evalJS(`document.querySelector('[data-price-status]').getAttribute('data-state')`)) !== "live");

  /* ===================== console ===================== */
  section("console & requests");
  const isMissingAsset = (f) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(f.url);
  const unexpected = failedRequests.filter((f) => !isMissingAsset(f));
  const missingAssets = failedRequests.filter(isMissingAsset);
  /* ERR_CONNECTION_REFUSED is expected here: the failure test deliberately
     kills the mock Worker, and the page reports the failed fetch as it falls
     back to the offline prices. Everything else must be clean. */
  const isDeadMock = (f) => /127\.0\.0\.1:5199/.test(f.url);
  check("only the deliberate dead-Worker call failed", unexpected.filter((f) => !isDeadMock(f)).length === 0, unexpected.filter((f) => !isDeadMock(f)).map((f) => f.status + " " + f.url).slice(0, 4).join(" | "));
  check("zero requests for unused .jpg photos", missingAssets.length === 0, missingAssets.map((f) => f.url.split("/").pop()).slice(0, 3).join(", "));
  const realErrors = consoleErrors.filter((t) => !/404|favicon|fonts\.googleapis|ERR_CONNECTION_REFUSED/i.test(t));
  check("no console errors", realErrors.length === 0, realErrors.slice(0, 4).join(" | "));

  /* ===================== reduced motion ===================== */
  section("reduced motion");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url });
  await sleep(3200);
  check("content visible immediately", (await evalJS(`[...document.querySelectorAll('[data-reveal]')].filter(e=>getComputedStyle(e).opacity==='1').length`)) > 0);
  check("no price shimmer under reduced motion", await evalJS(`[...document.querySelectorAll('.price')].every(p=>getComputedStyle(p).animationName==='none')`));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  ws.close(); child.kill();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("QA crashed: " + e.message); child.kill(); process.exit(1); });
