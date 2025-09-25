// Import PDF.js as an ES module
import * as pdfjsLib from './pdf.js/pdf.mjs';

// Point to the worker MJS
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.js/pdf.worker.mjs';

const url = './portfolio.pdf'; // your PDF file

let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    scale = 1.5,
    canvas = document.getElementById('pdf-render'),
    ctx = canvas.getContext('2d');

function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });

        document.getElementById('page-num').textContent = num;
    });
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

function onPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
}

function onNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
}

function zoomIn() {
    scale += 0.2;
    queueRenderPage(pageNum);
}

function zoomOut() {
    if (scale <= 0.4) return;
    scale -= 0.2;
    queueRenderPage(pageNum);
}

// Load PDF
pdfjsLib.getDocument(url).promise.then(function(pdfDoc_) {
    pdfDoc = pdfDoc_;
    document.getElementById('page-count').textContent = pdfDoc.numPages;
    renderPage(pageNum);
});

// Button events
document.getElementById('prev').addEventListener('click', onPrevPage);
document.getElementById('next').addEventListener('click', onNextPage);
document.getElementById('zoom-in').addEventListener('click', zoomIn);
document.getElementById('zoom-out').addEventListener('click', zoomOut);