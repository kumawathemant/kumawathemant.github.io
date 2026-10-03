/* hemantkumawat.com — research visualizations (plain canvas, no dependencies)
 *
 * Any <canvas data-viz="name"> on the page is animated with the sketch of that name.
 * Sketches only run while on screen, pause in background tabs, follow the light/dark
 * theme, and render a single static frame when the user prefers reduced motion.
 */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const mulberry = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const MONO = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  /* ---------- theme palette (read from CSS custom properties) ---------- */
  const rgbCache = new Map();
  const toRgb = (c) => {
    if (rgbCache.has(c)) return rgbCache.get(c);
    let rgb = [128, 128, 128];
    const hex = c.replace('#', '');
    if (/^[0-9a-f]{3}$/i.test(hex)) rgb = hex.split('').map((x) => parseInt(x + x, 16));
    else if (/^[0-9a-f]{6}$/i.test(hex)) rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    rgbCache.set(c, rgb);
    return rgb;
  };
  const rgba = (c, a) => {
    const [r, g, b] = toRgb(c);
    return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
  };
  const PAL = {};
  const readPalette = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    Object.assign(PAL, {
      mint: v('--mint'), indigo: v('--indigo'), amber: v('--amber'), rose: v('--rose'),
      text: v('--text'), text2: v('--text-2'), muted: v('--muted'), bg: v('--bg'),
      dark: document.documentElement.dataset.theme !== 'light',
    });
  };
  readPalette();

  /* ---------- 3D simplex noise (after Stefan Gustavson, public domain) ---------- */
  function makeNoise(seed) {
    const R = mulberry(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const s = p[i]; p[i] = p[j]; p[j] = s; }
    const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    const g = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
    const F3 = 1 / 3, G3 = 1 / 6;
    return (x, y, z) => {
      const s = (x + y + z) * F3;
      const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
      const t = (i + j + k) * G3;
      const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let n = 0, tt, gi;
      tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (tt > 0) { gi = pm12[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x0 + g[gi + 1] * y0 + g[gi + 2] * z0); }
      tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (tt > 0) { gi = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x1 + g[gi + 1] * y1 + g[gi + 2] * z1); }
      tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (tt > 0) { gi = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x2 + g[gi + 1] * y2 + g[gi + 2] * z2); }
      tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (tt > 0) { gi = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x3 + g[gi + 1] * y3 + g[gi + 2] * z3); }
      return 32 * n;
    };
  }

  const label = (ctx, text, x, y, color, size = 11, align = 'left', base = 'top') => {
    ctx.font = `500 ${size}px ${MONO}`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };

  /* ======================================================================
     flow — hero: particles advected by the curl of time-varying simplex noise.
     The pointer adds a local vortex ("control input").
     ====================================================================== */
  function flowSketch(v) {
    const noise = makeNoise(11);
    const R = mulberry(7);
    const K = 26; // trail length (ring buffer)
    let parts = [];
    let influence = 0;
    const make = () => ({ xs: new Float32Array(K), ys: new Float32Array(K), head: 0, len: 1, age: 0, life: 1, c: 0, dying: false });
    const spawn = (p) => {
      const x = R() * v.w, y = R() * v.h;
      p.head = 0; p.len = 1; p.xs[0] = x; p.ys[0] = y;
      p.age = 0; p.life = 3 + R() * 7; p.dying = false;
      const cn = noise(x * 0.0011, y * 0.0011, 17.3);
      p.c = cn < -0.15 ? 0 : cn < 0.2 ? 1 : 2;
      return p;
    };
    return {
      maxDpr: 1.75,
      warmup: 120,
      resize() {
        const n = Math.round(clamp((v.w * v.h) / 1500, 200, 1000));
        parts = Array.from({ length: n }, () => spawn(make()));
        parts.forEach((p) => { p.age = R() * p.life; });
      },
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        const P = v.pointer;
        if (dt > 0) {
          const f = 1 / 380, z = v.t * 0.045, e = 0.012;
          const S = 66 * clamp(Math.min(w, h) / 800, 0.75, 1.35);
          influence += ((P.active ? 1 : 0) - influence) * (1 - Math.exp(-dt * 3));
          const sig2 = 2 * 130 * 130;
          for (const p of parts) {
            if (p.dying) { p.len -= 1; if (p.len <= 1) spawn(p); continue; }
            p.age += dt;
            const x = p.xs[p.head], y = p.ys[p.head];
            const nx = x * f, ny = y * f;
            const a = (noise(nx, ny + e, z) - noise(nx, ny - e, z)) / (2 * e);
            const b = -(noise(nx + e, ny, z) - noise(nx - e, ny, z)) / (2 * e);
            const m = Math.hypot(a, b);
            let vx = (a / (0.6 + m)) * S + 7, vy = (b / (0.6 + m)) * S;
            if (influence > 0.01) {
              const dx = x - P.x, dy = y - P.y, d2 = dx * dx + dy * dy;
              const g = influence * Math.exp(-d2 / sig2);
              if (g > 0.002) {
                const d = Math.sqrt(d2) + 18;
                vx += ((-dy / d) * 190 + (dx / d) * 45) * g;
                vy += ((dx / d) * 190 + (dy / d) * 45) * g;
              }
            }
            const nxp = x + vx * dt, nyp = y + vy * dt;
            p.head = (p.head + 1) % K;
            p.xs[p.head] = nxp; p.ys[p.head] = nyp;
            if (p.len < K) p.len += 1;
            if (p.age > p.life || nxp < -40 || nxp > w + 40 || nyp < -40 || nyp > h + 40) p.dying = true;
          }
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = PAL.dark ? 'lighter' : 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.15;
        const cols = [PAL.mint, PAL.indigo, PAL.rose];
        const alphas = PAL.dark ? [0.06, 0.15, 0.4] : [0.07, 0.17, 0.42];
        for (let c = 0; c < 3; c++) {
          for (let band = 0; band < 3; band++) {
            ctx.beginPath();
            for (const p of parts) {
              if (p.c !== c || p.len < 2) continue;
              const L = p.len, seg = (L - 1) / 3;
              const i0 = Math.floor(band * seg), i1 = Math.ceil((band + 1) * seg);
              if (i1 <= i0) continue;
              const base = p.head - L + 1 + 2 * K;
              let idx = (base + i0) % K;
              ctx.moveTo(p.xs[idx], p.ys[idx]);
              for (let k = i0 + 1; k <= i1; k++) { idx = (base + k) % K; ctx.lineTo(p.xs[idx], p.ys[idx]); }
            }
            ctx.strokeStyle = rgba(cols[c], alphas[band]);
            ctx.stroke();
          }
          ctx.fillStyle = rgba(cols[c], PAL.dark ? 0.8 : 0.65);
          for (const p of parts) {
            if (p.c === c && !p.dying) ctx.fillRect(p.xs[p.head] - 0.8, p.ys[p.head] - 0.8, 1.6, 1.6);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  }

  /* ======================================================================
     koopman — orbits seen through a nonlinear warp (observation space) morph into
     pure rotations (Koopman latent space, where dynamics are linear). Hover scrubs.
     ====================================================================== */
  function koopmanSketch(v) {
    const rings = [0, 1, 2, 3, 4].map((k) => ({ r: 0.22 + 0.17 * k, w: 0.5 + 0.14 * k, n: 4 + 2 * k, ph: k * 0.9 }));
    let m = 0;
    const tmp = [0, 0];
    const pos = (r, th, mm) => {
      const zx = r * Math.cos(th), zy = r * Math.sin(th);
      const x1 = zx + 0.36 * Math.sin(2.7 * zy + 0.4) + 0.12 * zy * zy;
      const y1 = zy + 0.3 * Math.sin(2.5 * x1 - 0.3) + 0.22 * x1 * x1 - 0.12;
      tmp[0] = lerp(x1 * 0.9, zx, mm);
      tmp[1] = lerp(y1 * 0.9, zy, mm);
      return tmp;
    };
    return {
      frame(dt) {
        const { w, h, ctx } = v;
        const t = v.t;
        const ph = (t % 11) / 11;
        const auto = ph < 0.3 ? 0 : ph < 0.45 ? easeIO((ph - 0.3) / 0.15) : ph < 0.8 ? 1 : 1 - easeIO((ph - 0.8) / 0.2);
        const target = v.pointer.active ? clamp((v.pointer.x / w - 0.18) / 0.64, 0, 1) : auto;
        m += (target - m) * (dt > 0 ? 1 - Math.exp(-dt * 5) : 1);
        ctx.clearRect(0, 0, w, h);
        const small = w < 420;
        const cx = w * (small ? 0.5 : 0.46), cy = h * 0.5, S = Math.min(w * 0.8, h) * 0.37;
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = rgba(PAL.muted, 0.28);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - S * 1.45, cy); ctx.lineTo(cx + S * 1.45, cy);
        ctx.moveTo(cx, cy - S * 1.25); ctx.lineTo(cx, cy + S * 1.25);
        ctx.stroke();
        ctx.setLineDash([]);
        const cols = [PAL.mint, PAL.mint, PAL.indigo, PAL.indigo, PAL.rose];
        rings.forEach((ring, k) => {
          const col = cols[k];
          ctx.beginPath();
          for (let i = 0; i <= 140; i++) {
            const q = pos(ring.r, (i / 140) * TAU, m);
            const X = cx + q[0] * S, Y = cy - q[1] * S;
            if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
          }
          ctx.strokeStyle = rgba(col, 0.2 + 0.12 * m);
          ctx.lineWidth = 1;
          ctx.stroke();
          for (let j = 0; j < ring.n; j++) {
            const th = ring.ph + (j / ring.n) * TAU + t * ring.w;
            ctx.beginPath();
            for (let q = 0; q <= 12; q++) {
              const pq = pos(ring.r, th - q * 0.05, m);
              const X = cx + pq[0] * S, Y = cy - pq[1] * S;
              if (q) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
            }
            ctx.strokeStyle = rgba(col, 0.45);
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.stroke();
            const p = pos(ring.r, th, m);
            const X = cx + p[0] * S, Y = cy - p[1] * S;
            ctx.fillStyle = rgba(col, 0.16);
            ctx.beginPath(); ctx.arc(X, Y, 6.5, 0, TAU); ctx.fill();
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(X, Y, 2.5, 0, TAU); ctx.fill();
          }
        });
        const fs = small ? 10 : 11;
        label(ctx, 'observation space · x', 16, 16, rgba(PAL.text, 0.85 * (1 - m)), fs);
        label(ctx, 'koopman latent · z = φ(x)', 16, 16, rgba(PAL.text, 0.85 * m), fs);
        label(ctx, 'x(t+1) = f(x(t))  · nonlinear', 16, h - 14, rgba(PAL.text2, 0.85 * (1 - m)), fs, 'left', 'bottom');
        label(ctx, 'z(t+1) = K z(t)  · linear', 16, h - 14, rgba(PAL.mint, 0.95 * m), fs, 'left', 'bottom');
        if (!small) {
          const bx0 = w - 150, bx1 = w - 30, by = h - 21;
          ctx.strokeStyle = rgba(PAL.muted, 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke();
          ctx.strokeStyle = PAL.mint;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(lerp(bx0, bx1, m), by); ctx.stroke();
          ctx.fillStyle = PAL.text;
          ctx.beginPath(); ctx.arc(lerp(bx0, bx1, m), by, 4, 0, TAU); ctx.fill();
          label(ctx, 'x', bx0 - 10, by, PAL.muted, 11, 'center', 'middle');
          label(ctx, 'z', bx1 + 10, by, PAL.muted, 11, 'center', 'middle');
        }
      },
    };
  }

  /* ======================================================================
     agents — spring-coupled multi-agent system. Hollow nodes are hidden (never
     observed) and inferred; dotted paths are forecasts. Agents can be dragged.
     ====================================================================== */
  function agentsSketch(v) {
    const R = mulberry(23);
    const N = 10;
    const hidden = new Set([2, 6, 8]);
    const A = Array.from({ length: N }, (_, i) => ({
      x: Math.cos((i / N) * TAU) * 0.85 + (R() - 0.5) * 0.25,
      y: Math.sin((i / N) * TAU) * 0.55 + (R() - 0.5) * 0.2,
      vx: 0, vy: 0, ax: 0, ay: 0, nx: 0, ny: 0, hist: [],
    }));
    const E = [];
    for (let i = 0; i < N; i++) E.push([i, (i + 1) % N]);
    [[0, 4], [1, 6], [2, 8], [3, 7], [5, 9], [0, 6]].forEach((e) => E.push(e));
    const L = 0.6, kS = 2.6, damp = 0.32, kC = 0.22;
    let grab = -1, hover = -1, forecast = [], fTimer = 0, S = 1, cx = 0, cy = 0;

    const step = (S2, dt, noise) => {
      for (const a of S2) {
        a.ax = -kC * a.x - damp * a.vx;
        a.ay = -kC * a.y - damp * a.vy;
        if (a.x > 1.35) a.ax -= (a.x - 1.35) * 12; if (a.x < -1.35) a.ax -= (a.x + 1.35) * 12;
        if (a.y > 0.9) a.ay -= (a.y - 0.9) * 12; if (a.y < -0.9) a.ay -= (a.y + 0.9) * 12;
      }
      for (const [i, j] of E) {
        const a = S2[i], b = S2[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
        const f = (kS * (d - L)) / d;
        a.ax += f * dx; a.ay += f * dy; b.ax -= f * dx; b.ay -= f * dy;
      }
      for (const a of S2) {
        if (noise) {
          const sq = Math.sqrt(dt);
          a.nx += -0.8 * a.nx * dt + 2.2 * sq * (R() * 2 - 1);
          a.ny += -0.8 * a.ny * dt + 2.2 * sq * (R() * 2 - 1);
          a.ax += a.nx; a.ay += a.ny;
        }
        a.vx += a.ax * dt; a.vy += a.ay * dt;
        a.x += a.vx * dt; a.y += a.vy * dt;
      }
    };
    const simulate = () => {
      const S2 = A.map((a) => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy, ax: 0, ay: 0 }));
      const out = A.map(() => []);
      for (let s = 0; s < 64; s++) {
        step(S2, 0.035, false);
        if (s % 2 === 1) S2.forEach((a, i) => out[i].push(a.x, a.y));
      }
      return out;
    };
    const toScreen = (a) => [cx + a.x * S, cy + a.y * S];
    const nearest = () => {
      let best = -1, bd = 24 * 24;
      A.forEach((a, i) => {
        const [X, Y] = toScreen(a);
        const d = (X - v.pointer.x) ** 2 + (Y - v.pointer.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };

    return {
      warmup: 200,
      down() { grab = nearest(); if (grab >= 0) v.host.style.cursor = 'grabbing'; },
      up() { grab = -1; v.host.style.cursor = ''; },
      move() { if (grab < 0) { hover = nearest(); v.host.style.cursor = hover >= 0 ? 'grab' : ''; } },
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        S = Math.min(w / 3.0, h / 2.15); cx = w / 2; cy = h / 2;
        if (dt > 0) {
          for (let s = 0; s < 3; s++) step(A, dt / 3, true);
          if (grab >= 0) {
            const a = A[grab], tx = (v.pointer.x - cx) / S, ty = (v.pointer.y - cy) / S;
            a.vx = (tx - a.x) * 8; a.vy = (ty - a.y) * 8; a.x = tx; a.y = ty;
          }
          A.forEach((a) => { a.hist.push(a.x, a.y); if (a.hist.length > 56) a.hist.splice(0, 2); });
          fTimer -= dt;
          if (fTimer <= 0 || !forecast.length) { fTimer = 0.18; forecast = simulate(); }
        } else if (!forecast.length) forecast = simulate();
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        const tiny = w < 380 || v.c.classList.contains('hero-canvas');
        // edges
        for (const [i, j] of E) {
          const a = A[i], b = A[j];
          const [X1, Y1] = toScreen(a), [X2, Y2] = toScreen(b);
          const inferred = hidden.has(i) || hidden.has(j);
          const tension = clamp(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - L) * 3, 0, 1);
          const hl = hover === i || hover === j || grab === i || grab === j;
          ctx.setLineDash(inferred ? [3, 5] : []);
          ctx.strokeStyle = rgba(inferred ? PAL.muted : PAL.indigo, (inferred ? 0.45 : 0.22 + 0.5 * tension) + (hl ? 0.3 : 0));
          ctx.lineWidth = inferred ? 1 : 1.2 + tension;
          ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
        }
        ctx.setLineDash([]);
        // forecasts (observed agents)
        forecast.forEach((path, i) => {
          if (hidden.has(i)) return;
          const n = path.length / 2;
          for (let k = 0; k < n; k++) {
            const X = cx + path[2 * k] * S, Y = cy + path[2 * k + 1] * S;
            ctx.fillStyle = rgba(PAL.mint, 0.75 * (1 - k / n));
            ctx.beginPath(); ctx.arc(X, Y, 1.3, 0, TAU); ctx.fill();
          }
        });
        // trails
        A.forEach((a, i) => {
          if (hidden.has(i) || a.hist.length < 4) return;
          ctx.beginPath();
          for (let k = 0; k < a.hist.length; k += 2) {
            const X = cx + a.hist[k] * S, Y = cy + a.hist[k + 1] * S;
            if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
          }
          ctx.strokeStyle = rgba(PAL.indigo, 0.25);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
        // agents
        A.forEach((a, i) => {
          const [X, Y] = toScreen(a);
          if (hidden.has(i)) {
            const pulse = 11 + 4 * Math.sin(v.t * 2.2 + i);
            ctx.strokeStyle = rgba(PAL.rose, 0.22);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(X, Y, pulse + 6, 0, TAU); ctx.stroke();
            ctx.setLineDash([2.5, 3]);
            ctx.strokeStyle = rgba(PAL.rose, 0.9);
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(X, Y, 7, 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
            label(ctx, '?', X, Y + 0.5, rgba(PAL.rose, 0.9), 9, 'center', 'middle');
          } else {
            ctx.fillStyle = rgba(PAL.indigo, 0.16);
            ctx.beginPath(); ctx.arc(X, Y, 13, 0, TAU); ctx.fill();
            ctx.fillStyle = PAL.indigo;
            ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, TAU); ctx.fill();
            if (hover === i || grab === i) {
              ctx.strokeStyle = PAL.text;
              ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(X, Y, 10, 0, TAU); ctx.stroke();
            }
          }
        });
        if (!tiny) {
          const y = h - 18;
          ctx.fillStyle = PAL.indigo; ctx.beginPath(); ctx.arc(20, y, 4, 0, TAU); ctx.fill();
          label(ctx, 'observed', 30, y, PAL.muted, 11, 'left', 'middle');
          ctx.setLineDash([2.5, 3]); ctx.strokeStyle = PAL.rose; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(108, y, 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          label(ctx, 'hidden · inferred', 119, y, PAL.muted, 11, 'left', 'middle');
          for (let k = 0; k < 4; k++) { ctx.fillStyle = rgba(PAL.mint, 0.9 - k * 0.2); ctx.beginPath(); ctx.arc(248 + k * 6, y, 1.4, 0, TAU); ctx.fill(); }
          label(ctx, 'forecast', 276, y, PAL.muted, 11, 'left', 'middle');
        }
      },
    };
  }

  /* ======================================================================
     lidar — bird's-eye view. Radar pings open regions of interest (ROIs); the
     rotating LiDAR samples densely inside ROIs and sparsely everywhere else.
     ====================================================================== */
  function lidarSketch(v) {
    const R = mulberry(5);
    const lanes = [-3.6, 0, 3.6], laneV = [-2.4, 0.9, 2.2], egoV = 6, RANGE = 34;
    const rings = [4.5, 7.5, 11, 15.5, 21, 27.5];
    const objs = [];
    const freeLane = (y) => {
      const order = [0, 1, 2].sort(() => R() - 0.5);
      return order.find((l) => !objs.some((o) => o.kind === 'car' && o.lane === l && Math.abs(o.y - y) < 9)) ?? null;
    };
    const addCar = (y) => {
      const l = freeLane(y);
      if (l === null) return;
      objs.push({ kind: 'car', lane: l, x: lanes[l] + (R() - 0.5) * 0.3, y, w: 1.9, h: 4.4, roi: 0 });
    };
    [7, 15, 23, 30, -5, 12].forEach(addCar);
    for (let i = 0; i < 6; i++) objs.push({ kind: 'ped', x: (i % 2 ? -1 : 1) * (7.2 + R() * 2), y: -6 + R() * 42, w: 0.7, h: 0.7, roi: 0 });
    let pts = [], pings = [], ang = 0, radarT = 0;

    const cast = (dx, dy) => {
      let best = RANGE, bo = null;
      for (const o of objs) {
        const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y - o.h / 2, y1 = o.y + o.h / 2;
        let tmin = 0, tmax = best;
        if (Math.abs(dx) < 1e-9) { if (x0 > 0 || x1 < 0) continue; } else {
          let ta = x0 / dx, tb = x1 / dx; if (ta > tb) [ta, tb] = [tb, ta];
          tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
        }
        if (Math.abs(dy) < 1e-9) { if (y0 > 0 || y1 < 0) continue; } else {
          let ta = y0 / dy, tb = y1 / dy; if (ta > tb) [ta, tb] = [tb, ta];
          tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
        }
        if (tmax >= tmin && tmin > 0.6 && tmin < best) { best = tmin; bo = o; }
      }
      return bo ? { t: best, o: bo } : { t: RANGE, o: null };
    };
    const inRoi = (a) => objs.some((o) => {
      if (o.roi <= 0) return false;
      let lo = Infinity, hi = -Infinity;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const q = Math.atan2(o.y + (sy * (o.h + 1)) / 2, o.x + (sx * (o.w + 1)) / 2);
        lo = Math.min(lo, q); hi = Math.max(hi, q);
      }
      const aa = Math.atan2(Math.sin(a), Math.cos(a));
      return hi - lo < Math.PI && aa >= lo && aa <= hi;
    });

    return {
      warmup: 160,
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        const t = v.t;
        if (dt > 0) {
          for (const o of objs) {
            o.y += (o.kind === 'car' ? laneV[o.lane] : -egoV) * dt;
            o.roi = Math.max(0, o.roi - dt);
          }
          for (let i = objs.length - 1; i >= 0; i--) {
            const o = objs[i];
            if (o.kind === 'ped' && o.y < -10) { o.y = 38 + R() * 8; o.x = (R() < 0.5 ? -1 : 1) * (7.2 + R() * 2); }
            if (o.kind === 'car' && (o.y < -12 || o.y > 46)) { objs.splice(i, 1); addCar(o.y < 0 ? 40 + R() * 6 : -9); }
          }
          radarT -= dt;
          if (radarT <= 0) {
            radarT = 0.85;
            for (const o of objs) {
              if (o.kind !== 'car') continue;
              const d = Math.hypot(o.x, o.y);
              if (d < 32 && o.y > -2) { o.roi = 1.9; pings.push({ x: o.x + (R() - 0.5) * 0.8, y: o.y + (R() - 0.5) * 0.8, b: t, o }); }
            }
          }
          pings = pings.filter((p) => t - p.b < 0.9);
          const a1 = ang + (TAU / 1.5) * dt;
          let a = ang;
          while (a < a1) {
            const dx = Math.cos(a), dy = Math.sin(a);
            const dense = inRoi(a);
            const hit = cast(dx, dy);
            if (hit.o) pts.push({ o: hit.o, ox: dx * hit.t - hit.o.x, oy: dy * hit.t - hit.o.y, b: t, roi: dense });
            for (const r of rings) if (r < hit.t) pts.push({ o: null, x: dx * r, y: dy * r, b: t });
            a += dense ? 0.0085 : 0.042;
          }
          ang = a1 % TAU;
          for (const p of pts) if (!p.o) p.y -= egoV * dt;
          pts = pts.filter((p) => t - p.b < (p.o ? 1.5 : 1.1));
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        const sc = h / 30, ex = w / 2, ey = h * 0.8;
        const X = (x) => ex + x * sc, Y = (y) => ey - y * sc;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = rgba(PAL.muted, 0.22);
        [10, 20, 30].forEach((r) => {
          ctx.beginPath(); ctx.arc(ex, ey, r * sc, 0, TAU); ctx.stroke();
          if (w > 380) label(ctx, `${r} m`, ex + r * sc * 0.7071 + 4, ey - r * sc * 0.7071, rgba(PAL.muted, 0.7), 10);
        });
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba(PAL.muted, 0.35);
        ctx.beginPath(); ctx.moveTo(X(-5.4), 0); ctx.lineTo(X(-5.4), h); ctx.moveTo(X(5.4), 0); ctx.lineTo(X(5.4), h); ctx.stroke();
        ctx.setLineDash([2.2 * sc, 3.8 * sc]);
        ctx.lineDashOffset = -((t * egoV * sc) % (6 * sc));
        ctx.strokeStyle = rgba(PAL.muted, 0.3);
        ctx.beginPath(); ctx.moveTo(X(-1.8), 0); ctx.lineTo(X(-1.8), h); ctx.moveTo(X(1.8), 0); ctx.lineTo(X(1.8), h); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        for (let k = 0; k < 10; k++) {
          const a0 = ang - (k + 1) * 0.06, a1 = ang - k * 0.06;
          ctx.fillStyle = rgba(PAL.amber, 0.16 * (1 - k / 10));
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.arc(ex, ey, RANGE * sc, -a1, -a0); ctx.closePath(); ctx.fill();
        }
        for (const o of objs) {
          roundRect(ctx, X(o.x - o.w / 2), Y(o.y + o.h / 2), o.w * sc, o.h * sc, o.kind === 'car' ? 3 : 6);
          ctx.strokeStyle = rgba(PAL.text2, 0.16);
          ctx.lineWidth = 1;
          ctx.stroke();
          if (o.roi > 0) {
            const al = Math.min(1, o.roi);
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = rgba(PAL.amber, 0.85 * al);
            ctx.lineWidth = 1.3;
            roundRect(ctx, X(o.x - o.w / 2 - 0.6), Y(o.y + o.h / 2 + 0.6), (o.w + 1.2) * sc, (o.h + 1.2) * sc, 4);
            ctx.stroke();
            ctx.setLineDash([]);
            if (w > 380) label(ctx, 'ROI', X(o.x + o.w / 2 + 0.8), Y(o.y + o.h / 2 + 0.6), rgba(PAL.amber, 0.9 * al), 9.5);
          }
        }
        for (const p of pts) {
          const age = (t - p.b) / (p.o ? 1.5 : 1.1);
          const px = p.o ? p.o.x + p.ox : p.x, py = p.o ? p.o.y + p.oy : p.y;
          ctx.fillStyle = p.o ? rgba(PAL.amber, (p.roi ? 1 : 0.7) * (1 - age * 0.8)) : rgba(PAL.text2, 0.7 * (1 - age));
          const s = p.o ? (p.roi ? 2.6 : 2.2) : 1.7;
          ctx.fillRect(X(px) - s / 2, Y(py) - s / 2, s, s);
        }
        for (const p of pings) {
          const k = (t - p.b) / 0.9;
          ctx.strokeStyle = rgba(PAL.rose, 0.8 * (1 - k));
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3 + k * 16, 0, TAU); ctx.stroke();
          ctx.fillStyle = rgba(PAL.rose, 1 - k);
          ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y) - 4); ctx.lineTo(X(p.x) + 4, Y(p.y)); ctx.lineTo(X(p.x), Y(p.y) + 4); ctx.lineTo(X(p.x) - 4, Y(p.y)); ctx.closePath(); ctx.fill();
        }
        roundRect(ctx, X(-0.95), Y(2.2), 1.9 * sc, 4.4 * sc, 4);
        ctx.fillStyle = PAL.mint;
        ctx.fill();
        ctx.fillStyle = rgba(PAL.bg, 0.8);
        ctx.beginPath(); ctx.moveTo(X(0), Y(1.6)); ctx.lineTo(X(0.5), Y(0.6)); ctx.lineTo(X(-0.5), Y(0.6)); ctx.closePath(); ctx.fill();
        if (w > 380) {
          label(ctx, 'BEV · radar-guided LiDAR sampling', 16, 16, rgba(PAL.text, 0.85), 11);
          const y = h - 16;
          ctx.fillStyle = PAL.rose;
          ctx.beginPath(); ctx.moveTo(20, y - 4); ctx.lineTo(24, y); ctx.lineTo(20, y + 4); ctx.lineTo(16, y); ctx.closePath(); ctx.fill();
          label(ctx, 'radar', 30, y, PAL.muted, 11, 'left', 'middle');
          ctx.fillStyle = PAL.amber; ctx.fillRect(78, y - 1, 2, 2); ctx.fillRect(82, y - 1, 2, 2); ctx.fillRect(86, y - 1, 2, 2);
          label(ctx, 'dense in ROI', 94, y, PAL.muted, 11, 'left', 'middle');
          ctx.fillStyle = PAL.muted; ctx.fillRect(186, y - 1, 2, 2); ctx.fillRect(195, y - 1, 2, 2);
          label(ctx, 'sparse elsewhere', 203, y, PAL.muted, 11, 'left', 'middle');
        }
      },
    };
  }

  /* ======================================================================
     tokens — a game frame split into patches; attention follows the entity in
     focus while a compact state description is decoded token by token.
     ====================================================================== */
  function tokensSketch(v) {
    const C = 16, RW = 9;
    const att = new Float32Array(C * RW);
    const ents = [
      { col: 'mint', shape: 'circle', name: 'player', at: (t) => [0.28 + 0.17 * Math.sin(t * 0.45), 0.58 + 0.2 * Math.sin(t * 0.7 + 1)] },
      { col: 'rose', shape: 'tri', name: 'enemy', at: (t) => [0.74 + 0.13 * Math.sin(t * 0.33 + 2), 0.3 + 0.15 * Math.cos(t * 0.55)] },
      { col: 'amber', shape: 'diamond', name: 'item', at: (t) => [0.55 + 0.05 * Math.sin(t * 1.2), 0.8 + 0.04 * Math.cos(t * 1.1)] },
    ];
    const captions = [
      ['player', 'health', '23%', '·', 'cover', 'nearby'],
      ['enemy', 'approaching', '·', 'north-east'],
      ['health-pack', 'in', 'reach', '→', 'suggest:', 'grab', 'it'],
    ];
    let focus = 0, phase = 0;
    const PER = 4.6;
    const shape = (ctx, kind, x, y, r) => {
      ctx.beginPath();
      if (kind === 'circle') ctx.arc(x, y, r, 0, TAU);
      else if (kind === 'tri') { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.95, y + r * 0.7); ctx.lineTo(x - r * 0.95, y + r * 0.7); ctx.closePath(); }
      else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    };
    return {
      frame(dt) {
        const { w, h, ctx } = v;
        const t = v.t;
        phase += dt;
        if (phase > PER) { phase = 0; focus = (focus + 1) % ents.length; }
        const pos = ents.map((e) => e.at(t));
        const k = dt > 0 ? 1 - Math.exp(-dt * 5) : 1;
        for (let j = 0; j < RW; j++) {
          for (let i = 0; i < C; i++) {
            const px = (i + 0.5) / C, py = (j + 0.5) / RW;
            let a = 0;
            pos.forEach((p, e) => {
              const dx = (px - p[0]) * 1.7, dy = py - p[1];
              a += (e === focus ? 1 : 0.18) * Math.exp(-(dx * dx + dy * dy) / 0.014);
            });
            const idx = j * C + i;
            att[idx] += (Math.min(1, a) - att[idx]) * k;
          }
        }
        ctx.clearRect(0, 0, w, h);
        const pad = 16, top = 40, gw = w - 2 * pad, gh = h * 0.68 - top;
        const cw = gw / C, ch = gh / RW;
        const fc = PAL[ents[focus].col];
        for (let j = 0; j < RW; j++) {
          for (let i = 0; i < C; i++) {
            const a = att[j * C + i];
            roundRect(ctx, pad + i * cw + 1.5, top + j * ch + 1.5, cw - 3, ch - 3, 3);
            ctx.fillStyle = rgba(fc, 0.035 + 0.62 * a);
            ctx.fill();
          }
        }
        ctx.strokeStyle = rgba(PAL.muted, 0.3);
        ctx.lineWidth = 1;
        roundRect(ctx, pad - 0.5, top - 0.5, gw + 1, gh + 1, 6);
        ctx.stroke();
        ents.forEach((e, i) => {
          const x = pad + pos[i][0] * gw, y = top + pos[i][1] * gh;
          shape(ctx, e.shape, x, y, 6.5);
          ctx.fillStyle = PAL[e.col];
          ctx.fill();
          if (i === focus) {
            ctx.strokeStyle = rgba(PAL.text, 0.85);
            ctx.lineWidth = 1.3;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(x, y, 14 + 2 * Math.sin(t * 4), 0, TAU); ctx.stroke();
            ctx.setLineDash([]);
          }
        });
        label(ctx, 'frame → patches → tokens', pad, 16, rgba(PAL.text, 0.85), 11);
        label(ctx, `attending → ${ents[focus].name}`, w - pad, h - 14, rgba(fc, 0.95), 11, 'right', 'bottom');
        const cap = captions[focus];
        const shown = Math.min(cap.length, Math.floor(phase / 0.3));
        let x = pad, y = h * 0.68 + (h * 0.32) / 2 - 6;
        label(ctx, '›', x, y, PAL.muted, 13, 'left', 'middle');
        x += 16;
        ctx.font = `500 11px ${MONO}`;
        for (let i = 0; i < shown; i++) {
          const tw = ctx.measureText(cap[i]).width + 14;
          if (x + tw > w - pad) break;
          const newest = i === shown - 1 && phase < cap.length * 0.3 + 0.4;
          roundRect(ctx, x, y - 11, tw, 22, 6);
          ctx.fillStyle = newest ? rgba(fc, 0.28) : rgba(PAL.muted, 0.14);
          ctx.fill();
          label(ctx, cap[i], x + 7, y + 0.5, newest ? PAL.text : PAL.text2, 11, 'left', 'middle');
          x += tw + 6;
        }
        if (shown < cap.length && Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = fc; ctx.fillRect(x + 1, y - 7, 2, 14); }
      },
    };
  }

  /* ======================================================================
     events — event-camera stream (ON/OFF events at moving edges) feeding a
     state-space memory h_t that drives the policy.
     ====================================================================== */
  function eventsSketch(v) {
    const R = mulberry(3);
    const H = 14;
    const hs = new Float32Array(H);
    let evs = [];
    return {
      frame(dt) {
        const { w, h, ctx } = v;
        const t = v.t;
        const split = w * 0.64;
        const cx = split * 0.52, cy = h * 0.52, Lr = Math.min(split * 0.4, h * 0.36);
        const th = t * 1.7;
        if (dt > 0) {
          const n = Math.round(clamp((w * h) / 2600, 10, 34));
          for (let k = 0; k < n; k++) {
            const r = Lr * (0.12 + 0.88 * R());
            const lead = th + 0.07 + (R() - 0.5) * 0.04, trail = th - 0.07 + (R() - 0.5) * 0.04;
            evs.push({ x: cx + Math.cos(lead) * r, y: cy + Math.sin(lead) * r, p: 1, b: t });
            evs.push({ x: cx + Math.cos(trail) * r, y: cy + Math.sin(trail) * r, p: -1, b: t });
          }
          const ox = cx + Math.cos(t * 0.9) * Lr * 1.05, oy = cy + Math.sin(t * 1.3) * Lr * 0.45;
          const vx = -Math.sin(t * 0.9), vy = Math.cos(t * 1.3) * 0.6;
          for (let k = 0; k < n / 3; k++) {
            const a = R() * TAU, dot = Math.cos(a) * vx + Math.sin(a) * vy;
            if (Math.abs(dot) < 0.2) continue;
            evs.push({ x: ox + Math.cos(a) * 7, y: oy + Math.sin(a) * 7, p: dot > 0 ? 1 : -1, b: t });
          }
          evs = evs.filter((e) => t - e.b < 0.42);
          for (let i = 0; i < H; i++) {
            const decay = 0.94 - i * 0.045;
            const u = 0.5 + 0.5 * Math.sin(th * (0.6 + i * 0.23) + i * 1.7);
            hs[i] = decay * hs[i] + (1 - decay) * u;
          }
        }
        ctx.clearRect(0, 0, w, h);
        for (const e of evs) {
          const a = 1 - (t - e.b) / 0.42;
          ctx.fillStyle = rgba(e.p > 0 ? PAL.mint : PAL.rose, a * 0.95);
          ctx.fillRect(e.x - 1, e.y - 1, 2, 2);
        }
        const x0 = split + 18, x1 = w - 18, by = h * 0.74, bh = h * 0.46;
        const bw = (x1 - x0) / H;
        for (let i = 0; i < H; i++) {
          const val = clamp(hs[i], 0, 1);
          roundRect(ctx, x0 + i * bw + 1, by - val * bh, Math.max(1, bw - 2), val * bh, 2);
          ctx.fillStyle = rgba(PAL.indigo, 0.35 + 0.55 * val);
          ctx.fill();
        }
        ctx.strokeStyle = rgba(PAL.muted, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, by + 0.5); ctx.lineTo(x1, by + 0.5); ctx.stroke();
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(split - 4, cy); ctx.lineTo(x0 - 6, cy); ctx.stroke();
        ctx.setLineDash([]);
        const fs = w < 380 ? 9.5 : 11;
        label(ctx, 'events', 12, 12, rgba(PAL.text, 0.8), fs);
        label(ctx, '+', 12, h - 12, PAL.mint, fs, 'left', 'bottom');
        label(ctx, '−', 26, h - 12, PAL.rose, fs, 'left', 'bottom');
        label(ctx, 'SSM state hₜ', x0, 12, rgba(PAL.text, 0.8), fs);
        label(ctx, 'π(a | hₜ)', x1, h - 12, rgba(PAL.indigo, 0.95), fs, 'right', 'bottom');
      },
    };
  }

  /* ======================================================================
     chirp — FMCW radar: TX/RX chirps processed one at a time by a sequential
     model. `adaptive` (LUGA): sampling density follows an uncertainty estimate.
     ====================================================================== */
  function chirpSketch(v, adaptive) {
    const unc = (u) => 0.5 + 0.5 * Math.sin(u * 0.9) * Math.cos(u * 0.37 + 1);
    return {
      frame() {
        const { w, h, ctx } = v;
        const t = v.t;
        const L = 14, Rx = w - 14, top = adaptive ? h * 0.24 : h * 0.16, bot = h * 0.6;
        const nVis = 5, P = (Rx - L) / nVis, speed = P / 1.15, off = (t * speed) % P;
        const head = L + (Rx - L) * 0.66, ramp = 0.8, delay = P * 0.07;
        const base = Math.floor((t * speed) / P);
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath(); ctx.rect(L, 0, Rx - L, h); ctx.clip();
        if (adaptive) {
          ctx.beginPath();
          for (let x = L; x <= Rx; x += 4) {
            const u = unc((x - L + t * speed) / P);
            const y = top - 8 - u * (top - 26);
            if (x === L) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.lineTo(Rx, top - 8); ctx.lineTo(L, top - 8); ctx.closePath();
          ctx.fillStyle = rgba(PAL.rose, 0.18);
          ctx.fill();
        }
        for (let k = -1; k <= nVis; k++) {
          const xs = L - off + k * P, xe = xs + P * ramp;
          const cur = head >= xs && head <= xe, done = xe < head;
          ctx.lineWidth = cur ? 2.2 : 1.4;
          ctx.strokeStyle = rgba(PAL.amber, cur ? 1 : done ? 0.4 : 0.75);
          ctx.beginPath(); ctx.moveTo(xs, bot); ctx.lineTo(xe, top); ctx.stroke();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = rgba(PAL.indigo, cur ? 0.95 : 0.5);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(xs + delay, bot); ctx.lineTo(xe + delay, top); ctx.stroke();
          ctx.setLineDash([]);
          if (adaptive) {
            const u = unc((xs + P * ramp * 0.5 - L + t * speed) / P);
            const n = Math.round(4 + u * 20);
            for (let s = 0; s <= n; s++) {
              const q = s / n;
              ctx.fillStyle = rgba(PAL.amber, 0.9);
              ctx.fillRect(lerp(xs, xe, q) - 1.2, lerp(bot, top, q) - 1.2, 2.4, 2.4);
            }
          }
          const tx = xs + (P * ramp) / 2, ty = h * 0.72;
          roundRect(ctx, tx - 9, ty - 9, 18, 18, 4);
          ctx.fillStyle = cur ? PAL.mint : done ? rgba(PAL.mint, 0.45) : rgba(PAL.muted, 0.2);
          ctx.fill();
          if (cur) { ctx.strokeStyle = PAL.text; ctx.lineWidth = 1.2; ctx.stroke(); }
          label(ctx, String((base + k) % 100), tx, ty + 0.5, cur || done ? PAL.bg : PAL.muted, 8.5, 'center', 'middle');
        }
        ctx.strokeStyle = rgba(PAL.mint, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L, h * 0.72); ctx.lineTo(head, h * 0.72); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = rgba(PAL.text, 0.35);
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(head, top - 6); ctx.lineTo(head, bot + 6); ctx.stroke();
        ctx.setLineDash([]);
        const by = h * 0.88, amp = h * 0.045;
        ctx.beginPath();
        for (let x = L; x <= Rx; x += 2) {
          const y = by + amp * Math.sin((x - L) * 0.11 + t * 6) * (0.75 + 0.25 * Math.sin(x * 0.013 + t));
          if (x === L) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(PAL.indigo, 0.7);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        const fs = w < 380 ? 9.5 : 11;
        label(ctx, adaptive ? 'uncertainty → resolution' : 'TX / RX chirps', L + 2, 8, rgba(PAL.text, 0.8), fs);
        label(ctx, 'seq. model', Rx, h * 0.72 - 18, rgba(PAL.mint, 0.9), fs, 'right', 'bottom');
        label(ctx, 'beat signal', Rx, h - 4, rgba(PAL.muted, 0.9), fs, 'right', 'bottom');
      },
    };
  }


  /* ---------- runtime ---------- */
  const instances = [];
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
      const viz = en.target._viz;
      if (!viz) return;
      viz.visible = en.isIntersecting;
      if (viz.visible && !document.hidden) viz.start(); else viz.stop();
    }), { rootMargin: '120px 0px' })
    : null;

  class Viz {
    constructor(canvas, factory) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.t = 0;
      this.w = 0;
      this.h = 0;
      this.running = false;
      this.visible = false;
      this.pointer = { x: 0, y: 0, active: false, down: false };
      this.sketch = factory(this);
      canvas._viz = this;
      const host = canvas.closest('.hero, .thread-viz, .pub-viz, .notfound') || canvas;
      this.host = host;
      const setPointer = (e) => {
        const r = canvas.getBoundingClientRect();
        this.pointer.x = e.clientX - r.left;
        this.pointer.y = e.clientY - r.top;
        this.pointer.active = e.pointerType === 'mouse' || this.pointer.down;
      };
      host.addEventListener('pointermove', (e) => { setPointer(e); this.sketch.move?.(); });
      host.addEventListener('pointerdown', (e) => { this.pointer.down = true; setPointer(e); this.sketch.down?.(); });
      host.addEventListener('pointerleave', () => { this.pointer.active = false; this.pointer.down = false; this.sketch.up?.(); });
      addEventListener('pointerup', () => { if (this.pointer.down) { this.pointer.down = false; this.sketch.up?.(); } });
      this.loop = this.loop.bind(this);
      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas);
      if (io) io.observe(canvas); else this.start();
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, this.sketch.maxDpr || 2);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.sketch.resize?.();
      if (!this.running) this.still();
    }
    start() {
      if (this.running || reduce || this.c.closest('[data-media="fig"]')) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }
    stop() { this.running = false; }
    loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.t += dt;
      this.sketch.frame(dt, false);
      requestAnimationFrame(this.loop);
    }
    /* one static frame: warm the simulation up first when motion is reduced */
    still() {
      if (!this.w || this.w < 2) return;
      if (reduce && !this.warmed) {
        this.warmed = true;
        for (let i = 0; i < (this.sketch.warmup ?? 150); i++) { this.t += 1 / 60; this.sketch.frame(1 / 60, true); }
      }
      this.sketch.frame(0, false);
    }
  }

  addEventListener('themechange', () => {
    readPalette();
    instances.forEach((v) => { if (!v.running) v.still(); });
  });
  document.addEventListener('visibilitychange', () => {
    instances.forEach((v) => (document.hidden ? v.stop() : v.visible && v.start()));
  });

  const SKETCHES = {
    flow: flowSketch,
    koopman: koopmanSketch,
    agents: agentsSketch,
    lidar: lidarSketch,
    tokens: tokensSketch,
    events: eventsSketch,
    chirp: (v) => chirpSketch(v, false),
    'chirp-adaptive': (v) => chirpSketch(v, true),
    stemfold: (v) => agentsSketch(v, { fans: true }),
    'lidar-camera': (v) => lidarSketch(v, { mode: 'camera' }),
    maple: (v) => eventsSketch(v, { value: true }),
  };
  const boot = () => document.querySelectorAll('canvas[data-viz]').forEach((c) => {
    const f = SKETCHES[c.dataset.viz];
    if (f && !c._viz) instances.push(new Viz(c, f));
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => instances.forEach((v) => !v.running && v.still()));
  boot();
  window.hkVizBoot = boot; // lets themes animate canvases inserted later (e.g. side panels)
  // Plugin API: other scripts (e.g. viz-papers.js) register sketches, then call boot().
  window.hkViz = {
    register(name, factory) { SKETCHES[name] = factory; },
    boot,
    resume(canvas) { const vz = canvas && canvas._viz; if (vz && vz.visible && !document.hidden) vz.start(); },
    lib: { TAU, clamp, lerp, easeIO, mulberry, makeNoise, rgba, label, roundRect, PAL, MONO, reduce },
  };
})();
