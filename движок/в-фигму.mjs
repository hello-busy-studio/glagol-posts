#!/usr/bin/env node
// Глагол · подготовка слайдов к переносу в Фигму настоящими слоями.
//
//   node движок/в-фигму.mjs посты/<папка> [--формат в|г|оба] [--страница "AI-посты"]
//
// Берет HTML слайдов из .сборка (сначала запустите собрать.mjs), разбирает каждый слайд на слои
// (фреймы, тексты со стилями, векторы, места под фото) и пишет в .сборка/<пост>/фигма/:
//   NN-v.js            — код для use_figma (строит слайд слоями)
//   картинки.json      — какие фото загрузить в какие слои (после сборки слоев)
// Дальше Claude по очереди выполняет NN-*.js через use_figma, загружает фото через upload_assets
// и применяет кадрирование (см. CLAUDE.md → «Фигма»).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, openPage } from "./браузер.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const postArg = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--формат" && args[args.indexOf(a) - 1] !== "--страница");
const fmtArg = (args[args.indexOf("--формат") + 1] || "оба").toLowerCase();
const pageName = args.includes("--страница") ? args[args.indexOf("--страница") + 1] : "AI-посты";
if (!postArg) { console.log("Использование: node движок/в-фигму.mjs посты/<папка> [--формат в|г|оба]"); process.exit(1); }

const postDir = path.resolve(postArg);
const post = JSON.parse(fs.readFileSync(path.join(postDir, "пост.json"), "utf8"));
const build = path.join(ROOT, ".сборка", path.basename(postDir));
const outDir = path.join(build, "фигма");
fs.mkdirSync(outDir, { recursive: true });
const EXTRACT = fs.readFileSync(path.join(ROOT, "движок/фигма-разбор.js"), "utf8");
const BUILDER = fs.readFileSync(path.join(ROOT, "движок/фигма-сборщик.js"), "utf8");
const fmts = fmtArg.startsWith("в") ? ["v"] : fmtArg.startsWith("г") ? ["h"] : ["v", "h"];
const FMT_NAME = { v: "вертикальные", h: "горизонтальные" };

const r2 = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(r2) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r2(x)])) : v);
const fromUrl = (u) => decodeURIComponent(new URL(u).pathname);
const cleanSvg = (s) => s.replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
const viewBox = (s) => { const m = s.match(/viewBox="([\d.\s-]+)"/); const v = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, 100, 100]; return [v[2], v[3]]; };

const manifest = [];
const slidesData = [];
const b = await launchBrowser();
try {
  for (const fmt of fmts) {
    const files = fs.readdirSync(build).filter((f) => new RegExp(`^\\d+-${fmt}\\.html$`).test(f)).sort();
    if (!files.length) { console.log(`нет собранных слайдов (${FMT_NAME[fmt]}) — сначала node движок/собрать.mjs ${postArg}`); continue; }
    const html0 = fs.readFileSync(path.join(build, files[0]), "utf8");
    const W = Number(html0.match(/--W:(\d+)px/)[1]), H = Number(html0.match(/--H:(\d+)px/)[1]);
    const page = await openPage(b, W, H, 1);
    for (const f of files) {
      const idx = Number(f.slice(0, 2)) - 1;
      await page.load(path.join(build, f));
      await page.eval("window.__fit()");
      const data = await page.eval(EXTRACT);
      const svgs = {};
      let n = 0;
      const key = (p) => `${f.slice(0, 2)}${fmt}-${path.basename(p).replace(/\.[^.]+$/, "")}-${n++}`;
      const fix = (node) => {
        if (node.t === "svg" && node.inline) { const k = `иконка-${n++}`; svgs[k] = cleanSvg(node.inline); node.key = k; delete node.inline; }
        // фото и svg из <img>
        if (node.t === "img" && !node.src) { node.t = "frame"; node.fills = [{ k: "solid", c: [0.85, 0.85, 0.85, 1] }]; }
        if (node.t === "img") {
          const file = fromUrl(node.src);
          if (file.endsWith(".svg")) {
            const k = path.basename(file); const svg = cleanSvg(fs.readFileSync(file, "utf8"));
            svgs[k] = svg; const [vw, vh] = viewBox(svg);
            Object.assign(node, { t: "svg", key: k, vw, vh, fit: node.fit === "contain" ? "contain" : "cover" });
          } else {
            const k = key(file);
            const crop = node.fit === "cover" && node.nw ? (() => {
              const s = Math.max(node.w / node.nw, node.h / node.nh), dw = node.nw * s, dh = node.nh * s;
              const ox = (node.w - dw) * node.pos[0], oy = (node.h - dh) * node.pos[1];
              return [[node.w / dw, 0, -ox / dw], [0, node.h / dh, -oy / dh]];
            })() : null;
            manifest.push({ key: k, file: path.relative(ROOT, file), crop, bw: node.bw, slide: f });
            Object.assign(node, { key: k });
          }
          delete node.src;
        }
        // фоновые картинки (грани темной темы, шум)
        if (node.fills?.some((p) => p.k === "url")) {
          const extra = [];
          for (const p of node.fills.filter((p) => p.k === "url")) {
            const file = fromUrl(p.src);
            if (file.endsWith(".svg")) {
              const k = path.basename(file); const svg = cleanSvg(fs.readFileSync(file, "utf8"));
              svgs[k] = svg; const [vw, vh] = viewBox(svg);
              extra.push({ t: "svg", n: "фон", key: k, x: 0, y: 0, w: node.w, h: node.h, vw, vh, fit: "cover" });
            } else {
              const k = key(file);
              manifest.push({ key: k, file: path.relative(ROOT, file), tile: true, slide: f });
              extra.push({ t: "img", key: k, x: 0, y: 0, w: node.w, h: node.h, op: node.op, blend: node.blend });
            }
          }
          node.fills = node.fills.filter((p) => p.k !== "url");
          if (node.t === "frame") node.kids = [...extra, ...(node.kids || [])];
        }
        (node.kids || []).forEach(fix);
      };
      fix(data.root);
      const D = r2({ page: pageName, title: post.название || path.basename(postDir), fmtName: FMT_NAME[fmt], frameName: `${f.slice(0, 2)} · ${FMT_NAME[fmt].slice(0, -2)}ый`, idx, total: files.length, W, H, root: data.root, svgs });
      slidesData.push(D);
    }
  }
} finally { b.close(); }
// пачки слайдов: каждая — отдельный вызов use_figma (лимит кода 50 КБ)
for (const f of fs.readdirSync(outDir)) if (/^пачка-\d+\.js$/.test(f)) fs.rmSync(path.join(outDir, f));
const LIMIT = 24000; let batch = [], nb = 0;
const flush = () => {
  if (!batch.length) return;
  const SVGS = {}; const LIST = batch.map(({ svgs, ...d }) => { Object.assign(SVGS, svgs); return d; });
  const code = BUILDER.replace("/*DATA*/null", JSON.stringify({ SVGS, LIST }));
  const out = path.join(outDir, `пачка-${String(++nb).padStart(2, "0")}.js`);
  fs.writeFileSync(out, code);
  console.log(`✓ ${path.relative(ROOT, out)}  ${batch.map((d) => d.frameName).join(", ")}  ${(code.length / 1024).toFixed(1)} КБ`);
  batch = [];
};
for (const D of slidesData) {
  const sizeOf = (arr) => { const sv = {}; arr.forEach((d) => Object.assign(sv, d.svgs)); return BUILDER.length + JSON.stringify(sv).length + JSON.stringify(arr.map(({ svgs, ...d }) => d)).length; };
  const size = sizeOf([...batch, D]);
  if (batch.length && size > LIMIT) flush();
  batch.push(D);
  if (sizeOf(batch) > 49000) console.log(`⚠️ слайд ${D.frameName} больше лимита use_figma`);
}
flush();
fs.writeFileSync(path.join(outDir, "картинки.json"), JSON.stringify(manifest, null, 2));
console.log(`\nФото для загрузки: ${manifest.length} → ${path.relative(ROOT, path.join(outDir, "картинки.json"))}`);
