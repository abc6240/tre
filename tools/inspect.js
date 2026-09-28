/* Headless layout/a11y probe over the Chrome DevTools Protocol — no deps.
     node tools/inspect.js <url> [viewportWidth] [viewportHeight]

   Launches headless Chrome, evaluates a geometry report in the page and prints
   JSON. Useful for checking real widths, overflow and console errors. */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const url = process.argv[2] || "http://localhost:5177/";
const vw = Number(process.argv[3] || 1440);
const vh = Number(process.argv[4] || 900);
const PORT = 9333 + (vw % 100);

const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("No Chrome/Edge found.");
  process.exit(1);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tre-cdp-"));
const child = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + profile,
  "--window-size=" + vw + "," + vh,
  "about:blank",
], { stdio: "ignore" });

const get = (p) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve(JSON.parse(body)));
      })
      .on("error", reject);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORT = `(() => {
  const R = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const grid = document.querySelector('[data-grid]');
  const cs = grid ? getComputedStyle(grid) : null;
  const cards = [...document.querySelectorAll('.card')];
  const cols = cs ? cs.gridTemplateColumns : '';
  const out = {
    viewport: { w: innerWidth, h: innerHeight },
    docHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth
      ? document.documentElement.scrollWidth - innerWidth : 0,
    grid: grid ? { rect: R(grid), templateColumns: cols, count: cols.split(' ').length } : null,
    cardWidths: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().width)))],
    cardCount: cards.length,
    rowTops: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))],
    fontLoaded: {
      display: document.fonts ? document.fonts.check('600 32px "Cormorant Garamond"') : null,
      sans: document.fonts ? document.fonts.check('400 16px Inter') : null,
    },
    images: [...document.images].map(i => ({ alt: i.alt.slice(0,40), w: i.naturalWidth, ok: i.complete && i.naturalWidth > 0 })),
    sectionOrder: [...document.querySelectorAll('main > section')].map(s => s.id || s.className),
    headerStuck: !!document.querySelector('.site-header.is-stuck'),
    fabVisible: !!document.querySelector('.fab.is-visible'),
    revealed: document.querySelectorAll('[data-reveal].is-in').length + '/' + document.querySelectorAll('[data-reveal]').length,
    dmHref: (document.querySelector('.card-cta') || {}).href || null,
    errors: window.__treErrors || [],
  };
  return JSON.stringify(out);
})()`;

(async () => {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await get("/json/list");
      target = list.find((t) => t.type === "page");
    } catch (_) {}
  }
  if (!target) { console.error("CDP did not come up"); child.kill(); process.exit(1); }

  if (typeof WebSocket !== "function") {
    console.error("Global WebSocket unavailable — Node 22+ required.");
    child.kill();
    process.exit(2);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) =>
    new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });

  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Runtime.evaluate", {
    expression: `window.__treErrors=[];addEventListener('error',e=>window.__treErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>window.__treErrors.push('rejection: '+e.reason));`,
  });
  await send("Page.navigate", { url });
  await sleep(3500);
  /* scroll through so lazy images and reveals trigger */
  await send("Runtime.evaluate", { expression: `(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}scrollTo(0,0);await new Promise(r=>setTimeout(r,700));})()`, awaitPromise: true });
  await sleep(1200);

  const res = await send("Runtime.evaluate", { expression: REPORT, returnByValue: true });
  console.log(res.result && res.result.result ? res.result.result.value : JSON.stringify(res));
  ws.close();
  child.kill();
  process.exit(0);
})();
