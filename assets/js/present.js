/* Keynote "presentation mode" shared by the keynote-style themes.
 * Any element with class .slide becomes a slide. A [data-present] button starts the show:
 * fullscreen + scroll-snapping, ←/→ (or space, PgUp/PgDn) to move, Esc to exit.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const slides = () => Array.from(document.querySelectorAll('.slide'));
  if (!slides().length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hud = document.createElement('div');
  hud.className = 'present-hud';
  hud.innerHTML = '<div class="ph-bar"><i></i></div><span class="ph-count"></span><span class="ph-hint">← → navigate · esc exit</span>';
  hud.hidden = true;
  document.body.append(hud);

  const current = () => {
    const list = slides();
    const mid = innerHeight * 0.35;
    let idx = 0;
    list.forEach((s, i) => { if (s.getBoundingClientRect().top <= mid) idx = i; });
    return idx;
  };
  const update = () => {
    const list = slides();
    const i = current();
    hud.querySelector('.ph-count').textContent = `${i + 1} / ${list.length}`;
    hud.querySelector('.ph-bar i').style.transform = `scaleX(${(i + 1) / list.length})`;
  };
  const go = (i) => {
    const list = slides();
    const target = list[Math.max(0, Math.min(list.length - 1, i))];
    target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const start = async () => {
    root.classList.add('presenting');
    hud.hidden = false;
    try { if (document.fullscreenEnabled && !document.fullscreenElement) await root.requestFullscreen(); } catch { /* fullscreen is optional */ }
    go(current());
    update();
  };
  const stop = () => {
    root.classList.remove('presenting');
    hud.hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  document.querySelectorAll('[data-present]').forEach((b) => b.addEventListener('click', () => (root.classList.contains('presenting') ? stop() : start())));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && root.classList.contains('presenting')) stop(); });
  addEventListener('scroll', () => { if (root.classList.contains('presenting')) requestAnimationFrame(update); }, { passive: true });
  addEventListener('keydown', (e) => {
    if (!root.classList.contains('presenting') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')) return;
    const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key);
    const prev = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
    if (next || prev) { e.preventDefault(); go(current() + (next ? 1 : -1)); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(slides().length - 1); }
    if (e.key === 'Escape') stop();
  });
})();
