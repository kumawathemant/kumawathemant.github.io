/* Draft 3 · Bulletin — archive tabs, search, chart tooltips & line-draw, share */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = (msg) => {
    const t = $('.toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('is-visible'), 1600);
  };

  /* ---------- archive tabs (Latest / Top / …) ---------- */
  const tabs = $$('.tab[data-tab]');
  const panels = $$('[data-panel]');
  const show = (key) => {
    tabs.forEach((b) => { const on = b.dataset.tab === key; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== key; });
    filter();
  };
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  /* ---------- search ---------- */
  const bar = $('.searchbar');
  const input = bar && $('input', bar);
  let query = '';
  function filter() {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const panel = panels.find((p) => !p.hidden);
    if (!panel) return;
    let shown = 0;
    $$('.row', panel).forEach((r) => {
      const ok = words.every((w) => (r.dataset.search || r.textContent.toLowerCase()).includes(w));
      r.hidden = !ok;
      if (ok) shown += 1;
    });
    const empty = $('.empty');
    if (empty) empty.hidden = shown > 0;
  }
  $$('[data-search-toggle]').forEach((b) => b.addEventListener('click', () => {
    if (!bar) return;
    bar.hidden = !bar.hidden;
    if (!bar.hidden) {
      input.focus();
      const archive = $('#publications') || $('.archive');
      if (panels.length) archive?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }));
  input?.addEventListener('input', () => { query = input.value; filter(); });
  input?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; query = ''; filter(); bar.hidden = true; } });

  /* ---------- chart tooltips ---------- */
  const tip = $('.tip');
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!tip) return;
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    tip.style.left = `${e.clientX}px`;
    tip.style.top = `${e.clientY}px`;
  });
  document.addEventListener('scroll', () => { if (tip) tip.hidden = true; }, { passive: true });

  /* ---------- draw chart lines when scrolled into view ---------- */
  const charts = $$('.chart');
  charts.forEach((c) => $$('.draw', c).forEach((p) => p.style.setProperty('--len', Math.ceil(p.getTotalLength?.() || 2000))));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { threshold: 0.35 });
    charts.forEach((c) => io.observe(c));
  } else charts.forEach((c) => c.classList.add('is-in'));

  /* ---------- share ---------- */
  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { /* ignore */ }
    toast('Link copied ✓');
  }));

  /* ---------- copy-email buttons keep their label ---------- */
  $$('[data-copy-email]').forEach((b) => { const s = $('.email-text', b); if (s) s.hidden = true; });
})();
