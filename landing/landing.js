/*
 * The landing page's only script: reveal blocks as they scroll into view.
 *
 * Kept deliberately tiny and dependency-free — this page must stay fast, and it
 * is the first thing anyone sees. If IntersectionObserver is missing, or the
 * visitor asked for reduced motion, everything is simply shown at once; the CSS
 * already handles the reduced-motion case on its own, so this is the JS half of
 * the same promise.
 */

/*
 * Screenshots are captured by hand and dropped into public/shots/. A missing or
 * renamed one must never show a broken-image icon on the front page, so the
 * figure falls back to a labelled frame using the img's own alt text — which is
 * exactly the description of what belongs there.
 */
function standIn(img) {
  const figure = img.closest('.shot');
  if (!figure || figure.classList.contains('shot-missing')) return;
  figure.classList.add('shot-missing');
  // The ATTRIBUTES, not img.width/height: on a broken image those report the
  // rendered size of the placeholder glyph (measured: 72×449), which turns a
  // 16:9 frame into a 6685px column.
  const w = Number(img.getAttribute('width')) || 16;
  const h = Number(img.getAttribute('height')) || 9;
  figure.style.setProperty('--ratio', `${w} / ${h}`);
  const note = document.createElement('p');
  note.className = 'shot-note';
  note.textContent = img.alt || 'Screenshot';
  figure.append(note);
  img.remove();
}

for (const img of document.querySelectorAll('.shot img')) {
  // This script is a module, so it runs deferred — an image that 404'd during
  // parsing already fired its error event before we got here. Catching only the
  // event would silently miss exactly the case this exists for.
  if (img.complete && img.naturalWidth === 0) standIn(img);
  else img.addEventListener('error', () => standIn(img));
}

const blocks = document.querySelectorAll('.reveal');
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (still || !('IntersectionObserver' in window)) {
  blocks.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // Also reveal anything ALREADY above the viewport. Without this, a
        // reload that restores a scroll position — or any jump link — leaves
        // every block it skipped past invisible forever, because those never
        // report isIntersecting again. Measured: 1 of 24 blocks visible after
        // landing mid-page.
        const passed = entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passed) continue;
        // Stagger within one screenful only. Long delays read as a slow page,
        // so this caps out well before it becomes a queue.
        const delay = Math.min(entry.target.dataset.i ?? 0, 3) * 60;
        setTimeout(() => entry.target.classList.add('in'), delay);
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
  );

  blocks.forEach((el, i) => {
    el.dataset.i = String(i % 4);
    io.observe(el);
  });
}
