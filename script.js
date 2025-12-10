// script.js - brush reveal implementation (accumulative mask).
// Works with reveal.html (png1.png = base, png2.png = overlay).
// Also preserves the small index page "copy" button behavior if present.

document.addEventListener('DOMContentLoaded', () => {
  // init index page copy button (if present)
  const learnBtn = document.getElementById('learnMore');
  if (learnBtn) {
    learnBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const text = "Wear less. Style more. Switch looks instantly — digital outfits in AR/VR, simple real-world clothes. Cleaner wardrobe, lower waste.";
      navigator.clipboard?.writeText(text).then(() => {
        learnBtn.textContent = 'Copied!';
        setTimeout(()=> learnBtn.textContent = 'Download copy', 1500);
      }, () => {
        learnBtn.textContent = 'Copy failed';
        setTimeout(()=> learnBtn.textContent = 'Download copy', 1500);
      });
    });
  }

  // If reveal page elements exist, init the brush reveal
  const revealWrap = document.getElementById('revealWrap');
  const displayCanvas = document.getElementById('displayCanvas');
  const imgBase = document.getElementById('imgBase');
  const imgOverlay = document.getElementById('imgOverlay');
  const toggleBtn = document.getElementById('toggleGlasses');
  const resetBtn = document.getElementById('reset');

  if (revealWrap && displayCanvas && imgBase && imgOverlay && toggleBtn) {
    initBrushReveal({
      wrap: revealWrap,
      canvas: displayCanvas,
      imgBase,
      imgOverlay,
      toggleBtn,
      resetBtn
    });
  }
});

// ====== Brush reveal implementation ======
function initBrushReveal({ wrap, canvas, imgBase, imgOverlay, toggleBtn, resetBtn }) {
  // Offscreen canvases
  const maskCanvas = document.createElement('canvas');     // stores accumulated brush (alpha mask)
  const overlayCanvas = document.createElement('canvas');  // overlay image drawn + masked by maskCanvas

  const ctx = canvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');

  let active = false;           // "glasses" mode
  let isDrawing = false;        // pointer is down / touching
  let brushRadius = 80;         // default brush radius in px (will be responsive)
  let needsRender = false;      // requestAnimationFrame flag
  let lastPointer = { x: 0, y: 0 };

  // Wait for both images to load (they may already be cached)
  Promise.all([imageLoadPromise(imgBase), imageLoadPromise(imgOverlay)])
    .then(() => {
      // set canvas sizes based on base image natural size and container width
      fitCanvasesToContainer();
      // initial render: base only
      render();
      // wire controls & events
      wireUI();
    })
    .catch((err) => {
      console.error('Image load failed', err);
    });

  function imageLoadPromise(imgEl) {
    return new Promise((resolve, reject) => {
      if (imgEl.complete && imgEl.naturalWidth) return resolve();
      imgEl.onload = () => resolve();
      imgEl.onerror = reject;
    });
  }

  function fitCanvasesToContainer() {
    // we want the canvas pixel dimensions to match the image aspect ratio and container width
    const rect = wrap.getBoundingClientRect();
    const containerWidth = Math.max(200, Math.floor(rect.width));
    const imgW = imgBase.naturalWidth;
    const imgH = imgBase.naturalHeight;
    const aspect = imgW / imgH;

    // Set display canvas CSS will stretch to fit; set internal pixel size for crispness
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for performance
    const displayWidth = Math.floor(containerWidth * dpr);
    const displayHeight = Math.floor(displayWidth / aspect);

    // Apply sizes for visible canvas
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${Math.floor(rect.width / aspect)}px`;

    // Apply same pixel sizes to offscreen canvases
    maskCanvas.width = displayWidth;
    maskCanvas.height = displayHeight;
    overlayCanvas.width = displayWidth;
    overlayCanvas.height = displayHeight;

    // Compute brush radius relative to canvas size (responsive)
    brushRadius = Math.round(Math.max(24, Math.min(220, displayWidth * 0.06)));

    // Draw the overlay image into overlayCanvas (we will re-draw each frame after masking)
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.drawImage(imgOverlay, 0, 0, overlayCanvas.width, overlayCanvas.height);

    // mask start cleared
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function wireUI() {
    // Toggle glasses
    toggleBtn.addEventListener('click', () => {
      active = !active;
      if (active) {
        toggleBtn.textContent = 'Remove glasses';
        canvas.focus();
      } else {
        toggleBtn.textContent = 'Wear glasses';
      }
      render(); // show/hide overlay
    });

    resetBtn?.addEventListener('click', () => {
      // clear mask completely
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      render();
    });

    // Pointer events (mouse & pen)
    canvas.addEventListener('pointerdown', (e) => {
      if (!active) return;
      isDrawing = true;
      canvas.setPointerCapture(e.pointerId);
      const pos = getPointerPos(e);
      lastPointer = pos;
      paintAt(pos.x, pos.y);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!active) return;
      const pos = getPointerPos(e);
      if (isDrawing) {
        // paint along the line between last pointer and current for continuous strokes
        paintLine(lastPointer.x, lastPointer.y, pos.x, pos.y);
        lastPointer = pos;
      } else {
        // Optional: preview or show a cursor; not required
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!active) return;
      isDrawing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
    });

    // Leave/Cancel
    canvas.addEventListener('pointercancel', () => { isDrawing = false; });

    // Touch fallback handled by pointer events above (pointer events cover touch)
    // Keyboard: Space to toggle, Escape to disable
    canvas.addEventListener('keydown', (e) => {
      if (e.key === ' ') { // space toggles
        e.preventDefault();
        toggleBtn.click();
      } else if (e.key === 'Escape') {
        if (active) toggleBtn.click();
      }
    });

    // Resize handling
    window.addEventListener('resize', () => {
      // preserve existing mask by copying to a temp canvas, resizing canvases and drawing it back scaled
      const tempMask = document.createElement('canvas');
      const tempCtx = tempMask.getContext('2d');
      tempMask.width = maskCanvas.width;
      tempMask.height = maskCanvas.height;
      tempCtx.drawImage(maskCanvas, 0, 0);

      fitCanvasesToContainer();

      // draw old mask scaled into new mask
      maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
      maskCtx.drawImage(tempMask, 0, 0, maskCanvas.width, maskCanvas.height);

      // redraw overlay base into overlayCanvas
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      overlayCtx.drawImage(imgOverlay, 0, 0, overlayCanvas.width, overlayCanvas.height);

      render();
    });
  }

  // paint a soft circle at x,y into the mask (accumulative)
  function paintAt(x, y) {
    const r = brushRadius;
    // radial gradient for soft edges
    const g = maskCtx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    maskCtx.fillStyle = g;
    maskCtx.beginPath();
    maskCtx.arc(x, y, r, 0, Math.PI * 2);
    maskCtx.fill();

    scheduleRender();
  }

  // stroke a line by sampling circles between points
  function paintLine(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(4, brushRadius * 0.2); // spacing between stamp circles
    const steps = Math.ceil(dist / step);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const xi = x1 + dx * t;
      const yi = y1 + dy * t;
      paintAt(xi, yi);
    }
  }

  // convert pointer event to canvas pixel coords
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  // schedule a render on next animation frame (throttles rendering)
  function scheduleRender() {
    if (!needsRender) {
      needsRender = true;
      requestAnimationFrame(render);
    }
  }

  // Render: draw base image, then overlay masked by maskCanvas
  function render() {
    needsRender = false;
    // Draw base image on visible canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgBase, 0, 0, canvas.width, canvas.height);

    if (!active) return; // if not active, do not draw overlay

    // Prepare overlay canvas: draw overlay image, then keep only parts where mask exists
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCtx.drawImage(imgOverlay, 0, 0, overlayCanvas.width, overlayCanvas.height);

    // Use 'destination-in' to keep only where mask alpha > 0
    overlayCtx.globalCompositeOperation = 'destination-in';
    overlayCtx.drawImage(maskCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height);

    // reset composite mode
    overlayCtx.globalCompositeOperation = 'source-over';

    // Draw masked overlay onto visible canvas (over base)
    ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
  }
}
