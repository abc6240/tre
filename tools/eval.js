/* One-off CDP evaluation helper:
     node tools/eval.js <url> "<js expression>" [vw] [vh] */
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
const expr = process.argv[3];
const vw = Number(process.argv[4] || 1440);
const vh = Number(process.argv[5] || 900);
const PORT = 9600 + (vw % 90);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tre-eval-"));
const child = spawn(chrome, ["--headless=new","--disable-gpu","--hide-scrollbars","--no-first-run",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "--window-size=" + vw + "," + vh, "about:blank"], { stdio: "ignore" });

const get = (p) => new Promise((res, rej) => http.get({ host: "127.0.0.1", port: PORT, path: p }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => res(JSON.parse(b))); }).on("error", rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await get("/json/list")).find((t) => t.type === "page"); } catch (_) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await new Promise((r) => ws.addEventListener("open", r));
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url });
  await sleep(3000);
  const out = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(out.result && out.result.result ? out.result.result.value : out, null, 2));
  ws.close(); child.kill(); process.exit(0);
})();
