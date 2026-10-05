// Глагол · общий доступ к headless Chrome через DevTools Protocol (без npm-зависимостей).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ------------------------------------------------------------------ Chrome (CDP)

export function findChrome() {
  const c = [process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"].filter(Boolean);
  const f = c.find((p) => fs.existsSync(p));
  if (!f) throw new Error("Не найден Google Chrome. Установите его или задайте CHROME_PATH.");
  return f;
}

export async function launchBrowser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glagol-chrome-"));
  const proc = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--allow-file-access-from-files", "--hide-scrollbars", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", "--force-color-profile=srgb", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("Chrome не запустился за 30 с")), 30000);
    proc.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
    proc.on("exit", (code) => rej(new Error(`Chrome завершился (код ${code})`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else for (const w of [...waiters]) if (w.method === m.method && w.sessionId === m.sessionId) { waiters.splice(waiters.indexOf(w), 1); w.res(m.params); }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const once = (method, sessionId) => new Promise((res) => waiters.push({ method, sessionId, res }));
  const close = () => { try { ws.close(); } catch {} proc.kill(); setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 300); };
  return { send, once, close };
}

export async function openPage(b, w, h, scale = 1) {
  const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
  await b.send("Page.enable", {}, sessionId);
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false }, sessionId);
  await b.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 255, g: 255, b: 255, a: 1 } }, sessionId);
  return {
    async load(htmlFile) {
      const loaded = b.once("Page.loadEventFired", sessionId);
      await b.send("Page.navigate", { url: pathToFileURL(htmlFile).href }, sessionId);
      await loaded;
    },
    async eval(expression) {
      const r = await b.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result?.value;
    },
    async render(htmlFile, outFile, type) {
      const loaded = b.once("Page.loadEventFired", sessionId);
      await b.send("Page.navigate", { url: pathToFileURL(htmlFile).href }, sessionId);
      await loaded;
      const r = await b.send("Runtime.evaluate", { expression: "window.__fit()", awaitPromise: true, returnByValue: true }, sessionId);
      const shot = await b.send("Page.captureScreenshot", { format: type === "jpg" ? "jpeg" : "png", quality: type === "jpg" ? 92 : undefined, clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: false }, sessionId);
      fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
      return r.result?.value || [];
    },
  };
}

