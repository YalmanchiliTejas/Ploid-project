"""Store and reconstruct locally cached profile-avatar assets."""

import base64
import mimetypes
import os
import re
from pathlib import Path

from .profile_avatar import fetch_profile_avatar_asset


_EXTENSIONS = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "image/avif": "avif",
}


def _cache_root(cache_dir=None):
    return Path(cache_dir or os.getenv("AVATAR_CACHE_DIR", "avatar_cache")).resolve()


def _safe_identifier(value):
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "_", value or "unknown").strip("._")
    return normalized[:120] or "unknown"


def _cache_profile_image(provider, identifier, profile_url, suffix="", cache_dir=None):
    """Fetch one advertised image and write it locally."""
    asset = fetch_profile_avatar_asset(profile_url)
    if not asset:
        return None
    content_type = asset["content_type"].split(";", 1)[0].lower()
    extension = _EXTENSIONS.get(content_type, "img")
    root = _cache_root(cache_dir)
    destination = root / _safe_identifier(provider) / "{}{}.{}".format(
        _safe_identifier(identifier), suffix, extension
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(asset["content"])
    try:
        return str(destination.relative_to(Path.cwd()))
    except ValueError:
        return str(destination)


def cache_profile_avatar(provider, identifier, profile_url, cache_dir=None):
    """Fetch a profile avatar and write it locally, returning its local path."""
    return _cache_profile_image(provider, identifier, profile_url, cache_dir=cache_dir)


def cache_profile_images(provider, identifier, profile_url, related_urls=None,
                         max_images=4, cache_dir=None):
    """Cache a profile image plus a bounded set of associated public images."""
    urls = list(dict.fromkeys(
        url for url in [profile_url] + list(related_urls or []) if url
    ))[:max_images]
    paths = []
    for index, url in enumerate(urls):
        suffix = "" if index == 0 else "_{}".format(index)
        path = _cache_profile_image(
            provider, identifier, url, suffix=suffix, cache_dir=cache_dir
        )
        if path:
            paths.append(path)
    return paths


def read_cached_avatar(path):
    """Read a cached avatar's bytes and MIME type for a local response layer."""
    avatar_path = Path(path)
    data = avatar_path.read_bytes()
    return data, mimetypes.guess_type(avatar_path.name)[0] or "application/octet-stream"


def cached_avatar_data_url(path):
    """Return a data URL suitable for local previewing of a cached avatar."""
    data, content_type = read_cached_avatar(path)
    encoded = base64.b64encode(data).decode("ascii")
    return "data:{};base64,{}".format(content_type, encoded)
