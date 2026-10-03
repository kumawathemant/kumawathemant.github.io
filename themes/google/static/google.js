/* Draft 5 · Google I/O — top app bar state + active tab tracking */
(() => {
  'use strict';
  const bar = document.querySelector('.topbar');
  const onScroll = () => bar?.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const tabs = Array.from(document.querySelectorAll('.tabs a[data-section]'));
  const secs = tabs.map((a) => document.getElementById(a.dataset.section)).filter(Boolean);
  if (secs.length && 'IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
      const cur = secs.find((s) => seen.has(s));
      tabs.forEach((a) => a.classList.toggle('is-active', !!cur && a.dataset.section === cur.id));
    }, { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach((s) => io.observe(s));
  }
})();
