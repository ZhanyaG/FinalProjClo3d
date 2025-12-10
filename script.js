// script.js - used on both pages (index.html and reveal.html)
// For reveal page it controls the clip-path brush. For index page it wires the "Download copy" demo hook.

document.addEventListener('DOMContentLoaded', () => {
  // If reveal elements exist, initialize the brush demo
  const revealWrap = document.getElementById('revealWrap');
  const overlay = document.getElementById('overlayImage');
  const toggleBtn = document.getElementById('toggleGlasses');
  const resetBtn = document.getElementById('reset');

  if (revealWrap && overlay && toggleBtn) {
    initRevealDemo({ wrap: revealWrap, overlay, toggleBtn, resetBtn });
  }

  // Small extra: the "Download copy" button on index (if present) will copy the short text to clipboard
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
});

// ===== Reveal demo implementation =====
function initRevealDemo({ wrap, overlay, toggleBtn, resetBtn }) {
  let active = false;
  let radius = Math.round(Math.max(60, Math.min(180, (wrap.clientWidth || window.innerWidth) * 0.12))); // responsive radius
  // for soft edge we could use SVG mask or canvas; this is simple hard circle

  function enable() {
    active = true;
    wrap.classList.add('active');
    toggleBtn.textContent = 'Remove glasses';
    // show small circle at center (or wait for pointer)
    setClip(1, wrap.getBoundingClientRect().left + wrap.clientWidth / 2, wrap.getBoundingClientRect().top + wrap.clientHeight / 2);
    // add listeners
    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('touchmove', onTouchMove, { passive:false });
    wrap.addEventListener('mouseleave', onLeave);
    wrap.addEventListener('touchend', onLeave);
    // keyboard support: Escape to disable
    window.addEventListener('keydown', onKeyDown);
  }

  function disable() {
    active = false;
    wrap.classList.remove('active');
    toggleBtn.textContent = 'Wear glasses';
    overlay.style.clipPath = `circle(0px at 50% 50%)`;
    overlay.style.webkitClipPath = `circle(0px at 50% 50%)`;
    wrap.removeEventListener('mousemove', onMove);
    wrap.removeEventListener('touchmove', onTouchMove);
    wrap.removeEventListener('mouseleave', onLeave);
    wrap.removeEventListener('touchend', onLeave);
    window.removeEventListener('keydown', onKeyDown);
  }

  toggleBtn.addEventListener('click', () => {
    if (active) disable();
    else enable();
  });

  resetBtn?.addEventListener('click', () => {
    disable();
  });

  // compute and set clip (px radius) using page coordinates
  function setClip(pxRadius, pageX, pageY) {
    const rect = wrap.getBoundingClientRect();
    // convert page coords -> percentage position inside wrap
    // use pageX/pageY (clientX would also work since no scrolling likely)
    const xPct = ((pageX - rect.left) / rect.width) * 100;
    const yPct = ((pageY - rect.top) / rect.height) * 100;
    // clamp percentages just in case
    const xClamped = Math.max(0, Math.min(100, xPct));
    const yClamped = Math.max(0, Math.min(100, yPct));
    overlay.style.clipPath = `circle(${pxRadius}px at ${xClamped}% ${yClamped}%)`;
    overlay.style.webkitClipPath = `circle(${pxRadius}px at ${xClamped}% ${yClamped}%)`;
  }

  // event handlers
  function onMove(e) {
    if (!active) return;
    const x = e.clientX;
    const y = e.clientY;
    setClip(radius, x, y);
  }

  function onTouchMove(e) {
    if (!active) return;
    e.preventDefault();
    const t = e.touches[0];
    setClip(radius, t.clientX, t.clientY);
  }

  function onLeave() {
    // smoothly hide (instant here)
    overlay.style.clipPath = `circle(0px at 50% 50%)`;
    overlay.style.webkitClipPath = `circle(0px at 50% 50%)`;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && active) {
      disable();
    }
  }

  // make radius responsive on resize
  window.addEventListener('resize', () => {
    radius = Math.round(Math.max(50, Math.min(200, (wrap.clientWidth || window.innerWidth) * 0.12)));
  });
}
