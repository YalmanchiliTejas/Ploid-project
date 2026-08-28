"""Instagram-only public web-search discovery."""

import re
from urllib.parse import urlparse


_NON_PROFILE_PATHS = {"p", "reel", "reels", "explore", "stories", "accounts", "direct"}
_POST_PATHS = {"p", "reel", "reels", "tv"}


def normalize_instagram_url(url):
    """Return one canonical Instagram profile URL, or None for non-profiles."""
    value = (url or "").strip()
    parsed = urlparse(value if "://" in value else "https://" + value)
    host = parsed.hostname.lower() if parsed.hostname else ""
    if host not in ("instagram.com", "www.instagram.com"):
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 1 or parts[0].lower() in _NON_PROFILE_PATHS:
        return None
    username = parts[0].strip()
    if not username:
        return None
    return "https://www.instagram.com/{}/".format(username)


def extract_instagram_username(url):
    """Return the username from a valid Instagram profile URL, else None."""
    normalized = normalize_instagram_url(url)
    return normalized.rstrip("/").rsplit("/", 1)[-1] if normalized else None


def _quoted(value):
    return '"{}"'.format(value.replace('"', " ").strip())


def build_instagram_queries(identity):
    """Build a small, deduplicated set of site-restricted identity searches."""
    name = (identity.get("name") or "").strip()
    first_name = (identity.get("first_name") or "").strip()
    last_name = (identity.get("last_name") or "").strip()
    public_id = (identity.get("public_id") or "").strip()
    name_variants = list(dict.fromkeys(value for value in (name, first_name, last_name) if value))
    if not name_variants and not public_id:
        return []
    fields = [
        identity.get("current_company") or "",
        (identity.get("schools") or [""])[0],
        identity.get("current_title") or "",
        identity.get("location") or "",
    ]
    queries = []
    # Search the strongest identity (first + last) and each individual name
    # component. Some Instagram bios index only one component of a legal name.
    for name_variant in name_variants:
        for field in fields:
            if field:
                queries.append(
                    "site:instagram.com {} {}".format(
                        _quoted(name_variant), _quoted(field)
                    )
                )
    if name and fields[0] and fields[1]:
        queries.append(
            "site:instagram.com {} {} {}".format(
                _quoted(name), _quoted(fields[0]), _quoted(fields[1])
            )
        )
    if public_id:
        queries.append("site:instagram.com {}".format(_quoted(public_id)))
    # Always include standalone site-restricted name filters. In particular,
    # the first-name query can find profiles whose display name is indexed but
    # whose unrelated username and biography contain no LinkedIn attributes.
    for name_variant in name_variants:
        queries.append("site:instagram.com {}".format(_quoted(name_variant)))
    return list(dict.fromkeys(queries))


def _search_web(query):
    """Return normalized public web-search results without requiring an API key."""
    from ddgs import DDGS
    from ddgs.exceptions import DDGSException

    results = []
    for backend in ("duckduckgo", "bing", "brave"):
        try:
            # Query each free public index independently. DDGS can return an
            # empty combined response when one backend is temporarily blocked.
            results.extend(DDGS().text(query, max_results=10, backend=backend))
        except DDGSException as error:
            # No hits, rate limits, and a temporarily unavailable backend are
            # all non-fatal: the other indexes can still supply candidates.
            if str(error).strip().lower() != "no results found.":
                continue
    return [
        {
            "link": item.get("href") or item.get("url") or "",
            "title": item.get("title") or "",
            "snippet": item.get("body") or item.get("snippet") or "",
        }
        for item in results
    ]


def search_instagram_web(query):
    """Search only the Instagram-restricted query supplied by the caller."""
    return _search_web(query)


def _mentions(value, term):
    """Match a visible search-result term without trusting the query itself."""
    normalized_value = re.sub(r"\s+", " ", (value or "").lower())
    normalized_term = re.sub(r"\s+", " ", (term or "").lower()).strip()
    return bool(normalized_term and normalized_term in normalized_value)


def search_instagram_candidate_context(identity, username):
    """Find indexed school and location evidence for one shortlisted account.

    Search results can expose profile biographies, captions, and visible post
    location labels. They cannot prove that the candidate follows a school
    account, so this function deliberately records mentions rather than a
    following relationship.
    """
    username = (username or "").strip().lstrip("@").lower()
    if not username:
        return {}
    schools = list(dict.fromkeys(
        school.strip() for school in (identity.get("schools") or [])
        if isinstance(school, str) and school.strip()
    ))[:2]
    location = (identity.get("location") or "").strip()
    # City is more likely than the full LinkedIn location to appear in a post
    # label. Retain the full value too when it differs.
    locations = []
    if location:
        locations.append(location)
        city = location.split(",", 1)[0].strip()
        if len(city) >= 3 and city.lower() != location.lower():
            locations.append(city)
    specifications = [
        ("school", school,
         'site:instagram.com "@{}" {}'.format(username, _quoted(school)))
        for school in schools
    ] + [
        ("location", place,
         'site:instagram.com "@{}" {}'.format(username, _quoted(place)))
        for place in locations
    ]
    output = {
        "school_context_hits": 0,
        "location_context_hits": 0,
        "observed_location_terms": [],
        "post_context_urls": [],
        "context_titles": [],
        "context_snippets": [],
        "context_queries": [query for _, _, query in specifications],
    }
    seen = set()
    username_pattern = re.compile(
        r"(?<![a-zA-Z0-9._])@?{}(?![a-zA-Z0-9._])".format(re.escape(username)),
        re.IGNORECASE,
    )
    for kind, term, query in specifications:
        for item in _search_web(query):
            link = item.get("link", "")
            title = item.get("title", "")
            snippet = item.get("snippet", "")
            combined = " ".join((title, snippet))
            parsed = urlparse(link)
            host = (parsed.hostname or "").lower().removeprefix("www.")
            parts = [part for part in parsed.path.split("/") if part]
            is_profile = host == "instagram.com" and len(parts) == 1 and parts[0].lower() == username
            is_post = host == "instagram.com" and len(parts) >= 2 and parts[0].lower() in _POST_PATHS
            # A post URL does not include its author. Require the indexed text
            # to associate it with this exact handle before using its caption.
            if not is_profile and not (is_post and username_pattern.search(combined)):
                continue
            if not _mentions(combined, term):
                continue
            # The same indexed page can be returned for both "New York" and
            # "New York, United States". Count sources, not query variants.
            key = (kind, link, title, snippet)
            if key in seen:
                continue
            seen.add(key)
            output[kind + "_context_hits"] += 1
            if kind == "location" and term not in output["observed_location_terms"]:
                output["observed_location_terms"].append(term)
            if is_post and link not in output["post_context_urls"]:
                output["post_context_urls"].append(link)
            if title and title not in output["context_titles"]:
                output["context_titles"].append(title)
            if snippet and snippet not in output["context_snippets"]:
                output["context_snippets"].append(snippet)
    return output


def search_public_social_aliases(name):
    """Find handles publicly associated with an exact full name off Instagram.

    Every association retains its source and relationship quality. A generic
    ``@mention`` is intentionally weaker than an explicit Instagram label or
    an identity-profile URL whose handle matches the candidate.
    """
    if not name:
        return []
    results = _search_web('{} social media'.format(_quoted(name)))
    aliases = {}
    for item in results:
        combined = " ".join((item.get("title", ""), item.get("snippet", "")))
        if not re.search(r"\b{}\b".format(re.escape(name)), combined, re.IGNORECASE):
            continue
        mentioned_handles = set(re.findall(
            r"(?:@|instagram\.com/)([a-zA-Z0-9._]{1,30})", combined,
            re.IGNORECASE,
        ))
        explicit_handles = set(re.findall(
            r"(?:instagram(?:\s+(?:account|handle|profile))?\s*[:\-]?\s*@?"
            r"|instagram\.com/)([a-zA-Z0-9._]{1,30})",
            combined,
            re.IGNORECASE,
        ))
        parsed = urlparse(item.get("link", ""))
        host = (parsed.hostname or "").lower().removeprefix("www.")
        parts = [part for part in parsed.path.split("/") if part]
        profile_handle = None
        if parts and host in {
            "facebook.com", "medium.com", "twitter.com", "x.com", "unsplash.com",
        }:
            path_handle = parts[0].lstrip("@")
            if re.fullmatch(r"[a-zA-Z0-9._]{1,30}", path_handle):
                profile_handle = path_handle
                mentioned_handles.add(path_handle)
        for handle in mentioned_handles:
            normalized = handle.lower().rstrip(".")
            if normalized in _NON_PROFILE_PATHS:
                continue
            relationship = "mention"
            if any(value.lower().rstrip(".") == normalized for value in explicit_handles):
                relationship = "explicit_instagram_link"
            elif profile_handle and profile_handle.lower().rstrip(".") == normalized:
                relationship = "identity_profile"
            alias = aliases.setdefault(normalized, {
                "username": normalized,
                "supporting_results": [],
            })
            supporting_result = {
                "url": item.get("link", ""),
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "domain": host,
                "relationship": relationship,
            }
            key = (
                supporting_result["url"], supporting_result["title"],
                supporting_result["snippet"], supporting_result["relationship"],
            )
            existing_keys = {
                (source["url"], source["title"], source["snippet"], source["relationship"])
                for source in alias["supporting_results"]
            }
            if key not in existing_keys:
                alias["supporting_results"].append(supporting_result)
    return list(aliases.values())


def search_indexed_linkedin_profile(public_id, derived_name=""):
    """Find indexed metadata, retaining only the exact supplied LinkedIn URL."""
    queries = ['site:linkedin.com/in "{}"'.format(public_id)]
    if derived_name:
        queries.append('site:linkedin.com/in "{}"'.format(derived_name))
    results = []
    for query in queries:
        results.extend(_search_web(query))

    def is_target_profile(item):
        parsed = urlparse(item.get("link", ""))
        if not parsed.hostname or not parsed.hostname.lower().endswith("linkedin.com"):
            return False
        parts = [part for part in parsed.path.split("/") if part]
        return len(parts) == 2 and parts[0].lower() == "in" and parts[1].lower() == public_id.lower()

    unique = {}
    for item in results:
        if is_target_profile(item):
            unique.setdefault(item["link"].rstrip("/"), item)
    return list(unique.values())


def search_public_identity_context(name):
    """Find public, exact-name LinkedIn and company-page context snippets."""
    if not name:
        return []
    queries = [
        'site:linkedin.com/in {}'.format(_quoted(name)),
        'site:linkedin.com/company {}'.format(_quoted(name)),
        '{} ("Co-Founder" OR Founder OR CEO OR Director)'.format(_quoted(name)),
    ]
    unique = {}
    for query in queries:
        for item in _search_web(query):
            key = (item["link"].rstrip("/"), item["title"], item["snippet"])
            unique.setdefault(key, item)
    return list(unique.values())
