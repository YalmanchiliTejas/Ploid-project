"""Resolve public profile-image URLs from Open Graph metadata."""

from html.parser import HTMLParser
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener


_MAX_HTML_BYTES = 1_000_000
_USER_AGENT = "Mozilla/5.0 (compatible; ProfileAvatarResolver/1.0)"


class _AdvertisedImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self._active_image = None

    def handle_starttag(self, tag, attributes):
        values = {key.lower(): value for key, value in attributes if key and value}
        if tag.lower() == "link" and "image_src" in values.get("rel", "").lower():
            if values.get("href"):
                self.images.append({"url": values["href"], "width": 0, "height": 0})
            return
        if tag.lower() != "meta":
            return
        key = (values.get("property") or values.get("name") or "").lower()
        content = values.get("content", "").strip()
        if key in {"og:image", "og:image:url", "og:image:secure_url", "twitter:image"}:
            if content:
                self._active_image = {"url": content, "width": 0, "height": 0}
                self.images.append(self._active_image)
        elif key in {"og:image:width", "twitter:image:width"} and self._active_image:
            self._active_image["width"] = _positive_int(content)
        elif key in {"og:image:height", "twitter:image:height"} and self._active_image:
            self._active_image["height"] = _positive_int(content)


def _positive_int(value):
    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        return 0


def extract_advertised_images(html, page_url):
    """Return unique, publicly advertised image candidates, largest first."""
    parser = _AdvertisedImageParser()
    parser.feed(html)
    unique = {}
    for position, image in enumerate(parser.images):
        url = urljoin(page_url, image["url"])
        candidate = {
            "url": url,
            "width": image["width"],
            "height": image["height"],
            "position": position,
        }
        previous = unique.get(url)
        if previous is None or candidate["width"] * candidate["height"] > previous["width"] * previous["height"]:
            unique[url] = candidate
    return sorted(
        unique.values(),
        key=lambda image: (
            image["width"] * image["height"],
            image["width"], image["height"], -image["position"],
        ),
        reverse=True,
    )


def extract_og_image(html, page_url):
    """Return an absolute ``og:image`` URL from HTML, or ``None``."""
    images = extract_advertised_images(html, page_url)
    return images[0]["url"] if images else None


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
        advertised_images = extract_advertised_images(html, page_url)
        if not advertised_images:
            return None
        assets = []
        for advertised in advertised_images[:4]:
            image_request = Request(advertised["url"], headers={
                "User-Agent": _USER_AGENT,
                "Referer": page_url,
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            })
            try:
                with opener.open(image_request, timeout=timeout) as response:
                    content_type = response.headers.get_content_type()
                    if not content_type.startswith("image/"):
                        continue
                    image = response.read()
            except (HTTPError, URLError, OSError, ValueError):
                continue
            if image:
                assets.append({
                    "source_url": advertised["url"],
                    "content": image,
                    "content_type": content_type,
                    "declared_width": advertised["width"],
                    "declared_height": advertised["height"],
                })
        if assets:
            return max(assets, key=lambda asset: (
                asset["declared_width"] * asset["declared_height"],
                len(asset["content"]),
            ))
        return None
    except (HTTPError, URLError, OSError, ValueError):
        return None


def fetch_profile_avatar(profile_url, timeout=10):
    """Return the discovered source URL for callers that only need metadata."""
    asset = fetch_profile_avatar_asset(profile_url, timeout=timeout)
    return asset["source_url"] if asset else None
