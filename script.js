// script.js - minimal, crisp PDF viewer with Ctrl+wheel zoom
import * as pdfjsLib from './pdf.js/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.js/pdf.worker.mjs';

const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const indicator = document.getElementById('page-indicator');
const viewer = document.getElementById('viewer');

const URL = 'portfolio.pdf';

// state
let pdfDoc = null;
let pageNum = 1;
let scale = 1;
let fitMode = 'auto'; // auto = choose best fit for current viewer
let rendering = false;
let pending = null;

// helper: pick the best initial fit for current screen:
// - if page is wider relative to viewer -> fit width
// - else -> fit page (fit both)
function pickBestScaleForPage(page) {
  const v1 = page.getViewport({ scale: 1 }); // natural size (PDF points)
  const availW = viewer.clientWidth;
  const availH = viewer.clientHeight;
  const sx = availW / v1.width;
  const sy = availH / v1.height;
  // if page is wide (sx < sy) prefer width; else prefer page fit so full page visible
  return (sx < sy) ? sx : Math.min(sx, sy);
}

// ensure crisp rendering: set canvas size using devicePixelRatio
function prepareCanvas(viewport) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// render page n
function renderPage(n) {
  rendering = true;
  pdfDoc.getPage(n).then(page => {
    const viewport = page.getViewport({ scale });
    prepareCanvas(viewport);

    const renderTask = page.render({ canvasContext: ctx, viewport });
    renderTask.promise.then(() => {
      rendering = false;
      updateUI();
      if (pending !== null) { const p = pending; pending = null; renderPage(p); }
    }).catch(err => {
      console.error('Render error', err);
      rendering = false;
    });
  }).catch(err => {
    console.error('Page load error', err);
    rendering = false;
  });
}

function queueRender(n) {
  if (rendering) pending = n; else renderPage(n);
}

function updateUI() {
  indicator.textContent = `${pageNum} / ${pdfDoc ? pdfDoc.numPages : '--'}`;
}

// navigation
function prevPage() { if (pageNum <= 1) return; pageNum--; queueRender(pageNum); }
function nextPage() { if (!pdfDoc) return; if (pageNum >= pdfDoc.numPages) return; pageNum++; queueRender(pageNum); }

// zoom functions (ctrl+wheel will call these)
function zoomBy(factor, center) {
  // center currently unused — zoom is page-centered; could be extended to zoom toward cursor
  const newScale = Math.max(0.25, Math.min(8, +(scale * factor).toFixed(3)));
  if (Math.abs(newScale - scale) < 0.0001) return;
  scale = newScale;
  fitMode = 'custom';
  queueRender(pageNum);
}

// Choose and set scale based on fit mode = 'auto' (best fit), 'width', 'page', or 'custom'
function computeInitialScaleAndRender() {
  if (!pdfDoc) return;
  pdfDoc.getPage(pageNum).then(page => {
    if (fitMode === 'auto') {
      scale = pickBestScaleForPage(page);
    } else if (fitMode === 'width') {
      const v = page.getViewport({ scale: 1 });
      scale = viewer.clientWidth / v.width;
    } else if (fitMode === 'page') {
      const v = page.getViewport({ scale: 1 });
      scale = Math.min(viewer.clientWidth / v.width, viewer.clientHeight / v.height);
    }
    // clamp scale to sensible bounds
    scale = Math.max(0.25, Math.min(8, +scale.toFixed(3)));
    queueRender(pageNum);
  });
}

// keyboard and swipe
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { prevPage(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { nextPage(); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { zoomBy(1.2); e.preventDefault(); }
  if (e.key === '-') { zoomBy(1 / 1.2); e.preventDefault(); }
});

let sx = 0, sy = 0;
viewer.addEventListener('touchstart', e => {
  if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
}, { passive: true });
viewer.addEventListener('touchend', e => {
  if (!sx) return;
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { dx > 0 ? prevPage() : nextPage(); }
  sx = 0; sy = 0;
}, { passive: true });

// arrow buttons
prevBtn.addEventListener('click', prevPage);
nextBtn.addEventListener('click', nextPage);

// Ctrl + mouse wheel zoom
viewer.addEventListener('wheel', (e) => {
  // Only act when ctrlKey is pressed (standard for zooming GUIs)
  if (!e.ctrlKey) return;
  e.preventDefault(); // prevent browser zoom
  // wheel deltaY: negative -> zoom in, positive -> zoom out. Use small scale per tick.
  const delta = e.deltaY;
  const factor = delta < 0 ? 1.12 : 1 / 1.12;
  // optionally, can compute zoom towards cursor by using center coords (not implemented)
  zoomBy(factor);
}, { passive: false });

// responsive: recompute best fit when viewer size changes
const ro = new ResizeObserver(() => {
  if (!pdfDoc) return;
  // if user hasn't manually zoomed (fitMode == 'auto' or 'width'/'page') recompute best fit;
  if (fitMode === 'auto' || fitMode === 'width' || fitMode === 'page') {
    computeInitialScaleAndRender();
  } else {
    // keep custom scale but re-render for DPI changes / canvas resizing
    queueRender(pageNum);
  }
});
ro.observe(viewer);

// load PDF and initial render
pdfjsLib.getDocument(URL).promise.then(pdf => {
  pdfDoc = pdf;
  // choose auto fit then render
  fitMode = 'auto';
  computeInitialScaleAndRender();
  updateUI();
}).catch(err => {
  console.error('Failed to load PDF', err);
  indicator.textContent = 'Failed to load';
});
