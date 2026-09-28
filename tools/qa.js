/* End-to-end interaction check — drives the real page in headless Chrome.
     node tools/qa.js [url]
   Verifies filtering, lightbox behaviour, keyboard support, nav toggle,
   DM deep-links, image loading and console cleanliness. Exits non-zero on
   failure so it can be wired into CI. */
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
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

const get = (p) => new Promise((res, rej) =>
  http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail !== undefined && detail !== "" ? "  — " + detail : ""}`);
}

(async () => {
  let target;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await get("/json/list")).find((t) => t.type === "page"); } catch (_) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + " :: " + expr.slice(0, 80));
    return r.result.result.value;
  };
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");

  const consoleErrors = [];
  const failedRequests = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") consoleErrors.push(m.params.entry.text);
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.text);
    if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
      failedRequests.push({ status: m.params.response.status, url: m.params.response.url });
    }
  });

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await sleep(4000);

  /* ---- structure ---- */
  check("hero H1 present", await evalJS(`!!document.querySelector('h1')`));
  check("8 featured cards rendered", (await evalJS(`document.querySelectorAll('.card').length`)) === 8, await evalJS(`document.querySelectorAll('.card').length`));
  check("every card has a DM link", await evalJS(`[...document.querySelectorAll('.card-cta[href]')].every(a=>a.href.startsWith('https://ig.me/m/teamrocketsexchange'))`));
  check("DM link carries product name", await evalJS(`document.querySelector('.card-cta').href.includes('Charizard')`));
  check("DM links open in a new tab safely", await evalJS(`[...document.querySelectorAll('a[target=_blank]')].every(a=>/noopener/.test(a.rel))`));
  check("Collectr link present", await evalJS(`[...document.querySelectorAll('a')].some(a=>a.href.includes('app.getcollectr.com/showcase/profile/@teamrocketsexchange'))`));
  check("no cart / checkout CTA", !(await evalJS(`/add to (cart|bag)|view cart|proceed to (checkout|payment)|buy now/i.test(document.body.innerText)`)));
  check("all six sections in order", (await evalJS(`[...document.querySelectorAll('main > section')].map(s=>s.id||'closing').join(',')`)) === "hero,vault,categories,how,about,closing", await evalJS(`[...document.querySelectorAll('main > section')].map(s=>s.id||'closing').join(',')`));
  /* ---- images ---- */
  await evalJS(`(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=500){scrollTo(0,y);await new Promise(r=>setTimeout(r,80));}scrollTo(0,0);await new Promise(r=>setTimeout(r,900));})()`);
  const imgs = await evalJS(`JSON.stringify([...document.querySelectorAll('.card-media img')].map(i=>({ok:i.complete&&i.naturalWidth>0, src:i.currentSrc.slice(0,32)})))`);
  const parsed = JSON.parse(imgs);
  check("all card images resolved (incl. fallback)", parsed.every((i) => i.ok), JSON.stringify(parsed.filter((i) => !i.ok)));

  /* ---- filtering ---- */
  const vintageCount = await evalJS(`window.TRE_DATA.PRODUCTS.filter(p=>p.category==='vintage').length`);
  await evalJS(`document.querySelector('[data-category=vintage]').click()`);
  await sleep(900);
  check("category filter shows the whole drawer", (await evalJS(`document.querySelectorAll('.card').length`)) === vintageCount, `${await evalJS(`document.querySelectorAll('.card').length`)} of ${vintageCount}`);
  check("filter bar is announced", await evalJS(`!document.querySelector('[data-filter-bar]').hidden && document.querySelector('[data-filter-name]').textContent==='Vintage'`));
  check("category cards show piece counts", !(await evalJS(`/^\\s*$/.test(document.querySelector('[data-count=sealed]').textContent)`)));
  await evalJS(`document.querySelector('[data-filter-clear]').click()`);
  await sleep(900);
  check("clear restores featured set", (await evalJS(`document.querySelectorAll('.card').length`)) === 8);
  check("filter bar hides again", await evalJS(`document.querySelector('[data-filter-bar]').hidden`));

  /* ---- lightbox ---- */
  await evalJS(`(()=>{const b=document.querySelector('[data-open]');b.focus();b.click();})()`);
  await sleep(800);
  check("lightbox opens on card click", await evalJS(`!document.querySelector('[data-lightbox]').hidden`));
  check("lightbox shows the right card", (await evalJS(`document.querySelector('[data-lb-name]').textContent`)) === "Charizard");
  check("lightbox has grade + price rows", await evalJS(`document.querySelector('[data-lb-grade]').textContent==='PSA 9' && document.querySelector('[data-lb-price]').textContent.length>0`));
  check("lightbox DM link names the card", await evalJS(`document.querySelector('[data-lb-dm]').href.includes('Charizard')`));
  check("lightbox is a labelled modal", await evalJS(`document.querySelector('.lightbox-panel').getAttribute('aria-modal')==='true' && !!document.querySelector('.lightbox-panel').getAttribute('aria-labelledby')`));
  check("focus moved into the lightbox", await evalJS(`document.activeElement.classList.contains('lightbox-close')`));
  check("body scroll locked", await evalJS(`document.body.classList.contains('is-locked')`));

  await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(600);
  check("Escape closes the lightbox", await evalJS(`document.querySelector('[data-lightbox]').hidden`));
  check("focus returns to the card", await evalJS(`document.activeElement.classList.contains('card-open')`));
  check("body scroll unlocked", !(await evalJS(`document.body.classList.contains('is-locked')`)));

  /* backdrop click */
  await evalJS(`document.querySelector('[data-open]').click()`);
  await sleep(600);
  await evalJS(`document.querySelector('.lightbox-scrim').click()`);
  await sleep(500);
  check("backdrop click closes the lightbox", await evalJS(`document.querySelector('[data-lightbox]').hidden`));

  /* ---- header + fab ---- */
  check("header is stuck after scrolling", await evalJS(`(()=>{scrollTo(0,900);return new Promise(r=>setTimeout(()=>r(document.querySelector('.site-header').classList.contains('is-stuck')),400));})()`));
  check("floating DM button appears", await evalJS(`document.querySelector('.fab').classList.contains('is-visible')`));
  await evalJS(`scrollTo(0,0)`);

  /* ---- mobile nav ---- */
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(700);
  check("hamburger visible on mobile", await evalJS(`getComputedStyle(document.querySelector('[data-nav-toggle]')).display!=='none'`));
  await evalJS(`document.querySelector('[data-nav-toggle]').click()`);
  await sleep(500);
  check("menu opens and reports aria-expanded", await evalJS(`document.querySelector('#primaryNav').classList.contains('is-open') && document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded')==='true'`));
  check("menu links are tappable", await evalJS(`getComputedStyle(document.querySelector('#primaryNav a')).pointerEvents!=='none'`));
  await evalJS(`document.querySelector('#primaryNav a[href="#vault"]').click()`);
  await sleep(600);
  check("choosing a link closes the menu", await evalJS(`!document.querySelector('#primaryNav').classList.contains('is-open')`));
  check("no horizontal overflow at 390px", (await evalJS(`document.documentElement.scrollWidth - innerWidth`)) <= 0, await evalJS(`document.documentElement.scrollWidth - innerWidth`));

  /* ---- reduced motion ---- */
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url });
  await sleep(3200);
  check("reduced motion: content visible immediately", (await evalJS(`[...document.querySelectorAll('[data-reveal]')].filter(e=>getComputedStyle(e).opacity==='1').length`)) > 0);

  /* ---- console ---- */
  /* Product photos that don't exist yet produce a network 404 by design: the
     card then draws its branded inline placeholder (verified above). Those are
     expected; every other failed request or console error is a real problem. */
  const isMissingPhoto = (f) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(f.url);
  const unexpected = failedRequests.filter((f) => !isMissingPhoto(f));
  const missingPhotos = failedRequests.filter(isMissingPhoto);
  check("no unexpected failed requests", unexpected.length === 0, unexpected.map((f) => f.status + " " + f.url).slice(0, 4).join(" | "));
  check("zero requests for not-yet-added photos", missingPhotos.length === 0, missingPhotos.map((f) => f.url.split("/").pop()).slice(0, 4).join(", "));
  const realErrors = consoleErrors.filter((t) => !/404|favicon|fonts\.googleapis/i.test(t));
  check("no console errors", realErrors.length === 0, realErrors.slice(0, 4).join(" | "));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  ws.close(); child.kill();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("QA crashed: " + e.message); child.kill(); process.exit(1); });
