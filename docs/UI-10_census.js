// UI-10 inventaris — a DOM census of what the visitor SEES on one screen.
// Runs in the page; returns one JSON row. Counts only visible elements inside <main>.
(() => {
  const root = document.querySelector('main') || document.body;
  const vis = (el) => {
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    // inside a closed <details>? count as hidden
    let p = el.parentElement;
    while (p && p !== root) {
      if (p.tagName === 'DETAILS' && !p.open && !(el.closest('summary') && el.closest('summary').parentElement === p)) return false;
      p = p.parentElement;
    }
    return true;
  };
  const q = (sel) => [...root.querySelectorAll(sel)].filter(vis);
  const words = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;
  const text = q('p, li, span.derived, div.derived, label, h2, h3, h4, strong, td, th, summary')
    .filter((el) => !el.querySelector('p, li, h2, h3, h4, td, th')) // leaves only
    .map((el) => el.innerText || '');
  const inputs = q('input[type="text"], input[type="number"], input:not([type])');
  const selects = q('select');
  const checks = q('input[type="checkbox"], input[type="radio"]');
  const buttons = q('button');
  const derived = q('.derived, .nl-warning, .nfm-proposed, .v2-stated').map((el) => el.innerText || '');
  const paras = q('p').map((el) => words(el.innerText));
  const details = [...root.querySelectorAll('details')].filter((d) => vis(d));
  const totalWords = words(root.innerText);
  const helpWords = derived.reduce((a, s) => a + words(s), 0);
  const long = paras.filter((w) => w > 40).length;
  const placeholders = inputs.filter((i) => i.placeholder && i.placeholder !== '—').length;
  const units = q('input + span, input ~ span').length;
  return {
    url: location.hash,
    title: (document.querySelector('main h2, main h3') || {}).innerText || '',
    inputs: inputs.length,
    selects: selects.length,
    checksRadios: checks.length,
    buttons: buttons.length,
    detailsOpen: details.filter((d) => d.open).length,
    detailsClosed: details.filter((d) => !d.open).length,
    totalWords,
    helpWords,
    helpShare: totalWords ? Math.round((100 * helpWords) / totalWords) : 0,
    paragraphs: paras.length,
    longParagraphs: long,
    longestParagraph: Math.max(0, ...paras),
    placeholders,
    heightPx: Math.round(root.scrollHeight),
    textLeaves: text.length,
  };
})();
