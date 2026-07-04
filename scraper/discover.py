"""Auto-discovers exhibitions URL for museums that have a blank exhibitionsUrl."""
import requests
from urllib.parse import urljoin, urlparse

COMMON_PATHS = [
    '/exhibitions',
    '/current-exhibitions',
    '/on-view',
    '/whats-on',
    '/calendar/exhibitions',
    '/visit/exhibitions',
    '/exhibitions/current',
]

HEADERS = {'User-Agent': 'NYCExhibitionsTracker/1.0 (personal use)'}


def discover_exhibitions_url(base_url: str, haiku_client=None) -> str | None:
    """Try common paths, fall back to LLM if needed."""
    parsed = urlparse(base_url)
    root = f"{parsed.scheme}://{parsed.netloc}"

    for path in COMMON_PATHS:
        url = root + path
        try:
            r = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
            if r.status_code == 200:
                print(f"  Discovered: {url}")
                return url
        except Exception:
            continue

    # Fallback: fetch homepage, ask Haiku
    if haiku_client:
        return _llm_discover(root, haiku_client)

    return None


def _llm_discover(root_url: str, client) -> str | None:
    try:
        r = requests.get(root_url, headers=HEADERS, timeout=15)
        import trafilatura
        text = trafilatura.extract(r.text) or r.text[:3000]

        resp = client.messages.create(
            model='claude-haiku-4-5',
            max_tokens=200,
            messages=[{
                'role': 'user',
                'content': (
                    f"This is text from {root_url}. "
                    "Return ONLY the full URL of the page that lists current/upcoming exhibitions. "
                    "If unsure, return null.\n\n" + text[:2000]
                )
            }]
        )
        url = resp.content[0].text.strip().strip('"\'')
        if url.startswith('http') and root_url in url:
            return url
    except Exception as e:
        print(f"  LLM discovery failed: {e}")
    return None
