"""Draft 3 · Bulletin — server-rendered SVG charts in a Silver Bulletin / FiveThirtyEight style.

Registered as the Jinja global `charts`; every function returns inline SVG (Markup).
Hover tooltips come from `data-tip` attributes (handled in bulletin.js) with <title> fallbacks.
"""
from __future__ import annotations

import math
from html import escape

from markupsafe import Markup

GREEN = "#00C832"
GREEN_D = "#00A82E"
GREEN_L = "#B9EFC6"
INK = "#363737"
GRID = "#E6E6E6"
GRAY = "#B7B7B7"
PURPLE = "#8B5CF6"
TOPIC_COLORS = {"robot-learning": GREEN, "multi-agent": PURPLE, "perception": "#F59E0B", "edge": "#3B82F6"}


def _nice_max(v: float, ticks: int = 4) -> tuple[float, float]:
    """Round the axis max up to a 'nice' number; returns (max, step)."""
    if v <= 0:
        return 1, 1
    raw = v / ticks
    mag = 10 ** math.floor(math.log10(raw))
    step = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)
    return step * math.ceil(v / step), step


def _svg(w: int, h: int, body: str, label: str, cls: str = "") -> Markup:
    return Markup(
        f'<svg class="chart {cls}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(label)}" '
        f'preserveAspectRatio="xMidYMid meet">{body}</svg>'
    )


def _tip(text: str) -> str:
    return f' data-tip="{escape(text)}"'


def _ticks(vmax: float, step: float):
    t = 0.0
    while t <= vmax + 1e-9:
        yield t
        t += step


def citations_by_year(by_year: dict, total: int, as_of: str) -> Markup:
    """Annual citations as bars + cumulative total as a line with a direct end label."""
    years = sorted(int(y) for y in by_year)
    vals = [int(by_year[y]) for y in years]
    cum, run = [], 0
    for v in vals:
        run += v
        cum.append(run)
    W, H, L, R, T, B = 680, 320, 46, 78, 26, 40
    ymax, step = _nice_max(max(cum[-1], total))
    pw, ph = W - L - R, H - T - B
    bw = pw / len(years)
    x = lambda i: L + bw * i + bw / 2  # noqa: E731
    y = lambda v: T + ph - ph * v / ymax  # noqa: E731
    out = []
    for t in _ticks(ymax, step):
        yy = y(t)
        out.append(f'<line x1="{L}" x2="{W - R}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{GRID}" stroke-width="1"/>')
        out.append(f'<text class="ax" x="{L - 8}" y="{yy + 4:.1f}" text-anchor="end">{int(t)}</text>')
    for i, (yr, v) in enumerate(zip(years, vals)):
        bx, by = x(i) - bw * 0.3, y(v)
        partial = i == len(years) - 1
        fill = "url(#hatch)" if partial else GREEN_L
        tip = f"{yr}: {v} citations{' (so far)' if partial else ''} · {cum[i]} total"
        out.append(
            f'<rect class="hit" x="{bx:.1f}" y="{by:.1f}" width="{bw * 0.6:.1f}" height="{y(0) - by:.1f}" fill="{fill}" rx="2"'
            f"{_tip(tip)}><title>{escape(tip)}</title></rect>"
        )
        out.append(f'<text class="val" x="{x(i):.1f}" y="{by - 6:.1f}" text-anchor="middle">{v}</text>')
        out.append(f'<text class="ax" x="{x(i):.1f}" y="{H - B + 20}" text-anchor="middle">{yr}{"*" if partial else ""}</text>')
    pts = " ".join(f"{x(i):.1f},{y(c):.1f}" for i, c in enumerate(cum))
    out.append(f'<polyline class="draw" points="{pts}" fill="none" stroke="{GREEN_D}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>')
    for i, c in enumerate(cum):
        out.append(f'<circle cx="{x(i):.1f}" cy="{y(c):.1f}" r="{5 if i == len(cum) - 1 else 3.5}" fill="{GREEN_D}" stroke="#fff" stroke-width="1.5"/>')
    lx, ly = x(len(cum) - 1), y(cum[-1])
    out.append(f'<text class="endlab" x="{lx + 12:.1f}" y="{ly - 2:.1f}">{cum[-1]}</text>')
    out.append(f'<text class="endsub" x="{lx + 12:.1f}" y="{ly + 14:.1f}">total</text>')
    defs = (
        f'<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        f'<rect width="6" height="6" fill="{GREEN_L}"/><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="2.4"/></pattern></defs>'
    )
    return _svg(W, H, defs + "".join(out), f"Citations per year, {years[0]}–{years[-1]}; {cum[-1]} total as of {as_of}")


def citations_by_paper(pubs: list, limit: int = 10) -> Markup:
    """Horizontal bars, most-cited first; first-author papers in green."""
    rows = sorted((p for p in pubs if p.get("citations")), key=lambda p: -p["citations"])[:limit]
    W, L, R, rh, T = 680, 196, 44, 30, 8
    H = T + rh * len(rows) + 8
    xmax, step = _nice_max(max(p["citations"] for p in rows), 4)
    pw = W - L - R
    out = []
    for t in _ticks(xmax, step):
        xx = L + pw * t / xmax
        out.append(f'<line x1="{xx:.1f}" x2="{xx:.1f}" y1="{T - 4}" y2="{H - 6}" stroke="{GRID}"/>')
    for i, p in enumerate(rows):
        yy = T + i * rh
        w = pw * p["citations"] / xmax
        mine = p["first_author"] or p["co_first"]
        name = p.get("short") or p["title"]
        tip = f"{name} ({p['venue_short']} {p['year']}): {p['citations']} citations"
        out.append(f'<text class="lab{" mine" if mine else ""}" x="{L - 10}" y="{yy + rh / 2 + 4:.1f}" text-anchor="end">{escape(name)}</text>')
        out.append(
            f'<rect class="hit" x="{L}" y="{yy + 5}" width="{max(w, 2):.1f}" height="{rh - 10}" fill="{GREEN if mine else GRAY}" rx="2"'
            f"{_tip(tip)}><title>{escape(tip)}</title></rect>"
        )
        out.append(f'<text class="val" x="{L + w + 6:.1f}" y="{yy + rh / 2 + 4:.1f}">{p["citations"]}</text>')
    return _svg(W, H, "".join(out), "Google Scholar citations by paper", "hbar")


def papers_by_year(pubs: list, topics: dict) -> Markup:
    """Stacked columns: papers per year, colored by primary topic."""
    years = list(range(min(p["year"] for p in pubs), max(p["year"] for p in pubs) + 1))
    keys = list(topics)
    counts = {y: {k: 0 for k in keys} for y in years}
    for p in pubs:
        counts[p["year"]][(p.get("topics") or [keys[0]])[0]] += 1
    W, H, L, R, T, B = 680, 280, 40, 16, 16, 40
    ymax, step = _nice_max(max(sum(c.values()) for c in counts.values()), 4)
    pw, ph = W - L - R, H - T - B
    bw = pw / len(years)
    y = lambda v: T + ph - ph * v / ymax  # noqa: E731
    out = []
    for t in _ticks(ymax, step):
        yy = y(t)
        out.append(f'<line x1="{L}" x2="{W - R}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{GRID}"/>')
        out.append(f'<text class="ax" x="{L - 8}" y="{yy + 4:.1f}" text-anchor="end">{int(t)}</text>')
    for i, yr in enumerate(years):
        x0, acc = L + bw * i + bw * 0.2, 0
        for k in keys:
            n = counts[yr][k]
            if not n:
                continue
            y0, y1 = y(acc + n), y(acc)
            tip = f"{yr} · {topics[k]['label']}: {n} paper{'s' if n > 1 else ''}"
            out.append(
                f'<rect class="hit" x="{x0:.1f}" y="{y0 + 1:.1f}" width="{bw * 0.6:.1f}" height="{y1 - y0 - 1:.1f}" '
                f'fill="{TOPIC_COLORS.get(k, GRAY)}" rx="1.5"{_tip(tip)}><title>{escape(tip)}</title></rect>'
            )
            acc += n
        out.append(f'<text class="val" x="{L + bw * i + bw / 2:.1f}" y="{y(acc) - 6:.1f}" text-anchor="middle">{acc}</text>')
        out.append(f'<text class="ax" x="{L + bw * i + bw / 2:.1f}" y="{H - B + 20}" text-anchor="middle">{yr}</text>')
    return _svg(W, H, "".join(out), "Papers per year by primary topic", "stack")


def topic_legend(topics: dict) -> Markup:
    items = "".join(
        f'<span class="lg"><i style="background:{TOPIC_COLORS.get(k, GRAY)}"></i>{escape(v["label"])}</span>' for k, v in topics.items()
    )
    return Markup(f'<div class="legend">{items}</div>')


CAREER_KIND = {
    "Microsoft": ("Industry", INK),
    "Qualcomm": ("Internship", GREEN),
    "Amazon": ("Internship", GREEN),
    "Robotics Institute": ("Internship", GREEN),
    "Georgia Tech": ("Research", PURPLE),
    "SeDriCa": ("Leadership", GRAY),
}
CAREER_COLORS = [("Education", "#DDDDDD"), ("Research", PURPLE), ("Internship", GREEN), ("Industry", INK), ("Leadership", GRAY)]


def career_gantt(experience: list, education: list, now: float = 2026.8) -> Markup:
    """Career timeline: one row per role, bars spanning decimal years (open-ended roles get an arrow)."""
    rows = []
    for e in education:
        rows.append((e.get("short") or e["school"], e["degree"], e["span"], ("Education", "#DDDDDD")))
    for e in experience:
        kind = next((v for k, v in CAREER_KIND.items() if k in e["org"]), ("Other", GRAY))
        rows.append((e.get("short") or e["org"].split(" · ")[0], e["role"], e["span"], kind))
    rows.sort(key=lambda r: (r[2][0], r[2][1] or 9999))
    x0y, x1y = math.floor(min(r[2][0] for r in rows)), math.ceil(now)
    W, L, R, rh, T = 680, 190, 20, 30, 26
    H = T + rh * len(rows) + 10
    pw = W - L - R
    x = lambda v: L + pw * (v - x0y) / (x1y - x0y)  # noqa: E731
    out = []
    for yr in range(x0y, x1y + 1):
        xx = x(yr)
        out.append(f'<line x1="{xx:.1f}" x2="{xx:.1f}" y1="{T - 6}" y2="{H - 6}" stroke="{GRID}"/>')
        if yr < x1y:
            out.append(f'<text class="ax" x="{x(yr + 0.5):.1f}" y="{T - 10}" text-anchor="middle">’{str(yr)[2:]}</text>')
    for i, (org, role, span, (kind, color)) in enumerate(rows):
        yy = T + i * rh
        a, b = span[0], span[1] if span[1] is not None else now
        tip = f"{org} — {role} ({kind})"
        out.append(f'<text class="lab" x="{L - 10}" y="{yy + rh / 2 + 4:.1f}" text-anchor="end">{escape(org)}</text>')
        out.append(
            f'<rect class="hit" x="{x(a):.1f}" y="{yy + 6}" width="{max(x(b) - x(a), 4):.1f}" height="{rh - 12}" rx="3" fill="{color}"'
            f"{_tip(tip)}><title>{escape(tip)}</title></rect>"
        )
        if span[1] is None:
            out.append(f'<path d="M{x(b):.1f},{yy + 6} l7,{(rh - 12) / 2:.1f} l-7,{(rh - 12) / 2:.1f}z" fill="{color}"/>')
    return _svg(W, H, "".join(out), "Career timeline", "gantt")


def career_legend() -> Markup:
    items = "".join(f'<span class="lg"><i style="background:{c}"></i>{k}</span>' for k, c in CAREER_COLORS)
    return Markup(f'<div class="legend">{items}</div>')


def register(env) -> None:
    from types import SimpleNamespace

    fns = (citations_by_year, citations_by_paper, papers_by_year, topic_legend, career_gantt, career_legend)
    env.globals["charts"] = SimpleNamespace(**{fn.__name__: fn for fn in fns})  # {{ charts.citations_by_year(...) }}
