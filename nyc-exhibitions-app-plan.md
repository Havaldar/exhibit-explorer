# NYC Museum Exhibitions Tracker — Build Plan

A personal app that tracks current exhibitions across NYC museums, with a map view, a calendar of closing dates, and a list view. Data refreshes weekly via an automated scrape + LLM extraction pipeline.

---

## 1. Architecture Overview

```
Google Sheet (museum list — your "admin panel")
        │
        ▼
Weekly GitHub Action (cron, e.g. Mondays 6am)
        │
        ├─ 1. Fetch sheet as CSV
        ├─ 2. For each museum: fetch exhibitions page
        ├─ 3. Hash check — skip unchanged pages, reuse last week's data
        ├─ 4. Strip HTML → plain text
        ├─ 5. Claude Haiku (Batch API) → structured JSON per museum
        ├─ 6. Optionally follow detail pages (per-museum flag)
        └─ 7. Write exhibitions.json, commit to repo
        │
        ▼
Static frontend on GitHub Pages
        ├─ Map view
        ├─ Calendar view (closing dates)
        └─ List view
```

**Key principles:**
- No server, no database. One JSON file, fully rewritten weekly.
- The Google Sheet is the single source of truth for which museums to track.
- Failures on individual museums never block the run — log and move on.
- Images are hotlinked from museum sites (acceptable for personal use).

---

## 2. Google Sheet Setup

Create a sheet, share as **"Anyone with the link can view."**

Columns:

| Column | Example | Notes |
|---|---|---|
| name | MoMA | Display name |
| exhibitionsUrl | https://www.moma.org/calendar/exhibitions | Leave blank to trigger auto-discovery |
| lat | 40.7614 | For the map pin |
| lng | -73.9776 | |
| hours | Mon–Sun 10:30–5:30, Fri until 8 | Free text is fine; displayed as-is |
| followDetailPages | TRUE / FALSE | Whether listing page lacks dates/descriptions |
| tier | 1 / 2 | 1 = verified working, 2 = best effort |
| notes | Closed Tuesdays | Anything useful |

Fetch URL format:
```
https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0
```

**Starting set:** ~25 Tier 1 museums (Met, MoMA, Whitney, Guggenheim, Brooklyn Museum, New Museum, Frick, Morgan Library, Neue Galerie, Jewish Museum, Cooper Hewitt, Museum of the City of NY, MCNY, ICP, Studio Museum, Bronx Museum, Queens Museum, MoMA PS1, Noguchi, Rubin (check status), Asia Society, Americas Society, Drawing Center, Poster House, Fotografiska, etc. — finalize the list when building).

---

## 3. Weekly Pipeline (GitHub Action)

**Language:** Python (good scraping + CSV + API libraries).

**Steps per run:**

1. **Fetch sheet CSV** → parse rows into museum configs.
2. **Auto-discovery** (only for rows with blank `exhibitionsUrl`):
   - Try common patterns: `/exhibitions`, `/current-exhibitions`, `/whats-on`, `/calendar/exhibitions`, `/on-view`
   - Fallback: fetch homepage, extract links, ask Haiku "which URL is the exhibitions listing?"
   - Log discovered URL so you can paste it into the sheet.
3. **Fetch each exhibitions page** (respect robots.txt, set a friendly User-Agent, small delay between requests).
4. **Hash check:** SHA-256 of the extracted text. If unchanged from last run (store hashes in a small `hashes.json` in the repo), reuse last week's entries for that museum. Skips ~80% of LLM calls.
5. **Strip HTML → text** using `trafilatura` (best) or `html2text`.
6. **LLM extraction** — one call per changed museum via the **Batch API** (50% discount, 24h turnaround is fine for a weekly job). Model: `claude-haiku-4-5`.

   Extraction prompt shape:
   ```
   From this museum webpage text, extract all current/upcoming exhibitions.
   Return ONLY a JSON array, no markdown fences. Each item:
   {
     "title": string,
     "description": string (1-2 sentences),
     "startDate": "YYYY-MM-DD" or null,
     "endDate": "YYYY-MM-DD" or null,
     "ongoing": boolean,
     "imageUrl": string or null,
     "detailUrl": string or null
   }
   If no exhibitions found, return [].
   ```
   Note: image URLs often aren't in the stripped text — for those, either pass a lightly-cleaned HTML (keep `<img>` src attributes) or regex `og:image` / `<img>` tags separately and let the LLM match them to exhibitions.

7. **Detail-page follow** (only where `followDetailPages = TRUE`): fetch each `detailUrl`, extract missing fields with a second small LLM pass.
8. **Assemble `exhibitions.json`:**
   ```json
   {
     "generatedAt": "2026-07-06T06:00:00Z",
     "museums": [
       {
         "name": "MoMA",
         "lat": 40.7614, "lng": -73.9776,
         "hours": "…",
         "website": "…",
         "lastSuccessfulScrape": "2026-07-06",
         "scrapeStatus": "ok" | "failed" | "cached",
         "exhibitions": [ { "title": "…", "endDate": "…", … } ]
       }
     ]
   }
   ```
9. **Commit + push** the JSON (and updated hashes) to the repo → GitHub Pages serves it immediately.

**Error handling:** wrap each museum in try/except; failed museums keep their previous data with `scrapeStatus: "failed"` and old `lastSuccessfulScrape` so the frontend can show staleness.

**Secrets:** `ANTHROPIC_API_KEY` in GitHub Action secrets. Sheet ID can be plain env var.

---

## 4. Frontend (static site, GitHub Pages)

**Stack:** React + Vite single-page app (or plain HTML/JS if you prefer zero build). Loads `exhibitions.json` on startup. Three tabs/routes:

### a) Map view
- Leaflet + OpenStreetMap tiles (free, no API key) — pin per museum.
- Tap a pin → popup with museum name, hours, count of current exhibitions, tap-through to its list entries.
- Optional: color pins by "something closing within 2 weeks."

### b) Calendar view
- Month grid; each exhibition's **end date** appears as an entry on that day.
- Tap a date → list of exhibitions closing that day (with museum + image thumbnail).
- "Closing soon" is the killer feature — consider a badge for anything ending within 14 days.

### c) List view
- Card per exhibition: photo, title, museum, description, end date.
- Sort options: by end date (default — soonest closing first), by museum, by recently added.
- Filters: borough, museum, "closing this month," hide ongoing/permanent.
- Staleness indicator when `scrapeStatus != ok`.

**Mobile-first styling** — you'll mostly use this on your phone.

---

## 5. Repo Structure

```
nyc-exhibitions/
├── .github/workflows/scrape.yml   # weekly cron
├── scraper/
│   ├── main.py
│   ├── discover.py                # exhibitions-URL auto-discovery
│   ├── extract.py                 # LLM extraction
│   └── requirements.txt
├── data/
│   ├── exhibitions.json           # the "database"
│   └── hashes.json                # change detection
├── site/                          # frontend source
└── README.md
```

---

## 6. Build Order (suggested sessions)

**Session 1 — Frontend prototype**
Build the three views against hand-written sample `exhibitions.json` (5 museums, ~12 fake exhibitions). Validates the UX before any scraping exists.

**Session 2 — Scraper core**
Sheet CSV fetch → page fetch → text strip → Haiku extraction → JSON output. Test locally against 5 real museums. Iterate on the extraction prompt (dates in weird formats, "ongoing" shows, member previews, etc.).

**Session 3 — Robustness + automation**
Hash-based skip, detail-page following, error handling/staleness, auto-discovery for blank URLs, Batch API, GitHub Action cron, GitHub Pages deploy.

**Session 4 — Polish + scale**
Add remaining Tier 1 museums, fix per-museum quirks, add Tier 2 long tail from Wikipedia/Google Places, closing-soon badges, filters.

---

## 7. Known Gotchas

- **JavaScript-rendered sites** (some museums load exhibitions client-side): plain `requests` gets an empty page. Fixes: check for a JSON API the page calls (Network tab), or use Playwright in the Action for those specific museums (flag in sheet, e.g. `needsJs = TRUE`).
- **Date ambiguity:** "Through Fall 2026," "Ongoing," "Closing soon" — let the LLM return null + `ongoing: true` rather than hallucinating dates.
- **Image URLs:** frequently relative paths — resolve against the page URL. Some museums block hotlinking with referrer checks; acceptable losses for personal use, or proxy those few.
- **Permanent collection noise:** prompt the LLM to exclude permanent-collection displays unless they have an end date.
- **Rubin Museum** closed its NYC building (2024) — a reminder to sanity-check the museum list against current reality.

---

## 8. Cost Estimate

- ~25 museums, ~5–10 changed per week, Haiku via Batch API: **well under $0.05/week**.
- GitHub Actions + Pages: free tier is far more than enough.
- Maps: Leaflet/OSM free.

Total: effectively free.

---

## Tomorrow's kickoff prompt

Paste something like:

> "Here's my plan doc for the NYC exhibitions tracker [attach this file]. Let's start with Session 1: build the frontend prototype with the map, calendar, and list views against sample data."
