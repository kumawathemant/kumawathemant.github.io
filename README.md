# hemantkumawat.com

Personal academic website of **Hemant Kumawat** — a fast, dependency-light static site with animated
research figures, a filterable publication list with paper figures, and a Markdown blog.

```
content/                  ← everything you normally edit
  site.yml                  profile, bio, research threads, experience, education, service
  publications.yml          papers (figure, links, TL;DR, key results, abstract, BibTeX fields)
  news.yml                  news items
  posts/*.md                blog posts (front matter + Markdown, TeX math supported)
templates/                Jinja2 layouts (index, blog, post, partials)
static/                   copied as-is: CSS, JS (site.js, viz.js), images, figures, CV, CNAME
scripts/                  image helpers (optional, need Pillow)
build.py                  builds content + templates → _site/
```

## Preview locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # add -r requirements-dev.txt for the image scripts
python build.py serve                    # http://localhost:8000 — rebuilds & live-reloads on save
```

`python build.py` does a one-off build into `_site/` (git-ignored).

## Common edits

**Add a paper**
1. Make a web-ready figure: `python scripts/optimize_images.py figure ~/path/teaser.png my-paper`
   (writes `static/assets/fig/my-paper-{640,1600}.webp`).
2. Add an entry at the top of `content/publications.yml` with `id: my-paper` and `figure: my-paper`.
   Topics drive the filter chips; `highlights` become the key-result chips; BibTeX is generated
   from the entry (override fields under `bib:`). No figure yet? Use `viz: events | chirp | agents`
   for an animated schematic cover.

**Add news** — prepend to `content/news.yml`. Link a paper with `[Name](#pub-<id>)`; clicking it scrolls
to and highlights the card.

**Write a post** — add `content/posts/YYYY-MM-DD-slug.md`:

```markdown
---
title: My post
date: 2026-10-02
description: One-line summary.
tags: rl robotics
---
Text with inline math \( x_t \) and display math \[ z_{t+1} = K z_t \].
```

It is published at `/blog/YYYY/slug/` and added to the RSS feed. Add `draft: true` to hide it.

**Update the CV** — replace `static/assets/pdf/HemantCV.pdf` (same URL as before).

**Social preview card** — after changing your title or portrait: `python scripts/make_social_card.py`.

## Animations

`static/assets/js/viz.js` renders every `<canvas data-viz="…">`: `flow` (hero), `koopman`, `agents`,
`lidar`, `tokens`, `events`, `chirp`, `chirp-adaptive`. They only run while visible, pause in background
tabs, follow the light/dark theme, and show a single still frame for visitors who prefer reduced motion.

## Deploying (not done yet — the live site is unchanged)

GitHub Pages already serves `www.hemantkumawat.com` from the `gh-pages` branch. The workflow in
`.github/workflows/deploy.yml` runs on pushes to `master`: it builds with `build.py` and publishes
`_site/` to `gh-pages` (CNAME included). To go live:

```bash
git push -u origin redesign-2026      # review on GitHub, then merge into master
```

Old URLs (`/publications/`, `/cv/`, `/research/`, `/news/…`, `/blog/page/2/`, `/feed.xml`) redirect or
keep working, and blog posts keep their original `/blog/YYYY/slug/` addresses.

---

© Hemant Kumawat. Paper figures © their respective authors/publishers.
