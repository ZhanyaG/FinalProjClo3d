/* script.js
   - Brush reveal (accumulative mask)
   - Start CTA: show reveal area, run 5s demo cursor+highlight animation
     that starts from center and does a few left-right passes, then returns center.
   - Painting is enabled immediately when demo starts; start button hides.
   - Reset/back controls remain.
*/

/* ---------------------------
   DOM ready
   --------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Index copy (if present)
  const learnBtn = document.getElementById('learnMore');
  if (learnBtn) {
    learnBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const text = "Wear less. Style more. Switch looks instantly — digital outfits in AR/VR, simple real-world clothes. Cleaner wardrobe, lower waste.";
      navigator.clipboard?.writeText(text).then(() => {
        learnBtn.textContent = 'Copied!';
        setTimeout(() => learnBtn.textContent = 'Copy summary', 1500);
      });
    });
  }

  // Reveal page elements
  const startBtn = document.getElementById('startDemoBtn');
  const wrap = document.getElementById('revealWrap');
  const canvas = document.getElementById('displayCanvas');
  const imgBase = document.getElementById('imgBase');
  const imgOverlay = document.getElementById('imgOverlay');
  const controlsRow = document.getElementById('revealControls');
  const demoCursor = document.getElementById('demoCursor');
  const demoHighlight = document.getElementById('demoHighlight');
  const resetBtn = document.getElementById('reset');

  // create brush demo instance
  let brushDemo = null;
  if (wrap && canvas && imgBase && imgOverlay) {
    // note: no toggle button passed; painting will be enabled on start
    brushDemo = initBrushReveal({ wrap, canvas, imgBase, imgOverlay, resetBtn });
  }

  // Start CTA: show reveal, start 5s demo animation, enable painting immediately
  if (startBtn && wrap && brushDemo && demoCursor && demoHighlight) {
    startBtn.addEventListener('click', () => {
      // hide the start button after click
      startBtn.style.display = 'none';

      // reveal canvas area and controls
      wrap.classList.remove('hidden');
      if (controlsRow) controlsRow.style.display = 'flex';

      // fit & render so canvas matches image ratio
      setTimeout(() => {
        brushDemo.fitAndRender();

        // Enable painting immediately (user can draw while demo runs)
        brushDemo.enable();
        canvas.focus();

        // Start demo animation: 5 seconds, center start, left-right passes
        startDemoAnimation({
          wrap,
          canvas,
          demoCursor,
          demoHighlight,
          duration: 5000, // 5 seconds
          passes: 3,      // number of left-right passes
          onComplete: () => {
            // Hide demo UI after animation finishes (painting remains enabled)
            demoCursor.style.display = 'none';
            demoHighlight.style.display = 'none';
          }
        });

        // Bring reveal into view
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    });
  }
});

/* =========================
   Demo cursor + highlight animation (updated)
   - Starts from center, then performs `passes` left-right traversals, then returns center.
   - duration is total animation time in ms.
   - Moves demoCursor and demoHighlight; does not alter overlay mask.
   ========================= */
function startDemoAnimation({ wrap, canvas, demoCursor, demoHighlight, duration = 5000, passes = 3, onComplete = () => {} }) {
  // show demo elements
  demoCursor.style.display = 'block';
  demoCursor.classList.add('pulse');
  demoHighlight.style.display = 'block';

  // compute bounds
  const rect = canvas.getBoundingClientRect();
  const margin = 0.06;
  const leftX = rect.left + rect.width * margin;
  const rightX = rect.left + rect.width * (1 - margin);
  const centerX = rect.left + rect.width * 0.5;
  // vertical positions for passes: use center line (could vary slightly)
  const centerY = rect.top + rect.height * 0.5;

  // Build path: start at center, then for `passes` times go left->right (or right->left alternating),
  // finally return to center. Example with passes=3: center, left, right, left, right, center.
  const path = [];
  path.push({ x: centerX, y: centerY }); // start center

  // pick direction for first pass as left->right
  for (let p = 0; p < passes; p++) {
    if (p % 2 === 0) {
      path.push({ x: leftX, y: centerY });
      path.push({ x: rightX, y: centerY });
    } else {
      path.push({ x: rightX, y: centerY });
      path.push({ x: leftX, y: centerY });
    }
  }

  // ensure we end centered
  path.push({ x: centerX, y: centerY });

  // animation mapping
  const totalSegments = Math.max(1, path.length - 1);
  const startTime = performance.now();
  let rafId = null;

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration); // 0..1 normalized
    const segmentF = t * totalSegments;
    const segIndex = Math.floor(segmentF);
    const localT = Math.min(1, segmentF - segIndex);

    const a = path[Math.min(segIndex, path.length - 1)];
    const b = path[Math.min(segIndex + 1, path.length - 1)];
    const easeT = easeOutCubic(localT);

    const cx = a.x + (b.x - a.x) * easeT;
    const cy = a.y + (b.y - a.y) * easeT;

    // position demoCursor & demoHighlight centered at (cx, cy)
    demoCursor.style.left = `${cx}px`;
    demoCursor.style.top = `${cy}px`;
    demoHighlight.style.left = `${cx}px`;
    demoHighlight.style.top = `${cy}px`;

    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      // done
      if (rafId) cancelAnimationFrame(rafId);
      demoCursor.classList.remove('pulse');
      onComplete();
    }
  }

  rafId = requestAnimationFrame(step);

  // return handle to stop early if needed
  return {
    stop: () => {
      if (rafId) cancelAnimationFrame(rafId);
      demoCursor.classList.remove('pulse');
      demoCursor.style.display = 'none';
      demoHighlight.style.display = 'none';
      onComplete();
    }
  };
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/* =========================
   initBrushReveal (unchanged brush implementation)
   - returns { enable, disable, fitAndRender }
   ========================= */
function initBrushReveal({ wrap, canvas, imgBase, imgOverlay, resetBtn }) {
  const maskCanvas = document.createElement('canvas');
  const overlayCanvas = document.createElement('canvas');

  const ctx = canvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');

  let active = false;
  let isDrawing = false;
  let brushRadius = 80;
  let needsRender = false;
  let lastPointer = { x: 0, y: 0 };

  Promise.all([imageLoad(imgBase), imageLoad(imgOverlay)]).then(() => {
    fitCanvases();
    render();
    wireUI();
  }).catch(err => console.error('Image load failed', err));

  function imageLoad(img) {
    return new Promise((res, rej) => {
      if (img.complete && img.naturalWidth) return res();
      img.onload = res;
      img.onerror = rej;
    });
  }

  function fitCanvases() {
    const rect = wrap.getBoundingClientRect();
    const containerWidth = Math.max(200, Math.floor(rect.width));
    const imgRatio = imgBase.naturalWidth / imgBase.naturalHeight || 16/9;
    const displayHeight = Math.floor(containerWidth / imgRatio);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.floor(containerWidth * dpr);
    const pxH = Math.floor(displayHeight * dpr);

    canvas.width = overlayCanvas.width = maskCanvas.width = pxW;
    canvas.height = overlayCanvas.height = maskCanvas.height = pxH;

    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    brushRadius = Math.round(Math.max(24, Math.min(220, containerWidth * 0.06)));

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.drawImage(imgOverlay, 0, 0, overlayCanvas.width, overlayCanvas.height);

    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function wireUI() {
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        render();
      });
    }

    // Pointer events for painting (enabled when active = true)
    canvas.addEventListener('pointerdown', e => {
      if (!active) return;
      isDrawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const p = getPos(e);
      lastPointer = p;
      paintAt(p.x, p.y);
    });

    canvas.addEventListener('pointermove', e => {
      if (!active) return;
      const p = getPos(e);
      if (isDrawing) {
        paintLine(lastPointer.x, lastPointer.y, p.x, p.y);
        lastPointer = p;
      }
    });

    canvas.addEventListener('pointerup', e => {
      isDrawing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointercancel', () => { isDrawing = false; });

    // keyboard: space toggles, Escape disables
    canvas.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); if (active) disable(); else enable(); }
      else if (e.key === 'Escape') { if (active) disable(); }
    });

    // Resize: preserve mask content
    window.addEventListener('resize', () => {
      const tmp = document.createElement('canvas');
      tmp.width = maskCanvas.width; tmp.height = maskCanvas.height;
      tmp.getContext('2d').drawImage(maskCanvas, 0, 0);

      fitCanvases();

      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.drawImage(tmp, 0, 0, maskCanvas.width, maskCanvas.height);

      render();
    });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function paintAt(x, y) {
    const r = brushRadius;
    const g = maskCtx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    maskCtx.fillStyle = g;
    maskCtx.beginPath();
    maskCtx.arc(x, y, r, 0, Math.PI * 2);
    maskCtx.fill();
    scheduleRender();
  }

  function paintLine(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(4, brushRadius * 0.2);
    const steps = Math.ceil(dist / step);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : (i / steps);
      paintAt(x1 + dx * t, y1 + dy * t);
    }
  }

  function scheduleRender() {
    if (!needsRender) {
      needsRender = true;
      requestAnimationFrame(render);
    }
  }

  function render() {
    needsRender = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgBase, 0, 0, canvas.width, canvas.height);

    if (!active) return;

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.drawImage(imgOverlay, 0, 0, overlayCanvas.width, overlayCanvas.height);

    overlayCtx.globalCompositeOperation = 'destination-in';
    overlayCtx.drawImage(maskCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
  }

  function enable() {
    active = true;
    scheduleRender();
  }

  function disable() {
    active = false;
    render();
  }

  return { enable, disable, fitAndRender: fitCanvases };
}
