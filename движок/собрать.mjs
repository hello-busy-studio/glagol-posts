#!/usr/bin/env node
// Глагол · сборка каруселей.
//
//   node движок/собрать.mjs посты/<папка-поста>            — собрать все, что указано в пост.json
//   node движок/собрать.mjs посты/<папка> --формат в        — только вертикальные (в | г | оба)
//   node движок/собрать.mjs посты/<папка> --слайд 3         — пересобрать один слайд
//   node движок/собрать.mjs посты/<папка> --тип jpg         — переопределить тип файла (png | jpg)
//   node движок/собрать.mjs посты/<папка> --размер-г 1920x1080 — другой размер горизонтали (по умолчанию 1920x960)
//   node движок/собрать.mjs посты/<папка> --размер-в 1080x1350 — другой размер вертикали (по умолчанию 2160x2700)
//
// Никаких npm-зависимостей: нужен Node 22+ и Google Chrome (или Chromium/Edge).
// Путь к браузеру можно задать переменной CHROME_PATH.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LAYOUTS, decorSvg } from "./макеты.mjs";
import { launchBrowser, openPage } from "./браузер.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Холст макета имеет фиксированную ширину (1080 / 1280), высота считается из пропорций итогового размера,
// а масштаб = итоговая ширина / ширина холста. Так любой размер собирается из тех же макетов.
const FORMATS = {
  v: { base: 1080, size: [2160, 2700], dir: "вертикальные", name: "вертикальный" },
  h: { base: 1280, size: [1920, 960], dir: "горизонтальные", name: "горизонтальный" },
};
function parseSize(x) {
  if (!x) return null;
  const m = String(x).match(/^(\d+)\s*[xх×*]\s*(\d+)$/i);
  if (!m) throw new Error(`размер «${x}» — нужен вид 1920x960`);
  return [Number(m[1]), Number(m[2])];
}
function canvasFor(fmt, size) {
  const F = FORMATS[fmt]; const [W, H] = size || F.size;
  return { w: F.base, h: Math.round((F.base * H) / W), scale: W / F.base, out: [W, H] };
}
const FAMILIES = { "бренд": "brand", "кейс": "case", "вишня": "cherry" };
const THEMES = {
  // основной набор (сотрудник выбирает): см. DESIGN.md §2
  "зелено-салатовая": "green", "оранжево-белая": "orange", "серая-оранжевая": "white", "бело-серо-зеленая": "wlime",
  "черно-салатовая": "dark", "зелено-светло-зеленая": "mint",
  // дополнительные и старые названия
  "темная": "dark", "темная-в-рамке": "dark-frame",
  "темно-зеленая": "green", "темно-зеленая": "green", "зеленая": "green", "черная": "dark",
  "белая": "white", "светлая": "white", "оранжевая": "orange", "персиковая": "peach", "салатовая": "salad", "лаймовая": "lime",
  "кейс-зеленая": "case-green", "вишня-темная": "cherry-dark", "вишня-зеленая": "cherry-green",
};
const DARK_THEMES = new Set(["dark", "dark-frame", "green", "mint", "black", "case-green", "cherry-dark", "cherry-green"]);
const ACCENTS = { "градиент": "grad", "лайм": "lime", "лаймовый": "lime", "салатовый": "salad", "оранжевый": "orange", "серый": "gray", "белый": "white", "черный": "black", "черный": "black", "зеленый": "green", "темно-зеленый": "green", "персиковый": "peach" };
const PILLS = { "оранжевый": "orange", "зеленый": "green", "салатовый": "salad", "лайм": "lime", "синий": "blue", "фиолетовый": "purple", "темно-зеленый": "dark", "черный": "black", "розовый": "pink", "светлый": "light" };
const ARROW = `<svg viewBox="0 0 24.19 25.41" fill="none"><path d="M0 12.7071H22.6957" stroke="currentColor" stroke-width="2"/><path d="M11.4783 0.707107L23.4783 12.7071L11.4783 24.7071" stroke="currentColor" stroke-width="2" stroke-linejoin="bevel"/></svg>`;

// ------------------------------------------------------------------ аргументы

function parseArgs(argv) {
  const a = { post: null, fmt: null, slide: null, type: null, sizeV: null, sizeH: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--формат" || x === "--format") a.fmt = argv[++i];
    else if (x === "--слайд" || x === "--slide") a.slide = Number(argv[++i]);
    else if (x === "--тип" || x === "--type") a.type = argv[++i];
    else if (x === "--размер-г" || x === "--size-h") a.sizeH = argv[++i];
    else if (x === "--размер-в" || x === "--size-v") a.sizeV = argv[++i];
    else if (!a.post) a.post = x;
  }
  return a;
}

// ------------------------------------------------------------------ данные

function loadTrainers() {
  const f = path.join(ROOT, "ассеты/фотографии-тренеров/тренеры.json");
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { throw new Error(`тренеры.json: ${e.message}`); }
}

function makeCtx(postDir, post, fmt, warnings, trainers) {
  const resolve = (p) => {
    if (!p) return null;
    if (/^(https?:|data:|file:)/.test(p)) return p;
    for (const base of [postDir, ROOT]) {
      const abs = path.isAbsolute(p) ? p : path.join(base, p);
      if (fs.existsSync(abs)) return pathToFileURL(abs).href;
    }
    warnings.add(`не найден файл: ${p}`);
    return "";
  };
  const person = (p) => {
    if (!p) return {};
    const o = typeof p === "string" ? { тренер: p } : { ...p };
    if (o.тренер) {
      const t = trainers[o.тренер];
      if (!t) warnings.add(`нет тренера «${o.тренер}» в ассеты/фотографии-тренеров/тренеры.json`);
      else Object.assign(o, { ...t, ...o, фото: o.фото || (t.фото && path.join("ассеты/фотографии-тренеров", t.фото)) });
    }
    return o;
  };
  return { fmt, url: resolve, person, pillColor: (c) => PILLS[c] || c, family: "brand", theme: "green" };
}

// ------------------------------------------------------------------ HTML

// Предлоги, союзы и частицы, которые не оставляем в конце строки.
const HANG_WORDS = ["в", "во", "без", "до", "из", "к", "ко", "на", "над", "о", "об", "обо", "от", "по", "под", "при", "про", "с", "со", "у", "за", "для", "через", "перед", "между", "из-за", "из-под", "и", "а", "но", "да", "или", "ли", "же", "бы", "не", "ни", "что", "как", "чем", "это", "я", "мы", "вы", "он", "она", "оно", "они", "то", "так", "уже", "еще"];
const FIT_SCRIPT = `const HANG_WORDS = ${JSON.stringify(HANG_WORDS)};
window.__fit = async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.complete && i.naturalWidth ? null : new Promise((r) => { i.onload = i.onerror = r; })));
  let problems = [];
  const fitPass = () => { problems = [];
  // в горизонтали колонки подгоняются отдельно (заголовок слева не ужимает текст справа), потом весь блок
  const passId = String(Math.random());
  // карточки сетки подгоняются по отдельности: не влезает текст в карточку — уменьшаем только его
  for (const box of [...document.querySelectorAll('.fitbox .cards > *'), ...document.querySelectorAll('.fmt-h .fitbox .col'), ...document.querySelectorAll('.fitbox')]) {
    const inCard = box.parentElement?.classList.contains('cards');
    // эластичные отступы между блоками (data-gap="макс,мин"): в начале прохода — максимум
    const gapEls = [box, ...box.querySelectorAll('[data-gap]')].filter((e) => e.hasAttribute('data-gap'));
    for (const g of gapEls) if (g.dataset.gp !== passId) { g.dataset.gp = passId; g.style.gap = g.dataset.gap.split(',')[0] + 'px'; }
    const els = [...box.querySelectorAll('[data-fit]')];
    if (box.hasAttribute('data-fit')) els.push(box);
    const lines = [...box.querySelectorAll('.ln')];
    // переполнение считаем по реальным границам блочных элементов (scrollHeight врет при интерлиньяже < 1)
    // декоративная графика внутри текста (овал от руки) в переполнение не считается
    const blocks = [...box.querySelectorAll('*')].filter((e) => e.tagName !== 'BR' && !e.closest('svg') && !e.closest('[data-nofit]') && getComputedStyle(e).display !== 'inline');
    const excess = () => {
      let br = box.getBoundingClientRect(); let x = 0;
      if (inCard) { const cs = getComputedStyle(box); br = { top: br.top + parseFloat(cs.paddingTop), bottom: br.bottom - parseFloat(cs.paddingBottom), right: br.right - parseFloat(cs.paddingRight), width: br.width }; }
      for (const e of blocks) {
        const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
        // сверху допускаем до 8px: маркеры списков оптически приподняты (translateY)
        x = Math.max(x, r.bottom - br.bottom, br.top - r.top - 8, r.right - br.right);
      }
      for (const l of lines) x = Math.max(x, l.getBoundingClientRect().width - br.width);
      // длинное слово вылезает вбок за свой блок
      for (const e of els) if (e.scrollWidth - e.clientWidth > 2) x = Math.max(x, e.scrollWidth - e.clientWidth);
      return x;
    };
    const over = () => excess() > 2;
    // сначала сжимаем отступы между блоками до минимума, потом текст
    for (const g of gapEls) {
      const mn = Number(g.dataset.gap.split(',')[1]);
      while (over() && parseFloat(g.style.gap) > mn) g.style.gap = Math.max(mn, parseFloat(g.style.gap) - 2) + 'px';
    }
    // сначала ужимаем основной текст, затем заголовки; шаг 3%
    for (const prio of [1, 2]) {
      const group = els.filter((e) => (Number(e.dataset.fit.split(',')[2]) || 1) <= prio);
      let guard = 0;
      while (over() && guard++ < 80) {
        let changed = false;
        for (const e of group) {
          const [mx, mn] = e.dataset.fit.split(',').map(Number);
          const cur = parseFloat(e.style.fontSize);
          if (cur > mn) { e.style.fontSize = Math.max(mn, cur * 0.97).toFixed(2) + 'px'; changed = true; }
        }
        if (!changed) break;
      }
    }
    if (over()) problems.push(Math.round(excess()));
  }
  };
  fitPass();
  // Висячие предлоги и союзы в конце строки: чуть уменьшаем этот текст (до ~8 %), пока слово не уйдет на следующую строку.
  // Не помогло — возвращаем размер и ставим неразрывный пробел после слова. Потом проверяем, что все влезает.
  const SHORT = new Set(HANG_WORDS);
  const tokens = (el) => {
    const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      if (n.parentElement.closest('svg')) continue;
      const re = /[^\\s\u00A0]+/g; let m;
      while ((m = re.exec(n.data))) {
        const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const rs = r.getClientRects(); if (!rs.length) continue;
        out.push({ n, end: m.index + m[0].length, w: m[0], top: rs[0].top, h: rs[0].height });
      }
    }
    return out;
  };
  const hangs = (el) => {
    const t = tokens(el); const res = [];
    for (let i = 0; i + 1 < t.length; i++) {
      const word = t[i].w.toLowerCase().replace(/[«»"(),.:;!?…]/g, '');
      if (SHORT.has(word) && t[i + 1].top > t[i].top + t[i].h * 0.5) res.push(t[i]);
    }
    // одно короткое слово на последней строке абзаца — тоже правим (неразрывный пробел перед ним)
    const L = t.length;
    if (L > 2 && t[L - 1].top > t[L - 2].top + t[L - 2].h * 0.5 && t[L - 1].w.replace(/[«»"(),.:;!?…]/g, '').length <= 5) res.push(t[L - 2]);
    return res;
  };
  for (const el of document.querySelectorAll('[data-fit]')) {
    if (!hangs(el).length) continue;
    const start = parseFloat(el.style.fontSize);
    let cur = start, k = 0;
    while (hangs(el).length && k++ < 6) { cur *= 0.985; el.style.fontSize = cur.toFixed(2) + 'px'; }
    if (!hangs(el).length) continue;
    el.style.fontSize = start + 'px';
    for (let guard = 0; guard < 10; guard++) {
      const h = hangs(el)[0]; if (!h) break;
      const { n, end } = h;
      if (/[\\s]/.test(n.data[end] || '')) n.data = n.data.slice(0, end) + '\u00A0' + n.data.slice(end + 1);
      else {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); w.currentNode = n; const nx = w.nextNode();
        if (nx && /^\\s/.test(nx.data)) nx.data = '\u00A0' + nx.data.slice(1); else break;
      }
    }
  }
  fitPass();
  // плашки с текстом, стоящие свободно (имена спикеров, баблы), не налезают друг на друга, на текст заголовка и маркера
  // и на подвал с пагинацией. Расставляем снизу вверх: плашку, которая наехала, сдвигаем вверх, а если там место занято
  // или край слайда — вниз (но не на подвал).
  const movable = [...document.querySelectorAll('[data-noverlap]')];
  if (movable.length) {
    const GAP = 12;
    const sr = document.querySelector('.slide').getBoundingClientRect();
    const limit = Math.min(...[...document.querySelectorAll('.chrome.page, .chrome.foot')].map((e) => e.getBoundingClientRect().top)) - 16;
    const placed = [...document.querySelectorAll('.chrome.page, .chrome.foot, .chrome.tag, .meta')].map((e) => e.getBoundingClientRect());
    for (const e of document.querySelectorAll('[data-obstacle]')) { const r = document.createRange(); r.selectNodeContents(e); placed.push(...r.getClientRects()); }
    const hit = (a, b) => a.left < b.right + GAP && a.right + GAP > b.left && a.top < b.bottom + GAP && a.bottom + GAP > b.top;
    const free = (r, dy) => { const m = { left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy };
      return m.top >= sr.top + 40 && m.bottom <= limit && !placed.some((p) => hit(m, p)); };
    movable.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    for (const e of movable) {
      const r = e.getBoundingClientRect();
      if (placed.some((p) => hit(r, p))) {
        let dy = 0;
        for (let d = 4; d < 600 && !dy; d += 4) { if (free(r, -d)) dy = -d; else if (free(r, d)) dy = d; }
        if (dy) e.style.top = (parseFloat(getComputedStyle(e).top) + dy) + 'px';
      }
      placed.push(e.getBoundingClientRect());
    }
  }
  // автолиния: если текст доходит до линии — опускаем ее под текст, а если места нет — убираем
  const al = document.querySelector('svg.auto-line');
  if (al) {
    const H = document.querySelector('.slide').getBoundingClientRect().height;
    let bottom = 0;
    for (const e of document.querySelectorAll('.fitbox *')) {
      if (e.closest('svg') || e.tagName === 'BR') continue;
      // только то, что видно: элементы с текстом, картинки и карточки (растянутые обертки не считаем)
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText && e.tagName !== 'IMG' && !e.matches('.card,.card2,.hl,.stat,.step,.media,.pill,.quote-card')) continue;
      const r = e.getBoundingClientRect(); if (r.width && r.height) bottom = Math.max(bottom, r.bottom);
    }
    const top = al.querySelector('path').getBoundingClientRect().top;
    const gap = H * 0.03;
    if (bottom + gap > top) {
      const shift = bottom + gap - top;
      // опущенная линия не должна заходить на подвал и пагинацию — иначе убираем ее с этого слайда
      const chromeTop = Math.min(...[...document.querySelectorAll('.chrome.page, .chrome.foot')].map((e) => e.getBoundingClientRect().top), H);
      const lineBottom = al.querySelector('path').getBoundingClientRect().bottom;
      if (top + shift > H * 0.72 || lineBottom + shift > chromeTop - 16) al.remove(); else al.style.transform = 'translateY(' + shift + 'px)';
    }
  }
  return problems;
};`;

// Правило редактуры: везде «е» вместо «ё» (отключается "ё": true в пост.json).
// Пути к файлам не трогаем: в имени присланного фото может быть «ё».
const isPath = (v) => /[\\/]|\.(jpe?g|png|svg|webp|gif)$/i.test(v);
const noYo = (v) => typeof v === "string" ? (isPath(v) ? v : v.replace(/ё/g, "е").replace(/Ё/g, "Е"))
  : Array.isArray(v) ? v.map(noYo) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, noYo(x)])) : v;
const normTheme = (t) => (t ? String(t).replace(/ё/g, "е") : t);

function buildHtml(post, s, idx, total, fmt, ctx, canvas) {
  const layout = LAYOUTS[s.макет];
  if (!layout) throw new Error(`слайд ${idx + 1}: неизвестный макет «${s.макет}». Доступны: ${Object.keys(LAYOUTS).join(", ")}`);
  const family = FAMILIES[s.семейство || post.семейство || "бренд"];
  if (!family) throw new Error(`неизвестное семейство «${s.семейство || post.семейство}» (бренд | кейс | вишня)`);
  const themeName = normTheme(s.тема || post.тема || (family === "brand" ? "темно-зеленая" : ""));
  let theme = themeName ? THEMES[themeName] : "";
  if (themeName && !theme) throw new Error(`слайд ${idx + 1}: неизвестная тема «${themeName}». Доступны: ${Object.keys(THEMES).join(", ")}`);
  ctx.family = family; ctx.theme = theme;

  const merged = { ...s, ...(fmt === "h" ? s.горизонталь || {} : s.вертикаль || {}) };
  const out = layout(merged, ctx);
  if (out.theme) theme = out.theme;
  const accent = normTheme(merged.акцент || post.акцент);
  const accCls = accent ? `a-${ACCENTS[accent] || accent}` : "";

  const rawTag = merged.тег ?? post.тег ?? "";
  const tag = rawTag && post.хэштег !== false && !rawTag.startsWith("#") ? "#" + rawTag.replace(/[\s\-–—]+/g, "") : rawTag;
  const last = idx === total - 1;
  const arrow = family !== "cherry" && !last && merged.стрелка !== false && post.стрелка !== false;
  const paging = total > 1 && post.пагинация !== false && merged.пагинация !== false;
  const marking = merged.маркировка ?? post.маркировка;
  const partner = merged.партнер;
  const chrome = `${tag && !out.noTag ? `<div class="chrome tag">${escapeHtml(tag)}</div>` : ""}
    ${partner ? `<div class="chrome cobrand"><span class="logo">› бюро Глагол</span><span class="x">×</span><span>${escapeHtml(partner)}</span></div>` : ""}
    <div class="chrome foot">${escapeHtml(post.подпись ?? "glagol.me")}</div>
    ${paging ? `<div class="chrome page ${arrow ? "" : "no-arrow"}">${idx + 1}/${total}</div>` : ""}
    ${arrow ? `<div class="chrome arrow">${ARROW}</div>` : ""}
    ${marking ? `<div class="chrome marking">${escapeHtml(marking)}</div>` : ""}`;

  const bodyCls = [`fmt-${fmt}`, `fam-${family}`, theme && `t-${theme}`, accCls, out.inset && "inset"].filter(Boolean).join(" ");
  const bg = out.bg === "свечение" ? ` style="background:var(--bg-glow)"` : out.bg ? ` style="background:var(--bg-grad)"` : "";
  // Линии через один слайд (3, 5, 7…): линия 3 — темные темы, линия 2 — светлые. Обложку не трогаем (там графика),
  // фото-слайды тоже. Отключить: "линии": false в посте или "линия": false в слайде.
  const userDecor = merged.декор || [];
  const autoLine = fmt === "v" && post.линии !== false && merged.линия !== false && idx > 0 && idx % 2 === 0 && !last
    && !/on-photo|L-cover|L-photo|L-event|L-vacancy|L-speaker/.test(out.cls || "") && !userDecor.some((d) => d.тип === "линия") && !(out.decor || []).length;
  // в вертикали — в нижней трети, чтобы не идти под текстом; в горизонтали пока не ставим (разбираем позже)
  const AUTO_POS = { 3: { x: -99.4, y: 630 }, 2: { x: 470, y: 700, масштаб: 0.62 } };
  const lineNo = DARK_THEMES.has(theme) ? 3 : 2;
  const lineDecor = autoLine ? [{ тип: "линия", номер: lineNo, ...(fmt === "v" ? AUTO_POS[lineNo] : {}) }] : [];
  const decor = decorSvg([...(out.decor || []), ...userDecor], ctx, canvas.w, canvas.h)
    + decorSvg(lineDecor, ctx, canvas.w, canvas.h).replace('<svg class="decor"', '<svg class="decor auto-line"');
  const grain = merged.зерно ?? post.зерно ? `<div class="noise grain"></div>` : "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, "движок/стили.css")).href}">
<style>${post.css || ""}${s.css || ""}</style></head>
<body class="${bodyCls}" style="--W:${canvas.w}px;--H:${canvas.h}px"><div class="slide ${out.cls}"${bg}>${grain}${decor}${out.html}${chrome}</div>
<script>${FIT_SCRIPT}</script></body></html>`;
}
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ------------------------------------------------------------------ main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.post) { console.log("Использование: node движок/собрать.mjs посты/<папка-поста> [--формат в|г|оба] [--слайд N] [--тип png|jpg]"); process.exit(1); }
  const postDir = path.resolve(process.cwd(), args.post);
  const jsonFile = fs.existsSync(path.join(postDir, "пост.json")) ? path.join(postDir, "пост.json") : postDir.endsWith(".json") ? postDir : null;
  if (!jsonFile || !fs.existsSync(jsonFile)) throw new Error(`не найден ${path.join(postDir, "пост.json")}`);
  const dir = path.dirname(jsonFile);
  let post;
  try { post = JSON.parse(fs.readFileSync(jsonFile, "utf8")); } catch (e) { throw new Error(`пост.json — ошибка в JSON: ${e.message}`); }
  if (post.ё !== true) post = noYo(post);
  const sizes = {
    v: parseSize(args.sizeV || post.размер?.вертикальный),
    h: parseSize(args.sizeH || post.размер?.горизонтальный),
  };

  const want = (args.fmt || "").toLowerCase();
  const fromPost = (post.форматы || ["вертикальный", "горизонтальный"]).map((f) => (f.startsWith("г") || f === "h" ? "h" : "v"));
  const fmts = want === "в" || want === "v" ? ["v"] : want === "г" || want === "h" ? ["h"] : want === "оба" ? ["v", "h"] : fromPost;
  const type = (args.type || post.тип_файла || "png").toLowerCase().replace("jpeg", "jpg");
  if (!["png", "jpg"].includes(type)) throw new Error(`тип файла: png или jpg (сейчас «${type}»)`);

  const trainers = loadTrainers();
  const build = path.join(ROOT, ".сборка", path.basename(dir));
  fs.mkdirSync(build, { recursive: true });
  const b = await launchBrowser();
  const report = [];
  try {
    await Promise.all(fmts.map(async (fmt) => {
      const F = FORMATS[fmt];
      const slides = post.слайды.filter((s) => !s.только || (s.только.startsWith("г") ? "h" : "v") === fmt);
      const outDir = path.join(dir, F.dir);
      fs.mkdirSync(outDir, { recursive: true });
      if (!args.slide) for (const f of fs.readdirSync(outDir)) if (/^\d+\.(png|jpg)$/.test(f)) fs.rmSync(path.join(outDir, f));
      const C = canvasFor(fmt, sizes[fmt]);
      const page = await openPage(b, C.w, C.h, C.scale);
      for (let i = 0; i < slides.length; i++) {
        if (args.slide && args.slide !== i + 1) continue;
        const warnings = new Set();
        const ctx = makeCtx(dir, post, fmt, warnings, trainers);
        const html = buildHtml(post, slides[i], i, slides.length, fmt, ctx, C);
        const n = String(i + 1).padStart(2, "0");
        const htmlFile = path.join(build, `${n}-${fmt}.html`);
        fs.writeFileSync(htmlFile, html);
        const out = path.join(outDir, `${n}.${type}`);
        const problems = await page.render(htmlFile, out, type);
        for (const p of problems) warnings.add(`текст не влезает даже на минимальном кегле (лишние ~${p}px) — сократите текст или разбейте слайд`);
        report.push({ fmt: F.name, n, макет: slides[i].макет, file: path.relative(process.cwd(), out), warnings: [...warnings], size: C.out });
      }
    }));
  } finally { b.close(); }

  report.sort((a, b) => a.fmt.localeCompare(b.fmt) || a.n.localeCompare(b.n));
  let bad = 0;
  for (const r of report) {
    console.log(`${r.warnings.length ? "⚠️ " : "✓ "} ${r.fmt} ${r.n} [${r.макет}] → ${r.file}`);
    for (const w of r.warnings) { console.log(`     ${w}`); bad++; }
  }
  const sz = fmts.map((f) => canvasFor(f, sizes[f]).out.join("×")).join(", ");
  console.log(`\nГотово: ${report.length} слайдов (${sz}), ${type.toUpperCase()}.${bad ? ` Предупреждений: ${bad}.` : ""}`);
}

main().catch((e) => { console.error("Ошибка:", e.message); process.exit(1); });
