"""Resolve public profile-image URLs from Open Graph metadata."""

from html.parser import HTMLParser
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener


_MAX_HTML_BYTES = 1_000_000
_USER_AGENT = "Mozilla/5.0 (compatible; ProfileAvatarResolver/1.0)"


class _OpenGraphImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = None

    def handle_starttag(self, tag, attributes):
        if tag.lower() != "meta" or self.image:
            return
        values = {key.lower(): value for key, value in attributes if key and value}
        if values.get("property", "").lower() == "og:image" or values.get("name", "").lower() == "og:image":
            self.image = values.get("content")


def extract_og_image(html, page_url):
    """Return an absolute ``og:image`` URL from HTML, or ``None``."""
    parser = _OpenGraphImageParser()
    parser.feed(html)
    return urljoin(page_url, parser.image) if parser.image else None


def fetch_profile_avatar_asset(profile_url, timeout=10):
    """Fetch a public profile's advertised avatar bytes, if available.

    The same cookie-aware browser session is used for the profile page and the
    image request, with the profile page supplied as the image referrer. This
    avoids exposing a short-lived, protected CDN URL to a separate client.
    """
    try:
        opener = build_opener(HTTPCookieProcessor(CookieJar()))
        page_request = Request(profile_url, headers={"User-Agent": _USER_AGENT})
        with opener.open(page_request, timeout=timeout) as response:
            content_type = response.headers.get_content_type()
            if content_type not in ("text/html", "application/xhtml+xml"):
                return None
            charset = response.headers.get_content_charset() or "utf-8"
            html = response.read(_MAX_HTML_BYTES).decode(charset, errors="replace")
            page_url = response.url
        avatar_url = extract_og_image(html, page_url)
        if not avatar_url:
            return None
        image_request = Request(avatar_url, headers={
            "User-Agent": _USER_AGENT,
            "Referer": page_url,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        })
        with opener.open(image_request, timeout=timeout) as response:
            content_type = response.headers.get_content_type()
            if not content_type.startswith("image/"):
                return None
            image = response.read()
            if not image:
                return None
            return {
                "source_url": avatar_url,
                "content": image,
                "content_type": content_type,
            }
    except (HTTPError, URLError, OSError, ValueError):
        return None


def fetch_profile_avatar(profile_url, timeout=10):
    """Return the discovered source URL for callers that only need metadata."""
    asset = fetch_profile_avatar_asset(profile_url, timeout=timeout)
    return asset["source_url"] if asset else None
