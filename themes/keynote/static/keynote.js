/* Draft 4 · Keynote — word-by-word scroll reveal, carousel arrows */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- words light up as the statement scrolls through the viewport ---------- */
  const scrubs = Array.from(document.querySelectorAll('[data-scrub]'));
  scrubs.forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      el.append(s, i < words.length - 1 ? ' ' : '');
    });
    // a few words get the gradient once lit
    const hot = /^(vision-language|games|Ph\.D\.|robots|agents|perception)/i;
    el.querySelectorAll('.w').forEach((s) => { if (hot.test(s.textContent)) s.dataset.hot = '1'; });
  });
  const updateScrubs = () => {
    const vh = innerHeight;
    scrubs.forEach((el) => {
      const r = el.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (vh * 0.78 - r.top) / (r.height + vh * 0.22)));
      const spans = el.querySelectorAll('.w');
      const n = Math.round(p * spans.length);
      spans.forEach((s, i) => {
        const lit = reduce || i < n;
        s.classList.toggle('lit', lit);
        s.classList.toggle('hot', lit && s.dataset.hot === '1');
      });
    });
  };
  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateScrubs(); }); }, { passive: true });
  addEventListener('resize', updateScrubs);
  updateScrubs();

  /* ---------- carousel arrows ---------- */
  const car = document.querySelector('[data-carousel]');
  document.querySelectorAll('[data-car]').forEach((b) => b.addEventListener('click', () => {
    if (!car) return;
    const card = car.querySelector('.card:not([hidden])');
    const step = card ? card.getBoundingClientRect().width + 20 : 380;
    car.scrollBy({ left: Number(b.dataset.car) * step * 2, behavior: reduce ? 'auto' : 'smooth' });
  }));
  // filtering should bring the carousel back to the start
  document.querySelectorAll('.filter').forEach((f) => f.addEventListener('click', () => car?.scrollTo({ left: 0, behavior: 'auto' })));
})();
