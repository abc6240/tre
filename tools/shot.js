/* Drive the page and screenshot it — headless Chrome over CDP, no deps.
     node tools/shot.js <url> <out.png> [width] [height] [clickSelector] [fullPage]

   Examples:
     node tools/shot.js http://localhost:5177/ shot.png 1440 900
     node tools/shot.js http://localhost:5177/ lb.png 1440 950 "[data-open]"
     node tools/shot.js http://localhost:5177/ full.png 390 844 "" full

   `clickSelector` is clicked before capture. `full` captures the whole document
   via a captureBeyondViewport clip (the window size flag is unreliable in
   headless, so the viewport is set with Emulation.setDeviceMetricsOverride). */
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
const url = process.argv[2];
const outFile = path.resolve(process.argv[3]);
const vw = Number(process.argv[4] || 1440);
const vh = Number(process.argv[5] || 900);
const rest = process.argv.slice(6).filter((a) => a !== "");
const fullPage = rest.includes("full");
const clickSel = rest.find((a) => a !== "full") || "";
const PORT = 9400 + (vw % 70);

const chrome = CANDIDATES.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tre-shot-"));
const child = spawn(chrome, ["--headless=new","--disable-gpu","--hide-scrollbars","--no-first-run",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });

const get = (p) => new Promise((res, rej) =>
  http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));

const SCROLL_THROUGH = `(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.querySelectorAll('[data-reveal]').forEach(e => e.classList.add('is-in'));
  document.querySelectorAll('img').forEach(i => { i.loading = 'eager'; });
  const h = document.documentElement.scrollHeight;
  for (let y = 0; y < h; y += Math.round(innerHeight * 0.7)) {
    scrollTo(0, y);
    await new Promise(r => setTimeout(r, 110));
  }
  scrollTo(0, 0);
  await Promise.all([...document.images].map(i => (i.complete && i.naturalWidth) ? null : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 2500); })));
  try { await document.fonts.ready; } catch (e) {}
  for (let i = 0; i < 10; i++) await raf();
})()`;

(async () => {
  let target;
  for (let i = 0; i < 80 && !target; i++) { await sleep(250); try { target = (await get("/json/list")).find((t) => t.type === "page"); } catch (_) {} }
  if (!target) { console.error("CDP did not come up"); child.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise((r) => ws.addEventListener("open", r));

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await sleep(4200);

  if (clickSel) {
    const clicked = await send("Runtime.evaluate", { expression: `(()=>{const e=document.querySelector(${JSON.stringify(clickSel)}); if(e) e.click(); return !!e;})()`, returnByValue: true });
    if (!clicked.result.result.value) console.error("warning: selector not found — " + clickSel);
    await sleep(1500);
  }

  await send("Runtime.evaluate", { expression: SCROLL_THROUGH, awaitPromise: true });
  await sleep(700);

  const params = { format: "png" };
  if (fullPage) {
    const m = await send("Page.getLayoutMetrics");
    const size = (m.result && (m.result.cssContentSize || m.result.contentSize)) || { width: vw, height: vh };
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: vw, height: Math.min(22000, Math.ceil(size.height)), scale: 1 };
  }
  const shot = await send("Page.captureScreenshot", params);
  if (!shot.result || !shot.result.data) { console.error("no screenshot data: " + JSON.stringify(shot).slice(0, 300)); child.kill(); process.exit(1); }
  fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
  console.log(`${path.basename(outFile)} written (${vw}x${fullPage ? "full" : vh})`);
  ws.close(); child.kill(); process.exit(0);
})().catch((e) => { console.error(e.message); child.kill(); process.exit(1); });
