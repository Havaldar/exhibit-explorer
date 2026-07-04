#!/usr/bin/env python3
"""
NYC Exhibitions Scraper
Reads museum list from Google Sheet → scrapes → extracts with Claude Haiku → writes exhibitions.json
"""
import csv
import hashlib
import io
import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests
import trafilatura
import anthropic
from dotenv import load_dotenv

from discover import discover_exhibitions_url
from extract import extract_exhibitions

load_dotenv()

SHEET_ID = os.environ.get('SHEET_ID', '')
SHEET_URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
EXHIBITIONS_JSON = os.path.join(DATA_DIR, 'exhibitions.json')
HASHES_JSON = os.path.join(DATA_DIR, 'hashes.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
}
REQUEST_DELAY = 3  # seconds between museum fetches
MAX_RETRIES = 3


def fetch_sheet() -> list[dict]:
    print(f"Fetching sheet: {SHEET_URL}")
    r = requests.get(SHEET_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    reader = csv.DictReader(io.StringIO(r.text))
    museums = [row for row in reader if row.get('name')]
    print(f"  {len(museums)} museums in sheet")
    return museums


def fetch_page(url: str, force_playwright: bool = False) -> str | None:
    """Fetch page using Playwright (real browser) for all museums.

    Museum sites are too JS-heavy and bot-protected for plain requests to be
    reliable — Playwright is the right default for a weekly job.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                # --no-sandbox is required in CI; avoid other flags that
                # change rendering and break Cloudflare JS challenges
                args=['--no-sandbox'],
            )
            page = browser.new_page(user_agent=HEADERS['User-Agent'])
            page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                window.chrome = { runtime: {} };
            """)
            try:
                page.goto(url, wait_until='networkidle', timeout=45000)
            except PWTimeout:
                print(f"  networkidle timeout — extracting what loaded so far")
            page.wait_for_timeout(2000)
            html = page.content()
            # Use whichever extraction method gives more content:
            # trafilatura works well for server-rendered pages (MoMA)
            # inner_text works well for JS-rendered pages (Whitney)
            text_traf = trafilatura.extract(html, include_links=False, include_images=False) or ''
            text_inner = page.inner_text('body') or ''
            text = text_traf if len(text_traf) >= len(text_inner) else text_inner
            browser.close()
        chars = len(text)
        print(f"  Fetched {chars} chars from {url}")
        return text or ''
    except Exception as e:
        print(f"  Playwright error {url}: {e}")
        return None


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def load_json(path: str, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def run():
    client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

    # Load previous state
    prev_output = load_json(EXHIBITIONS_JSON, {'museums': []})
    prev_by_name = {m['name']: m for m in prev_output.get('museums', [])}
    hashes = load_json(HASHES_JSON, {})

    # Fetch museum list
    if SHEET_ID:
        sheet_rows = fetch_sheet()
    else:
        print("No SHEET_ID set — using hardcoded sample museums for testing")
        sheet_rows = SAMPLE_MUSEUMS

    museums_out = []

    for row in sheet_rows:
        name = row['name'].strip()
        print(f"\n--- {name} ---")

        url = (row.get('exhibitionsUrl') or row.get('exhibitionUrl') or '').strip()
        lat = float(row.get('lat', 0) or 0)
        lng = float(row.get('lng', 0) or 0)
        hours = row.get('hours', '').strip()
        website = row.get('website', '').strip()
        follow_detail = row.get('followDetailPages', '').upper() == 'TRUE'
        needs_js = row.get('needsJs', '').upper() == 'TRUE'

        # Auto-discover URL if blank
        if not url:
            print("  No URL — auto-discovering…")
            url = discover_exhibitions_url(website or f"https://www.{name.lower().replace(' ', '')}.org", client)
            if url:
                print(f"  Paste into sheet: {url}")
            else:
                print("  Discovery failed, skipping")
                if name in prev_by_name:
                    museums_out.append({**prev_by_name[name], 'scrapeStatus': 'failed'})
                continue

        # Fetch page via Playwright (real browser, handles JS and bot protection)
        text = fetch_page(url)
        time.sleep(REQUEST_DELAY)

        if text is None:
            print("  Fetch failed")
            if name in prev_by_name:
                museums_out.append({**prev_by_name[name], 'scrapeStatus': 'failed'})
            continue

        # Hash check
        h = sha256(text)
        if hashes.get(name) == h and name in prev_by_name:
            print("  Unchanged — reusing cached data")
            museums_out.append({**prev_by_name[name], 'scrapeStatus': 'cached'})
            continue

        # Extract with LLM
        print("  Changed — extracting with Haiku…")
        exhibitions = extract_exhibitions(text, client)
        print(f"  Found {len(exhibitions)} exhibitions")

        # Resolve relative URLs
        for ex in exhibitions:
            if ex.get('detailUrl') and not ex['detailUrl'].startswith('http'):
                ex['detailUrl'] = urljoin(url, ex['detailUrl'])
            if ex.get('imageUrl') and not ex['imageUrl'].startswith('http'):
                ex['imageUrl'] = urljoin(url, ex['imageUrl'])

        # Follow detail pages if flagged
        if follow_detail:
            for ex in exhibitions:
                if ex.get('detailUrl') and (not ex.get('endDate') or not ex.get('description')):
                    detail_text = fetch_page(ex['detailUrl'])
                    time.sleep(REQUEST_DELAY)
                    if detail_text:
                        detail = extract_exhibitions(detail_text, client)
                        if detail:
                            ex.setdefault('endDate', detail[0].get('endDate'))
                            ex.setdefault('description', detail[0].get('description'))

        hashes[name] = h

        museums_out.append({
            'name': name,
            'lat': lat,
            'lng': lng,
            'hours': hours,
            'website': website,
            'lastSuccessfulScrape': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            'scrapeStatus': 'ok',
            'exhibitions': exhibitions,
        })

    output = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'museums': museums_out,
    }

    save_json(EXHIBITIONS_JSON, output)
    save_json(HASHES_JSON, hashes)
    print(f"\nDone. Wrote {len(museums_out)} museums to {EXHIBITIONS_JSON}")


# Minimal fallback for local testing without a Sheet
SAMPLE_MUSEUMS = [
    {'name': 'MoMA', 'exhibitionsUrl': 'https://www.moma.org/calendar/exhibitions',
     'lat': '40.7614', 'lng': '-73.9776', 'hours': 'Mon–Sun 10:30–5:30', 'followDetailPages': 'FALSE'},
    {'name': 'Whitney Museum', 'exhibitionsUrl': 'https://whitney.org/exhibitions/',
     'lat': '40.7396', 'lng': '-74.0089', 'hours': 'Mon, Wed–Sun 10:30–6', 'followDetailPages': 'FALSE'},
]


if __name__ == '__main__':
    run()
