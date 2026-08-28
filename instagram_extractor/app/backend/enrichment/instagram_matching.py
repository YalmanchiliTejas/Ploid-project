"""Deterministic scoring for Instagram candidates discovered by web search."""

import re
from difflib import SequenceMatcher


_WEIGHTS = {
    "name": 0.35, "company": 0.20, "school": 0.15, "title": 0.10,
    "location": 0.05, "username": 0.05, "corroboration": 0.10,
}


def _normalized(value):
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def _haystack(candidate):
    return " ".join(
        [candidate.get("username", "")] + candidate.get("titles", []) + candidate.get("snippets", [])
    ).lower()


def _field_signal(values, text):
    values = [value for value in values if value]
    if not values:
        return 0.0
    return 1.0 if any(value.lower() in text for value in values) else 0.0


def _name_signal(identity, text):
    name = (identity.get("name") or "").strip()
    first, last = (identity.get("first_name") or "").strip(), (identity.get("last_name") or "").strip()
    def has_words(value):
        words = [re.escape(word) for word in value.lower().split() if word]
        return bool(words and re.search(r"\b" + r"\s+".join(words) + r"\b", text))

    if name and has_words(name):
        return 1.0
    if first and last and has_words(first) and has_words(last):
        return 0.9
    if first and has_words(first):
        return 0.35
    if last and has_words(last):
        return 0.35
    return 0.0


def _resolve_name(identity, candidate, text):
    """Find the strongest identity-name signal across handle, title, and snippet."""
    full_name = _normalized(identity.get("name"))
    first_name = _normalized(identity.get("first_name"))
    last_name = _normalized(identity.get("last_name"))
    username = _normalized(candidate.get("username"))
    text_signal = _name_signal(identity, text)

    if full_name and username == full_name:
        return 1.0, "exact_username_full_name_match"
    # Common handle forms: @timsuchanek, @tim_suchanek, or @tsuchanek.
    if first_name and last_name and first_name in username and last_name in username:
        return max(text_signal, 0.9), "username_contains_first_and_last_name"
    if first_name and last_name and username in (
        first_name[0] + last_name,
        last_name + first_name[0],
    ):
        return max(text_signal, 0.85), "username_initial_and_last_name_match"
    return text_signal, "name_in_result" if text_signal else None


def score_instagram_candidate(identity, candidate):
    """Score a web-search-discovered profile and return explainable signals."""
    text = _haystack(candidate)
    full_name = _normalized(identity.get("name"))
    linkedin_slug = _normalized(identity.get("public_id"))
    username = _normalized(candidate.get("username"))
    name_signal, name_evidence = _resolve_name(identity, candidate, text)
    exact_username_name = bool(full_name and username and full_name == username)
    direct_exact_name_handle = bool(candidate.get("direct_handle") and exact_username_name)
    exact_linkedin_slug = bool(linkedin_slug and username and linkedin_slug == username)
    cross_platform_alias_hits = int(candidate.get("cross_platform_alias_hits", 0))
    alias_sources = candidate.get("alias_sources") or []
    alias_relationships = [source.get("relationship", "mention") for source in alias_sources]
    alias_domains = {
        source.get("domain", "").lower() for source in alias_sources
        if source.get("domain")
    }
    explicit_alias_hits = alias_relationships.count("explicit_instagram_link")
    identity_profile_alias_hits = alias_relationships.count("identity_profile")
    signals = {
        "name": name_signal,
        "company": _field_signal(identity.get("companies") or [identity.get("current_company")], text),
        "school": _field_signal(identity.get("schools") or [], text),
        "title": _field_signal(identity.get("titles") or [identity.get("current_title")], text),
        "location": _field_signal([identity.get("location")], text),
        "username": SequenceMatcher(None, full_name, username).ratio() if full_name and username else 0.0,
        "corroboration": min(float(candidate.get("search_hits", 0)) / 3.0, 1.0),
    }
    score = sum(_WEIGHTS[key] * value for key, value in signals.items())
    # Shared employers or schools alone are not sufficient identity evidence.
    if signals["name"] < 0.6:
        score = min(score, 0.59)
    # Cross-platform aliases rank candidates but never confirm identity on
    # their own. Explicit Instagram links are stronger than identity-profile
    # paths, which are stronger than a generic @mention.
    alias_reliable = (
        (explicit_alias_hits > 0 or identity_profile_alias_hits > 0)
        and candidate.get("search_hits", 0) > 0
        and name_signal >= 0.9
        and identity.get("identity_source") != "linkedin_url_fallback"
    )
    if explicit_alias_hits:
        alias_bonus = 0.12
    elif identity_profile_alias_hits:
        alias_bonus = 0.08
    elif cross_platform_alias_hits:
        alias_bonus = 0.04
    else:
        alias_bonus = 0.0
    score += alias_bonus
    alias_corroborated = bool(
        alias_reliable
        and (
            signals["company"]
            or signals["school"]
            or signals["title"]
            or candidate.get("location_context_hits", 0) >= 2
            or len(alias_domains) >= 2
        )
    )
    if alias_corroborated:
        score = max(score, 0.82)
    # LinkedIn and Instagram commonly share the same non-name handle (including
    # middle initials). It is strong evidence only when independent Instagram
    # searches found the profile more than once and its indexed metadata also
    # contains the person's name. A synthesized/guessed handle does not qualify.
    linkedin_slug_verified = (
        exact_linkedin_slug
        and candidate.get("search_hits", 0) >= 2
        and name_signal >= 0.9
        and identity.get("identity_source") != "linkedin_url_fallback"
    )
    if linkedin_slug_verified:
        score = max(score, 0.82)
    # A LinkedIn URL alone cannot prove cross-platform identity. Surface useful
    # candidates but never label one a verified high-confidence match.
    if identity.get("identity_source") == "linkedin_url_fallback":
        # Exact full-name handles are strong leads, even when public search has
        # no profile snippet. Keep them medium-confidence until corroborated.
        if exact_username_name:
            score = min(max(score, 0.75), 0.79)
        else:
            score = min(score, 0.59)
    score = round(score, 3)
    evidence = [key for key in ("name", "company", "school", "title", "location") if signals[key] > 0]
    if name_evidence:
        evidence.append(name_evidence)
    if direct_exact_name_handle:
        evidence.append("direct_exact_full_name_handle")
    if exact_linkedin_slug:
        evidence.append("exact_linkedin_slug_match")
    if linkedin_slug_verified:
        evidence.append("linkedin_slug_search_verified")
    if cross_platform_alias_hits:
        evidence.append("cross_platform_alias_supported")
    if explicit_alias_hits:
        evidence.append("explicit_instagram_alias_source")
    elif identity_profile_alias_hits:
        evidence.append("identity_profile_alias_source")
    if alias_corroborated:
        evidence.append("cross_platform_alias_independently_corroborated")
    if signals["username"] >= 0.7:
        evidence.append("username_similarity")
    if candidate.get("search_hits", 0) > 1:
        evidence.append("found_in_{}_searches".format(candidate["search_hits"]))
    if candidate.get("school_context_hits", 0):
        evidence.append("school_in_public_instagram_context")
    if candidate.get("location_context_hits", 0):
        evidence.append("location_in_public_instagram_context")
    evidence_families = []
    if signals["name"] >= 0.9:
        evidence_families.append("name")
    if signals["company"] or signals["title"]:
        evidence_families.append("employment")
    if signals["school"]:
        evidence_families.append("education")
    if candidate.get("location_context_hits", 0) >= 2:
        evidence_families.append("location")
    if linkedin_slug_verified:
        evidence_families.append("shared_slug")
    if alias_reliable:
        evidence_families.append("alias")
    return {
        "username": candidate["username"], "url": candidate["url"], "score": score,
        "confidence": "high" if score >= 0.80 else "medium" if score >= 0.60 else "low",
        "evidence": evidence,
        "signals": signals,
        "search_hits": candidate.get("search_hits", 0),
        "matched_queries": candidate.get("matched_queries", []),
        "cross_platform_alias_hits": cross_platform_alias_hits,
        "alias_bonus": round(alias_bonus, 3),
        "alias_reliable": alias_reliable,
        "alias_independently_corroborated": alias_corroborated,
        "alias_source_domain_count": len(alias_domains),
        "alias_sources": alias_sources,
        "evidence_families": evidence_families,
        "negative_evidence": [],
        "school_context_hits": candidate.get("school_context_hits", 0),
        "location_context_hits": candidate.get("location_context_hits", 0),
        "observed_location_terms": candidate.get("observed_location_terms", []),
        "post_context_urls": candidate.get("post_context_urls", []),
        "context_queries": candidate.get("context_queries", []),
    }
