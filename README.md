# hemantkumawat.com

Personal academic website of **Hemant Kumawat** — a fast, dependency-light static site with animated
research figures, an animation for every paper (with the paper's own figure one click away), a filterable
publication list, and an optional Markdown blog.

```
content/                  ← everything you normally edit
  site.yml                  profile, bio, research threads, experience, education, service
  publications.yml          papers (figure, links, TL;DR, key results, abstract, BibTeX fields)
  news.yml                  news items
  posts/*.md                blog posts (front matter + Markdown, TeX math supported)
themes/<name>/            one design each: Jinja2 templates + CSS/JS (site.yml `theme:` picks the live one)
templates/                shared templates: drafts gallery, animation lab, sitemap, feeds, redirects
static/                   copied as-is: JS (site.js, viz.js, viz-papers.js), images, figures, CNAME
scripts/                  image helpers (optional, need Pillow)
build.py                  builds content + templates → _site/
```

## Preview locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # add -r requirements-dev.txt for the image scripts
python build.py serve                    # http://localhost:8000 — rebuilds & live-reloads on save
```

While serving, `/drafts/` compares every design side by side and `/drafts/vizlab/` shows all paper
animations at once (append `?theme=light` for the light palette).

`python build.py` does a one-off build into `_site/`; `serve` builds into `_dev.nosync/` (both git-ignored;
the `.nosync` suffix stops iCloud Drive from syncing the rebuild churn).

## Common edits

**Add a paper**
1. Make a web-ready figure: `python scripts/optimize_images.py figure ~/path/teaser.png my-paper`
   (writes `static/assets/fig/my-paper-{640,1600}.webp`).
2. Add an entry at the top of `content/publications.yml` with `id: my-paper`, `figure: my-paper`
   (optional — shown behind the card's "Figure" toggle) and `viz:` naming its animation (see
   [Animations](#animations); without one, a generic sketch is picked from the first topic).
   Topics drive the filter chips; `highlights` become the key-result chips; BibTeX is generated
   from the entry (override fields under `bib:`).

**Add news** — prepend to `content/news.yml`. Link a paper with `[Name](#pub-<id>)`; clicking it scrolls
to and highlights the card.

**Write a post** — the blog is switched off (`blog: false` in `site.yml`: no Writing section, links,
`/blog/` pages or feeds; old blog URLs redirect home). Set `blog: true`, then add
`content/posts/YYYY-MM-DD-slug.md`:

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

**Social preview card** — after changing your title or portrait: `python scripts/make_social_card.py`.

## Animations

`static/assets/js/viz.js` renders every `<canvas data-viz="…">` — `contours` (Notion cover), research-thread
sketches `koopman`, `agents`, `lidar`, `tokens`, `events`, `chirp`, `chirp-adaptive`, plus the variants `stemfold`,
`lidar-camera` and `maple`. `static/assets/js/viz-papers.js` registers one sketch per paper: `robokoop`,
`adacred`, `dfdnet`, `luga`, `sdgn`, `s2a`, `cogsense`, `chirpnet`, `stagenet`, `radarcam`,
`fnbacktrace`. Each is a schematic of the paper's idea, not a figure from it. They only run while visible,
pause in background tabs, follow the light/dark theme, and show a single still frame for visitors who
prefer reduced motion.

## Deploying

GitHub Pages serves `www.hemantkumawat.com` from the `gh-pages` branch. Every push to `master` runs
`.github/workflows/deploy.yml`, which builds the site with `build.py` and publishes `_site/` to
`gh-pages` (CNAME included); the site updates a minute or two later.

Only the live theme is published — `theme:` in `content/site.yml`, currently `notion`. The other designs
stay in `themes/` as drafts you can preview locally with `python build.py serve` (at `/drafts/`).

Old URLs (`/publications/`, `/cv/`, `/research/`, `/news/…`) redirect. With the blog off, `/blog/…` URLs
redirect to the homepage; with it on, posts keep their original `/blog/YYYY/slug/` addresses.

---

© Hemant Kumawat. Paper figures © their respective authors/publishers.
