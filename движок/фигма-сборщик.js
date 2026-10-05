// Глагол · сборщик слоев в Фигме (выполняется через use_figma). Данные подставляет движок/в-фигму.mjs.
const { SVGS, LIST } = /*DATA*/null;
const results = [];
const FAM = "Wix Madefor Display";
const STYLE = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold" };
for (const st of new Set(Object.values(STYLE))) await figma.loadFontAsync({ family: FAM, style: st });

let page = figma.root.children.find((p) => p.name === LIST[0].page);
if (!page) { page = figma.createPage(); page.name = LIST[0].page; }
await figma.setCurrentPageAsync(page);

let imgs = {};


const paint = (p) => p.k === "solid"
  ? { type: "SOLID", color: { r: p.c[0], g: p.c[1], b: p.c[2] }, opacity: p.c[3] }
  : { type: p.k === "lin" ? "GRADIENT_LINEAR" : "GRADIENT_RADIAL", gradientTransform: p.m, gradientStops: p.stops.map((s) => ({ color: { r: s[0], g: s[1], b: s[2], a: s[3] }, position: Math.min(1, Math.max(0, s[4])) })) };
const BLEND = { overlay: "OVERLAY", multiply: "MULTIPLY", screen: "SCREEN" };

function finish(node, n) {
  node.name = n.n || node.name;
  if (n.rot) node.rotation = -n.rot;
  node.x = n.x; node.y = n.y;
  if (n.op != null) node.opacity = n.op;
  if (n.blend && BLEND[n.blend]) node.blendMode = BLEND[n.blend];
  if (n.fx && "effects" in node) node.effects = n.fx.map((f) => ({ type: "DROP_SHADOW", color: { r: f.c[0], g: f.c[1], b: f.c[2], a: f.c[3] }, offset: { x: f.x, y: f.y }, radius: f.blur / 2, spread: f.spread, visible: true, blendMode: "NORMAL" }));
}
function corners(node, r) { if (!r) return; [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius] = r; }

function mk(n, parent) {
  let node;
  if (n.t === "text") {
    node = figma.createText();
    node.fontName = { family: FAM, style: "Regular" };
    node.characters = n.chars;
    for (const s of n.segs) {
      node.setRangeFontName(s.s, s.e, { family: FAM, style: STYLE[s.w] || "Regular" });
      node.setRangeFontSize(s.s, s.e, s.size);
      node.setRangeLetterSpacing(s.s, s.e, { unit: "PIXELS", value: s.ls });
      node.setRangeFills(s.s, s.e, [paint(s.fill)]);
    }
    node.lineHeight = { unit: "PIXELS", value: n.lh };
    node.textAlignHorizontal = { center: "CENTER", right: "RIGHT", end: "RIGHT", justify: "JUSTIFIED" }[n.align] || "LEFT";
    parent.appendChild(node);
    const single = !n.chars.includes("\n") && n.h < n.lh * 1.6;
    const leftish = !["center", "right", "end"].includes(n.align);
    if (n.nowrap || (single && leftish)) node.textAutoResize = "WIDTH_AND_HEIGHT";
    else { node.textAutoResize = "HEIGHT"; node.resize(Math.max(1, n.w + 2), node.height); }
    finish(node, n);
    return node;
  }
  if (n.t === "svg") {
    // вектор из SVG, вписанный в рамку как object-fit
    const box = figma.createFrame(); box.fills = []; box.clipsContent = n.fit !== "visible"; parent.appendChild(box);
    box.resizeWithoutConstraints(Math.max(1, n.w), Math.max(1, n.h)); corners(box, n.radius);
    const v = figma.createNodeFromSvg(SVGS[n.key]); v.name = n.key;
    const s = n.fit === "contain" ? Math.min(n.w / n.vw, n.h / n.vh) : Math.max(n.w / n.vw, n.h / n.vh);
    box.appendChild(v); v.rescale(s * n.vw / v.width);
    v.x = (n.w - v.width) * (n.pos?.[0] ?? 0.5); v.y = (n.h - v.height) * (n.pos?.[1] ?? 0.5);
    finish(box, { ...n, n: n.n || "графика" });
    return box;
  }
  if (n.t === "img") {
    node = figma.createRectangle(); parent.appendChild(node);
    node.resize(Math.max(1, n.w), Math.max(1, n.h)); corners(node, n.radius);
    node.fills = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
    finish(node, { ...n, n: "фото:" + n.key });
    imgs[n.key] = node.id;
    return node;
  }
  if (n.t === "poly") {
    const c = n.fills?.find((f) => f.k === "solid")?.c || [1, 1, 1, 1];
    const hex = "#" + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    node = figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n.w}" height="${n.h}" viewBox="0 0 ${n.w} ${n.h}"><polygon points="${n.pts.map((p) => p.join(",")).join(" ")}" fill="${hex}" fill-opacity="${c[3]}"/></svg>`);
    parent.appendChild(node); finish(node, n); return node;
  }
  node = figma.createFrame(); parent.appendChild(node);
  node.resizeWithoutConstraints(Math.max(1, n.w), Math.max(1, n.h));
  node.fills = (n.fills || []).map(paint);
  node.clipsContent = !!n.clip;
  corners(node, n.radius);
  if (n.stroke) { node.strokes = [paint({ k: "solid", c: n.stroke.c })]; node.strokeWeight = n.stroke.w; node.strokeAlign = "INSIDE"; }
  finish(node, n);
  for (const k of n.kids || []) mk(k, node);
  return node;
}

for (const D of LIST) {
// секция поста и формата
const secName = `${D.title} · ${D.fmtName}`;
let sec = page.children.find((n) => n.type === "SECTION" && n.name === secName);
if (!sec) {
  const bottom = page.children.reduce((m, n) => Math.max(m, n.y + n.height), 0);
  sec = figma.createSection(); sec.name = secName; page.appendChild(sec);
  sec.x = 0; sec.y = page.children.length > 1 ? bottom + 200 : 0;
  sec.resizeWithoutConstraints(200 + D.total * (D.W + 80), D.H + 240);
}
const old = sec.children.find((n) => n.name === D.frameName); if (old) old.remove();
imgs = {};
const root = D.root;
const frame = figma.createFrame();
sec.appendChild(frame);
frame.name = D.frameName;
frame.resizeWithoutConstraints(D.W, D.H);
frame.fills = (root.fills || []).map(paint);
frame.clipsContent = true;
frame.x = 100 + D.idx * (D.W + 80); frame.y = 140;
for (const k of root.kids || []) mk(k, frame);
results.push({ slide: D.frameName, frameId: frame.id, section: sec.id, imgs });
}
return { page: page.id, results };
