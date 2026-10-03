#!/usr/bin/env python3
"""Static site builder for hemantkumawat.com.

    python build.py              build the live theme (site.yml `theme:`) into _site/
    python build.py --drafts     ...plus every theme under /drafts/<theme>/ for comparison
    python build.py serve        build with drafts into _dev.nosync/, serve on http://localhost:8000, live-reload on change
    python build.py serve -p 4000

Content lives in content/ (YAML + Markdown), designs in themes/<name>/ (Jinja2 + CSS/JS), shared assets in static/.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import http.server
import importlib.util
import itertools
import os
import re
import shutil
import sys
import threading
import time
from functools import partial
from pathlib import Path

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup, escape

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
THEMES = ROOT / "themes"
OUT = ROOT / "_site"
# `serve` output. iCloud Drive skips *.nosync names, so rebuild churn can't spawn "_site 2"-style conflict copies.
DEV_OUT = ROOT / "_dev.nosync"
SELF = "Hemant Kumawat"

# filter key -> (label, colour token)
TOPICS = {
    "robot-learning": ("Robot learning", "mint"),
    "multi-agent": ("Multi-agent", "indigo"),
    "perception": ("Perception", "amber"),
    "edge": ("Edge AI", "rose"),
}

# Old al-folio URLs that should keep working.
REDIRECTS = {
    "publications/": "/#publications",
    "research/": "/#research",
    "projects/": "/#research",
    "cv/": "/#experience",
    "news/": "/#news",
    "repositories/": "/#publications",
    "blog/page/2/": "/blog/",
    **{f"news/announcement_{i}/": "/#news" for i in range(1, 6)},
}

LINK_ICONS = {"code": "code", "scholar": "scholar", "pdf": "file", "arxiv": "file", "supp": "file"}

# --------------------------------------------------------------------------- icons
_STROKE = {
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    "arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    "mail": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    "moon": '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "code": '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    "file": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8M16 17H8M10 9H8"/>',
    "book": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    "text": '<path d="M17 6H3M21 12H3M15 18H3"/>',
    "braces": '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "close": '<path d="M18 6 6 18M6 6l12 12"/>',
    "pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    "expand": '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    "external": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    "rss": '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "calendar": '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "hash": '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    "list": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    "briefcase": '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    "graduation": '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    "grid": '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    "table": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>',
    "more": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    "share": '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
    "sidebar": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevrons-right": '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "chart": '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    "plus": '<path d="M5 12h14M12 5v14"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "heart": '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    "message": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    "repeat": '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    "play": '<path d="M6 3l14 9-14 9z"/>',
    "image": '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
}
_FILL = {  # brand marks from Simple Icons (CC0)
    "scholar": '<path d="M5.242 13.769 0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/>',
    "github": '<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>',
    "linkedin": '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
    "x": '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>',
}


def icon(name: str, cls: str = "") -> Markup:
    c = f"icon {cls}".strip()
    if name in _FILL:
        return Markup(f'<svg class="{c}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{_FILL[name]}</svg>')
    return Markup(
        f'<svg class="{c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" '
        f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{_STROKE[name]}</svg>'
    )


# --------------------------------------------------------------------------- markdown
_inline_md = markdown.Markdown(extensions=["smarty"])


def external_links(fragment: str) -> str:
    return re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', fragment)


def md_inline(text) -> Markup:
    """Render one paragraph of Markdown without the surrounding <p>."""
    if not text:
        return Markup("")
    out = _inline_md.reset().convert(str(text)).strip()
    out = re.sub(r"^<p>(.*)</p>$", r"\1", out, flags=re.S)
    return Markup(external_links(out))


FENCE_RE = re.compile(r"^([ \t]*)(```|~~~)[^\n]*\n.*?^\1\2[ \t]*$", re.S | re.M)
LIST_AFTER_PARA_RE = re.compile(r"^(?![ \t]*(?:[-*+]|\d+\.)[ \t])([^\n]*\S[^\n]*)\n(?=[ \t]*(?:[-*+]|\d+\.)[ \t])", re.M)
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
MATH_RE = re.compile(r"\$\$.+?\$\$|\\\[.+?\\\]|\\\(.+?\\\)", re.S)


def render_post_markdown(text: str) -> tuple[str, list, bool]:
    """Markdown -> HTML while protecting TeX (rendered client-side by KaTeX) from the Markdown parser."""
    code: list[str] = []

    def hide_code(m):
        code.append(m.group(0))
        return f"\x00CODE{len(code) - 1}\x00"

    text = FENCE_RE.sub(hide_code, text)
    text = INLINE_CODE_RE.sub(hide_code, text)
    maths: list[str] = []

    def hide_math(m):
        maths.append(m.group(0))
        return f"MATHTOKEN{len(maths) - 1}END"

    text = MATH_RE.sub(hide_math, text)
    # kramdown (the old Jekyll engine) allows a list right after a paragraph; Python-Markdown needs a blank line
    text = LIST_AFTER_PARA_RE.sub(lambda m: m.group(1) + "\n\n" if not m.group(1).lstrip().startswith(("|", "#", ">")) else m.group(0), text)
    text = re.sub("\x00CODE(\\d+)\x00", lambda m: code[int(m.group(1))], text)
    md = markdown.Markdown(
        extensions=["abbr", "attr_list", "def_list", "footnotes", "md_in_html", "tables",
                    "pymdownx.superfences", "sane_lists", "smarty", "toc"],
        extension_configs={
            "toc": {"permalink": "#", "permalink_class": "heading-anchor", "toc_depth": "2-3"},
            "pymdownx.superfences": {"css_class": "codeblock"},
        },
    )
    body = md.convert(text)
    body = re.sub(r"MATHTOKEN(\d+)END", lambda m: html.escape(maths[int(m.group(1))], quote=False), body)
    body = body.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    return external_links(body), md.toc_tokens, bool(maths)


# --------------------------------------------------------------------------- content
def load_yaml(name: str):
    with open(CONTENT / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def as_date(value) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value).strip()[:10])


def flatten_toc(tokens: list) -> list[dict]:
    out = []
    for t in tokens:
        out.append({"id": t["id"], "name": Markup(t["name"]), "level": t["level"]})
        out.extend(flatten_toc(t.get("children") or []))
    return out


def load_posts() -> list[dict]:
    posts = []
    for path in sorted((CONTENT / "posts").glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.S)
        if not m:
            raise ValueError(f"{path.name}: missing front matter")
        meta, body = yaml.safe_load(m.group(1)) or {}, m.group(2)
        if meta.get("draft"):
            continue
        date = as_date(meta.get("date") or path.name[:10])
        slug = meta.get("slug") or re.sub(r"^\d{4}-\d{2}-\d{2}-", "", path.stem)
        html_body, toc, has_math = render_post_markdown(body)
        words = len(re.findall(r"\w+", re.sub(r"```.*?```", "", body, flags=re.S)))
        tags = meta.get("tags") or []
        if isinstance(tags, str):
            tags = tags.split()
        posts.append(
            {
                "title": meta["title"],
                "description": (meta.get("description") or "").strip(),
                "date": date,
                "date_str": date.strftime("%b %-d, %Y"),
                "year": date.year,
                "slug": slug,
                "url": f"/blog/{date.year}/{slug}/",
                "tags": list(dict.fromkeys(t.lower() for t in tags)),
                "html": Markup(html_body),
                "html_str": html_body,
                "toc": flatten_toc(toc) if len(flatten_toc(toc)) >= 3 else [],
                "has_math": has_math,
                "read_min": max(1, round(words / 220)),
            }
        )
    posts.sort(key=lambda p: p["date"], reverse=True)
    for i, p in enumerate(posts):
        p["newer"] = posts[i - 1] if i > 0 else None
        p["older"] = posts[i + 1] if i + 1 < len(posts) else None
    return posts


def bib_name(name: str) -> str:
    parts = name.rstrip("*").split()
    return f"{parts[-1]}, {' '.join(parts[:-1])}" if len(parts) > 1 else parts[0]


def bibtex(p: dict) -> str:
    extra = dict(p.get("bib") or {})
    kind = extra.pop("type", None) or ("article" if "journal" in extra else "inproceedings" if "booktitle" in extra else "misc")
    year = extra.pop("year", p["year"])
    last = re.sub(r"[^a-z]", "", p["authors"][0].rstrip("*").split()[-1].lower())
    word = re.findall(r"[A-Za-z]+", p.get("short") or p["title"])[0].lower()
    key = extra.pop("key", f"{last}{year}{word}")
    fields = [("title", "{" + p["title"] + "}"), ("author", " and ".join(bib_name(a) for a in p["authors"]))]
    for k in ("journal", "booktitle", "series", "volume", "number", "pages", "publisher", "howpublished", "note", "doi", "url"):
        if k in extra:
            fields.append((k, str(extra.pop(k))))
    fields.append(("year", str(year)))
    fields += [(k, str(v)) for k, v in extra.items()]
    width = max(len(k) for k, _ in fields)
    body = ",\n".join(f"  {k.ljust(width)} = {{{v.replace('&', chr(92) + '&')}}}" for k, v in fields)
    return f"@{kind}{{{key},\n{body}\n}}"


def format_authors(authors: list[str], limit: int = 7, toggle: bool = True) -> Markup:
    parts = []
    for a in authors:
        name, star = a.rstrip("*"), a.endswith("*")
        s = str(escape(name)) + ("<sup>*</sup>" if star else "")
        parts.append(f'<strong class="me">{s}</strong>' if name == SELF else s)
    if len(parts) <= limit:
        return Markup(", ".join(parts))
    head, tail = parts[: limit - 2], parts[limit - 2 :]
    if not toggle:  # compact form for cards: keep my name visible, elide the rest
        return Markup(", ".join(head + [s for s in tail if 'class="me"' in s]) + " et al.")
    return Markup(
        ", ".join(head)
        + f'<span class="authors-more" hidden>, {", ".join(tail)}</span>'
        + f' <button class="authors-toggle" type="button">+{len(tail)} more</button>'
    )


def process_publications(pubs: list[dict]) -> list[dict]:
    seen = set()
    for p in pubs:
        if p["id"] in seen:
            raise ValueError(f"duplicate publication id: {p['id']}")
        seen.add(p["id"])
        p.setdefault("citations", 0)
        authors = p["authors"]
        me = next((a for a in authors if a.rstrip("*") == SELF), None)
        p["first_author"] = authors[0].rstrip("*") == SELF
        p["co_first"] = bool(me and me.endswith("*") and not p["first_author"])
        topics = p.get("topics") or []
        unknown = set(topics) - set(TOPICS)
        if unknown:
            raise ValueError(f"{p['id']}: unknown topics {unknown}")
        p["filters"] = " ".join(
            topics + (["selected"] if p.get("selected") else []) + (["first"] if p["first_author"] or p["co_first"] else [])
        )
        p["color"] = TOPICS[topics[0]][1] if topics else "mint"
        p["authors_html"] = format_authors(authors)
        p["authors_short"] = format_authors(authors, limit=5, toggle=False)
        p["links"] = [
            {**l, "icon": LINK_ICONS.get(l["label"].lower(), "book" if l["label"] in ("PMLR", "IEEE", "OpenReview") else "external")}
            for l in p.get("links") or []
        ]
        p["main_url"] = p["links"][0]["url"] if p["links"] else None
        p["bibtex"] = bibtex(p)
        p["search"] = " ".join(
            [p["title"], p.get("short", ""), " ".join(authors), p["venue"], p["venue_short"], str(p["year"]), " ".join(topics)]
        ).lower().replace("*", "")
        if p.get("figure"):
            for size in (640, 1600):
                if not (STATIC / "assets" / "fig" / f"{p['figure']}-{size}.webp").exists():
                    raise FileNotFoundError(f"{p['id']}: missing static/assets/fig/{p['figure']}-{size}.webp")
            p["fig_sm"] = f"/assets/fig/{p['figure']}-640.webp"
            p["fig_lg"] = f"/assets/fig/{p['figure']}-1600.webp"
        if not p.get("viz"):  # every paper gets an animation (the real figure, if any, sits beside it)
            p["viz"] = {"robot-learning": "koopman", "multi-agent": "agents", "perception": "lidar"}.get(topics[0] if topics else "", "flow")
    return pubs


_hash_cache: dict = {}


def file_hash(path: Path) -> str:
    key = (str(path), path.stat().st_mtime_ns)
    if key not in _hash_cache:
        _hash_cache[key] = hashlib.sha1(path.read_bytes()).hexdigest()[:10]
    return _hash_cache[key]


def list_themes() -> list[dict]:
    themes = []
    for d in sorted(p for p in THEMES.iterdir() if (p / "templates" / "index.html").exists()):
        meta = yaml.safe_load((d / "theme.yml").read_text(encoding="utf-8")) if (d / "theme.yml").exists() else {}
        themes.append({"key": d.name, "draft": meta.get("draft", 99), "label": meta.get("label", d.name.title()),
                       "tagline": meta.get("tagline", ""), "inspiration": meta.get("inspiration", "")})
    return sorted(themes, key=lambda t: (t["draft"], t["key"]))


def load_data() -> dict:
    site = load_yaml("site.yml")
    pubs = process_publications(load_yaml("publications.yml"))
    by_id = {p["id"]: p for p in pubs}
    for t in site["threads"]:
        for pid in t.get("papers") or []:
            if pid not in by_id:
                raise KeyError(f"thread {t['key']}: unknown paper id {pid}")
    blog_on = bool(site.get("blog", True))
    all_posts = load_posts()
    posts = all_posts if blog_on else []
    filters = [
        {"key": "all", "label": "All", "count": len(pubs)},
        {"key": "selected", "label": "Selected", "count": sum(1 for p in pubs if p.get("selected"))},
        {"key": "first", "label": "First author", "count": sum(1 for p in pubs if p["first_author"] or p["co_first"])},
    ] + [{"key": k, "label": v[0], "count": sum(1 for p in pubs if k in (p.get("topics") or []))} for k, v in TOPICS.items()]
    return {
        "site": site,
        "pubs": pubs,
        "pubs_by_id": by_id,
        "pubs_by_year": [(y, list(g)) for y, g in itertools.groupby(sorted(pubs, key=lambda p: -p["year"]), key=lambda p: p["year"])],
        "filters": filters,
        "topics": {k: {"label": v[0], "color": v[1]} for k, v in TOPICS.items()},
        "news": load_yaml("news.yml"),
        "blog_on": blog_on,
        "posts": posts,
        "retired_posts": [] if blog_on else all_posts,
        "posts_by_year": [(y, list(g)) for y, g in itertools.groupby(posts, key=lambda p: p["year"])],
        "stats": {
            "papers": len(pubs),
            "first": sum(1 for p in pubs if p["first_author"] or p["co_first"]),
            "citations": site["stats"]["citations"],
            "h_index": site["stats"]["h_index"],
            "venues": len({p["venue_short"] for p in pubs}),
        },
    }


# --------------------------------------------------------------------------- build
LIVE_RELOAD = Markup(
    "<script>(()=>{let v;setInterval(async()=>{try{const t=await (await fetch('/__build',{cache:'no-store'})).text();"
    "if(v&&t!==v)location.reload();v=t}catch(e){}},700)})()</script>"
)


def make_env(theme: str, base: str, themes: list[dict], dev: bool, blog_on: bool = True) -> Environment:
    env = Environment(
        loader=FileSystemLoader([THEMES / theme / "templates", TEMPLATES]),
        autoescape=select_autoescape(["html", "xml"]),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["md"] = md_inline
    today = dt.date.today()
    url = lambda path="/": base + path  # noqa: E731  — page links are prefixed when previewing a draft
    env.globals.update(
        icon=icon,
        url=url,
        base=base,
        theme=theme,
        is_draft=bool(base),
        themes=themes,
        asset=lambda rel: f"/assets/{rel}?v={file_hash(STATIC / 'assets' / rel)}",
        theme_asset=lambda rel: f"/assets/themes/{theme}/{rel}?v={file_hash(THEMES / theme / 'static' / rel)}",
        year=today.year,
        updated=today.strftime("%B %Y"),
        live_reload=LIVE_RELOAD if dev else "",
        paper_pages=(THEMES / theme / "templates" / "paper.html").exists(),
        paper_url=lambda pid: url(f"/papers/{pid}/"),
        nav=[
            {"id": "research", "label": "Research", "href": url("/#research")},
            {"id": "publications", "label": "Publications", "href": url("/#publications")},
            {"id": "experience", "label": "Experience", "href": url("/#experience")},
            {"id": "news", "label": "News", "href": url("/#news")},
        ] + ([{"id": "writing", "label": "Writing", "href": url("/blog/")}] if blog_on else []),
    )
    hooks = THEMES / theme / "theme.py"
    if hooks.exists():  # optional per-theme Python helpers, e.g. SVG chart builders
        spec = importlib.util.spec_from_file_location(f"theme_{theme}", hooks)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.register(env)
    return env


def render_theme(theme: str, out: Path, base: str, data: dict, themes: list[dict], dev: bool, switcher: bool) -> None:
    env = make_env(theme, base, themes, dev, data["blog_on"])
    shared = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True)

    def render(template: str, rel_path: str, **ctx) -> None:
        dest = out / base.strip("/") / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        page_url = "/" + rel_path.removesuffix("index.html")
        html_out = env.get_template(template).render(page_url=page_url, **{**data, **ctx})
        if switcher:
            widget = shared.get_template("partials/switcher.html").render(themes=themes, current=theme, page_url=page_url, base=base)
            html_out = html_out.replace("</body>", widget + "\n</body>", 1)
        dest.write_text(html_out, encoding="utf-8")

    render("index.html", "index.html", page="home")
    if data["blog_on"]:
        render("blog.html", "blog/index.html", page="blog")
        for post in data["posts"]:
            render("post.html", post["url"].strip("/") + "/index.html", post=post, page="blog")
    if env.globals["paper_pages"]:
        for p in data["pubs"]:
            render("paper.html", f"papers/{p['id']}/index.html", paper=p, page="paper")
    render("404.html", "404.html", page="404")


def build(dev: bool = False, drafts: bool = False) -> int:
    t0 = time.time()
    data = load_data()
    site, posts = data["site"], data["posts"]
    themes = list_themes()
    keys = [t["key"] for t in themes]
    live = site.get("theme", "aurora")
    if live not in keys:
        raise ValueError(f"site.yml theme '{live}' not found in themes/ ({', '.join(keys)})")
    drafts = drafts or dev

    out = DEV_OUT if dev else OUT
    tmp = ROOT / f"_build-{os.getpid()}.nosync"
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        _render_all(tmp, data, themes, keys, live, dev, drafts)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise

    old = ROOT / f"_old-{os.getpid()}.nosync"
    shutil.rmtree(old, ignore_errors=True)
    if out.exists():
        out.rename(old)
    tmp.rename(out)
    shutil.rmtree(old, ignore_errors=True)
    n = sum(1 for _ in out.rglob("*.html"))
    extra = f", drafts: {', '.join(keys)}" if drafts else ""
    blog = f"{len(posts)} posts" if data["blog_on"] else "blog off"
    print(f"built {n} pages ({live} live{extra}) · {len(data['pubs'])} papers · {blog} · {time.time() - t0:.2f}s")
    return n


def _render_all(tmp: Path, data: dict, themes: list, keys: list, live: str, dev: bool, drafts: bool) -> None:
    site = data["site"]
    shutil.copytree(STATIC, tmp, ignore=shutil.ignore_patterns(".DS_Store"))
    for key in keys if drafts else [live]:
        if (THEMES / key / "static").exists():
            shutil.copytree(THEMES / key / "static", tmp / "assets" / "themes" / key, ignore=shutil.ignore_patterns(".DS_Store"))

    # the live theme at the site root, plus every theme under /drafts/<key>/ for side-by-side comparison
    render_theme(live, tmp, "", data, themes, dev, switcher=drafts)
    if drafts:
        for key in keys:
            render_theme(key, tmp, f"/drafts/{key}", data, themes, dev, switcher=True)
        gallery = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True).get_template("drafts.html")
        (tmp / "drafts").mkdir(parents=True, exist_ok=True)
        (tmp / "drafts" / "index.html").write_text(
            gallery.render(themes=themes, live=live, site=site, posts=data["posts"], live_reload=LIVE_RELOAD if dev else ""),
            encoding="utf-8")
        # every paper animation on one page (QA); ?theme=light for the light palette
        lab = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True).get_template("vizlab.html")
        (tmp / "drafts" / "vizlab").mkdir(parents=True, exist_ok=True)
        js = lambda rel: f"/assets/js/{rel}?v={file_hash(STATIC / 'assets' / 'js' / rel)}"  # noqa: E731
        (tmp / "drafts" / "vizlab" / "index.html").write_text(lab.render(
            site=site, pubs=data["pubs"], cell=300, viz_js=js("viz.js"), viz_papers_js=js("viz-papers.js"),
            aurora_css=f"/assets/themes/aurora/site.css?v={file_hash(THEMES / 'aurora' / 'static' / 'site.css')}",
            live_reload=LIVE_RELOAD if dev else ""), encoding="utf-8")

    env = make_env(live, "", themes, dev, data["blog_on"])

    def render_root(template: str, rel_path: str, **ctx) -> None:
        dest = tmp / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(env.get_template(template).render(page_url="/" + rel_path.removesuffix("index.html"), **{**data, **ctx}),
                        encoding="utf-8")

    redirects = dict(REDIRECTS)
    if data["blog_on"]:
        redirects.update({f"blog/{y}/": "/blog/" for y, _ in data["posts_by_year"]})
    else:  # blog switched off: old blog URLs land on the homepage instead of a 404
        retired = data["retired_posts"]
        redirects.update({"blog/": "/", "blog/page/2/": "/"})
        redirects.update({f"blog/{p['year']}/": "/" for p in retired})
        redirects.update({p["url"].strip("/") + "/": "/" for p in retired})
    for src, target in redirects.items():
        render_root("redirect.html", src + "index.html", target=target, page="redirect")
    render_root("sitemap.xml", "sitemap.xml", page="sitemap",
                paper_ids=[p["id"] for p in data["pubs"]] if env.globals["paper_pages"] else [])
    if data["blog_on"]:
        now = dt.datetime.now(dt.timezone.utc)
        render_root("feed.xml", "blog/feed.xml", page="feed", now=now)
        render_root("feed.xml", "feed.xml", page="feed", now=now)  # al-folio's old feed URL
    if dev:
        (tmp / "__build").write_text(str(time.time()))


# --------------------------------------------------------------------------- dev server
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if "__build" not in (str(args[0]) if args else ""):
            sys.stderr.write("  " + fmt % args + "\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def snapshot() -> dict:
    files = [ROOT / "build.py", *CONTENT.rglob("*"), *TEMPLATES.rglob("*"), *STATIC.rglob("*"), *THEMES.rglob("*")]
    return {str(f): f.stat().st_mtime for f in files if f.is_file()}


def serve(port: int) -> None:
    sys.stdout.reconfigure(line_buffering=True)  # build messages show up promptly when piped
    try:
        build(dev=True)
    except Exception as e:  # keep watching so a fix can be picked up
        print(f"  build error: {e!r}")
        DEV_OUT.mkdir(exist_ok=True)
    handler = partial(QuietHandler, directory=str(DEV_OUT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"\n  ➜  http://localhost:{port}          live theme\n  ➜  http://localhost:{port}/drafts/   compare all drafts   (Ctrl+C to stop)\n")
    last = snapshot()
    try:
        while True:
            time.sleep(0.6)
            cur = snapshot()
            if cur != last:
                if cur.get(str(ROOT / "build.py")) != last.get(str(ROOT / "build.py")):
                    print("  build.py changed — restarting server")
                    httpd.shutdown()
                    httpd.server_close()
                    os.execv(sys.executable, [sys.executable, *sys.argv])
                last = cur
                try:
                    build(dev=True)
                except Exception as e:  # keep serving the last good build
                    print(f"  build error: {e!r}")
    except KeyboardInterrupt:
        httpd.shutdown()


def main() -> None:
    ap = argparse.ArgumentParser(description="Build hemantkumawat.com")
    ap.add_argument("command", nargs="?", default="build", choices=["build", "serve"])
    ap.add_argument("-p", "--port", type=int, default=8000)
    ap.add_argument("--drafts", action="store_true", help="also build every theme under /drafts/<theme>/")
    args = ap.parse_args()
    serve(args.port) if args.command == "serve" else build(drafts=args.drafts)


if __name__ == "__main__":
    main()
