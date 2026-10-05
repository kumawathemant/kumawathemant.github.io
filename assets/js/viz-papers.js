/* hemantkumawat.com — one small animation per paper (plain canvas, no dependencies)
 *
 * Each sketch is a schematic of a paper's core idea — not a figure from the paper. They plug into
 * the runtime in viz.js through window.hkViz.register(name, factory), with the same contract as the
 * sketches there: factory(v) -> { frame(dt, noDraw), warmup? }, where v carries w, h, ctx, t, pointer.
 */
(() => {
  'use strict';
  const HK = window.hkViz;
  if (!HK) return;
  const { TAU, clamp, lerp, easeIO, mulberry, makeNoise, rgba, label, roundRect, PAL } = HK.lib;

  /* ---------- drawing helpers ---------- */
  const fsz = (w) => (w < 340 ? 9 : w < 440 ? 10 : 11);
  const ease = (dt, k) => (dt > 0 ? 1 - Math.exp(-dt * k) : 1);
  const dot = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const circle = (ctx, x, y, r, col, lw = 1, dash = null) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    if (dash) ctx.setLineDash([]);
  };
  const seg = (ctx, x1, y1, x2, y2, col, lw = 1, dash = null) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (dash) ctx.setLineDash([]);
  };
  const head = (ctx, x, y, a, size, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(a - 0.45), y - size * Math.sin(a - 0.45));
    ctx.lineTo(x - size * Math.cos(a + 0.45), y - size * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fill();
  };
  const arrow = (ctx, x1, y1, x2, y2, col, lw = 1.2, size = 5) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    seg(ctx, x1, y1, x2 - Math.cos(a) * size * 0.7, y2 - Math.sin(a) * size * 0.7, col, lw);
    head(ctx, x2, y2, a, size, col);
  };
  // point + direction on a quadratic Bézier at parameter u
  const quadAt = (x1, y1, cx, cy, x2, y2, u) => {
    const m = 1 - u;
    return [m * m * x1 + 2 * m * u * cx + u * u * x2, m * m * y1 + 2 * m * u * cy + u * u * y2,
      Math.atan2(2 * m * (cy - y1) + 2 * u * (y2 - cy), 2 * m * (cx - x1) + 2 * u * (x2 - cx))];
  };
  // "a → b → c" with the active stage highlighted
  const stages = (ctx, names, active, x, y, fs) => {
    let cx = x;
    names.forEach((n, i) => {
      label(ctx, n, cx, y, i === active ? PAL.text : rgba(PAL.muted, 0.85), fs);
      cx += ctx.measureText(n).width;
      if (i < names.length - 1) {
        label(ctx, ' → ', cx, y, rgba(PAL.muted, 0.6), fs);
        cx += ctx.measureText(' → ').width;
      }
    });
  };
  // legend row: [color, text, shape] with shape in dot | sq | ring | dashring | line | dash | box | diamond
  const legend = (ctx, items, x, y, fs) => {
    let cx = x;
    for (const [col, text, shape = 'dot'] of items) {
      if (shape === 'sq') { ctx.fillStyle = col; ctx.fillRect(cx, y - 3.5, 7, 7); cx += 11; }
      else if (shape === 'ring') { circle(ctx, cx + 3.5, y, 3.2, col, 1.2); cx += 11; }
      else if (shape === 'dashring') { circle(ctx, cx + 3.5, y, 3.5, col, 1.2, [2, 2]); cx += 11; }
      else if (shape === 'line') { seg(ctx, cx, y, cx + 11, y, col, 2); cx += 15; }
      else if (shape === 'dash') { seg(ctx, cx, y, cx + 11, y, col, 1.2, [2, 3]); cx += 15; }
      else if (shape === 'box') { ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.strokeRect(cx + 0.5, y - 3.5, 7, 7); cx += 11; }
      else if (shape === 'diamond') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(cx + 3.5, y - 3.5); ctx.lineTo(cx + 7, y); ctx.lineTo(cx + 3.5, y + 3.5); ctx.lineTo(cx, y); ctx.closePath(); ctx.fill();
        cx += 11;
      }
      else { dot(ctx, cx + 3.5, y, 3.2, col); cx += 11; }
      label(ctx, text, cx, y, PAL.muted, fs, 'left', 'middle');
      cx += ctx.measureText(text).width + 12;
    }
  };

  /* ======================================================================
     RoboKoop — a camera sees a swinging pendulum (coarse pixels). A learned
     Koopman embedding lifts it to a latent z where the dynamics are linear, so
     a linear controller u = −Kz (LQR) brings the latent home after every push.
     ====================================================================== */
  function robokoop(v) {
    const R = mulberry(41);
    const KP = 2.4, KD = 1.15, WN = Math.sqrt(9 + KP);
    let th = 1.2, om = 0, kick = 3.4, fx = 0, dir = 1;
    const trail = [];
    const step = (hh) => {
      const u = -KP * th - KD * om;
      om += (-9 * Math.sin(th) - 0.12 * om + u) * hh;
      th += om * hh;
    };
    return {
      warmup: 120,
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        if (dt > 0) {
          for (let s = 0; s < 4; s++) step(dt / 4);
          kick -= dt;
          fx = Math.max(0, fx - dt * 1.3);
          if (kick <= 0) { kick = 4.4; dir = R() < 0.5 ? -1 : 1; om += dir * (5.5 + R() * 2.5); fx = 1; }
          trail.push(th, om / WN);
          if (trail.length > 300) trail.splice(0, 2);
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), pad = 12, small = w < 380;
        const split = w * 0.44;
        // observation x: the pendulum as the camera sees it, a coarse pixel grid
        const N = 12;
        const cell = Math.max(3, Math.min((split - pad * 2) / N, (h - pad * 2 - fs * 3) / N));
        const gw = cell * N, gx = pad + (split - pad - gw) / 2, gy = (h - gw) / 2 + fs * 0.5;
        const px = gx + gw / 2, py = gy + cell * 2.5, len = gw * 0.6;
        const bx = px + Math.sin(th) * len, by = py + Math.cos(th) * len;
        const ux = bx - px, uy = by - py, L2 = ux * ux + uy * uy || 1;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const cx = gx + (i + 0.5) * cell, cy = gy + (j + 0.5) * cell;
            const q = clamp(((cx - px) * ux + (cy - py) * uy) / L2, 0, 1);
            const rod = clamp(1.3 - Math.hypot(cx - px - ux * q, cy - py - uy * q) / (cell * 0.7), 0, 1);
            const bob = clamp(1.7 - Math.hypot(cx - bx, cy - by) / cell, 0, 1);
            ctx.fillStyle = bob > 0.05 ? rgba(PAL.mint, 0.25 + 0.7 * bob) : rgba(PAL.text2, 0.07 + 0.5 * rod);
            ctx.fillRect(cx - cell / 2 + 0.5, cy - cell / 2 + 0.5, cell - 1, cell - 1);
          }
        }
        if (fx > 0.02) {
          const ax = bx - dir * cell * 1.3;
          arrow(ctx, ax - dir * cell * 2.4, by, ax, by, rgba(PAL.rose, fx), 1.6, 5);
          if (!small) label(ctx, 'push', ax - dir * cell * 1.2, by - 5, rgba(PAL.rose, fx), fs - 1, 'center', 'bottom');
        }
        // encoder φ
        const lx0 = split + 16;
        arrow(ctx, gx + gw + 4, h / 2, lx0 - 3, h / 2, rgba(PAL.muted, 0.85), 1.1, 5);
        label(ctx, 'φ', (gx + gw + lx0) / 2, h / 2 - 5, PAL.text2, fs + 1, 'center', 'bottom');
        // latent space: the closed loop is a clean spiral into the origin
        const lw = w - lx0 - pad, lh = h - pad * 2 - fs * 3.4;
        const lcx = lx0 + lw / 2, lcy = h / 2 + fs * 0.8, S = Math.min(lw, lh) / 2 - 2, k = S / 2.1;
        seg(ctx, lcx - S, lcy, lcx + S, lcy, rgba(PAL.muted, 0.3), 1, [2, 5]);
        seg(ctx, lcx, lcy - S, lcx, lcy + S, rgba(PAL.muted, 0.3), 1, [2, 5]);
        circle(ctx, lcx, lcy, S * 0.55, rgba(PAL.muted, 0.14), 1);
        const n = trail.length / 2;
        for (let i = 1; i < n; i++) {
          const a = i / n;
          seg(ctx, lcx + trail[2 * i - 2] * k, lcy - trail[2 * i - 1] * k, lcx + trail[2 * i] * k, lcy - trail[2 * i + 1] * k,
            rgba(PAL.indigo, 0.06 + 0.62 * a * a), 1.4);
        }
        seg(ctx, lcx - 5, lcy, lcx + 5, lcy, PAL.text2, 1.2);
        seg(ctx, lcx, lcy - 5, lcx, lcy + 5, PAL.text2, 1.2);
        const zx = lcx + th * k, zy = lcy - (om / WN) * k;
        if (Math.hypot(zx - lcx, zy - lcy) > 14) arrow(ctx, zx, zy, lerp(zx, lcx, 0.32), lerp(zy, lcy, 0.32), rgba(PAL.mint, 0.9), 1.4, 5);
        dot(ctx, zx, zy, 7, rgba(PAL.mint, 0.18));
        dot(ctx, zx, zy, 3.2, PAL.mint);
        label(ctx, small ? 'pixels' : 'pixels · x', gx, gy - 7, rgba(PAL.text, 0.8), fs, 'left', 'bottom');
        label(ctx, small ? 'latent z' : 'latent · z = φ(x)', lx0, gy - 7, rgba(PAL.text, 0.8), fs, 'left', 'bottom');
        label(ctx, 'u = −K z', lx0, h - 8, PAL.mint, fs, 'left', 'bottom');
        if (!small) label(ctx, 'linear (LQR)', w - pad, h - 8, PAL.muted, fs, 'right', 'bottom');
      },
    };
  }

  /* ======================================================================
     AdaCred — a causal decision transformer reads (s, a, r) tokens through a
     short context. Every token is credited for the next action; low-credit
     tokens are pruned, so the model needs far less history.
     ====================================================================== */
  function adacred(v) {
    const NAMES = ['s', 'a', 'r'];
    const kind = (n) => ((n % 3) + 3) % 3; // token indices go negative at t = 0
    const colOf = (n) => [PAL.indigo, PAL.mint, PAL.amber][kind(n)];
    const hash = (n) => { const x = Math.sin(n * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
    const credit = (n) => clamp((kind(n) === 1 ? 0.4 : 0.1) + 0.8 * hash(n), 0, 1);
    const K = 9, CUT = 0.42;
    return {
      frame() {
        const { w, h, ctx } = v;
        const t = v.t;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), small = w < 380;
        const s = clamp(w / 20, 11, 19), stepX = s * 1.36;
        const pos = t * 2.2, newest = Math.floor(pos), frac = pos - newest;
        const xP = w - 12 - s, right = xP - stepX * 1.6;
        const base = h * 0.5, topY = fs + 18;
        const xOf = (n) => right - (newest - n + frac) * stepX;
        const barTop = base + s / 2 + 5, barH = s * 1.05;
        const oldest = newest - K + 1;
        // causal credit: arcs from each kept token into the next-action prediction
        for (let n = newest; n >= oldest; n--) {
          const c = credit(n);
          if (c < CUT) continue;
          const x = xOf(n) + s / 2, x2 = xP + s / 2, y = base - s / 2;
          const ctrl = Math.max(2 * topY - y, y - (x2 - x) * 0.8);
          ctx.strokeStyle = rgba(colOf(n), 0.12 + 0.6 * c * c);
          ctx.lineWidth = 0.6 + 1.8 * c;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + x2) / 2, ctrl, x2, y); ctx.stroke();
        }
        for (let n = newest; ; n--) {
          const x = xOf(n);
          if (x < -s) break;
          const inCtx = n >= oldest, c = credit(n), pruned = inCtx && c < CUT;
          const enter = n === newest ? clamp(frac * 4, 0, 1) : 1;
          const col = colOf(n), y = base - s / 2, fsT = s * 0.55;
          roundRect(ctx, x, y, s, s, 3);
          if (inCtx && !pruned) {
            ctx.fillStyle = rgba(col, 0.9 * enter);
            ctx.fill();
            label(ctx, NAMES[kind(n)], x + s / 2, base + 0.5, rgba(PAL.bg, enter), fsT, 'center', 'middle');
          } else if (pruned) {
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = rgba(col, 0.55 * enter);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
            label(ctx, NAMES[kind(n)], x + s / 2, base + 0.5, rgba(col, 0.5 * enter), fsT, 'center', 'middle');
          } else {
            ctx.fillStyle = rgba(col, 0.1);
            ctx.fill();
            label(ctx, NAMES[kind(n)], x + s / 2, base + 0.5, rgba(PAL.muted, 0.45), fsT, 'center', 'middle');
          }
          if (inCtx) {
            const bh = barH * c * enter;
            ctx.fillStyle = rgba(col, pruned ? 0.25 : 0.6);
            ctx.fillRect(x + s * 0.3, barTop + barH - bh, s * 0.4, bh);
          }
        }
        // the (short) context window
        const bx0 = xOf(oldest) - 2, bx1 = xOf(newest) + s + 2, by = barTop + barH + 6;
        ctx.strokeStyle = rgba(PAL.muted, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx0, by - 4); ctx.lineTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(bx1, by - 4); ctx.stroke();
        label(ctx, small ? 'context · 3 steps' : 'short context · 3 steps', (bx0 + bx1) / 2, by + 4, PAL.muted, fs, 'center', 'top');
        // the next-action prediction
        const pulse = 0.55 + 0.45 * Math.sin(t * 4);
        roundRect(ctx, xP, base - s / 2, s, s, 3);
        ctx.fillStyle = rgba(PAL.mint, 0.1 + 0.12 * pulse);
        ctx.fill();
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = rgba(PAL.mint, 0.55 + 0.45 * pulse);
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, 'â', xP + s / 2, base + 0.5, PAL.mint, s * 0.6, 'center', 'middle');
        label(ctx, small ? 'credit → â' : 'credit each token → next action â', 12, 10, rgba(PAL.text, 0.8), fs);
        if (!small) legend(ctx, [[PAL.indigo, 'state', 'sq'], [PAL.mint, 'action', 'sq'], [PAL.amber, 'reward', 'sq'], [PAL.muted, 'pruned', 'dashring']], 12, h - 10, fs);
      },
    };
  }

  /* ======================================================================
     DFDNet — fully-sparse LiDAR detection: only voxels on object surfaces
     exist. They are classified (object vs. clutter), features diffuse
     directionally into the object interiors, and oriented boxes are regressed
     — empty space is never computed.
     ====================================================================== */
  function dfdnet(v) {
    const CYCLE = 6.4;
    let scene = null, key = '';
    const build = (cols, rows, id) => {
      const rr = mulberry(1000 + id * 7);
      const objs = [];
      for (let k = 0; objs.length < 3 && k < 80; k++) {
        const o = { x: 3 + rr() * (cols - 6), y: 2.5 + rr() * Math.max(1, rows * 0.62 - 3), hw: 1.15 + rr() * 0.35, hl: 2.1 + rr() * 0.6, a: rr() * Math.PI };
        if (objs.every((p) => Math.hypot(p.x - o.x, p.y - o.y) > 6.2)) objs.push(o);
      }
      const ex = cols / 2, ey = rows + 1.5; // the sensor sits just below the grid
      const azi = (i, j) => clamp((Math.atan2(j + 0.5 - ey, i + 0.5 - ex) + Math.PI) / Math.PI, 0, 1);
      const cells = [];
      for (const o of objs) {
        const ca = Math.cos(o.a), sa = Math.sin(o.a);
        const rad = Math.ceil(Math.hypot(o.hw, o.hl)) + 1;
        const surf = [], inner = [];
        for (let i = Math.floor(o.x - rad); i <= Math.ceil(o.x + rad); i++) {
          for (let j = Math.floor(o.y - rad); j <= Math.ceil(o.y + rad); j++) {
            if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
            const dx = i + 0.5 - o.x, dy = j + 0.5 - o.y;
            const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
            if (Math.abs(lx) > o.hw + 0.4 || Math.abs(ly) > o.hl + 0.4) continue;
            const mx = o.hw - Math.abs(lx), my = o.hl - Math.abs(ly);
            const sx = Math.sign(lx) || 1, sy = Math.sign(ly) || 1;
            const [nx, ny] = mx < my ? [sx * ca, sx * sa] : [-sy * sa, sy * ca];
            const facing = nx * (ex - i - 0.5) + ny * (ey - j - 0.5) > 0;
            if (Math.min(mx, my) < 0.75 && facing) surf.push({ i, j, kind: 1, ord: 0, d: azi(i, j) });
            else if (mx >= 0 && my >= 0) inner.push({ i, j, kind: 2, ord: 0, d: 0 });
          }
        }
        if (!surf.length) continue;
        let maxd = 0.001;
        for (const c of inner) {
          let best = 1e9;
          for (const s of surf) best = Math.min(best, Math.hypot(s.i - c.i, s.j - c.j));
          c.ord = best;
          maxd = Math.max(maxd, best);
        }
        for (const c of inner) c.ord /= maxd;
        cells.push(...surf, ...inner);
        o.sx = surf.reduce((a, c) => a + c.i + 0.5, 0) / surf.length;
        o.sy = surf.reduce((a, c) => a + c.j + 0.5, 0) / surf.length;
      }
      // a few isolated returns from clutter (ground, foliage) that the classifier rejects
      for (let k = 0; k < 9; k++) {
        const i = Math.floor(rr() * cols), j = Math.floor(rr() * rows);
        if (!cells.some((c) => c.i === i && c.j === j)) cells.push({ i, j, kind: 3, ord: 0, d: azi(i, j) });
      }
      return { objs: objs.filter((o) => o.sx !== undefined), cells };
    };
    return {
      warmup: 290, // still frame: boxes over the diffused features
      frame() {
        const { w, h, ctx } = v;
        const t = v.t;
        const fs = fsz(w), pad = 10, top = fs + 16, bot = fs + 14;
        const cell = clamp(Math.min((w - pad * 2) / 30, (h - top - bot) / 16), 5, 18);
        const cols = Math.floor((w - pad * 2) / cell), rows = Math.floor((h - top - bot) / cell);
        const id = Math.floor(t / CYCLE), p = (t % CYCLE) / CYCLE;
        const k = `${cols}x${rows}:${id}`;
        if (k !== key) { key = k; scene = build(cols, rows, id); }
        const gx = (w - cols * cell) / 2, gy = top;
        const X = (i) => gx + i * cell, Y = (j) => gy + j * cell;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = rgba(PAL.muted, 0.2);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillRect(X(i + 0.5) - 0.6, Y(j + 0.5) - 0.6, 1.2, 1.2);
        const fade = p > 0.9 ? 1 - (p - 0.9) / 0.1 : 1;
        const sweep = clamp(p / 0.18, 0, 1), cls = clamp((p - 0.2) / 0.08, 0, 1);
        const diff = clamp((p - 0.3) / 0.3, 0, 1), boxP = clamp((p - 0.62) / 0.16, 0, 1);
        const stage = p < 0.2 ? 0 : p < 0.3 ? 1 : p < 0.62 ? 2 : 3;
        const r = Math.min(3, cell * 0.25);
        let active = 0;
        for (const c of scene.cells) {
          if (c.kind === 2) {
            const a = clamp((diff - c.ord) * 5, 0, 1);
            if (a <= 0.01) continue;
            active++;
            roundRect(ctx, X(c.i) + 1, Y(c.j) + 1, cell - 2, cell - 2, r);
            ctx.fillStyle = rgba(PAL.amber, 0.45 * a * fade);
            ctx.fill();
            continue;
          }
          if (c.d > sweep) continue;
          active++;
          roundRect(ctx, X(c.i) + 1, Y(c.j) + 1, cell - 2, cell - 2, r);
          if (c.kind === 1) {
            ctx.fillStyle = rgba(PAL.text2, 0.6 * (1 - cls) * fade);
            ctx.fill();
            ctx.fillStyle = rgba(PAL.amber, 0.95 * cls * fade);
            ctx.fill();
          } else {
            ctx.fillStyle = rgba(PAL.text2, 0.6 * (1 - 0.75 * cls) * fade);
            ctx.fill();
          }
        }
        // directional diffusion: features flow from the seen surface toward each object's centre
        if (diff > 0 && boxP < 1) {
          const e = easeIO(diff);
          for (const o of scene.objs) {
            const x1 = X(o.sx), y1 = Y(o.sy), x2 = X(o.x), y2 = Y(o.y);
            if (Math.hypot(x2 - x1, y2 - y1) < cell * 0.8) continue;
            arrow(ctx, x1, y1, lerp(x1, x2, 0.3 + 0.7 * e), lerp(y1, y2, 0.3 + 0.7 * e), rgba(PAL.amber, 0.95 * (1 - boxP) * fade), 1.3, 4.5);
          }
        }
        if (boxP > 0) {
          for (const o of scene.objs) {
            const ca = Math.cos(o.a), sa = Math.sin(o.a);
            const pts = [[-o.hw, -o.hl], [o.hw, -o.hl], [o.hw, o.hl], [-o.hw, o.hl]].map(([lx, ly]) => [X(o.x + lx * ca - ly * sa), Y(o.y + lx * sa + ly * ca)]);
            const per = 4 * (o.hw + o.hl) * cell;
            ctx.setLineDash([per * boxP, per]);
            ctx.strokeStyle = rgba(PAL.mint, 0.95 * fade);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            dot(ctx, X(o.x), Y(o.y), 2.4, rgba(PAL.mint, boxP * fade));
            seg(ctx, X(o.x), Y(o.y), X(o.x - o.hl * sa * 0.9), Y(o.y + o.hl * ca * 0.9), rgba(PAL.mint, boxP * fade), 1.2);
          }
        }
        const sx = gx + (cols * cell) / 2, sy = gy + rows * cell + 3;
        ctx.fillStyle = PAL.mint;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 5, sy + 7); ctx.lineTo(sx - 5, sy + 7); ctx.closePath(); ctx.fill();
        stages(ctx, ['voxels', 'classify', 'diffuse', 'boxes'], stage, pad, 8, fs);
        label(ctx, `active voxels ${Math.max(1, Math.round((100 * active) / (cols * rows)))}%`, w - pad, h - 5, PAL.muted, fs, 'right', 'bottom');
      },
    };
  }

  /* ======================================================================
     LUGA — a radar map is sensed coarsely where the detector is confident and
     refined only where its uncertainty is high (around moving targets): fewer
     samples, less energy.
     ====================================================================== */
  function luga(v) {
    const T = [
      { a: 0.34, b: 0.28, f: 0.31, g: 0.43, ph: 0 },
      { a: 0.3, b: 0.3, f: 0.23, g: 0.29, ph: 2.2 },
      { a: 0.36, b: 0.22, f: 0.37, g: 0.21, ph: 4.1 },
    ];
    const THR = [0.05, 0.12, 0.24, 0.42, 0.66];
    return {
      frame() {
        const { w, h, ctx } = v;
        const t = v.t;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), pad = 12, top = fs + 16, bottom = fs + 14;
        const X0 = pad, Y0 = top, W = w - pad * 2, Hh = h - top - bottom;
        const pts = T.map((g) => [X0 + W * (0.5 + g.a * Math.sin(t * g.f + g.ph)), Y0 + Hh * (0.5 + g.b * Math.sin(t * g.g + g.ph * 1.3))]);
        const sig = Math.min(W, Hh) * 0.15, s2 = 2 * sig * sig, r2 = 2 * (sig * 0.36) ** 2;
        const unc = (x, y) => { let s = 0; for (const [a, b] of pts) s += Math.exp(-((x - a) ** 2 + (y - b) ** 2) / s2); return s; };
        const ret = (x, y) => { let s = 0; for (const [a, b] of pts) s += Math.exp(-((x - a) ** 2 + (y - b) ** 2) / r2); return Math.min(1, s); };
        const MAXD = W > 520 ? 5 : 4;
        const rc = 4, rr = Math.max(1, Math.round((4 * Hh) / W));
        const tiles = [];
        const visit = (x, y, tw, th, d) => {
          const u = Math.max(unc(x + tw / 2, y + th / 2), unc(x, y), unc(x + tw, y), unc(x, y + th), unc(x + tw, y + th));
          if (d < MAXD && u > THR[d]) {
            const hw = tw / 2, hh = th / 2;
            visit(x, y, hw, hh, d + 1); visit(x + hw, y, hw, hh, d + 1);
            visit(x, y + hh, hw, hh, d + 1); visit(x + hw, y + hh, hw, hh, d + 1);
          } else tiles.push([x, y, tw, th, d]);
        };
        for (let i = 0; i < rc; i++) for (let j = 0; j < rr; j++) visit(X0 + (W / rc) * i, Y0 + (Hh / rr) * j, W / rc, Hh / rr, 0);
        for (const [a, b] of pts) {
          const g = ctx.createRadialGradient(a, b, 0, a, b, sig * 1.8);
          g.addColorStop(0, rgba(PAL.rose, 0.22));
          g.addColorStop(1, rgba(PAL.rose, 0));
          ctx.fillStyle = g;
          ctx.fillRect(a - sig * 1.8, b - sig * 1.8, sig * 3.6, sig * 3.6);
        }
        ctx.lineWidth = 0.75;
        for (const [x, y, tw, th, d] of tiles) {
          ctx.fillStyle = rgba(PAL.amber, 0.04 + 0.85 * ret(x + tw / 2, y + th / 2));
          ctx.fillRect(x + 0.5, y + 0.5, tw - 1, th - 1);
          ctx.strokeStyle = rgba(PAL.text2, 0.1 + 0.04 * d);
          ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
        }
        label(ctx, 'radar map · uncertainty → resolution', pad, 8, rgba(PAL.text, 0.8), fs);
        legend(ctx, [[PAL.rose, 'uncertain'], [PAL.amber, 'return', 'sq'], [PAL.text2, w < 380 ? 'fine tiles' : 'fine tiles only where needed', 'ring']], pad, h - 8, fs);
      },
    };
  }

  /* ======================================================================
     SDGN — spiking neurons with spike-timing-dependent plasticity (STDP) learn
     the hidden excitation graph between event streams (a multivariate point
     process). The true graph changes now and then; the learned one follows.
     ====================================================================== */
  function sdgn(v) {
    const R = mulberry(61);
    const N = 7;
    const GRAPHS = [
      [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [3, 6], [1, 5]],
      [[6, 0], [0, 2], [2, 4], [4, 1], [1, 3], [3, 5], [5, 0], [2, 6]],
      [[0, 3], [3, 1], [1, 4], [4, 2], [2, 5], [5, 3], [6, 1], [0, 6]],
    ];
    const MU = 0.2, BETA = 3.2, ALPHA = 2.3; // Hawkes excitation, sub-critical: bursty but stable
    const A = new Uint8Array(N * N), W = new Float32Array(N * N);
    const exc = new Float32Array(N), last = new Float32Array(N).fill(-99), flash = new Float32Array(N);
    let gi = 0, gT = 10, spikes = [], pulses = [], t = 0;
    const setGraph = () => { A.fill(0); for (const [j, i] of GRAPHS[gi]) A[j * N + i] = 1; };
    setGraph();
    const advance = (dt) => {
      t += dt;
      gT -= dt;
      if (gT <= 0) { gT = 10; gi = (gi + 1) % GRAPHS.length; setGraph(); }
      const sub = 3, hs = dt / sub;
      for (let s = 0; s < sub; s++) {
        const ts = t - dt + hs * (s + 1);
        for (let i = 0; i < N; i++) exc[i] *= Math.exp(-BETA * hs);
        for (let i = 0; i < N; i++) {
          if (R() >= (MU + exc[i]) * hs) continue;
          spikes.push({ i, t: ts });
          flash[i] = 1;
          for (let k = 0; k < N; k++) if (A[i * N + k]) { exc[k] += ALPHA; pulses.push({ j: i, i: k, b: ts }); }
          for (let j = 0; j < N; j++) {
            const d = ts - last[j];
            if (j === i || d <= 0 || d >= 1) continue;
            W[j * N + i] += 0.3 * Math.exp(-d / 0.32); // pre (j) before post (i): potentiate j→i
            W[i * N + j] = Math.max(0, W[i * N + j] - 0.12 * Math.exp(-d / 0.32)); // anti-causal: depress i→j
          }
          last[i] = ts;
        }
      }
      const decay = Math.exp(-dt / 7);
      for (let k = 0; k < N * N; k++) W[k] *= decay;
      for (let i = 0; i < N; i++) flash[i] = Math.max(0, flash[i] - dt * 3.2);
      spikes = spikes.filter((s) => t - s.t < 4);
      pulses = pulses.filter((p) => t - p.b < 0.4);
    };
    for (let k = 0; k < 330; k++) advance(1 / 30); // warm start: the learned graph exists from the first frame
    return {
      warmup: 1,
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        if (dt > 0) advance(dt);
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), pad = 12, small = w < 380;
        const gcx = w * 0.3, gcy = h * 0.54, rad = Math.min(w * 0.21, h * 0.33);
        const P = (i) => { const a = -Math.PI / 2 + (i / N) * TAU; return [gcx + Math.cos(a) * rad, gcy + Math.sin(a) * rad]; };
        for (const [j, i] of GRAPHS[gi]) { const [x1, y1] = P(j), [x2, y2] = P(i); seg(ctx, x1, y1, x2, y2, rgba(PAL.muted, 0.4), 1, [2, 4]); }
        let wmax = 0.6;
        for (let k = 0; k < N * N; k++) wmax = Math.max(wmax, W[k]);
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const wn = W[j * N + i] / wmax;
            if (j === i || wn < 0.18) continue;
            const [x1, y1] = P(j), [x2, y2] = P(i);
            const cx = (x1 + x2) / 2 - (y2 - y1) * 0.12, cy = (y1 + y2) / 2 + (x2 - x1) * 0.12;
            const col = rgba(PAL.indigo, 0.15 + 0.75 * wn);
            ctx.strokeStyle = col;
            ctx.lineWidth = 0.6 + 2.2 * wn;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
            const [hx, hy, ha] = quadAt(x1, y1, cx, cy, x2, y2, 0.8);
            head(ctx, hx, hy, ha, 4 + 2 * wn, col);
          }
        }
        for (const p of pulses) {
          const q = (t - p.b) / 0.4, [x1, y1] = P(p.j), [x2, y2] = P(p.i);
          dot(ctx, lerp(x1, x2, q), lerp(y1, y2, q), 2.2, rgba(PAL.mint, 1 - q * 0.6));
        }
        const nr = clamp(rad * 0.13, 4.5, 8);
        for (let i = 0; i < N; i++) {
          const [x, y] = P(i);
          if (flash[i] > 0) circle(ctx, x, y, nr + 3 + (1 - flash[i]) * 8, rgba(PAL.mint, 0.5 * flash[i]), 1.2);
          dot(ctx, x, y, nr, PAL.bg);
          dot(ctx, x, y, nr, rgba(PAL.mint, 0.12 + 0.88 * flash[i]));
          circle(ctx, x, y, nr, rgba(PAL.text2, 0.55), 1.2);
        }
        // spike raster
        const rx0 = w * 0.62, rx1 = w - pad, ry0 = fs + 26, ry1 = h - fs - 16, rowH = (ry1 - ry0) / N;
        for (let i = 0; i < N; i++) seg(ctx, rx0, ry0 + rowH * (i + 0.5), rx1, ry0 + rowH * (i + 0.5), rgba(PAL.muted, 0.15), 1);
        for (const s of spikes) {
          const x = rx1 - ((t - s.t) / 4) * (rx1 - rx0), y = ry0 + rowH * (s.i + 0.5);
          seg(ctx, x, y - rowH * 0.36, x, y + rowH * 0.36, rgba(PAL.mint, 0.95 - 0.55 * ((t - s.t) / 4)), 1.5);
        }
        label(ctx, 'spikes', rx0, ry0 - 6, rgba(PAL.text, 0.8), fs, 'left', 'bottom');
        label(ctx, 'now', rx1, ry1 + 4, PAL.muted, fs - 1, 'right', 'top');
        label(ctx, small ? 'graph via STDP' : 'graph learned with STDP', pad, 8, rgba(PAL.text, 0.8), fs);
        legend(ctx, [[PAL.indigo, 'learned', 'line'], [PAL.muted, 'true', 'dash']], pad, h - 9, fs);
      },
    };
  }

  /* ======================================================================
     Sensing-to-action — two agents sense where they are about to act: each
     aims its sensing cone at its look-ahead. Features inside a cone are sensed
     (crisp); the rest are only predicted (hollow). The agents share what they
     see.
     ====================================================================== */
  function s2a(v) {
    const R = mulberry(83);
    const F = Array.from({ length: 54 }, () => ({ x: 0.03 + R() * 0.94, y: 0.06 + R() * 0.88, seen: 0, by: 0 }));
    const AG = [{ ph: 0, col: 'mint' }, { ph: Math.PI * 0.85, col: 'indigo' }];
    const path = (s) => [0.5 + 0.42 * Math.sin(s), 0.5 + 0.44 * Math.sin(s) * Math.cos(s)];
    return {
      warmup: 120,
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        const t = v.t;
        const fs = fsz(w), pad = 12, top = fs + 14;
        const X = (x) => pad + x * (w - pad * 2), Y = (y) => top + y * (h - top - pad - fs - 4);
        const range = Math.min(w, h) * 0.34, half = 0.5;
        const ag = AG.map((a, k) => {
          const s = t * 0.42 + a.ph;
          const [x, y] = path(s), [lx, ly] = path(s + 0.55);
          const px = X(x), py = Y(y);
          return { px, py, ang: Math.atan2(Y(ly) - py, X(lx) - px), col: PAL[a.col], k };
        });
        if (dt > 0) {
          for (const f of F) {
            const fx = X(f.x), fy = Y(f.y);
            for (const a of ag) {
              const dx = fx - a.px, dy = fy - a.py;
              let da = Math.atan2(dy, dx) - a.ang;
              da = Math.atan2(Math.sin(da), Math.cos(da));
              if (Math.hypot(dx, dy) < range && Math.abs(da) < half) { f.seen = 1; f.by = a.k; }
            }
            f.seen = Math.max(0, f.seen - dt * 0.45);
          }
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = rgba(PAL.muted, 0.2);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) { const [x, y] = path((i / 120) * TAU); if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)); }
        ctx.stroke();
        ctx.setLineDash([]);
        for (const a of ag) {
          const g = ctx.createRadialGradient(a.px, a.py, 0, a.px, a.py, range);
          g.addColorStop(0, rgba(a.col, 0.26));
          g.addColorStop(1, rgba(a.col, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.arc(a.px, a.py, range, a.ang - half, a.ang + half); ctx.closePath(); ctx.fill();
        }
        for (const f of F) {
          const fx = X(f.x), fy = Y(f.y);
          if (f.seen > 0.02) dot(ctx, fx, fy, 2.5, rgba(ag[f.by].col, 0.25 + 0.75 * f.seen));
          circle(ctx, fx, fy, 2.6, rgba(PAL.text2, 0.4 * (1 - f.seen)), 1);
        }
        const [a0, a1] = ag, d01 = Math.hypot(a1.px - a0.px, a1.py - a0.py);
        const link = clamp(1.7 - d01 / (Math.min(w, h) * 0.6), 0, 1);
        if (link > 0) {
          seg(ctx, a0.px, a0.py, a1.px, a1.py, rgba(PAL.text2, 0.45 * link), 1, [3, 4]);
          for (let k = 0; k < 3; k++) {
            const q = (t * 0.8 + k / 3) % 1;
            dot(ctx, lerp(a0.px, a1.px, q), lerp(a0.py, a1.py, q), 1.8, rgba(PAL.text2, 0.85 * link));
          }
        }
        for (const a of ag) {
          ctx.save();
          ctx.translate(a.px, a.py);
          ctx.rotate(a.ang);
          ctx.fillStyle = a.col;
          ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        label(ctx, 'sense → act → sense', pad, 8, rgba(PAL.text, 0.8), fs);
        if (link > 0.3 && w > 360) label(ctx, 'share', (a0.px + a1.px) / 2, (a0.py + a1.py) / 2 - 6, rgba(PAL.text2, link), fs - 1, 'center', 'bottom');
        legend(ctx, [[PAL.mint, 'sensed'], [PAL.text2, 'predicted', 'ring']], pad, h - 9, fs);
      },
    };
  }

  /* ======================================================================
     Cognitive sensing — instead of digitizing every pixel (the "analog data
     deluge"), a learned analog front-end compresses the raw signal into a few
     features before conversion.
     ====================================================================== */
  function cogsense(v) {
    const R = mulberry(97);
    const noise = makeNoise(5);
    let parts = [], toks = [], acc = 0, absorbed = 0;
    const NS = 5;
    return {
      warmup: 220,
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        const t = v.t;
        const fs = fsz(w), pad = 12, small = w < 380;
        const gx0 = pad, gx1 = w * 0.25, gy0 = fs + 20, gy1 = h - fs - 18;
        const cols = 6, rows = 8, cw = (gx1 - gx0) / cols, ch = (gy1 - gy0) / rows;
        const cy = (gy0 + gy1) / 2, mouthX = w * 0.42, throatX = w * 0.62;
        const mouthH = (gy1 - gy0) * 0.5, throatH = Math.max(4, h * 0.035);
        const sx0 = w * 0.74, slotW = w - pad - sx0, slotH = clamp((gy1 - gy0) / 7, 8, 16), slotGap = slotH * 0.45;
        const slotY = (k) => cy + (k - (NS - 1) / 2) * (slotH + slotGap) - slotH / 2;
        if (dt > 0) {
          acc += dt * 55;
          while (acc >= 1) {
            acc -= 1;
            const y0 = gy0 + (Math.floor(R() * rows) + 0.5) * ch;
            parts.push({ x0: gx1 + 2, y0, x: gx1 + 2, y: y0, ey: cy + (R() - 0.5) * throatH * 1.5, sp: ((0.8 + R() * 0.5) * (throatX - gx1)) / 2.2 });
          }
          for (const p of parts) {
            p.x += p.sp * dt;
            const q = clamp((p.x - p.x0) / (throatX - p.x0), 0, 1);
            p.y = lerp(p.y0, p.ey, easeIO(q)) + Math.sin(p.x * 0.09 + p.y0) * (1 - q) * 2;
          }
          const before = parts.length;
          parts = parts.filter((p) => p.x < throatX);
          absorbed += before - parts.length;
          while (absorbed >= 18) {
            absorbed -= 18;
            toks.forEach((k) => { k.slot -= 1; });
            toks.push({ slot: NS - 1, x: throatX + 8, y: cy - slotH / 2, a: 0 });
            toks = toks.filter((k) => k.slot >= -1);
          }
          for (const k of toks) {
            k.x += (sx0 - k.x) * ease(dt, 5);
            k.y += (slotY(Math.max(0, k.slot)) - k.y) * ease(dt, 5);
            k.a += ((k.slot < 0 ? 0 : 1) - k.a) * ease(dt, 4);
          }
          toks = toks.filter((k) => k.slot >= 0 || k.a > 0.03);
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        // shimmering analog pixel array
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const n = 0.5 + 0.5 * noise(i * 0.55, j * 0.55, t * 0.7);
            ctx.fillStyle = rgba(PAL.amber, 0.08 + 0.55 * n);
            ctx.fillRect(gx0 + i * cw + 1, gy0 + j * ch + 1, cw - 2, ch - 2);
          }
        }
        // the deluge of raw samples
        ctx.fillStyle = rgba(PAL.amber, 0.7);
        for (const p of parts) ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        // learned analog front-end
        ctx.beginPath();
        ctx.moveTo(mouthX, cy - mouthH);
        ctx.bezierCurveTo(lerp(mouthX, throatX, 0.55), cy - mouthH, lerp(mouthX, throatX, 0.55), cy - throatH, throatX, cy - throatH);
        ctx.lineTo(throatX + 8, cy - throatH);
        ctx.lineTo(throatX + 8, cy + throatH);
        ctx.lineTo(throatX, cy + throatH);
        ctx.bezierCurveTo(lerp(mouthX, throatX, 0.55), cy + throatH, lerp(mouthX, throatX, 0.55), cy + mouthH, mouthX, cy + mouthH);
        ctx.closePath();
        ctx.fillStyle = rgba(PAL.indigo, 0.12);
        ctx.fill();
        ctx.strokeStyle = rgba(PAL.indigo, 0.75);
        ctx.lineWidth = 1.3;
        ctx.stroke();
        arrow(ctx, throatX + 10, cy, sx0 - 6, cy, rgba(PAL.muted, 0.6), 1, 4);
        // a few features
        ctx.lineWidth = 1;
        for (let k = 0; k < NS; k++) {
          roundRect(ctx, sx0, slotY(k), slotW, slotH, 3);
          ctx.strokeStyle = rgba(PAL.muted, 0.3);
          ctx.stroke();
        }
        for (const k of toks) {
          roundRect(ctx, k.x, k.y, slotW, slotH, 3);
          ctx.fillStyle = rgba(PAL.mint, 0.85 * k.a);
          ctx.fill();
        }
        label(ctx, small ? 'analog' : 'analog pixels', gx0, h - 8, PAL.muted, fs, 'left', 'bottom');
        label(ctx, small ? 'learned AFE' : 'learned front-end', (mouthX + throatX) / 2 + 4, h - 8, rgba(PAL.indigo, 0.95), fs, 'center', 'bottom');
        label(ctx, 'features', w - pad, h - 8, rgba(PAL.mint, 0.95), fs, 'right', 'bottom');
        label(ctx, small ? 'data deluge → few features' : 'analog data deluge → a few features', pad, 8, rgba(PAL.text, 0.8), fs);
      },
    };
  }

  /* ======================================================================
     ChirpNet — chirps are processed one at a time as they arrive, instead of
     waiting for the whole frame and building an FFT radar cube; the answer
     arrives about 3× sooner (the latency gain the paper reports).
     ====================================================================== */
  function chirpnet(v) {
    const PERIOD = 5.4, NCH = 8, CH = 0.05;
    const at = (k) => 0.05 + k * 0.064;
    const acqEnd = at(NCH - 1) + CH, aEnd = acqEnd + 0.3, bEnd = acqEnd + 0.1;
    return {
      warmup: 280, // still frame: both pipelines finished, latency brackets visible
      frame() {
        const { w, h, ctx } = v;
        const t = v.t;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), pad = 12, small = w < 380;
        const tau = (t % PERIOD) / PERIOD;
        const X = (q) => lerp(pad, w - pad, q);
        const yC = h * 0.25, cH = h * 0.11, yA = h * 0.52, yB = h * 0.8;
        const fade = tau > 0.94 ? 1 - (tau - 0.94) / 0.06 : 1;
        ctx.globalAlpha = fade;
        // incoming chirps (shared by both pipelines)
        for (let k = 0; k < NCH; k++) {
          if (tau < at(k)) break;
          const pr = clamp((tau - at(k)) / CH, 0, 1);
          seg(ctx, X(at(k)), yC + cH / 2, X(at(k) + CH * pr), yC + cH / 2 - cH * pr, PAL.amber, 1.6);
        }
        // A · build the full radar cube, then a heavy FFT + CNN pass
        const laneH = h * 0.13;
        for (let k = 0; k < NCH; k++) {
          if (tau < at(k) + CH) break;
          roundRect(ctx, X(at(k)), yA - laneH / 2, X(at(k) + CH) - X(at(k)), laneH, 2);
          ctx.fillStyle = rgba(PAL.amber, 0.22);
          ctx.fill();
        }
        if (tau > acqEnd) {
          const x1 = X(Math.min(tau, aEnd));
          roundRect(ctx, X(acqEnd), yA - laneH * 0.75, Math.max(2, x1 - X(acqEnd)), laneH * 1.5, 3);
          ctx.fillStyle = rgba(PAL.indigo, 0.55);
          ctx.fill();
          if (!small && x1 - X(acqEnd) > 70) label(ctx, 'FFT cube + CNN', X(acqEnd) + 6, yA, rgba(PAL.bg, 0.95), fs - 1, 'left', 'middle');
        }
        // B · a small recurrent step right after each chirp
        const cs = clamp(laneH * 0.7, 7, 13);
        for (let k = 0; k < NCH; k++) {
          const x = X(at(k) + CH) + 2;
          if (tau < at(k) + CH) break;
          if (k) seg(ctx, X(at(k - 1) + CH) + 2 + cs, yB, x, yB, rgba(PAL.mint, 0.6), 1.2);
          roundRect(ctx, x, yB - cs / 2, cs, cs, 2.5);
          ctx.fillStyle = PAL.mint;
          ctx.fill();
        }
        const done = (x, y, c) => { dot(ctx, x, y, 7, c); label(ctx, '✓', x, y + 0.5, PAL.bg, 9, 'center', 'middle'); };
        const bracket = (x0, x1, y, text, c) => {
          ctx.strokeStyle = c;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, y - 3); ctx.lineTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x1, y - 3); ctx.stroke();
          label(ctx, text, x1 + 5, y, c, fs - 1, 'left', 'middle');
        };
        if (tau >= aEnd) {
          done(X(aEnd) + 9, yA, PAL.indigo);
          bracket(X(acqEnd), X(aEnd), yA + laneH * 0.75 + 7, 'latency', rgba(PAL.indigo, 0.9));
        }
        if (tau >= bEnd) {
          done(X(bEnd) + 9, yB, PAL.mint);
          bracket(X(acqEnd), X(bEnd), yB + cs / 2 + 8, small ? '≈3× sooner' : '≈3× lower latency', rgba(PAL.mint, 0.95));
        }
        seg(ctx, X(tau), yC - cH, X(tau), yB + cs, rgba(PAL.text, 0.3), 1, [2, 4]);
        ctx.globalAlpha = 1;
        label(ctx, 'chirps', pad, yC - cH / 2 - 6, rgba(PAL.text, 0.8), fs, 'left', 'bottom');
        label(ctx, 'frame → radar cube', pad, yA - laneH * 0.75 - 5, PAL.muted, fs, 'left', 'bottom');
        label(ctx, small ? 'chirp by chirp' : 'chirp by chirp (sequential)', pad, yB - cs / 2 - 5, rgba(PAL.mint, 0.95), fs, 'left', 'bottom');
      },
    };
  }

  /* ======================================================================
     STAGE Net — spatio-temporal attention: a query agent attends to agents
     across past time steps (stacked planes). One agent is never observed; it
     is inferred from how it moves the others.
     ====================================================================== */
  function stagenet(v) {
    const N = 6, HID = 4, DT = 0.75, OBS = [0, 1, 2, 3, 5];
    const P = Array.from({ length: N }, (_, i) => ({ fa: 0.29 + 0.07 * i, fb: 0.41 - 0.045 * i, pa: i * 1.7, pb: i * 2.9 }));
    const at = (i, tt) => { const p = P[i]; return [0.5 + 0.4 * Math.sin(tt * p.fa + p.pa), 0.5 + 0.36 * Math.sin(tt * p.fb + p.pb)]; };
    return {
      frame() {
        const { w, h, ctx } = v;
        const t = v.t;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), small = w < 380;
        const lab = small ? 26 : 34;
        const PW = (w - lab - 16) * 0.78, skew = (w - lab - 16) * 0.2, PH = h * 0.19, gapY = h * 0.235;
        const ox = lab + 4, baseY = h - fs - 14;
        const proj = (k, u, q) => [ox + u * PW + q * skew, baseY - k * gapY - q * PH];
        for (let k = 0; k < 3; k++) {
          const c = [proj(k, 0, 0), proj(k, 1, 0), proj(k, 1, 1), proj(k, 0, 1)];
          ctx.beginPath();
          c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fillStyle = rgba(PAL.text2, k === 2 ? 0.07 : 0.035);
          ctx.fill();
          ctx.strokeStyle = rgba(PAL.text2, k === 2 ? 0.3 : 0.16);
          ctx.lineWidth = 1;
          ctx.stroke();
          label(ctx, ['t−2', 't−1', 't'][k], ox - 6, baseY - k * gapY - PH / 2, k === 2 ? PAL.text2 : PAL.muted, fs, 'right', 'middle');
        }
        const pos = (i, k) => { const [u, q] = at(i, t - (2 - k) * DT); return proj(k, u, q); };
        for (const i of OBS) {
          ctx.setLineDash([1.5, 3]);
          ctx.strokeStyle = rgba(PAL.muted, 0.35);
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) { const [x, y] = pos(i, k); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // attention from the current query agent to agents across time
        const qi = OBS[Math.floor(t / 2.6) % OBS.length], qa = Math.min(1, (t % 2.6) * 3);
        const [Qx, Qy] = pos(qi, 2), [qu, qq] = at(qi, t);
        const att = [];
        for (const j of OBS) {
          for (let k = 0; k < 3; k++) {
            if (j === qi && k === 2) continue;
            const [u, q] = at(j, t - (2 - k) * DT);
            att.push([j, k, Math.exp(-((u - qu) ** 2 + (q - qq) ** 2) / 0.09) * 0.72 ** (2 - k)]);
          }
        }
        const amax = Math.max(...att.map((a) => a[2]), 1e-6);
        for (const [j, k, a] of att) {
          const wn = a / amax;
          if (wn < 0.12) continue;
          const [x, y] = pos(j, k);
          seg(ctx, Qx, Qy, x, y, rgba(PAL.indigo, (0.12 + 0.6 * wn) * qa), 0.6 + 1.8 * wn);
          const ph = (t * 1.3 + j * 0.37 + k * 0.21) % 1;
          dot(ctx, lerp(x, Qx, ph), lerp(y, Qy, ph), 1.6, rgba(PAL.indigo, 0.9 * wn * qa));
        }
        // the hidden agent: never observed, only inferred
        for (let k = 0; k < 3; k++) {
          const [x, y] = pos(HID, k);
          circle(ctx, x, y, 5.5, rgba(PAL.rose, k === 2 ? 0.9 : 0.45), 1.3, [2.5, 2.5]);
          if (k === 2) label(ctx, '?', x, y + 0.5, PAL.rose, 8.5, 'center', 'middle');
        }
        const [hx, hy] = pos(HID, 2);
        seg(ctx, Qx, Qy, hx, hy, rgba(PAL.rose, 0.45 * qa), 1, [3, 3]);
        for (const i of OBS) {
          for (let k = 0; k < 3; k++) {
            if (i === qi && k === 2) continue;
            const [x, y] = pos(i, k);
            dot(ctx, x, y, k === 2 ? 3.6 : 2.8, rgba(PAL.indigo, k === 2 ? 1 : 0.55));
          }
        }
        circle(ctx, Qx, Qy, 7 + Math.sin(t * 4) * 1.2, rgba(PAL.mint, 0.6), 1.2);
        dot(ctx, Qx, Qy, 4.2, PAL.mint);
        label(ctx, 'spatio-temporal attention', 12, 8, rgba(PAL.text, 0.8), fs);
        if (!small) legend(ctx, [[PAL.mint, 'query'], [PAL.indigo, 'observed'], [PAL.rose, 'hidden · inferred', 'dashring']], ox, h - 9, fs);
      },
    };
  }

  /* ======================================================================
     Radar-guided attention — radar returns are projected into the camera
     image. Where the RGB detector misses a small, distant object, its radar
     points open a region of interest for a light second-stage detector, which
     recovers it.
     ====================================================================== */
  function radarcam(v) {
    const R = mulberry(53);
    const LANES = [-3.4, 0, 3.4];
    let cars = [], spawn = 0, uid = 0;
    const add = (z) => {
      const x = LANES[Math.floor(R() * 3)];
      if (cars.some((c) => Math.abs(c.x - x) < 1.2 && Math.abs(c.z - z) < 10)) return;
      cars.push({ id: uid++, x: x + (R() - 0.5) * 0.5, z, vz: -(6 + R() * 6), roi: 0, rec: 0 });
    };
    [10, 24, 38, 55, 72].forEach(add);
    const car = (ctx, x0, y0, cw, ch) => {
      roundRect(ctx, x0, y0, cw, ch, Math.min(4, cw * 0.15));
      ctx.fillStyle = rgba(PAL.text2, 0.4);
      ctx.fill();
      ctx.fillStyle = rgba(PAL.bg, 0.4);
      ctx.fillRect(x0 + cw * 0.15, y0 + ch * 0.12, cw * 0.7, ch * 0.3);
      ctx.fillStyle = rgba(PAL.rose, 0.85);
      ctx.fillRect(x0 + cw * 0.08, y0 + ch * 0.56, cw * 0.15, ch * 0.1);
      ctx.fillRect(x0 + cw * 0.77, y0 + ch * 0.56, cw * 0.15, ch * 0.1);
    };
    return {
      warmup: 150,
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        const t = v.t;
        const fs = fsz(w), pad = 12, small = w < 380;
        const hy = h * 0.36, f = h * 1.25, camH = 2, detH = h * 0.075;
        const P = (x, z) => [w / 2 + (f * x) / z, hy + (f * camH) / z];
        if (dt > 0) {
          for (const c of cars) {
            c.z += c.vz * dt;
            const rgb = (f * 1.5) / c.z > detH;
            c.roi = !rgb && c.z < 82 ? Math.min(1, c.roi + dt * 1.4) : Math.max(0, c.roi - dt * 2);
            if (c.roi > 0.7) c.rec = 1;
            if (rgb) c.rec = 0;
          }
          cars = cars.filter((c) => c.z > 5);
          spawn -= dt;
          if (spawn <= 0) { spawn = 1.1 + R() * 1.2; if (cars.length < 6) add(84 + R() * 10); }
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        for (const xr of [-5.2, 5.2]) { const [x1, y1] = P(xr, 4.5), [x2, y2] = P(xr, 160); seg(ctx, x1, y1, x2, y2, rgba(PAL.muted, 0.45), 1.2); }
        const off = (t * 9) % 8;
        for (const xr of [-1.7, 1.7]) {
          for (let z = 12.5 - off; z < 95; z += 8) {
            const [x1, y1] = P(xr, z), [x2, y2] = P(xr, z + 3.5);
            seg(ctx, x1, y1, x2, y2, rgba(PAL.muted, 0.35), Math.max(0.6, 7 / z));
          }
        }
        seg(ctx, 0, hy, w, hy, rgba(PAL.muted, 0.2), 1);
        let focus = null;
        for (const c of [...cars].sort((a, b) => b.z - a.z)) {
          const [cx, gy] = P(c.x, c.z);
          const cw = (f * 1.8) / c.z, ch = (f * 1.5) / c.z, x0 = cx - cw / 2, y0 = gy - ch;
          car(ctx, x0, y0, cw, ch);
          if (ch > detH) {
            ctx.strokeStyle = PAL.mint;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x0 - 2, y0 - 2, cw + 4, ch + 4);
            continue;
          }
          if (c.z >= 82) continue;
          const tick = Math.floor(t * 3);
          for (let k = 0; k < 3; k++) {
            const rx = cx + Math.sin(c.id * 7.1 + k * 2.3 + tick) * cw * 0.4, ry = gy - ch * 0.45 + Math.cos(c.id * 3.7 + k * 1.9 + tick) * ch * 0.3;
            ctx.fillStyle = PAL.rose;
            ctx.beginPath(); ctx.moveTo(rx, ry - 3); ctx.lineTo(rx + 3, ry); ctx.lineTo(rx, ry + 3); ctx.lineTo(rx - 3, ry); ctx.closePath(); ctx.fill();
          }
          if (c.roi > 0) {
            const s = Math.max(18, cw * 3.4);
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = rgba(PAL.amber, 0.9 * Math.min(1, c.roi * 1.5));
            ctx.lineWidth = 1.2;
            ctx.strokeRect(cx - s / 2, gy - ch / 2 - s / 2, s, s);
            ctx.setLineDash([]);
            if (!focus || c.id < focus.id) focus = c;
          }
          if (c.rec) { ctx.strokeStyle = PAL.amber; ctx.lineWidth = 1.5; ctx.strokeRect(x0 - 1.5, y0 - 1.5, cw + 3, ch + 3); }
        }
        // the ROI crop, magnified, where the light second-stage detector runs
        if (focus) {
          const iw = Math.max(80, w * 0.27), ih = iw * 0.62, ix = w - pad - iw, iy = fs + 16;
          const [cx, gy] = P(focus.x, focus.z);
          seg(ctx, cx, gy - (f * 1.5) / focus.z / 2, ix, iy + ih, rgba(PAL.amber, 0.45), 1, [2, 3]);
          roundRect(ctx, ix, iy, iw, ih, 6);
          ctx.fillStyle = rgba(PAL.bg, 0.92);
          ctx.fill();
          ctx.strokeStyle = rgba(PAL.amber, 0.85);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          const ch2 = ih * 0.46, cw2 = ch2 * 1.2, x0 = ix + iw / 2 - cw2 / 2, y0 = iy + ih * 0.58 - ch2 / 2;
          car(ctx, x0, y0, cw2, ch2);
          if (focus.rec) {
            ctx.strokeStyle = PAL.amber;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x0 - 3, y0 - 3, cw2 + 6, ch2 + 6);
          }
          label(ctx, focus.rec ? 'ROI · found' : 'ROI crop', ix + 6, iy + 5, rgba(PAL.amber, 0.95), fs - 1);
        }
        label(ctx, small ? 'radar → ROIs' : 'camera + radar-guided ROIs', pad, 8, rgba(PAL.text, 0.8), fs);
        if (!small) legend(ctx, [[PAL.mint, 'RGB detection', 'box'], [PAL.rose, 'radar', 'diamond'], [PAL.amber, 'recovered via ROI', 'box']], pad, h - 9, fs);
      },
    };
  }

  /* ======================================================================
     Origins of false negatives — gradients from a missed detection (FN) are
     traced back through the detector; the nodes that fail consistently form a
     signature, and the signature depends on the condition (darkness, glare).
     ====================================================================== */
  function fnbacktrace(v) {
    const R = mulberry(71);
    const LAY = [5, 6, 6, 5, 3], L = LAY.length, FN = 2, PER = 4.8;
    const CONDS = [
      { name: 'normal', sig: null },
      { name: 'darkness', sig: [[1], [0, 3], [2], [1, 4]] },
      { name: 'glare', sig: [[3], [4], [1, 5], [3]] },
    ];
    const heat = LAY.map((n) => new Float32Array(n));
    let pulses = [], spawn = 0, lastCi = -1;
    return {
      warmup: 420, // still frame: a false negative under darkness, with its signature lit
      frame(dt, noDraw) {
        const { w, h, ctx } = v;
        const t = v.t;
        const ci = Math.floor(t / PER) % CONDS.length, cond = CONDS[ci], local = (t % PER) / PER;
        if (dt > 0) {
          if (ci !== lastCi) { lastCi = ci; heat.forEach((a) => a.fill(0)); pulses = []; }
          for (const a of heat) for (let i = 0; i < a.length; i++) a[i] *= Math.exp(-dt * 0.35);
          if (cond.sig && local > 0.1 && local < 0.82) {
            spawn -= dt;
            while (spawn <= 0) {
              spawn += 0.08;
              const path = [FN];
              for (let l = L - 2; l >= 0; l--) {
                const s = cond.sig[l];
                path.unshift(R() < 0.72 ? s[Math.floor(R() * s.length)] : Math.floor(R() * LAY[l]));
              }
              pulses.push({ path, b: t, at: L - 1, pos: L - 1 });
            }
          }
          for (const p of pulses) {
            p.pos = (L - 1) - ((t - p.b) / 1.1) * (L - 1);
            while (p.at > Math.max(0, Math.ceil(p.pos))) {
              p.at -= 1;
              heat[p.at][p.path[p.at]] = Math.min(1.4, heat[p.at][p.path[p.at]] + 0.09);
            }
          }
          pulses = pulses.filter((p) => p.pos > -0.05);
        }
        if (noDraw) return;
        ctx.clearRect(0, 0, w, h);
        const fs = fsz(w), pad = 12, small = w < 380, top = fs + 18, bot = fs + 12;
        const tw = clamp(w * 0.17, 40, 76), th = tw * 0.72, tx = pad, ty = (top + h - bot) / 2 - th / 2;
        const x0 = tx + tw + 18, x1 = w - pad - 18;
        const colX = (l) => lerp(x0, x1, l / (L - 1));
        const span = h - top - bot;
        const nodeY = (l, i) => { const n = LAY[l], sp = span * Math.min(1, (n - 1) / 5); return top + (span - sp) / 2 + (n > 1 ? (i / (n - 1)) * sp : sp / 2); };
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = rgba(PAL.text2, 0.1);
        ctx.beginPath();
        for (let l = 0; l < L - 1; l++) {
          for (let i = 0; i < LAY[l]; i++) {
            for (let j = 0; j < LAY[l + 1]; j++) { ctx.moveTo(colX(l), nodeY(l, i)); ctx.lineTo(colX(l + 1), nodeY(l + 1, j)); }
          }
        }
        ctx.stroke();
        for (const p of pulses) {
          const pos = Math.max(0, p.pos), a = Math.min(L - 2, Math.floor(pos)), q = pos - a;
          const xA = colX(a), yA = nodeY(a, p.path[a]), xB = colX(a + 1), yB = nodeY(a + 1, p.path[a + 1]);
          const x = lerp(xA, xB, q), y = lerp(yA, yB, q);
          seg(ctx, x, y, lerp(x, xB, 0.35), lerp(y, yB, 0.35), rgba(PAL.rose, 0.35), 1.2);
          dot(ctx, x, y, 1.8, rgba(PAL.rose, 0.95));
        }
        const nr = clamp(span / 26, 3, 6.5);
        for (let l = 0; l < L - 1; l++) {
          for (let i = 0; i < LAY[l]; i++) {
            const x = colX(l), y = nodeY(l, i), hh = clamp(heat[l][i], 0, 1);
            if (hh > 0.05) dot(ctx, x, y, nr + 6 * hh, rgba(PAL.rose, 0.22 * hh));
            dot(ctx, x, y, nr, PAL.bg);
            dot(ctx, x, y, nr, hh > 0.05 ? rgba(PAL.rose, 0.3 + 0.7 * hh) : rgba(PAL.text2, 0.38));
          }
        }
        for (let i = 0; i < LAY[L - 1]; i++) {
          const x = colX(L - 1), y = nodeY(L - 1, i), miss = cond.sig && i === FN, col = miss ? PAL.rose : PAL.mint;
          dot(ctx, x, y, nr + 2, rgba(col, 0.18));
          circle(ctx, x, y, nr + 2, col, 1.4);
          label(ctx, miss ? 'FN' : '✓', x + nr + 6, y, col, fs, 'left', 'middle');
        }
        // the input frame under the current condition
        roundRect(ctx, tx, ty, tw, th, 4);
        ctx.save();
        ctx.clip();
        ctx.fillStyle = rgba(PAL.indigo, 0.2);
        ctx.fillRect(tx, ty, tw, th * 0.5);
        ctx.fillStyle = rgba(PAL.text2, 0.2);
        ctx.fillRect(tx, ty + th * 0.5, tw, th * 0.5);
        seg(ctx, tx + tw * 0.5, ty + th * 0.5, tx + tw * 0.08, ty + th, rgba(PAL.text2, 0.45), 1);
        seg(ctx, tx + tw * 0.5, ty + th * 0.5, tx + tw * 0.92, ty + th, rgba(PAL.text2, 0.45), 1);
        ctx.fillStyle = rgba(PAL.text2, 0.75);
        ctx.fillRect(tx + tw * 0.55, ty + th * 0.58, tw * 0.2, th * 0.15);
        if (cond.name === 'darkness') { ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'; ctx.fillRect(tx, ty, tw, th); }
        if (cond.name === 'glare') {
          const g = ctx.createRadialGradient(tx + tw * 0.72, ty + th * 0.32, 0, tx + tw * 0.72, ty + th * 0.32, tw * 0.75);
          g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          g.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(tx, ty, tw, th);
        }
        ctx.restore();
        roundRect(ctx, tx, ty, tw, th, 4);
        ctx.strokeStyle = rgba(PAL.text2, 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
        arrow(ctx, tx + tw + 3, ty + th / 2, x0 - 7, ty + th / 2, rgba(PAL.muted, 0.7), 1, 4);
        label(ctx, 'input', tx, ty + th + 5, PAL.muted, fs - 1, 'left', 'top');
        label(ctx, 'condition: ', pad, 8, PAL.muted, fs);
        label(ctx, cond.name, pad + ctx.measureText('condition: ').width, 8, cond.sig ? PAL.rose : PAL.mint, fs);
        if (!small) legend(ctx, cond.sig ? [[PAL.rose, 'FN signature'], [PAL.rose, 'gradient trace', 'line']] : [[PAL.mint, 'all objects detected']], x0, h - 8, fs);
      },
    };
  }

  const SKETCHES = { robokoop, adacred, dfdnet, luga, sdgn, s2a, cogsense, chirpnet, stagenet, radarcam, fnbacktrace };
  Object.entries(SKETCHES).forEach(([name, f]) => HK.register(name, f));
  HK.boot();
})();
