// Глагол · макеты слайдов.
// Каждый макет — функция (слайд, ctx) → { cls, html }.
// ctx.fmt: "v" (1080×1350) | "h" (1280×592). Поля слайда — на русском, см. DESIGN.md → «Каталог макетов».

// Диапазоны кегля [макс, мин] — авторазмер уменьшает текст, пока он не влезет.
const SIZES = {
  v: { h1: [112, 90], h2: [90, 64], h3: [42, 32], d: [42, 32], p: [42, 30], s: [38, 26], xs: [32, 22], num: [150, 96], numBig: [260, 120], qt: [42, 30], caps: [142, 96], capsS: [126, 90], q: [174, 120], price: [80, 56], date: [64, 44] },
  h: { h1: [107, 55], h2: [107, 55], h3: [28, 20], d: [28, 21], p: [28, 18], s: [26, 16], xs: [21, 14], num: [84, 52], numBig: [118, 60], qt: [56, 18], caps: [84, 54], capsS: [72, 50], q: [96, 64], price: [46, 32], date: [36, 26] },
};

// Заголовок обложки в вертикали: мало текста — 112, много — 88. В горизонтали — от 107 (160 в 1920) вниз до 55 (82),
// авторазмер ужимает, пока не влезет: заголовок заполняет все отведенное место. Одинаково для всех тем и рубрик.
const H1_LONG = 45; // символов без разметки
const H1_BIG = { v: 112, h: 107 }, H1_SMALL = { v: 88, h: 107 };
const plain = (s) => String(s ?? "").replace(/\(\(|\)\)|==|\*\*|\*|~/g, "").replace(/\n/g, " ");
export const h1Size = (text, ctx) => (plain(text).length > H1_LONG ? H1_SMALL : H1_BIG)[ctx.fmt];

const HEADLINE = new Set(["h1", "h2", "num", "numBig", "qt", "caps", "capsS", "q", "price", "date"]);

export function fitAttr(ctx, kind, override, extraStyle = "") {
  const table = SIZES[ctx.fmt];
  const [max, min] = override ? [override, ctx.fmt === "h" && HEADLINE.has(kind) ? Math.min(override, table[kind]?.[1] ?? override * 0.8) : Math.round(override * 0.8)] : table[kind];
  // приоритет: сначала ужимается основной текст (1), заголовки и цифры — в последнюю очередь (2)
  // в горизонтали наоборот: заголовок заполняет место и ужимается первым, описание держит 42 px (в 1920)
  const prio = (ctx.fmt === "h") === HEADLINE.has(kind) ? 1 : 2;
  return `data-fit="${max},${min},${prio}" style="font-size:${max}px;${extraStyle}"`;
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// *акцент*  **жирный**  ~приглушенный~  \n — перенос строки
// Типографика: «елочки», длинное тире с неразрывным пробелом перед ним, число неотрывно от слова.
const NB = "\u00A0";
export const typo = (s) => String(s)
  .replace(/(^|[\s(\[\u00A0])"(?=\S)/g, "$1«").replace(/"/g, "»")
  .replace(/ [-–] /g, " — ")
  .replace(/ — /g, NB + "— ").replace(/^— /gm, "—" + NB)
  .replace(/(\d) (?=[А-Яа-яЁёA-Za-z%₽$€])/g, "$1" + NB)
  .replace(/(№|§) (?=\d)/g, "$1" + NB);
export function T(s) {
  if (s == null) return "";
  return esc(typo(s))
    .replace(/\(\((.+?)\)\)/gs, '<span class="oval">$1<svg class="oval-svg" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true"><path d="M30 24 C 70 8, 150 6, 186 30 C 206 46, 196 74, 150 86 C 100 98, 34 94, 12 70 C -6 50, 22 26, 74 18"/><path d="M58 14 C 100 6, 150 8, 178 20"/></svg></span>')
    .replace(/==(.+?)==/gs, '<span class="mark">$1</span>')
    .replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>")
    .replace(/\*(.+?)\*/gs, '<span class="acc">$1</span>')
    .replace(/~(.+?)~/gs, '<span class="dim">$1</span>')
    .replace(/\n/g, "<br>");
}
const paras = (s, cls, ctx, kind = "p") =>
  (Array.isArray(s) ? s : [s]).filter(Boolean).map((x) => `<div class="${cls}" ${fitAttr(ctx, kind)}>${T(x)}</div>`).join("");

const img = (ctx, src, pos, bw) => src ? `<img class="cover${bw ? " bw" : ""}" src="${ctx.url(src)}" style="object-position:${pos || "50% 50%"}">` : "";
const ava = (ctx, p, extra = "") => `<div class="ava" ${extra}>${p?.фото ? img(ctx, p.фото, p.фото_позиция || "50% 30%") : ""}</div>`;

function head(s, ctx, kind = "h2") {
  let h = "";
  if (s.метка) h += `<div class="pill">${T(s.метка)}</div>`;
  if (s.плашка) h += `<div><span class="badge-hl">${T(s.плашка)}</span></div>`;
  if (s.заголовок) h += `<div class="${kind === "h1" ? "h1" : "h2"}" ${fitAttr(ctx, kind, s.размер_заголовка?.[ctx.fmt] || (kind === "h1" ? h1Size(s.заголовок, ctx) : undefined))}>${T(s.заголовок)}</div>`;
  if (s.подзаголовок) h += `<div class="d acc" ${fitAttr(ctx, "d")}>${T(s.подзаголовок)}</div>`;
  if (s.описание) h += `<div class="d" ${fitAttr(ctx, "d")}>${T(s.описание)}</div>`;
  return h;
}

// Внутренний слайд: шапка + тело. В вертикали — стопкой, в горизонтали — две колонки.
// Расстояние между смысловыми блоками тела (карточка, список, итог) — эластичное: 56 → 32 px в вертикали
// (37 → 21 на холсте горизонтали = 56 → 32 в 1920). Сначала сжимается оно, потом текст.
const BODY_GAP = { v: "56,32", h: "37,21" };
function twoCol(s, ctx, bodyHtml, { eq = false, fill = false } = {}) {
  const h = head(s, ctx);
  if (!bodyHtml) return `<div class="fitbox content">${h}</div>`;
  if (!h) return `<div class="fitbox content">${bodyHtml}</div>`;
  return `<div class="fitbox content"><div class="cols ${eq ? "eq" : ""} ${fill ? "fill" : ""}"><div class="col head">${h}</div><div class="col grow" data-gap="${BODY_GAP[ctx.fmt]}">${bodyHtml}</div></div></div>`;
}

function card(s, ctx, c, cls) {
  if (!c) return "";
  const o = typeof c === "string" ? { текст: c } : c;
  const style = o.стиль === "акцент" ? "hl" : o.стиль === "темная" || o.стиль === "цветная" ? "card2" : cls || "card";
  return `<div class="${style}">${o.метка ? `<div class="pill" style="margin-bottom:16px">${T(o.метка)}</div>` : ""}${o.заголовок ? `<div class="h3" ${fitAttr(ctx, "h3")}>${T(o.заголовок)}</div>` : ""}${o.текст ? paras(o.текст, "p", ctx, o.мелко ? "s" : "p") : ""}</div>`;
}

// ------------------------------------------------------------------ ДЕКОР
import fs from "node:fs";
import { fileURLToPath } from "node:url";
// Линии из Фигмы (ассеты/линии/линия-N.svg): путь, цвет, толщина и позиция на слайде 1080×1350 из макета.
const LINES_DIR = fileURLToPath(new URL("../ассеты/линии/", import.meta.url));
const LINE_POS = { 1: { x: -13.5, y: 336.2 }, 2: { x: 290, y: 320 }, 3: { x: -99.4, y: 371 } };
const LINES = Object.fromEntries([1, 2, 3].map((n) => {
  const src = fs.readFileSync(LINES_DIR + `линия-${n}.svg`, "utf8");
  const [, , w, h] = src.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  return [n, { d: src.match(/ d="([^"]+)"/)[1], stroke: src.match(/stroke="([^"]+)"/)[1], sw: Number(src.match(/stroke-width="([\d.]+)"/)[1]), w, h, ...LINE_POS[n] }];
}));
// Линия из библиотеки: { тип: "линия", номер: 1|2|3, x, y, масштаб, поворот, цвет, толщина, слой } — x/y в пикселях холста вертикали;
// в горизонтали позиция и масштаб пересчитываются автоматически (или задаются в "горизонталь").
function libLine(d, ctx, W, H) {
  const L = LINES[d.номер || 3]; if (!L) return "";
  const v = ctx.fmt === "v";
  const k = d.масштаб ?? (v ? 1 : 0.56);
  // в горизонтали линия по умолчанию уходит в правую половину (там фото/бейджи), левая — под текст
  const x = d.x ?? (v ? L.x : W * 0.47 + L.x * k);
  const y = d.y ?? (v ? L.y : H * 0.22 + (L.y - 330) * k);
  const color = DECOR_COLORS[d.цвет] || d.цвет || L.stroke;
  const sw = (d.толщина ?? L.sw) / k * (v ? 1 : 0.75);
  const rot = d.поворот ? ` rotate(${d.поворот} ${L.w / 2} ${L.h / 2})` : "";
  return `<g transform="translate(${x} ${y}) scale(${k})${rot}"><path d="${L.d}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round"/></g>`;
}
// Линии на фоне: пунктирные связки и сплошные ленты. Координаты — в % слайда.
// { тип: "пунктир" | "лента", от: [x, y], до: [x, y], изгиб: 0.3, изгиб2: 0.3, цвет: "салатовый", толщина, слой: "под" | "над" }
const DECOR_COLORS = { "лайм": "#DBFB6A", "салатовый": "#C3E5AE", "белый": "#FBFBFB", "оранжевый": "#FF5C00", "персиковый": "#FFF0E1", "черный": "#1A1A1A", "зеленый": "#004139" };
export function decorSvg(list, ctx, W, H) {
  if (!list?.length) return "";
  const v = ctx.fmt === "v";
  const layer = (which) => list.filter((d) => (d.слой || "под") === which).map((d) => {
    if (d.путь) return d.путь; // готовый путь в пикселях холста
    if (d.тип === "линия") return libLine(d, ctx, W, H);
    const [x0, y0] = [d.от[0] / 100 * W, d.от[1] / 100 * H], [x1, y1] = [d.до[0] / 100 * W, d.до[1] / 100 * H];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const b1 = (d.изгиб ?? 0.3) * len, b2 = (d.изгиб2 ?? d.изгиб ?? 0.3) * len;
    const c1 = [x0 + dx / 3 + nx * b1, y0 + dy / 3 + ny * b1], c2 = [x0 + dx * 2 / 3 + nx * b2, y0 + dy * 2 / 3 + ny * b2];
    const color = DECOR_COLORS[d.цвет] || d.цвет || (d.тип === "лента" ? "#DBFB6A" : "#C3E5AE");
    const dot = d.толщина || (d.тип === "лента" ? (v ? 8 : 5) : (v ? 5 : 3.5));
    const dash = d.тип === "лента" ? "" : ` stroke-dasharray="0 ${dot * 2.8}"`;
    return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} C ${c1.map((n) => n.toFixed(1)).join(" ")}, ${c2.map((n) => n.toFixed(1)).join(" ")}, ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${dot}" stroke-linecap="round"${dash}/>`;
  }).join("");
  const under = layer("под"), over = layer("над");
  const svg = (paths, z) => paths ? `<svg class="decor" style="z-index:${z}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>` : "";
  return svg(under, 2) + svg(over, 15);
}

// ------------------------------------------------------------------ ОБЛОЖКИ

const coverPlate = (s, ctx) => ({
  cls: "L-cover-plate on-photo",
  html: `
    <div class="ph">${img(ctx, s.фото, s.фото_позиция, s.чб)}</div>
    ${s.затемнение === false ? "" : `<div class="shade-top"></div>`}
    <div class="plate"></div>
    <div class="fitbox">${head({ ...s, описание: null }, ctx, "h1")}${s.описание ? `<div class="d" ${fitAttr(ctx, "d")}>${T(s.описание)}</div>` : ""}</div>`,
});

const coverPhoto = (s, ctx) => {
  const top = s.положение === "верх";
  const shade = s.затемнение === false ? "" : ctx.fmt === "h" ? `<div class="shade-left"></div>` : top ? `<div class="shade-top"></div>` : `<div class="shade-top" style="height:22%"></div><div class="shade-bottom"></div>`;
  return {
    cls: `L-cover-photo on-photo ${top ? "pos-top" : ""}`,
    html: `<div class="ph">${img(ctx, s.фото, s.фото_позиция, s.чб)}</div>${shade}
      <div class="fitbox">${head({ ...s, описание: null }, ctx, "h1")}${s.описание ? `<div class="d" ${fitAttr(ctx, "d")}>${T(s.описание)}</div>` : ""}</div>`,
  };
};

const coverColor = (s, ctx) => {
  // эмодзи картинкой (Apple Color Emoji) — только если попросили; иначе эмодзи пишем в тексте
  const illu = s.иллюстрация ? `<div class="illu"><img src="${ctx.url(s.иллюстрация)}"></div>`
    : s.эмодзи ? `<div class="illu emoji-big">${esc(s.эмодзи)}</div>` : "";
  const people = s.люди?.length ? `<div class="people">${s.люди.map((p) => ava(ctx, ctx.person(p))).join("")}</div>` : "";
  const low = s.описание_внизу && s.описание;
  return {
    cls: `L-cover-color ${s.выравнивание === "центр" ? "align-center" : ""}`,
    bg: s.фон,
    html: `${illu}<div class="fitbox content ${illu ? "has-illu" : ""}">${head(low ? { ...s, описание: null } : s, ctx, "h1")}${people}</div>
      ${low ? `<div class="fitbox low-desc"><div class="d" ${fitAttr(ctx, "d")}>${T(s.описание)}</div></div>` : ""}`,
  };
};

const coverSpeakers = (s, ctx) => {
  const sp = (s.спикеры || []).map(ctx.person);
  const pos = ctx.fmt === "v"
    ? [{ l: 20, t: 80, r: -6 }, { l: 520, t: 150, r: 7 }, { l: 270, t: 20, r: -2 }]
    : [{ l: 10, t: 40, r: -6 }, { l: 280, t: 70, r: 7 }, { l: 150, t: 0, r: -2 }];
  const cord = s.бейджи === "шнурок";
  const cpos = ctx.fmt === "v" ? [{ l: 110, t: 600, r: -8 }, { l: 520, t: 740, r: 16 }, { l: 300, t: 560, r: 4 }] : [{ l: 640, t: 120, r: -8 }, { l: 900, t: 190, r: 14 }, { l: 760, t: 80, r: 4 }];
  const P = cord ? cpos : pos;
  // обычные бейджи — рядом, по центру области (в горизонтали — по центру относительно заголовка), со сдвигом по высоте
  const DY = ctx.fmt === "v" ? [-30, 40, 0] : [-14, 18, 0];
  const badges = sp.map((p, i) => `<div class="badge ${cord ? "cord" : ""}" style="${cord ? `left:${P[i % 3].l}px;top:${P[i % 3].t}px;` : ""}transform:${cord ? "" : `translateY(${DY[i % 3]}px) `}rotate(${P[i % 3].r}deg)">${ava(ctx, p)}<div class="nm">${T(p.имя)}</div><div class="rl">${T(p.роль)}</div></div>`).join("");
  // лаймовая лента за бейджами
  // за бейджами — линия 3 из библиотеки (как в Фигме), слоем под бейджами
  const ribbon = cord && s.лента !== false ? decorSvg([{ тип: "линия", номер: s.линия || 3, ...(s.линия_позиция || {}) }], ctx, ctx.fmt === "v" ? 1080 : 1280, ctx.fmt === "v" ? 1350 : 640).replace('style="z-index:2"', 'style="z-index:3"') : "";
  return {
    cls: `L-cover-speakers ${cord ? "cords" : ""}`, noTag: true, bg: s.фон,
    html: `${s.когда ? `<div class="meta">${T(s.когда)}</div>` : ""}
      ${s.теги?.length ? `<div class="meta-pills">${s.теги.map((t) => `<span class="pill">${T(t)}</span>`).join("")}</div>` : ""}
      <div class="fitbox">${head(s, ctx, "h1")}</div>${ribbon}<div class="badges">${badges}</div>`,
  };
};

const coverAnnounce = (s, ctx) => {
  const p = ctx.person(s.спикер || {});
  return {
    cls: "L-cover-announce", bg: s.фон,
    html: `<div class="fitbox content">
      ${s.плашки?.length ? `<div class="pills">${s.плашки.map((t, i) => `<span class="pill ${i === 0 ? "solid" : ""}">${T(t)}</span>`).join("")}</div>` : ""}
      ${head(s, ctx, "h1")}
      ${ctx.fmt === "v" ? spk(ctx, p) : ""}</div>${ctx.fmt === "h" ? spk(ctx, p) : ""}`,
  };
};
const spk = (ctx, p) => `<div class="spk"><div class="info"><div class="nm">${T(p.имя)}</div><div class="rl">${T(p.роль)}</div></div><div class="pic">${img(ctx, p.фото, p.фото_позиция || "50% 20%")}</div></div>`;

// ------------------------------------------------------------------ ВНУТРЕННИЕ

const text = (s, ctx) => {
  let body = "";
  const media = s.фото ? `<div class="media grow" style="min-height:${ctx.fmt === "v" ? 300 : 110}px">${img(ctx, s.фото, s.фото_позиция, s.чб)}</div>` : "";
  if (s.фото_сверху) body += media;
  if (s.текст) body += `<div>${paras(s.текст, "p", ctx)}</div>`;
  if (!s.фото_сверху) body += media;
  if (s.карточка) body += card(s, ctx, s.карточка, ctx.family === "case" ? "card2" : "card");
  if (s.итог) body += card(s, ctx, { ...(typeof s.итог === "string" ? { текст: s.итог } : s.итог), стиль: "акцент" });
  return { cls: "L-text", html: twoCol(s, ctx, body) };
};

const list = (s, ctx) => {
  const numbered = s.нумерация !== false;
  const items = (s.пункты || []).map((it, i) => {
    const o = typeof it === "string" ? { текст: it } : it;
    const n = numbered ? String(i + 1).padStart(2, "0") : "→";
    return `<div class="item ${numbered ? "" : "bul"}" ${fitAttr(ctx, s.крупно ? "p" : "s")}><span class="num">${n}</span><span>${o.заголовок ? `<span class="t">${T(o.заголовок)}</span>${o.текст ? " — " : ""}` : ""}${T(o.текст)}</span></div>`;
  }).join("");
  let body = "";
  if (s.вступление) body += card(s, ctx, { метка: s.метка_вступления, текст: s.вступление, мелко: true });
  body += `<div class="items">${items}</div>`;
  if (s.итог) body += card(s, ctx, { текст: s.итог, стиль: "акцент", мелко: true });
  return { cls: "L-list", html: twoCol(s, ctx, body) };
};

const problemSolution = (s, ctx) => {
  const blk = (lbl, ico, txt, cls) => txt ? `<div class="${cls} pr"><div class="lbl" ${fitAttr(ctx, "s")}><span class="${ico === "✕" ? "x" : "v"}">${ico}</span>${T(lbl)}</div>${paras(txt, "p", ctx, "s")}</div>` : "";
  let body = blk(s.метка_проблемы || "Что происходит:", "✕", s.проблема, "card") + blk(s.метка_решения || "Как исправить:", "✓", s.решение, "card");
  if (s.итог) body += card(s, ctx, { текст: s.итог, стиль: "акцент", мелко: true });
  return { cls: "L-pr", html: twoCol(s, ctx, body) };
};

const stats = (s, ctx) => {
  const n = (s.цифры || []).length;
  // три числа: два сверху, третье — широкое снизу и крупнее; плашки занимают все место
  const wide = (i) => n === 3 && !s.столбиком && i === 2;
  const st = (s.цифры || []).map((x, i) => `<div class="stat ${x.акцент ? "accent" : ""} ${wide(i) ? "wide" : ""}"><div class="n" ${fitAttr(ctx, wide(i) ? "numBig" : "num")}>${T(x.число)}</div><div class="c" ${fitAttr(ctx, "xs")}>${T(x.подпись)}</div></div>`).join("");
  return { cls: "L-stats", html: twoCol(s, ctx, `<div class="stats n${Math.min(n, 4)} ${s.столбиком ? "tall" : ""}">${st}</div>`, { eq: true, fill: true }) };
};

const cards = (s, ctx) => {
  const list = s.карточки || [];
  const style = s.стиль === "акцент" ? "hl" : s.стиль === "цветные" || (ctx.family === "case" && s.стиль !== "светлые") ? "card2" : "card";
  const cs = list.map((c, i) => {
    const o = typeof c === "string" ? { текст: c } : c;
    const tk = s.большие_номера ? "date" : "h3";
    const xk = list.length <= 2 ? "p" : "s";
    return `<div class="${o.акцент ? "hl" : style}">${s.большие_номера ? `<div class="bign" data-nofit>${i + 1}</div>` : ""}${o.метка ? `<span class="pill">${T(o.метка)}</span>` : ""}${o.заголовок ? `<div class="t" ${fitAttr(ctx, tk)}>${T(o.заголовок)}</div>` : ""}${o.текст ? `<div class="s" ${fitAttr(ctx, xk)}>${T(o.текст)}</div>` : ""}</div>`;
  }).join("");
  return { cls: "L-cards", html: twoCol(s, ctx, `<div class="cards ${list.length < 3 && ctx.fmt === "v" ? "one" : ""} ${s.большие_номера ? "numbered" : ""}">${cs}</div>`) };
};

const steps = (s, ctx) => {
  const st = (s.этапы || []).map((x) => {
    const o = typeof x === "string" ? { текст: x } : x;
    return `<div class="step ${o.акцент ? "accent" : ""}" ${fitAttr(ctx, "s")}>${T(o.текст)}</div>`;
  }).join("");
  return { cls: "L-steps", html: twoCol(s, ctx, `<div class="steps">${st}</div>`) };
};

const schedule = (s, ctx) => {
  const rows = (s.даты || []).map((r) => `<div class="row"><div class="dt" ${fitAttr(ctx, "date")}>${T(r.дата)}${r.время ? `<span class="tm">${T(r.время)}</span>` : ""}</div><div class="s" ${fitAttr(ctx, "s")}>${T(r.текст)}</div></div>`).join("");
  return { cls: "L-schedule", html: twoCol(s, ctx, `<div class="sched">${rows}</div>`) };
};

const quote = (s, ctx) => {
  const p = ctx.person(s.автор || {});
  const q = ctx.family === "cherry" ? "кавычки-розовые" : ctx.family === "case" ? "кавычки-зеленые" : ctx.theme === "green" || ctx.theme === "black" ? "кавычки-белые" : "кавычки-зеленые";
  return {
    cls: "L-quote",
    html: `<div class="fitbox content">
      <div class="qrow"><img class="qmark" src="${ctx.url("ассеты/иконки/" + q + ".svg")}">
        <div class="person">${p.фото ? ava(ctx, p) : ""}<div><div class="nm" ${fitAttr(ctx, "h3")}>${T(p.имя)}</div><div class="rl" ${fitAttr(ctx, "xs")}>${T(p.роль)}</div></div></div></div>
      ${s.заголовок ? `<div class="h2" ${fitAttr(ctx, "h2")}>${T(s.заголовок)}</div>` : ""}
      <div class="quote-card ${(ctx.family === "case" || ctx.fmt === "h") && !s.фото_доп?.length ? "grow" : ""}">${paras(s.текст, "p", ctx, s.мелко ? "s" : ctx.fmt === "h" ? "qt" : "p")}${s.часть ? `<div class="s" style="opacity:.55;margin-top:18px;font-size:${ctx.fmt === "v" ? 24 : 15}px">${T(s.часть)}</div>` : ""}</div>
      ${s.фото_доп?.length ? `<div class="grow" style="display:grid;grid-template-columns:repeat(${Math.min(s.фото_доп.length, 3)},1fr);gap:16px;min-height:${ctx.fmt === "v" ? 220 : 100}px">${s.фото_доп.map((f) => `<div class="media">${img(ctx, f)}</div>`).join("")}</div>` : ""}</div>
      ${(ctx.theme === "dark" || ctx.theme === "dark-frame") && s.свечение !== false ? `<div class="glow"></div>` : ""}`,
  };
};

const speaker = (s, ctx) => {
  const p = ctx.person(s.спикер || {});
  const pic = `<div class="pic">${img(ctx, p.фото, p.фото_позиция || "50% 20%", s.чб)}</div>`;
  return {
    cls: "L-speaker",
    html: `${ctx.fmt === "h" ? pic : ""}<div class="fitbox content">${ctx.fmt === "v" ? pic : ""}
      <div><div class="h2" ${fitAttr(ctx, "h2")}>${T(p.имя)}</div><div class="d" ${fitAttr(ctx, "xs", ctx.fmt === "v" ? 32 : 19, "opacity:.7;margin-top:10px")}>${T(p.роль)}</div></div>
      ${s.текст ? `<div class="card">${paras(s.текст, "p", ctx, "s")}</div>` : ""}</div>`,
  };
};

const team = (s, ctx) => {
  const ms = (s.люди || []).map(ctx.person).map((p) => `<div class="mate"><div class="info"><div class="nm" ${fitAttr(ctx, "xs")}>${T(p.имя)}</div><div class="rl" ${fitAttr(ctx, "xs", ctx.fmt === "v" ? 20 : 12)}>${T(p.роль)}</div>${p.метка ? `<span class="pill">${T(p.метка)}</span>` : ""}</div><div class="pic">${img(ctx, p.фото, p.фото_позиция || "50% 20%")}</div></div>`).join("");
  return { cls: "L-team", html: twoCol({ ...s }, ctx, `<div class="team">${ms}</div>`) };
};

const prices = (s, ctx) => {
  const ps = (s.тарифы || []).map((t) => `<div class="plan ${t.главный ? "main" : ""}">${t.название ? `<span class="pill">${T(t.название)}</span>` : ""}<div class="pr" ${fitAttr(ctx, "price")}>${T(t.цена)}</div>${t.старая_цена ? `<div class="old" ${fitAttr(ctx, "xs")}>${T(t.старая_цена)}</div>` : ""}${t.текст ? `<div class="s" ${fitAttr(ctx, "xs")}>${T(t.текст)}</div>` : ""}</div>`).join("");
  const note = s.сноска ? `<div class="s" ${fitAttr(ctx, "xs", null, "opacity:.6")}>${T(s.сноска)}</div>` : "";
  return { cls: "L-prices", html: twoCol(s, ctx, `<div class="plans">${ps}</div>${note}`, { fill: true }) };
};

const photoCaption = (s, ctx) => ({
  cls: "L-photo-caption on-photo",
  html: `<div class="ph">${img(ctx, s.фото, s.фото_позиция, s.чб)}</div><div class="shade-top" style="height:22%"></div>${ctx.fmt === "h" ? `<div class="shade-left"></div>` : `<div class="shade-bottom"></div>`}
    <div class="fitbox">${s.заголовок ? `<div class="h2" ${fitAttr(ctx, "h2")}>${T(s.заголовок)}</div>` : ""}${s.текст ? `<div class="d" ${fitAttr(ctx, "d")}>${T(s.текст)}</div>` : ""}</div>`,
});

const tags = (s, ctx) => {
  const colors = ["orange", "light", "salad", "blue", "green", "purple", "lime", "pink"];
  const pills = (s.теги || []).map((t, i) => {
    const o = typeof t === "string" ? { текст: t } : t;
    const c = ctx.pillColor(o.цвет) || colors[i % colors.length];
    return `<span class="pill pc-${c}">${T(o.текст)}</span>`;
  }).join("");
  return { cls: "L-tags", html: `<div class="fitbox content center">${head(s, ctx)}<div class="cloud">${pills}</div></div>` };
};

const cta = (s, ctx) => {
  const side = s.qr ? `<div class="qr"><img src="${ctx.url(s.qr)}"></div>` : "";
  const illu = s.иллюстрация ? `<div class="illu"><img src="${ctx.url(s.иллюстрация)}"></div>` : "";
  return {
    cls: `L-cta ${side ? "has-side" : ""}`, bg: s.фон,
    html: `${illu}<div class="fitbox content">${head(s, ctx)}${s.кнопка ? `<span class="btn">${T(s.кнопка)}</span>` : ""}${ctx.fmt === "v" ? side : ""}</div>${ctx.fmt === "h" && side ? `<div class="side">${side}</div>` : ""}`,
  };
};

const ctaBubble = (s, ctx) => ({
  cls: "L-cta-bubble", noTag: true,
  html: `<div class="bubble fitbox b1"><div ${fitAttr(ctx, "h2")}>${T(s.вопрос)}</div></div>
    <div class="bubble fitbox b2"><div ${fitAttr(ctx, "h2")}>${T(s.ответ || "Напишите\nнам сейчас")}</div><span class="ico"></span></div>`,
});

const bigQuote = (s, ctx) => {
  const illu = s.иллюстрация ? `<div class="illu" style="position:absolute;z-index:4;right:-80px;top:${ctx.fmt === "v" ? 380 : 120}px;width:${ctx.fmt === "v" ? 520 : 300}px"><img src="${ctx.url(s.иллюстрация)}" style="width:100%"></div>` : "";
  return {
    cls: "L-bigquote",
    html: `${illu}<div class="fitbox content">
      ${s.метка ? `<span class="pill">${T(s.метка)}</span>` : ""}
      ${s.текст ? `<div style="max-width:${ctx.fmt === "v" ? 800 : 700}px">${paras(s.текст, "p", ctx)}</div>` : ""}
      <div class="grow"></div>
      <div><div class="bigq acc" ${fitAttr(ctx, "q")}>“</div><div class="h2" ${fitAttr(ctx, "h2")}>${T(s.заголовок)}</div></div></div>`,
  };
};

// ------------------------------------------------------------------ КОЛЛАЖ И БАБЛЫ

// Коллаж (рис. 1): заголовок по центру, ниже — фото и наложенные карточки, связанные пунктиром.
const collage = (s, ctx) => {
  const v = ctx.fmt === "v";
  const back = s.карточка_сзади ? `<div class="cl-back">${s.карточка_сзади.метка ? `<div class="cl-label">${T(s.карточка_сзади.метка)}</div>` : ""}${(s.карточка_сзади.строки || []).map((r) => `<div class="cl-row" style="--c:${DECOR_COLORS[r.цвет] || r.цвет || "#DBFB6A"}"><b>${T(r.текст)}</b>${r.подпись ? `<span>${T(r.подпись)}</span>` : ""}</div>`).join("")}</div>` : "";
  const ph = s.фото ? `<div class="cl-photo">${img(ctx, s.фото, s.фото_позиция, s.чб)}</div>` : "";
  const c = s.карточка;
  const znak = (c && c.знак) || "✕";
  const front = c ? `<div class="cl-front">${c.заголовок ? `<div class="cl-title" ${fitAttr(ctx, "s")}>${T(c.заголовок)}</div>` : ""}${(c.пункты || []).map((x) => `<div class="cl-item" ${fitAttr(ctx, "xs")}><span class="z">${znak}</span><span>${T(x)}</span></div>`).join("")}</div>` : "";
  const dots = s.пунктир === false ? [] : v
    ? [{ тип: "пунктир", от: [76, 45], до: [57, 58.5], изгиб: -0.6, изгиб2: 0.3 }, { тип: "пунктир", от: [86, 70], до: [89, 79], изгиб: -0.45 }]
    : [{ тип: "пунктир", от: [44, 30], до: [56, 14], изгиб: -0.5 }, { тип: "пунктир", от: [93, 40], до: [95, 58], изгиб: -0.4 }];
  return {
    cls: "L-collage", decor: dots,
    html: `<div class="fitbox content cl-head">${head(s, ctx, "h1")}</div><div class="cl-stage">${back}${ph}${front}</div>`,
  };
};

// Обложка с баблами (рис. 4): фото спикеров в мягких формах, белые карточки с именами,
// полупрозрачные пилюли-баблы, маркерная подсветка подзаголовка.
const coverBubbles = (s, ctx) => {
  const v = ctx.fmt === "v";
  const sp = (s.спикеры || []).map(ctx.person).slice(0, 2);
  const PH = v ? [{ l: 60, t: 594, w: 427, h: 430, nl: 160, nt: 935 }, { l: 600, t: 700, w: 419, h: 419, nl: 430, nt: 1066 }]
               : [{ l: 640, t: 140, w: 284, h: 286, nl: 600, nt: 392 }, { l: 960, t: 220, w: 280, h: 280, nl: 900, nt: 468 }];
  const speakers = sp.map((p, i) => { const q = PH[i];
    return `<div class="bb-photo b${i}" style="left:${q.l}px;top:${q.t}px;width:${q.w}px;height:${q.h}px">${img(ctx, p.фото, p.фото_позиция || "50% 25%", s.чб)}<i class="sq"></i></div>
      <div class="bb-name" data-noverlap style="left:${q.nl}px;top:${q.nt}px"><div class="nm">${T(p.имя)}</div><div class="rl">${T(p.роль)}</div></div>`; }).join("");
  const BP = v ? [{ r: 40, t: 140, rot: 5 }, { l: 354, t: 540, rot: -3 }, { r: 60, t: 470, rot: 4 }]
               : [{ l: 470, t: 70, rot: 5 }, { l: 330, t: 262, rot: -3 }, { r: 60, t: 560, rot: 4 }];
  const bubbles = (s.баблы || []).map((t, i) => { const q = BP[i % 3];
    return `<span class="bubble-pill" data-noverlap style="${q.l != null ? `left:${q.l}px` : `right:${q.r}px`};top:${q.t}px;transform:rotate(${q.rot}deg)">${T(t)}</span>`; }).join("");
  return {
    cls: "L-cover-bubbles", noTag: true, bg: s.фон,
    html: `${s.когда ? `<div class="meta">${T(s.когда)}</div>` : ""}
      <div class="fitbox bb-head">${s.заголовок ? `<div class="h1" data-obstacle ${fitAttr(ctx, "h1", s.размер_заголовка?.[ctx.fmt] || h1Size(s.заголовок, ctx))}>${T(s.заголовок)}</div>` : ""}</div>
      ${s.описание ? `<div class="fitbox bb-sub"><div class="d" ${fitAttr(ctx, "d")}><span class="mark" data-obstacle>${T(s.описание)}</span></div></div>` : ""}
      ${speakers}${bubbles}`,
  };
};

// ------------------------------------------------------------------ ДОП. РУБРИКИ

// «Знакомим с командой»: Факт / Герой / Питомец / Песня. Фото с подписью-пузырем + текст.
const profile = (s, ctx) => {
  const pic = s.фото ? `<div class="pic ${s.фото_широкое ? "wide" : ""}">${img(ctx, s.фото, s.фото_позиция, s.чб)}${s.подпись_фото ? `<div class="cap">${T(s.подпись_фото)}</div>` : ""}</div>` : "";
  const body = `<div class="row2 ${pic ? "" : "solo"}">${pic}<div>${paras(s.текст, "p", ctx, ctx.fmt === "h" ? "d" : "s")}</div></div>`;
  return { cls: "L-profile", html: twoCol(s, ctx, body) };
};

// Итоги в цифрах: первое число огромное, остальные — строками «число + подпись».
const bigNumbers = (s, ctx) => {
  const v = ctx.fmt === "v";
  const list = s.цифры || [];
  const rows = list.map((x, i) => {
    const top = i === 0 && s.первое_крупно !== false;
    const size = top ? (v ? 300 : 210) : (v ? 130 : 96);
    return `<div class="bignum ${top ? "top" : ""}"><div class="n" ${fitAttr(ctx, "num", size)}>${T(x.число)}</div><div class="c" ${fitAttr(ctx, "s")}>${T(x.подпись)}</div></div>`;
  }).join("");
  return { cls: "L-bignums", html: twoCol(s, ctx, `<div class="bignums ${!v && list.length > 3 ? "grid2" : ""}">${rows}</div>`, { eq: true }) };
};

// Подборка: книги / статьи / подкасты / видео.
const picks = (s, ctx) => {
  const items = (s.пункты || []).map((x) => {
    const o = typeof x === "string" ? { заголовок: x } : x;
    return `<div class="pick ${o.обложка ? "" : "nocv"}">${o.обложка ? `<div class="cv">${img(ctx, o.обложка)}</div>` : ""}<div><div class="t" ${fitAttr(ctx, "h3")}>${T(o.заголовок)}</div>${o.автор ? `<div class="a" ${fitAttr(ctx, "xs")}>${T(o.автор)}</div>` : ""}${o.текст ? `<div class="x" ${fitAttr(ctx, "xs")}>${T(o.текст)}</div>` : ""}</div></div>`;
  }).join("");
  return { cls: "L-picks", html: twoCol(s, ctx, `<div class="picks">${items}</div>`) };
};

// Вакансия: ряд аватаров команды + «плюс», заголовок «Ищем *роль*».
const vacancy = (s, ctx) => {
  const avas = (s.люди || []).map((p) => ava(ctx, ctx.person(p))).join("");
  const center = s.выравнивание === "центр";
  const row = avas || s.плюс !== false ? `<div class="avas">${avas}${s.плюс === false ? "" : `<div class="plus">+<svg class="cursor" viewBox="0 0 24 24"><path d="M3 2 L21 10 L13 12.5 L10 21 Z" fill="currentColor"/></svg></div>`}</div>` : "";
  // в горизонтали (эталон TG) аватары — справа сверху, вне текстового блока
  const aside = ctx.fmt === "h" && !center;
  return {
    cls: `L-vacancy ${center ? "align-center" : ""}`, bg: s.фон,
    html: `${aside ? row : ""}<div class="fitbox content" style="${center ? "align-items:center;text-align:center;justify-content:center" : "justify-content:flex-end"}">
      ${aside ? "" : row}${head(s, ctx, "h1")}${s.кнопка ? `<span class="btn">${T(s.кнопка)}</span>` : ""}</div>`,
  };
};

// Обложка события: стикеры даты/времени/формата, фото спикера, карточка продукта.
const eventCover = (s, ctx) => {
  const v = ctx.fmt === "v";
  const p = s.спикер ? ctx.person(s.спикер) : null;
  const photo = s.фото || p?.фото;
  const st = [];
  // позиции стикеров: относительно фото
  const pos = v
    ? { date: "right:70px;bottom:calc(44% + 60px)", time: "left:70px;bottom:150px", fmtp: "right:90px;bottom:330px", prod: "right:70px;bottom:160px" }
    : { date: "right:100px;top:60px", time: "right:calc(52% - 180px);bottom:90px", fmtp: "right:240px;top:84px", prod: "right:100px;bottom:110px" };
  if (s.дата) { const [d, ...m] = String(s.дата).split(" "); st.push(`<div class="stk date" style="${pos.date}">${T(d)}<small>${T(m.join(" "))}</small></div>`); }
  if (s.время) st.push(`<div class="stk time" style="${pos.time}">${T(s.время)}<small>${T(s.часовой_пояс || "по мск")}</small></div>`);
  if (s.формат) st.push(`<div class="stk fmtp" style="${pos.fmtp}">${T(s.формат)}</div>`);
  if (s.продукт) st.push(`<div class="stk prod" style="${pos.prod}">${T(s.продукт)}${s.продукт_подпись ? `<small>${T(s.продукт_подпись)}</small>` : ""}</div>`);
  return {
    cls: "L-event", bg: s.фон,
    html: `${photo ? `<div class="ph ${s.фото_на_край ? "full" : ""}">${img(ctx, photo, s.фото_позиция || p?.фото_позиция || "50% 25%", s.чб)}</div>` : ""}
      <div class="fitbox">${head(s, ctx, "h1")}${p?.имя && s.показать_спикера !== false ? `<div class="d" ${fitAttr(ctx, "xs")}>Спикер — ${T(p.имя)}${p.роль ? `, ${T(p.роль)}` : ""}</div>` : ""}</div>${st.join("")}`,
  };
};

// Чек-лист с тумблерами.
const checklist = (s, ctx) => {
  const items = (s.пункты || []).map((x) => `<div class="chk"><span class="tgl"></span><span class="s" ${fitAttr(ctx, "s")}>${T(x)}</span></div>`).join("");
  return { cls: "L-checklist grid-bg", html: twoCol(s, ctx, `<div class="checks">${items}</div>`) };
};

// ------------------------------------------------------------------ ВИШНЯ

const lines = (s, ctx, kind, align) => (s.заголовок || "").split("\n").map((ln, i) => {
  const a = (s.выключка || align)[i] || "л";
  return `<span class="ln ${a === "п" ? "r" : a === "ц" ? "c" : ""}" ${fitAttr(ctx, kind)}>${T(ln)}</span>`;
}).join("");

const cherryCover = (s, ctx) => {
  const v = ctx.fmt === "v";
  const bgKind = s.фон || "вишни"; // вишни | волна | волна-зеленая
  let deco = "", headTop, descPos;
  if (bgKind === "вишни") {
    deco = `<div class="cherries"><img src="${ctx.url("ассеты/иллюстрации/вишня/вишни-обложка.png")}"></div>`;
    headTop = v ? 180 : 100; descPos = v ? "left:60px;top:657px;width:562px" : "left:40px;top:370px;width:560px";
  } else {
    deco = `<div class="wave"><img src="${ctx.url("ассеты/иллюстрации/вишня/волна.svg")}"></div><div class="noise"></div>
      <div class="swirl" style="${v ? "left:511px;top:72px" : "left:1000px;top:30px;width:130px"}"><img src="${ctx.url("ассеты/иллюстрации/вишня/завиток.svg")}"></div>
      <div class="motion" style="${v ? "left:912px;top:791px" : "left:1130px;top:380px;width:80px"};transform:rotate(-30deg)"><img src="${ctx.url("ассеты/иллюстрации/вишня/штрихи-движения.png")}"></div>
      <div class="motion" style="${v ? "left:139px;top:661px" : "left:640px;top:250px;width:80px"};transform:rotate(-150deg)"><img src="${ctx.url("ассеты/иллюстрации/вишня/штрихи-движения.png")}"></div>`;
    headTop = v ? 550 : 96; descPos = v ? "left:272px;top:1030px;width:562px" : "left:40px;top:400px;width:520px";
  }
  const right = v ? "60px" : bgKind === "вишни" ? "560px" : "560px";
  return {
    cls: `L-cherry-cover`, theme: bgKind === "волна-зеленая" ? "cherry-green" : "cherry-dark",
    html: `${deco}<div class="chead fitbox" style="top:${headTop}px;right:${right};overflow:visible">${lines(s, ctx, "caps", ["л", "п", "л"])}</div>
      ${s.описание ? `<div class="cdesc d fitbox" style="${descPos};height:${v ? 200 : 110}px"><div ${fitAttr(ctx, "xs", v ? 37 : 21)}>${T(s.описание)}</div></div>` : ""}`,
  };
};

const cherrySpeaker = (s, ctx) => {
  const v = ctx.fmt === "v";
  const p = ctx.person(s.спикер || {});
  return {
    cls: "L-cherry-speaker", theme: s.фон === "волна-зеленая" ? "cherry-green" : "cherry-dark",
    html: `<div class="wave" style="${v ? "top:113px" : "top:40px"}"><img src="${ctx.url("ассеты/иллюстрации/вишня/волна.svg")}"></div><div class="noise"></div>
      <div class="swirl" style="${v ? "left:287px;top:162px" : "left:700px;top:30px;width:120px"};transform:rotate(179deg)"><img src="${ctx.url("ассеты/иллюстрации/вишня/завиток.svg")}"></div>
      <div class="cbadge" style="${v ? "left:541px;top:132px" : "right:70px;left:auto;top:120px"}">${ava(ctx, p)}<div class="nm">${T(p.имя)}</div><div class="rl">${T(p.роль)}</div>${s.событие ? `<div class="ev">${T(s.событие)}</div>` : ""}</div>
      <div class="chead fitbox" style="${v ? "top:698px;left:56px;right:56px" : "top:170px;left:40px;right:420px"};overflow:visible">${lines(s, ctx, "capsS", ["л", "л", "п"])}</div>
      ${s.описание ? `<div class="cdesc d fitbox" style="${v ? "left:272px;top:1099px;width:560px;height:130px" : "left:220px;top:470px;width:560px;height:60px"}"><div ${fitAttr(ctx, "xs", v ? 37 : 20)}>${T(s.описание)}</div></div>` : ""}`,
  };
};

const cherryThought = (s, ctx) => {
  const media = s.фото ? `<div class="media grow" style="min-height:${ctx.fmt === "v" ? 360 : 180}px">${img(ctx, s.фото, s.фото_позиция)}</div>`
    : s.заглушка !== false ? `<div class="media grow" style="min-height:${ctx.fmt === "v" ? 360 : 180}px;display:flex;align-items:center;justify-content:center;font-size:${ctx.fmt === "v" ? 30 : 18}px;color:#1A1A1A">${T(s.подпись_медиа || "здесь кадр из видео")}</div>` : "";
  const h = `<div class="h2" ${fitAttr(ctx, "h2", null, "line-height:.9")}>${T(s.заголовок)}</div>${paras(s.текст, "p", ctx)}`;
  return {
    cls: "L-cherry-thought", inset: true,
    html: ctx.fmt === "v" ? `<div class="fitbox content" style="gap:40px">${h}${media}</div>`
      : `<div class="fitbox content"><div class="cols eq"><div class="col head">${h}</div><div class="col grow" style="height:100%">${media}</div></div></div>`,
  };
};

const cherryQuote = (s, ctx) => {
  const v = ctx.fmt === "v";
  const p = ctx.person(s.автор || {});
  return {
    cls: "L-cherry-quote", inset: true,
    html: `<img src="${ctx.url("ассеты/иконки/кавычки-розовые.svg")}" style="position:absolute;z-index:10;${v ? "right:90px;top:90px;width:197px" : "right:56px;top:44px;width:100px"}">
      <div class="fitbox content" style="${v ? "top:443px" : "top:110px"};gap:${v ? 60 : 24}px">
        <div class="person"><div class="ava" style="${v ? "width:317px;height:317px" : "width:150px;height:150px"}">${p.фото ? img(ctx, p.фото, p.фото_позиция || "50% 30%") : ""}</div>
          <div><div class="nm" ${fitAttr(ctx, "h3", v ? 64 : 34)}>${T(p.имя)}</div><div class="rl" ${fitAttr(ctx, "d")}>${T(p.роль)}</div></div></div>
        <div class="quote-card grow">${paras(s.текст, "p", ctx)}</div></div>`,
  };
};

const cherryFinal = (s, ctx) => ({
  cls: "L-cherry-final", theme: "cherry-dark",
  html: `<div class="fitbox content" style="${ctx.fmt === "v" ? "top:182px;bottom:680px" : "top:100px;right:420px"};gap:40px">
      <div class="h2" ${fitAttr(ctx, "h2", null, "line-height:.85")}>${T(s.заголовок)}</div>${s.текст ? `<div class="p" ${fitAttr(ctx, "d")}>${T(s.текст)}</div>` : ""}</div>
    ${s.qr ? `<div class="qrcard"><img src="${ctx.url(s.qr)}"><div class="cap">${T(s.подпись_qr || "")}</div></div>` : ""}`,
});

// ------------------------------------------------------------------ РЕЕСТР

export const LAYOUTS = {
  "обложка-фото-плашка": coverPlate,
  "обложка-фото": coverPhoto,
  "обложка-цвет": coverColor,
  "обложка-спикеры": coverSpeakers,
  "обложка-анонс": coverAnnounce,
  "текст": text,
  "список": list,
  "проблема-решение": problemSolution,
  "цифры": stats,
  "карточки": cards,
  "этапы": steps,
  "расписание": schedule,
  "цитата": quote,
  "спикер": speaker,
  "команда": team,
  "тарифы": prices,
  "фото-подпись": photoCaption,
  "теги": tags,
  "призыв": cta,
  "призыв-пузырь": ctaBubble,
  "цитата-крупно": bigQuote,
  "коллаж": collage,
  "обложка-баблы": coverBubbles,
  "анкета": profile,
  "цифры-крупно": bigNumbers,
  "подборка": picks,
  "вакансия": vacancy,
  "обложка-событие": eventCover,
  "чек-лист": checklist,
  "вишня-обложка": cherryCover,
  "вишня-спикер": cherrySpeaker,
  "вишня-мысль": cherryThought,
  "вишня-цитата": cherryQuote,
  "вишня-финал": cherryFinal,
};
