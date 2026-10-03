/* Draft 2 · Notion — side peek, database views, quick find, sidebar */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toastEl = $('.toast');
  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('is-visible'), 1600);
  };
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
    toast(msg);
  };

  /* ---------- database views ---------- */
  const list = $('.pub-list');
  const views = $$('.db-view[data-view]');
  const setView = (v) => {
    if (!list) return;
    list.dataset.mode = v;
    views.forEach((b) => { const on = b.dataset.view === v; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
    try { localStorage.setItem('notion-db-view', v); } catch {}
  };
  views.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  try { const v = localStorage.getItem('notion-db-view'); if (v) setView(v); } catch {}

  /* ---------- side peek ---------- */
  const peek = $('.peek');
  const body = peek && $('.peek-body', peek);
  let current = null;
  const order = () => $$('.gallery .pub').filter((el) => !el.hidden).map((el) => el.dataset.peek);
  const openPeek = (id, push = true) => {
    const tpl = document.getElementById(`peek-${id}`);
    if (!peek || !tpl) return false;
    body.replaceChildren(tpl.content.cloneNode(true));
    body.scrollTop = 0;
    current = id;
    peek.classList.add('is-open');
    peek.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (push) history.replaceState(null, '', `#pub-${id}`);
    window.hkVizBoot?.();
    $('.peek-bar [data-peek-close]', peek)?.focus({ preventScroll: true });
    return true;
  };
  const closePeek = () => {
    if (!peek?.classList.contains('is-open')) return;
    peek.classList.remove('is-open');
    peek.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);
    const card = current && document.getElementById(`pub-${current}`);
    current = null;
    card?.focus({ preventScroll: true });
  };
  // capture phase so the shared "jump to paper" handler doesn't also scroll the page
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-peek]');
    if (!t || !peek || e.target.closest('a[target="_blank"]')) return;
    e.preventDefault();
    e.stopPropagation();
    openPeek(t.dataset.peek);
  }, true);
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest?.('[data-peek]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPeek(t.dataset.peek); }
    if (e.key === 'Escape') closePeek();
  });
  $$('[data-peek-close]').forEach((b) => b.addEventListener('click', closePeek));
  $$('[data-peek-step]').forEach((b) => b.addEventListener('click', () => {
    const ids = order();
    if (!current || !ids.length) return;
    const i = ids.indexOf(current);
    openPeek(ids[(i + Number(b.dataset.peekStep) + ids.length) % ids.length]);
  }));
  body?.addEventListener('click', (e) => {
    const cp = e.target.closest('[data-copy-next]');
    if (cp) copy(cp.closest('.code').querySelector('code').textContent, 'BibTeX copied');
    const z = e.target.closest('[data-zoom]');
    const lb = $('.lightbox-n');
    if (z && lb) {
      $('img', lb).src = z.dataset.zoom;
      $('figcaption', lb).textContent = z.dataset.caption || '';
      lb.showModal();
    }
  });
  const lb = $('.lightbox-n');
  lb?.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('.lb-x')) lb.close(); });
  if (location.hash.startsWith('#pub-')) setTimeout(() => openPeek(location.hash.slice(5), false), 200);

  /* ---------- sidebar (mobile) + active section ---------- */
  const toggleSb = (open) => document.body.classList.toggle('sb-open', open);
  $$('[data-sidebar-toggle]').forEach((b) => b.addEventListener('click', () => toggleSb(!document.body.classList.contains('sb-open'))));
  $$('[data-sidebar-close], .sidebar a').forEach((el) => el.addEventListener('click', () => toggleSb(false)));
  const items = $$('.sidebar [data-sb]');
  const secs = items.map((a) => document.getElementById(a.dataset.sb)).filter(Boolean);
  if (secs.length && 'IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
      const cur = secs.find((s) => seen.has(s));
      items.forEach((a) => a.classList.toggle('is-active', !!cur && a.dataset.sb === cur.id));
    }, { rootMargin: '-20% 0px -70% 0px' });
    secs.forEach((s) => io.observe(s));
  }

  /* ---------- quick find (⌘K) ---------- */
  const qf = $('.qf');
  if (qf) {
    const input = $('input', qf);
    const links = $$('.qf-list a', qf);
    const empty = $('.qf-empty', qf);
    let sel = 0;
    const visible = () => links.filter((a) => !a.parentElement.hidden);
    const mark = () => visible().forEach((a, i) => a.classList.toggle('is-sel', i === sel));
    const filter = () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      links.forEach((a) => {
        const hay = (a.dataset.kw + ' ' + a.textContent).toLowerCase();
        a.parentElement.hidden = !words.every((w) => hay.includes(w));
      });
      sel = 0;
      empty.hidden = visible().length > 0;
      mark();
    };
    const open = () => { if (!qf.open) { qf.showModal(); input.value = ''; filter(); input.focus(); } };
    $$('[data-search-open]').forEach((b) => b.addEventListener('click', open));
    addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); qf.open ? qf.close() : open(); }
    });
    input.addEventListener('input', filter);
    input.addEventListener('keydown', (e) => {
      const vis = visible();
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(vis.length - 1, sel + 1); mark(); vis[sel]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); vis[sel]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && vis[sel]) { e.preventDefault(); vis[sel].click(); }
    });
    qf.addEventListener('click', (e) => {
      if (e.target === qf) { qf.close(); return; }
      const a = e.target.closest('a[data-peek-link]');
      if (a && peek) { e.preventDefault(); qf.close(); openPeek(a.dataset.peekLink); return; }
      if (e.target.closest('a')) qf.close();
    });
  }

  /* ---------- share ---------- */
  $$('[data-share]').forEach((b) => b.addEventListener('click', () => copy(location.href, 'Link copied to clipboard')));
})();
