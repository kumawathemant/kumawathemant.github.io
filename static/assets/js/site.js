/* hemantkumawat.com — page interactions (no dependencies) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------------- toast & clipboard ---------------- */
  const toastEl = $('.toast');
  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('is-visible'), 1900);
  };
  const copyText = async (text, msg = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(msg + ' ✓');
  };

  /* ---------------- theme ---------------- */
  const STORE = root.dataset.store || 'theme'; // each design draft remembers its own light/dark choice
  const setTheme = (t, persist) => {
    root.dataset.theme = t;
    if (persist) try { localStorage.setItem(STORE, t); } catch {}
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  };
  $$('.theme-toggle').forEach((btn) => btn.addEventListener('click', (e) => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (document.startViewTransition && !reduceMotion) {
      const r = btn.getBoundingClientRect();
      root.style.setProperty('--vt-x', `${e.clientX || r.left + r.width / 2}px`);
      root.style.setProperty('--vt-y', `${e.clientY || r.top + r.height / 2}px`);
      document.startViewTransition(() => setTheme(next, true));
    } else setTheme(next, true);
  }));
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem(STORE); } catch {}
    if (!saved) setTheme(e.matches ? 'light' : 'dark', false);
  });

  /* ---------------- nav: scrolled state, progress bar, mobile menu ---------------- */
  const nav = $('[data-nav]');
  const progress = $('.progress');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = window.scrollY;
    nav?.classList.toggle('is-scrolled', y > 20);
    const max = root.scrollHeight - innerHeight;
    progress?.style.setProperty('--p', max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    updateTimeline();
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

  const menuBtn = $('.menu-toggle');
  const closeMenu = () => { nav?.classList.remove('is-open'); menuBtn?.setAttribute('aria-expanded', 'false'); };
  menuBtn?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-links a').forEach((a) => a.addEventListener('click', closeMenu));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* sliding pill under the active section link */
  const navLinks = $$('.nav-links a[data-section]');
  const pill = $('.nav-pill');
  let activeLink = $('.nav-links a[aria-current]');
  const placePill = () => {
    if (!pill) return;
    if (!activeLink || getComputedStyle(pill).display === 'none') { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.width = `${activeLink.offsetWidth}px`;
    pill.style.transform = `translateX(${activeLink.offsetLeft}px)`;
  };
  const sections = navLinks.map((a) => document.getElementById(a.dataset.section)).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      const current = sections.find((s) => visible.has(s));
      const next = current ? navLinks.find((a) => a.dataset.section === current.id) : null;
      if (next !== activeLink) {
        navLinks.forEach((a) => a.classList.toggle('is-active', a === next));
        activeLink = next;
        placePill();
      }
    }, { rootMargin: '-42% 0px -55% 0px' });
    sections.forEach((s) => io.observe(s));
  }
  addEventListener('resize', placePill);
  document.fonts?.ready.then(placePill);
  placePill();

  /* ---------------- reveal on scroll ---------------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const rio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); rio.unobserve(en.target); }
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    revealEls.forEach((el) => rio.observe(el));
  } else revealEls.forEach((el) => el.classList.add('is-in'));

  /* ---------------- typewriter ---------------- */
  const typed = $('.typed');
  if (typed && !reduceMotion) {
    let phrases = [];
    try { phrases = JSON.parse(typed.dataset.phrases || '[]'); } catch {}
    if (phrases.length > 1) {
      let i = 0, n = phrases[0].length, deleting = true;
      const tick = () => {
        const word = phrases[i];
        if (deleting) {
          n -= 1;
          typed.textContent = word.slice(0, n);
          if (n <= 0) { deleting = false; i = (i + 1) % phrases.length; return setTimeout(tick, 380); }
          return setTimeout(tick, 22);
        }
        n += 1;
        typed.textContent = phrases[i].slice(0, n);
        if (n >= phrases[i].length) { deleting = true; return setTimeout(tick, 2600); }
        return setTimeout(tick, 42 + Math.random() * 46);
      };
      setTimeout(tick, 3400);
    }
  }

  /* ---------------- count-up stats ---------------- */
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    counters.forEach((el) => { el.textContent = '0'; });
    const cio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      cio.unobserve(en.target);
      const el = en.target, end = Number(el.dataset.count), t0 = performance.now(), dur = 1500 + Math.min(end, 200) * 3;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), { threshold: 0.5 });
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------------- cursor spotlight on cards ---------------- */
  if (finePointer) {
    $$('.spot').forEach((el) => el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }

  /* ---------------- portrait tilt ---------------- */
  const tilt = $('[data-tilt]');
  if (tilt && finePointer && !reduceMotion) {
    tilt.addEventListener('pointermove', (e) => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      tilt.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      tilt.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
      tilt.style.setProperty('--sx', `${x * 100}%`);
      tilt.style.setProperty('--sy', `${y * 100}%`);
    });
    tilt.addEventListener('pointerleave', () => { tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg'); });
  }

  /* ---------------- timeline progress line ---------------- */
  const timeline = $('[data-timeline]');
  function updateTimeline() {
    if (!timeline) return;
    const r = timeline.getBoundingClientRect();
    const k = (innerHeight * 0.6 - r.top) / r.height;
    timeline.style.setProperty('--tl', Math.max(0, Math.min(1, k)).toFixed(4));
  }
  onScroll();

  /* ---------------- publications: filters + search ---------------- */
  const pubList = $('.pub-list');
  const filterBtns = $$('.filter');
  const searchInput = $('.pub-search input');
  let activeFilter = 'all', query = '';
  const applyFilters = () => {
    if (!pubList) return;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    $$('.pub', pubList).forEach((p) => {
      const topics = p.dataset.topics.split(' ');
      const ok = (activeFilter === 'all' || topics.includes(activeFilter)) && words.every((w) => p.dataset.search.includes(w));
      if (ok && p.hidden) {
        p.hidden = false;
        if (!reduceMotion) { p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
      } else if (!ok) p.hidden = true;
      if (ok) shown += 1;
    });
    $$('.pub-year', pubList).forEach((y) => { y.hidden = !$$('.pub', y).some((p) => !p.hidden); });
    const empty = $('.pub-empty', pubList);
    if (empty) empty.hidden = shown > 0;
  };
  filterBtns.forEach((btn) => btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    applyFilters();
  }));
  searchInput?.addEventListener('input', () => { query = searchInput.value; applyFilters(); });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && searchInput && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')) {
      e.preventDefault();
      searchInput.focus({ preventScroll: false });
      searchInput.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
  });

  /* ---------------- abstract / bibtex panels ---------------- */
  $$('[data-toggle]').forEach((btn) => {
    const panel = document.getElementById(btn.dataset.toggle);
    if (!panel) return;
    panel.inert = true;
    btn.setAttribute('aria-controls', panel.id);
    btn.addEventListener('click', () => {
      const scope = btn.closest('.pub') || document;
      const open = !panel.classList.contains('is-open');
      $$('.pub-panel.is-open', scope).forEach((other) => {
        if (other === panel) return;
        other.classList.remove('is-open');
        other.inert = true;
        $(`[data-toggle="${other.id}"]`, scope)?.setAttribute('aria-expanded', 'false');
      });
      panel.classList.toggle('is-open', open);
      panel.inert = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  $$('[data-copy]').forEach((btn) => btn.addEventListener('click', () => {
    const src = $(btn.dataset.copy);
    if (src) copyText(src.textContent, btn.dataset.copyMsg || 'Copied');
  }));
  $$('.authors-toggle').forEach((btn) => btn.addEventListener('click', () => {
    btn.previousElementSibling.hidden = false;
    btn.remove();
  }));

  /* ---------------- jump to a paper (from research chips & news) ---------------- */
  const flashPaper = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.hidden || el.closest('.pub-year')?.hidden) {
      if (searchInput) searchInput.value = '';
      query = '';
      $('.filter[data-filter="all"]')?.click();
    }
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
    return true;
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#pub-"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (flashPaper(id)) { e.preventDefault(); history.replaceState(null, '', `#${id}`); }
  });
  if (location.hash.startsWith('#pub-')) setTimeout(() => flashPaper(location.hash.slice(1)), 350);

  /* ---------------- news: show all ---------------- */
  $('[data-news-more]')?.addEventListener('click', (e) => {
    const list = $('.news-list');
    const all = list.classList.toggle('show-all');
    $$('.news-item.is-extra', list).forEach((li) => li.classList.add('is-in'));
    e.currentTarget.textContent = all ? 'Show fewer' : `Show all ${$$('.news-item', list).length} updates`;
  });

  /* ---------------- email (assembled client-side to deter scrapers) ---------------- */
  $$('[data-email]').forEach((a) => { a.href = `mailto:${a.dataset.user}@${a.dataset.domain}`; });
  $$('[data-copy-email]').forEach((btn) => {
    const addr = `${btn.dataset.user}@${btn.dataset.domain}`;
    const label = $('.email-text', btn);
    if (label) label.textContent = addr;
    btn.addEventListener('click', () => copyText(addr, 'Email copied'));
  });

  /* ---------------- figure lightbox ---------------- */
  const lb = $('.lightbox');
  if (lb && typeof lb.showModal === 'function') {
    const figs = $$('[data-lightbox]');
    const img = $('img', lb), cap = $('figcaption', lb);
    let idx = 0;
    const show = (i) => {
      idx = (i + figs.length) % figs.length;
      const f = figs[idx];
      img.src = f.dataset.full;
      img.alt = $('img', f)?.alt || '';
      cap.textContent = f.dataset.caption || '';
    };
    figs.forEach((f, i) => f.addEventListener('click', () => { show(i); lb.showModal(); }));
    $('.lb-close', lb).addEventListener('click', () => lb.close());
    $('.lb-prev', lb).addEventListener('click', () => show(idx - 1));
    $('.lb-next', lb).addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
  }

  /* ---------------- blog posts: TOC highlighting + code copy ---------------- */
  const tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const heads = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    const tio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      tocLinks.forEach((a) => a.classList.toggle('is-active', a.hash.slice(1) === en.target.id));
    }), { rootMargin: '0px 0px -75% 0px' });
    heads.forEach((h) => tio.observe(h));
  }
  $$('.prose pre').forEach((pre) => {
    const btn = Object.assign(document.createElement('button'), { className: 'code-copy', type: 'button', textContent: 'copy' });
    btn.addEventListener('click', () => copyText($('code', pre)?.textContent || pre.textContent, 'Code copied'));
    pre.append(btn);
  });
})();
