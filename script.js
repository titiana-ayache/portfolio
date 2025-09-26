// script.js - PDF viewer with natural aspect ratio and Ctrl+wheel zoom
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

// helper: pick best scale to fit container height, preserving PDF aspect ratio
function pickBestScaleForPage(page) {
  const v1 = page.getViewport({ scale: 1 });
  const availH = viewer.clientHeight;
  const availW = viewer.clientWidth;

  // scale based on height first
  const scaleH = availH / v1.height;
  const scaledWidth = v1.width * scaleH;

  // if width fits container, use it; else scale down to width
  return scaledWidth <= availW ? scaleH : availW / v1.width;
}

// prepare canvas for crisp rendering and natural aspect ratio
function prepareCanvas(viewport) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  // compute scale to fit height, preserve aspect ratio
  const maxHeight = viewer.clientHeight;
  const scaleFactor = maxHeight / viewport.height;

  const scaledWidth = viewport.width * scaleFactor;
  const scaledHeight = viewport.height * scaleFactor;

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);

  canvas.style.width = `${scaledWidth}px`;
  canvas.style.height = `${scaledHeight}px`;

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

// zoom functions (ctrl+wheel)
function zoomBy(factor) {
  const newScale = Math.max(0.25, Math.min(8, +(scale * factor).toFixed(3)));
  if (Math.abs(newScale - scale) < 0.0001) return;
  scale = newScale;
  fitMode = 'custom';
  queueRender(pageNum);
}

// compute initial scale based on fitMode
function computeInitialScaleAndRender() {
  if (!pdfDoc) return;
  pdfDoc.getPage(pageNum).then(page => {
    if (fitMode === 'auto') scale = pickBestScaleForPage(page);
    else if (fitMode === 'width') {
      const v = page.getViewport({ scale: 1 });
      scale = viewer.clientWidth / v.width;
    } else if (fitMode === 'page') {
      const v = page.getViewport({ scale: 1 });
      scale = Math.min(viewer.clientWidth / v.width, viewer.clientHeight / v.height);
    }
    scale = Math.max(0.25, Math.min(8, +scale.toFixed(3)));
    queueRender(pageNum);
  });
}

// keyboard navigation
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { prevPage(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { nextPage(); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { zoomBy(1.2); e.preventDefault(); }
  if (e.key === '-') { zoomBy(1 / 1.2); e.preventDefault(); }
});

// swipe navigation
let sx = 0, sy = 0;
viewer.addEventListener('touchstart', e => {
  if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
}, { passive: true });
viewer.addEventListener('touchend', e => {
  if (!sx) return;
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) dx > 0 ? prevPage() : nextPage();
  sx = 0; sy = 0;
}, { passive: true });

// arrow buttons
prevBtn.addEventListener('click', prevPage);
nextBtn.addEventListener('click', nextPage);

// Ctrl + wheel zoom
viewer.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const delta = e.deltaY;
  const factor = delta < 0 ? 1.12 : 1 / 1.12;
  zoomBy(factor);
}, { passive: false });

// responsive: recompute best fit when viewer size changes
const ro = new ResizeObserver(() => {
  if (!pdfDoc) return;
  if (fitMode === 'auto' || fitMode === 'width' || fitMode === 'page') computeInitialScaleAndRender();
  else queueRender(pageNum); // keep custom scale
});
ro.observe(viewer);

// load PDF and initial render
pdfjsLib.getDocument(URL).promise.then(pdf => {
  pdfDoc = pdf;
  fitMode = 'auto';
  computeInitialScaleAndRender();
  updateUI();
}).catch(err => {
  console.error('Failed to load PDF', err);
  indicator.textContent = 'Failed to load';
});
