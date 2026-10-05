// Глагол · разбор отрисованного слайда в дерево слоев для Фигмы.
// Выполняется внутри страницы (Chrome) после авторазмера. Возвращает JSON:
// { w, h, root: Node } — Node = { t: frame|text|img|svg|poly, n, x, y, w, h, rot, fills, stroke, radius, clip, op, fx, kids, ... }
// Координаты — локальные в системе родителя (до поворота), x/y — верхний левый угол уже повернутого узла,
// как этого ждет Фигма (поворот вокруг верхнего левого угла).
(() => {
  const slide = document.querySelector(".slide");
  const px = (v) => parseFloat(v) || 0;
  const DEG = Math.PI / 180;

  // ---------- цвета и градиенты
  const parseColor = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
  };
  const splitTop = (s) => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const stopsOf = (parts) => {
    const st = [];
    parts.forEach((p, i) => {
      const c = parseColor(p); if (!c) return;
      const pm = p.replace(/rgba?\([^)]*\)/, "").match(/(-?[\d.]+)%/);
      st.push([...c, pm ? px(pm[1]) / 100 : null]);
    });
    st.forEach((s, i) => { if (s[4] == null) s[4] = st.length === 1 ? 0 : i / (st.length - 1); });
    return st;
  };
  const parseGradient = (g, w, h) => {
    const lin = g.match(/^linear-gradient\((.*)\)$/s), rad = g.match(/^radial-gradient\((.*)\)$/s);
    if (lin) {
      const parts = splitTop(lin[1]);
      let ang = 180;
      if (/deg/.test(parts[0])) { ang = px(parts.shift()); }
      else if (/^to /.test(parts[0])) { const t = parts.shift(); ang = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 }[t] ?? 180; }
      // единичный вектор направления в пикселях → в долях узла
      const a = ang * DEG, dx = Math.sin(a), dy = -Math.cos(a);
      const L = Math.abs(w * dx) + Math.abs(h * dy); // длина линии градиента по CSS
      const ux = (dx * L) / w, uy = (dy * L) / h; // вектор от начала к концу в долях
      const sx = 0.5 - ux / 2, sy = 0.5 - uy / 2;
      // M: пространство градиента → узел; (0,.5)→start, (1,.5)→end. Фигме нужна обратная матрица.
      const A = ux, D = uy, B = -uy, E = ux, C = sx - 0.5 * B, F = sy - 0.5 * E;
      const det = A * E - B * D || 1e-6;
      const m = [[E / det, -B / det, (B * F - C * E) / det], [-D / det, A / det, (C * D - A * F) / det]];
      return { k: "lin", stops: stopsOf(parts), m };
    }
    if (rad) {
      const parts = splitTop(rad[1]);
      let rx = 0.5, ry = 0.5, cx = 0.5, cy = 0.5;
      if (!parseColor(parts[0])) {
        const head = parts.shift();
        const at = head.match(/at\s+(-?[\d.]+)%\s+(-?[\d.]+)%/); if (at) { cx = px(at[1]) / 100; cy = px(at[2]) / 100; }
        const sz = head.match(/^(-?[\d.]+)%\s+(-?[\d.]+)%/); if (sz) { rx = px(sz[1]) / 100; ry = px(sz[2]) / 100; }
      }
      // радиальный градиент Фигмы: центр (0.5,0.5), радиус 0.5 в пространстве градиента
      const m = [[0.5 / rx, 0, 0.5 - (0.5 / rx) * cx], [0, 0.5 / ry, 0.5 - (0.5 / ry) * cy]];
      return { k: "rad", stops: stopsOf(parts), m };
    }
    return null;
  };
  const bgPaints = (cs, w, h) => {
    const out = [];
    const bc = parseColor(cs.backgroundColor);
    if (bc && bc[3] > 0) out.push({ k: "solid", c: bc });
    const bi = cs.backgroundImage;
    if (bi && bi !== "none") {
      for (const layer of splitTop(bi).reverse()) {
        if (/gradient/.test(layer)) { const g = parseGradient(layer, w, h); if (g) out.push(g); }
        else { const u = layer.match(/url\(["']?(.*?)["']?\)/); if (u) out.push({ k: "url", src: u[1], size: cs.backgroundSize, repeat: cs.backgroundRepeat }); }
      }
    }
    return out;
  };
  const shadows = (cs) => {
    if (!cs.boxShadow || cs.boxShadow === "none") return [];
    return splitTop(cs.boxShadow).map((s) => {
      const c = parseColor(s); const n = s.replace(/rgba?\([^)]*\)/, "").trim().split(/\s+/).map(px);
      return c ? { c, x: n[0], y: n[1], blur: n[2], spread: n[3] || 0 } : null;
    }).filter(Boolean);
  };
  const radii = (cs) => [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px);
  const ownRot = (el) => { const t = getComputedStyle(el).transform; if (!t || t === "none") return 0; const m = new DOMMatrix(t); return Math.atan2(m.b, m.a) / DEG; };
  const cumRot = (el) => { let a = 0; for (let e = el; e && e !== document.body; e = e.parentElement) a += ownRot(e); return a; };
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const rotV = ([x, y], deg) => { const a = deg * DEG; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; };

  // позиция узла внутри родителя (оба — элементы DOM), с учетом поворотов
  const place = (el, parent, w, h) => {
    const [cx, cy] = center(el), [pcx, pcy] = center(parent);
    const pw = parent.offsetWidth, ph = parent.offsetHeight;
    const pr = cumRot(parent), rel = cumRot(el) - pr;
    const [lx, ly] = rotV([cx - pcx, cy - pcy], -pr);
    const vx = lx + pw / 2, vy = ly + ph / 2;
    const [ox, oy] = rotV([-w / 2, -h / 2], rel);
    return { x: vx + ox, y: vy + oy, rot: rel };
  };

  const isInline = (el) => getComputedStyle(el).display === "inline" || el.tagName === "BR";
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // лист текста: есть текст (в любом месте внутри) и все вложенные элементы строчные (svg внутри текста — допустимо)
  const inlineDeep = (c) => (isInline(c) || c.tagName.toLowerCase() === "svg") && [...c.querySelectorAll("*")].every((d) => d.closest("svg") || isInline(d));
  const isLeaf = (el) => el.tagName !== "IMG" && el.tagName.toLowerCase() !== "svg" && (el.textContent.trim() || [...el.children].some((c) => c.tagName === "BR")) && [...el.children].length + [...el.childNodes].filter((n) => n.nodeType === 3).length > 0 && [...el.children].every(inlineDeep);

  // ---------- текст: символы и стилевые сегменты
  const textOf = (leaf) => {
    let chars = ""; const segs = [];
    const lcs = getComputedStyle(leaf);
    const upper = lcs.textTransform === "uppercase";
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          let t = n.textContent.replace(/\s+/g, " ");
          if (!t) continue;
          if (upper) t = t.toUpperCase();
          if (!chars || chars.endsWith("\n")) t = t.replace(/^ /, "");
          if (!t) continue;
          const el = n.parentElement, cs = getComputedStyle(el);
          let fill = null;
          // градиентный текст (background-clip: text)
          for (let e = el; e && e !== leaf.parentElement; e = e.parentElement) {
            const ecs = getComputedStyle(e);
            if ((ecs.webkitBackgroundClip === "text" || ecs.backgroundClip === "text") && ecs.backgroundImage !== "none") {
              const g = parseGradient(splitTop(ecs.backgroundImage)[0], 200, 40); if (g) fill = g; break;
            }
          }
          let op = 1; for (let e = el; e && e !== leaf; e = e.parentElement) op *= px(getComputedStyle(e).opacity) || 1;
          if (!fill) { const c = parseColor(cs.color); c[3] *= op; fill = { k: "solid", c }; }
          segs.push({ s: chars.length, e: chars.length + t.length, w: Number(cs.fontWeight), size: px(cs.fontSize), ls: px(cs.letterSpacing), fill });
          chars += t;
        } else if (n.nodeType === 1) {
          if (n.tagName === "BR") { chars = chars.replace(/ $/, "") + "\n"; continue; }
          if (n.tagName.toLowerCase() === "svg") continue;
          walk(n);
        }
      }
    };
    walk(leaf);
    chars = chars.replace(/ +$/, "");
    segs.forEach((s) => { s.e = Math.min(s.e, chars.length); });
    const lh = lcs.lineHeight === "normal" ? px(lcs.fontSize) * 1.2 : px(lcs.lineHeight);
    return { chars, segs: segs.filter((s) => s.e > s.s), lh, align: lcs.textAlign, nowrap: lcs.whiteSpace === "nowrap" };
  };

  const baseBox = (el, cs, w, h) => {
    const n = {};
    const fills = bgPaints(cs, w, h); if (fills.length) n.fills = fills;
    const bw = px(cs.borderTopWidth); const bcol = parseColor(cs.borderTopColor);
    if (bw > 0 && cs.borderTopStyle !== "none" && bcol && bcol[3] > 0) n.stroke = { c: bcol, w: bw };
    const r = radii(cs); if (r.some(Boolean)) n.radius = r;
    if (cs.overflow === "hidden" || cs.overflowX === "hidden") n.clip = true;
    const op = px(cs.opacity); if (cs.opacity !== "" && op < 1) n.op = op;
    const fx = shadows(cs); if (fx.length) n.fx = fx;
    if (cs.mixBlendMode && cs.mixBlendMode !== "normal") n.blend = cs.mixBlendMode;
    return n;
  };

  // псевдоэлементы ::before / ::after (панели, хвост пузыря, ручка тумблера…)
  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which);
    if (!cs || cs.content === "none" || cs.content === "normal" || cs.display === "none") return null;
    if (cs.position !== "absolute") return null;
    const W = el.offsetWidth, H = el.offsetHeight;
    const L = cs.left !== "auto" ? px(cs.left) : null, R = cs.right !== "auto" ? px(cs.right) : null;
    const T = cs.top !== "auto" ? px(cs.top) : null, B = cs.bottom !== "auto" ? px(cs.bottom) : null;
    let w = cs.width !== "auto" ? px(cs.width) : W - (L || 0) - (R || 0);
    let h = cs.height !== "auto" ? px(cs.height) : H - (T || 0) - (B || 0);
    const x = L != null ? L : R != null ? W - R - w : 0;
    let y = T != null ? T : B != null ? H - B - h : 0;
    if (cs.marginTop && px(cs.marginTop)) y += px(cs.marginTop);
    const node = { t: "frame", n: which.replace("::", ""), x, y, w, h, ...baseBox(el, cs, w, h) };
    const cp = cs.clipPath && cs.clipPath.match(/polygon\((.*)\)/);
    if (cp) { node.t = "poly"; node.pts = cp[1].split(",").map((p) => p.trim().split(/\s+/).map((v, i) => (px(v) / 100) * (i ? h : w))); }
    if (!node.fills && !node.stroke) return null;
    return node;
  };

  const zOf = (el) => { const z = getComputedStyle(el).zIndex; return z === "auto" ? 0 : Number(z); };

  // ---------- основной обход
  const build = (el, parent) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return [];
    if (el.tagName.toLowerCase() === "svg") {
      // встроенный SVG (стрелка): переносим как вектор, currentColor → реальный цвет
      const r = el.getBoundingClientRect(); const c = parseColor(cs.color) || [1, 1, 1, 1];
      const hex = "#" + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
      const vb = (el.getAttribute("viewBox") || `0 0 ${r.width} ${r.height}`).split(/\s+/).map(Number);
      let markup = el.outerHTML.replace(/currentColor/g, hex);
      // стили из CSS (овал: stroke, ширина) переносим в атрибуты, иначе Фигма их не увидит
      if (el.classList.contains("oval-svg")) {
        const pc = getComputedStyle(el.querySelector("path"));
        const st = parseColor(pc.stroke) || [1, 1, 1, 1];
        const sh = "#" + st.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
        const sw = px(pc.strokeWidth) * (Number((el.getAttribute("viewBox") || "0 0 200 100").split(/\s+/)[2]) / r.width);
        markup = markup.replace(/<path /g, `<path fill="none" stroke="${sh}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" `);
      }
      if (!/xmlns=/.test(markup)) markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const p = place(el.parentElement === parent ? el : el, parent, r.width, r.height);
      return [{ t: "svg", n: "иконка", ...p, w: r.width, h: r.height, inline: markup, vw: vb[2], vh: vb[3], fit: "contain" }];
    }
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w && !h) return [];
    const leaf = isLeaf(el);
    const box = baseBox(el, cs, w, h);
    const rot = Math.abs(cumRot(el) - cumRot(parent)) > 0.01;
    const cls = (el.className && typeof el.className === "string" ? el.className.split(" ")[0] : el.tagName.toLowerCase()) || "div";

    if (el.tagName === "IMG") {
      const p = place(el, parent, w, h);
      const ofit = cs.objectFit, opos = cs.objectPosition.split(" ").map((v) => px(v) / 100);
      const bw = /grayscale/.test(cs.filter);
      return [{ t: "img", n: "фото", ...p, w, h, src: el.currentSrc || el.src, nw: el.naturalWidth, nh: el.naturalHeight, fit: ofit, pos: opos, bw, ...(box.radius ? { radius: box.radius } : {}), ...(box.op ? { op: box.op } : {}) }];
    }

    const include = el === slide || leaf || rot || box.fills || box.stroke || box.fx || (box.clip && el.children.length) || pseudo(el, "::before") || pseudo(el, "::after");
    if (!include) {
      // прозрачная обертка: поднимаем детей к родителю
      const out = [];
      for (const c of el.children) out.push(...build(c, parent).map((n) => ({ ...n, z: zOf(c) || n.z || 0 })));
      return out;
    }
    const node = { t: "frame", n: cls, ...(el === slide ? { x: 0, y: 0, rot: 0 } : place(el, parent, w, h)), w, h, ...box, kids: [] };
    const before = pseudo(el, "::before"), after = pseudo(el, "::after");
    if (before) node.kids.push({ ...before, z: -1 });
    if (leaf) {
      const t = textOf(el);
      const padL = px(cs.paddingLeft) + px(cs.borderLeftWidth), padT = px(cs.paddingTop) + px(cs.borderTopWidth);
      const cw = el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
      // для flex-контейнеров с текстом (пилюли, кнопки) — центрирование по вертикали
      const range = document.createRange(); range.selectNodeContents(el);
      const rr = range.getBoundingClientRect(), er = el.getBoundingClientRect();
      // вертикаль: строки начинаются от верха контентной области; во flex-контейнере блок строк центрируется
      const tops = new Set([...range.getClientRects()].map((r) => Math.round((r.top + r.bottom) / 2 / Math.max(1, t.lh * 0.5))));
      const lines = Math.max(1, Math.round(rr.height / t.lh) || tops.size);
      const contentH = el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
      const centered = cs.display.includes("flex") && (cs.alignItems === "center" || cs.justifyContent === "center");
      const ty = padT + (centered ? Math.max(0, (contentH - lines * t.lh) / 2) : 0);
      const tx = rot || ["center", "right", "end"].includes(t.align) ? padL : Math.max(0, rr.left - er.left);
      const tw = t.nowrap || cs.display.includes("flex") ? Math.ceil(rr.width) + 2 : cw;
      // маркер (==текст==): плашки за строками — отдельными прямоугольниками под текстом
      for (const m of el.querySelectorAll(".mark")) {
        const mc = parseColor(getComputedStyle(m).backgroundColor);
        if (mc && mc[3] > 0) for (const r of m.getClientRects()) node.kids.push({ t: "frame", n: "маркер", x: r.left - er.left, y: r.top - er.top, w: r.width, h: r.height, rot: 0, fills: [{ k: "solid", c: mc }], z: 0 });
      }
      if (t.chars) node.kids.push({ t: "text", n: t.chars.slice(0, 30), x: tx, y: ty, w: tw, h: rr.height, rot: 0, ...t, z: 1 });
      // овал от руки ((слово)) и другие svg внутри текста — поверх
      for (const sv of el.querySelectorAll("svg")) node.kids.push(...build(sv, el).map((k) => ({ ...k, z: 2 })));
      if (!box.fills && !box.stroke && !box.fx && !rot && !before && !after) {
        // чистый текст без подложки — без лишнего фрейма
        if (node.kids.length === 1 && node.kids[0].t === "text") { const txt = node.kids[0]; return [{ ...txt, x: node.x + txt.x, y: node.y + txt.y, rot: node.rot, z: zOf(el) }]; }
        if (!node.kids.length) return [];
        node.n = "текст"; node.clip = false;
      }
    } else {
      for (const c of el.children) node.kids.push(...build(c, el).map((n) => ({ ...n, z: zOf(c) || n.z || 0 })));
    }
    if (after) node.kids.push({ ...after, z: 99 });
    node.kids = node.kids.map((k, i) => ({ k, i })).sort((a, b) => (a.k.z || 0) - (b.k.z || 0) || a.i - b.i).map(({ k }) => { delete k.z; return k; });
    return [node];
  };

  const root = build(slide, document.body)[0];
  root.n = "слайд";
  return { w: slide.offsetWidth, h: slide.offsetHeight, root };
})()
