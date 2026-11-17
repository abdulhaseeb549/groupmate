/**
 * The PDF reader that runs inside a hidden web view (an iframe on web).
 *
 * Why a web view: pdf.js — the reader every browser uses — needs a browser
 * (canvas, workers). It loads from a CDN on first use, then the phone reads
 * the student's PDF itself: text page by page, scanned pages as small
 * pictures, and figures cut out of the page. Only that goes to the AI, so a
 * 300 MB textbook costs a few hundred KB of upload instead of being refused.
 *
 * The file never enters the web view whole: pdf.js asks the host for byte
 * ranges (PDFDataRangeTransport) and the host reads just those from disk.
 *
 * Messages are JSON strings both ways. Host → reader: window.__gm(json), or
 * window.postMessage(json) in an iframe. Reader → host: ReactNativeWebView
 * .postMessage, or parent.postMessage in an iframe. Protocol in reader.ts.
 *
 * Plain JS in a string: no backticks or dollar-brace inside, so it can sit in
 * this template literal untouched.
 */
const PDFJS_VERSION = '4.10.38';

const ENGINE_JS = String.raw`
const VERSION = '__V__';
const CDNS = [
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + VERSION + '/',
  'https://unpkg.com/pdfjs-dist@' + VERSION + '/',
];
let lib = null;
let base = '';
let doc = null;
let transport = null;

function send(msg) {
  const text = JSON.stringify(msg);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
  else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*');
}

async function loadLib() {
  if (lib) return lib;
  let last = null;
  for (const root of CDNS) {
    try {
      const m = await import(root + 'build/pdf.min.mjs');
      m.GlobalWorkerOptions.workerSrc = root + 'build/pdf.worker.min.mjs';
      lib = m;
      base = root;
      return m;
    } catch (e) {
      last = e;
    }
  }
  throw new Error('reader-load: ' + (last && last.message ? last.message : 'offline'));
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function cleanText(items) {
  let out = '';
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    out += it.str;
    out += it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : '');
  }
  return out.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function pageNumberOf(dest) {
  try {
    let d = dest;
    if (typeof d === 'string') d = await doc.getDestination(d);
    if (!Array.isArray(d) || !d[0]) return null;
    if (typeof d[0] === 'number') return d[0] + 1;
    return (await doc.getPageIndex(d[0])) + 1;
  } catch (e) {
    return null;
  }
}

/** Chapters from the PDF's bookmarks: top level, or one level down when the top is just the book's title. */
async function readOutline() {
  let items = null;
  try { items = await doc.getOutline(); } catch (e) { items = null; }
  if (!items || !items.length) return [];
  let level = items;
  if (items.length <= 2) {
    const kids = [];
    for (const it of items) for (const k of (it.items || [])) kids.push(k);
    if (kids.length >= 3) level = kids;
  }
  const out = [];
  for (const it of level.slice(0, 80)) {
    const page = await pageNumberOf(it.dest);
    const title = String(it.title || '').replace(/\s+/g, ' ').trim();
    if (page && title) out.push({ title: title.slice(0, 90), page: page });
  }
  out.sort(function (a, b) { return a.page - b.page; });
  const seen = new Set();
  return out.filter(function (c) { if (seen.has(c.page)) return false; seen.add(c.page); return true; });
}

/** Text pages or picture pages: a few pages spread through the book. */
async function looksScanned() {
  const n = doc.numPages;
  const picks = Array.from(new Set([1, 2, Math.ceil(n / 3), Math.ceil(n / 2), Math.ceil((2 * n) / 3)])).filter(function (p) { return p >= 1 && p <= n; });
  let textPages = 0;
  for (const p of picks) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    if (cleanText(tc.items).length >= 80) textPages++;
    page.cleanup();
  }
  return textPages * 2 < picks.length;
}

async function open(msg) {
  const m = await loadLib();
  class Transport extends m.PDFDataRangeTransport {
    requestDataRange(begin, end) { send({ type: 'range', begin: begin, end: end }); }
  }
  try {
    doc = await openWith(m, Transport, msg);
  } catch (e) {
    // The worker comes from the CDN too; if it failed, try the other one.
    if (!/worker/i.test(String(e && e.message))) throw e;
    const other = CDNS.find(function (r) { return r !== base; });
    m.GlobalWorkerOptions.workerSrc = other + 'build/pdf.worker.min.mjs';
    doc = await openWith(m, Transport, msg);
  }
  const outline = await readOutline();
  const scanned = await looksScanned();
  send({ type: 'opened', pages: doc.numPages, outline: outline, scanned: scanned });
}

async function openWith(m, Transport, msg) {
  transport = new Transport(msg.length, b64ToBytes(msg.head));
  const task = m.getDocument({
    range: transport,
    length: msg.length,
    rangeChunkSize: 262144,
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
  });
  task.onPassword = function () { send({ type: 'error', code: 'password' }); };
  return task.promise;
}

async function toJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

async function renderPage(page, width) {
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(width / v1.width, 2.5);
  const vp = page.getViewport({ scale: scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return toJpeg(canvas, 0.6);
}

/** Where each picture sits on the page (viewport units at scale 1). */
function imageBoxes(ops, vp) {
  const OPS = lib.OPS;
  const U = lib.Util;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const boxes = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = U.transform(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (args && Array.isArray(args[0]) && args[0].length === 6) ctm = U.transform(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (p) { return vp.convertToViewportPoint.apply(vp, U.applyTransform(p, ctm)); });
      const xs = pts.map(function (p) { return p[0]; });
      const ys = pts.map(function (p) { return p[1]; });
      boxes.push({ x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) });
    }
  }
  return boxes;
}

const CAPTION = /^\s*(fig(ure)?|table|chart|diagram|graph|source|image|photo)\b/i;

/** Grows a picture's box to take in the short labels printed around it ("Nucleus", "A"), never its caption. */
function withLabels(box, items, vp) {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const near = { x0: box.x0 - w * 0.18, y0: box.y0 - h * 0.12, x1: box.x1 + w * 0.18, y1: box.y1 + h * 0.06 };
  const out = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, floor: Infinity };
  const rects = [];
  for (const it of items) {
    const s = (it.str || '').trim();
    if (!s) continue;
    const t = it.transform;
    const r = vp.convertToViewportRectangle([t[4], t[5], t[4] + (it.width || 0), t[5] + (it.height || Math.abs(t[3]) || 8)]);
    rects.push({ s: s, x0: Math.min(r[0], r[2]), x1: Math.max(r[0], r[2]), y0: Math.min(r[1], r[3]), y1: Math.max(r[1], r[3]) });
  }
  for (const r of rects) {
    const x0 = r.x0, x1 = r.x1, y0 = r.y0, y1 = r.y1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (r.s.length > 28 || CAPTION.test(r.s)) continue;
    if (cx < near.x0 || cx > near.x1 || cy < near.y0 || cy > near.y1) continue;
    out.x0 = Math.min(out.x0, x0); out.y0 = Math.min(out.y0, y0);
    out.x1 = Math.max(out.x1, x1); out.y1 = Math.max(out.y1, y1);
  }
  // The crop stops above the first longer line of text under the figure
  // (its caption, which often names the answer).
  for (const r of rects) {
    if (r.s.length <= 28 && !CAPTION.test(r.s)) continue;
    if (r.y0 < out.y1 - 2 || r.x1 < out.x0 || r.x0 > out.x1) continue;
    out.floor = Math.min(out.floor, r.y0);
  }
  return out;
}

async function cropFigure(f) {
  const page = await doc.getPage(f.page);
  const v1 = page.getViewport({ scale: 1 });
  const pad = 6;
  const floor = Number.isFinite(f.box.floor) ? f.box.floor - 1 : v1.height;
  const b = { x0: Math.max(0, f.box.x0 - pad), y0: Math.max(0, f.box.y0 - pad), x1: Math.min(v1.width, f.box.x1 + pad), y1: Math.min(v1.height, floor, f.box.y1 + pad) };
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const scale = Math.min(900 / Math.max(w, h), 3);
  const vp = page.getViewport({ scale: scale, offsetX: -b.x0 * scale, offsetY: -b.y0 * scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return { data: await toJpeg(canvas, 0.72), w: canvas.width, h: canvas.height };
}

function spread(list, max) {
  if (list.length <= max) return list;
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.floor((i * list.length) / max)]);
  return out;
}

async function extract(msg) {
  const from = Math.max(1, msg.from), to = Math.min(doc.numPages, msg.to);
  const total = to - from + 1;
  const pages = [];
  const scans = [];
  let scansSkipped = 0;
  const textOnly = new Map();
  for (let p = from; p <= to; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = cleanText(tc.items);
    if (text.length < 60) {
      if (scans.length < msg.maxScans) scans.push({ page: p, data: await renderPage(page, 1100) });
      else scansSkipped++;
    } else {
      pages.push({ n: p, text: text });
      textOnly.set(p, tc.items);
    }
    page.cleanup();
    send({ type: 'progress', stage: 'text', done: p - from + 1, total: total });
  }

  const figures = [];
  if (msg.maxFigures > 0 && textOnly.size > 0) {
    // Looking for pictures is the slow part, so only some pages are searched.
    const searchPages = spread(Array.from(textOnly.keys()), 48);
    const found = [];
    const seenAt = new Map();
    let i = 0;
    for (const p of searchPages) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const area = vp.width * vp.height;
      let boxes = [];
      try { boxes = imageBoxes(await page.getOperatorList(), vp); } catch (e) { boxes = []; }
      const keep = [];
      for (const raw of boxes) {
        const bw = raw.x1 - raw.x0, bh = raw.y1 - raw.y0;
        const share = (bw * bh) / area;
        if (bw < vp.width * 0.2 || bh < vp.height * 0.08 || share < 0.04 || share > 0.7) continue;
        const key = [raw.x0, raw.y0, raw.x1, raw.y1].map(function (v) { return Math.round(v / 12); }).join(',');
        seenAt.set(key, (seenAt.get(key) || 0) + 1);
        keep.push({ page: p, key: key, share: share, box: withLabels(raw, textOnly.get(p) || [], vp) });
      }
      keep.sort(function (a, b) { return b.share - a.share; });
      for (const k of keep.slice(0, 2)) found.push(k);
      page.cleanup();
      i++;
      send({ type: 'progress', stage: 'figures', done: i, total: searchPages.length });
    }
    // The same picture in the same spot on many pages is a logo or a border.
    const real = found.filter(function (f) { return (seenAt.get(f.key) || 0) < 3; });
    const chosen = spread(real, msg.maxFigures);
    const perPage = new Map();
    for (const f of chosen) {
      const n = (perPage.get(f.page) || 0) + 1;
      perPage.set(f.page, n);
      try {
        const img = await cropFigure(f);
        figures.push({ id: 'p' + f.page + '-' + n, page: f.page, data: img.data, w: img.w, h: img.h });
      } catch (e) { /* a figure that will not draw is skipped */ }
    }
  }
  send({ type: 'extracted', pages: pages, scans: scans, scansSkipped: scansSkipped, figures: figures });
}

async function handle(raw) {
  let msg;
  try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; }
  try {
    if (msg.type === 'ping') send({ type: 'ready' });
    else if (msg.type === 'open') await open(msg);
    else if (msg.type === 'rangeData') transport.onDataRange(msg.begin, b64ToBytes(msg.data));
    else if (msg.type === 'extract') await extract(msg);
    else if (msg.type === 'close') { if (doc) await doc.destroy(); doc = null; }
  } catch (e) {
    const text = e && e.message ? e.message : String(e);
    const code = /password/i.test(text) ? 'password' : /reader-load/.test(text) ? 'offline' : /Invalid PDF|FormatError|corrupt/i.test(text) ? 'broken' : 'failed';
    send({ type: 'error', code: code, message: text.slice(0, 300) });
  }
}

window.__gm = handle;
window.addEventListener('message', function (e) { if (typeof e.data === 'string') handle(e.data); });
send({ type: 'ready' });
`.replace('__V__', PDFJS_VERSION);

export const ENGINE_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
  '</head><body><script type="module">' +
  ENGINE_JS +
  '</script></body></html>';
