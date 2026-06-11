# Wheech Marketing Website

Static landing page for [Wheech](https://github.com/gils1908/Wheech). Uses the **Lime Zest** theme from `design/handoff/wheech-lz.css`.

**Live repo:** [gils1908/Wheech-Website](https://github.com/gils1908/Wheech-Website)  
**Hosting:** Render static site (auto-deploy on push to `main`)

## Local preview

```bash
cd website
python3 -m http.server 8080
# open http://localhost:8080
```

## Push workflow

This folder is a **nested git repo** inside the Wheech project. The parent repo ignores `website/` — commits here are independent.

From the Wheech project root, push both repos:

```bash
scripts/push.sh
```

Or manually:

```bash
# Main Wheech repo
git push

# Website repo
cd website && git push
```

## Render setup (one-time)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Static Site**
2. Connect `gils1908/Wheech-Website`
3. Branch: `main`, publish directory: `.` (root)
4. Enable **Auto-Deploy**
5. Optional: add custom domain under site settings

`render.yaml` in this folder documents the static site config.

## Screenshots

Drop PNGs into `images/screenshots/`. Placeholders show until files exist.

| File | Screen | Where used |
|------|--------|------------|
| `welcome.png` | Welcome / auth | Hero, Screenshots gallery |
| `create-matchup.png` | Create Matchup | How it works step 1 |
| `vote-gate.png` | Vote gate | How it works step 2 |
| `results.png` | Results / Verdict | How it works step 3, Screenshots gallery |
| `my-matchups.png` | My Matchups list | Screenshots gallery (optional) |
| `og-image.png` | Open Graph | 1200×630 — link previews |

Export from iOS simulator or device at **2×** resolution.

After adding images:

```bash
cd website
git add images/screenshots/
git commit -m "Add app screenshots"
cd .. && scripts/push.sh
```

## Keeping copy in sync with the app

| App change | Update on website |
|------------|-------------------|
| Welcome tagline / preview copy | Hero section |
| Core loop (vote count, scoring types) | How it works |
| Season pass price / ad messaging | Get the app section |
| Major screens or rebranding | Screenshot list + hero |

**Policy:** Copy changes that reflect app messaging are confirmed with Gil before going live. Screenshot swaps are safe once assets are provided.

Internal MVP details (vote threshold K, projection fallback, etc.) stay off the marketing site unless explicitly requested.
