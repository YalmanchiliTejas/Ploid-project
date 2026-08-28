"""Known-LinkedIn-profile to most-likely-Instagram pipeline."""

from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import re

from .avatar_cache import cache_profile_avatar
from .face_matching import face_similarity
from .instagram_matching import score_instagram_candidate
from .instagram_search import (
    build_instagram_queries, extract_instagram_username, normalize_instagram_url,
    search_instagram_candidate_context,
    search_indexed_linkedin_profile, search_instagram_web, search_public_identity_context,
    search_public_social_aliases,
)
from .linkedin_profile import (
    enrich_identity_from_public_context, fallback_identity_from_url, fetch_linkedin_profile,
    identity_from_indexed_linkedin_results,
)
from .profile_avatar import fetch_profile_avatar


MAX_CANDIDATES = 10
CONTEXT_CANDIDATES = 3
AVATAR_FETCH_WORKERS = 5
FACE_MATCH_MIN_SIMILARITY = 0.45
FACE_MATCH_MIN_MARGIN = 0.04
FACE_SCORE_BONUS_BASE = 0.10
FACE_SCORE_BONUS_MAX = 0.15
FACE_MISMATCH_MAX_SIMILARITY = 0.05
FACE_MISMATCH_PENALTY = 0.08


def _direct_handle_candidates(identity):
    """Seed obvious handles even when public search indexes do not return them."""
    full_name = re.sub(r"[^a-z0-9]", "", (identity.get("name") or "").lower())
    public_id = (identity.get("public_id") or "").strip().lower()
    normalized_public_id = re.sub(r"[^a-z0-9]", "", public_id)
    handles = []
    if full_name:
        handles.append(full_name)
    # Preserve a LinkedIn slug only when it is itself the normalized full
    # name. Numeric IDs and unrelated custom slugs are not identity evidence.
    if (
        public_id and normalized_public_id == full_name
        and re.fullmatch(r"[a-z0-9._]{1,30}", public_id)
    ):
        handles.append(public_id)
    return {
        handle: {
            "username": handle,
            "url": "https://www.instagram.com/{}/".format(handle),
            "search_hits": 0,
            "matched_queries": [],
            "titles": [],
            "snippets": [],
            "direct_handle": True,
        }
        for handle in dict.fromkeys(handles)
    }


def _add_public_alias_candidates(identity, candidates):
    """Add handles that external public results associate with the exact name."""
    for alias in search_public_social_aliases(identity.get("name") or ""):
        username = alias["username"]
        supporting = alias.get("supporting_results") or []
        candidate = candidates.setdefault(username, {
            "username": username,
            "url": "https://www.instagram.com/{}/".format(username),
            "search_hits": 0,
            "matched_queries": [],
            "titles": [],
            "snippets": [],
        })
        candidate["cross_platform_alias_hits"] = len(supporting)
        candidate["alias_sources"] = []
        for source in supporting:
            # Retain compatibility with records produced by the original
            # tuple-based alias search while preferring auditable dictionaries.
            if isinstance(source, dict):
                normalized_source = {
                    "url": source.get("url", ""),
                    "title": source.get("title", ""),
                    "snippet": source.get("snippet", ""),
                    "domain": source.get("domain", ""),
                    "relationship": source.get("relationship", "mention"),
                }
            else:
                url, title, snippet = source
                normalized_source = {
                    "url": url, "title": title, "snippet": snippet,
                    "domain": "", "relationship": "mention",
                }
            if normalized_source not in candidate["alias_sources"]:
                candidate["alias_sources"].append(normalized_source)
            # Do not mix alias-page text into Instagram profile text. Otherwise
            # a company/name found on the same alias page would masquerade as
            # an independent Instagram corroboration signal.
    return candidates


def _collect_candidates(queries, candidates=None):
    candidates = candidates if candidates is not None else {}
    if not queries:
        return candidates
    workers = max(1, min(
        len(queries), int(os.getenv("INSTAGRAM_SEARCH_WORKERS", "4"))
    ))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        pending = {
            executor.submit(search_instagram_web, query): query for query in queries
        }
        completed = (
            (pending[future], future.result()) for future in as_completed(pending)
        )
        for query, results in completed:
            for item in results:
                url = normalize_instagram_url(item.get("link", ""))
                username = extract_instagram_username(url) if url else None
                if not username:
                    continue
                candidate = candidates.setdefault(username.lower(), {
                    "username": username, "url": url, "search_hits": 0,
                    "matched_queries": [], "titles": [], "snippets": [],
                })
                if query not in candidate["matched_queries"]:
                    candidate["matched_queries"].append(query)
                    candidate["search_hits"] += 1
                for key in ("title", "snippet"):
                    value = item.get(key)
                    target = candidate[key + "s"]
                    if isinstance(value, str) and value and value not in target:
                        target.append(value)
    return candidates


def _rank(identity, candidates):
    return sorted(
        [score_instagram_candidate(identity, candidate) for candidate in candidates],
        key=lambda candidate: candidate["score"], reverse=True,
    )


def _add_public_candidate_context(identity, candidates, preliminary_ranked):
    """Supplement only the leading candidates with indexed post context."""
    shortlisted = preliminary_ranked[:CONTEXT_CANDIDATES]
    with ThreadPoolExecutor(max_workers=max(1, len(shortlisted))) as executor:
        pending = {
            executor.submit(
                search_instagram_candidate_context, identity, ranked["username"]
            ): ranked["username"].lower()
            for ranked in shortlisted
        }
        for future in as_completed(pending):
            candidate = candidates.get(pending[future])
            if not candidate:
                continue
            try:
                context = future.result() or {}
            except Exception:
                continue
            candidate.update({
                key: context.get(key, [] if key.endswith(("urls", "terms", "queries")) else 0)
                for key in (
                    "school_context_hits", "location_context_hits",
                    "observed_location_terms", "post_context_urls", "context_queries",
                )
            })
            for source_key, target_key in (("context_titles", "titles"), ("context_snippets", "snippets")):
                for value in context.get(source_key, []):
                    if value and value not in candidate[target_key]:
                        candidate[target_key].append(value)
    return candidates


def _add_avatar_urls(identity, ranked):
    """Fetch known public avatar assets concurrently into the local cache."""
    targets = []
    if not identity.get("avatar_path"):
        targets.append((identity, "linkedin", identity["public_id"], identity["linkedin_url"]))
    targets.extend([
        (candidate, "instagram", candidate["username"], candidate["url"])
        for candidate in ranked if not candidate.get("avatar_path")
    ])
    with ThreadPoolExecutor(max_workers=AVATAR_FETCH_WORKERS) as executor:
        pending = {
            executor.submit(cache_profile_avatar, provider, identifier, url): output
            for output, provider, identifier, url in targets
        }
        for future in as_completed(pending):
            output = pending[future]
            try:
                output["avatar_path"] = future.result()
            except Exception:
                output["avatar_path"] = None


def _rerank_with_faces(identity, ranked):
    """Supplement text scores with bounded local face-match evidence."""
    reference_path = identity.get("avatar_path")
    for candidate in ranked:
        text_score = candidate["score"]
        similarity = face_similarity(reference_path, candidate.get("avatar_path"))
        bonus = 0.0
        penalty = 0.0
        if similarity is not None and similarity >= FACE_MATCH_MIN_SIMILARITY:
            progress = min(
                (similarity - FACE_MATCH_MIN_SIMILARITY)
                / (1.0 - FACE_MATCH_MIN_SIMILARITY),
                1.0,
            )
            bonus = FACE_SCORE_BONUS_BASE + (
                FACE_SCORE_BONUS_MAX - FACE_SCORE_BONUS_BASE
            ) * progress
        elif similarity is not None and similarity <= FACE_MISMATCH_MAX_SIMILARITY:
            # InsightFace returned usable embeddings for both portraits, but
            # they strongly disagree. Keep the penalty bounded because an
            # Instagram avatar can still be a group or non-current portrait.
            penalty = FACE_MISMATCH_PENALTY
        candidate["text_score"] = text_score
        candidate["face_similarity"] = similarity
        candidate["face_match_available"] = similarity is not None
        candidate["face_score_bonus"] = round(bonus, 3)
        candidate["face_score_penalty"] = round(penalty, 3)
        candidate["score"] = round(max(min(text_score + bonus - penalty, 1.0), 0.0), 3)
        if bonus:
            candidate.setdefault("evidence_families", []).append("face")
            candidate.setdefault("evidence", []).append("face_similarity_match")
        if penalty:
            candidate.setdefault("negative_evidence", []).append("face_similarity_mismatch")
        candidate["confidence"] = (
            "high" if candidate["score"] >= 0.80
            else "medium" if candidate["score"] >= 0.60
            else "low"
        )

    return sorted(
        ranked,
        key=lambda candidate: (
            candidate["score"],
            candidate["face_similarity"] if candidate["face_similarity"] is not None else -1.0,
            candidate["text_score"],
        ),
        reverse=True,
    )


def _verification_summary(best, second):
    """Explain whether independent evidence is sufficient for confirmation."""
    families = set(best.get("evidence_families") or [])
    margin = best["score"] - second["score"] if second else best["score"]
    strong = families & {"shared_slug", "face", "alias"}
    medium = families & {"name", "employment", "education", "location"}
    alias_has_independent_support = bool(
        "alias" not in families
        or families & {"shared_slug", "face", "employment", "education", "location"}
        or best.get("alias_source_domain_count", 0) >= 2
    )
    enough_families = bool(
        (strong and medium)
        or len(medium) >= 3
    )
    return {
        "score_threshold_met": best["score"] >= 0.80,
        "margin_threshold_met": second is None or margin >= 0.10,
        "score_margin": round(margin, 3),
        "evidence_families": sorted(families),
        "strong_evidence_families": sorted(strong),
        "medium_evidence_families": sorted(medium),
        "alias_has_independent_support": alias_has_independent_support,
        "independent_evidence_gate_met": enough_families and alias_has_independent_support,
    }


def find_instagram_from_linkedin(linkedin_url, fallback=False):
    """Resolve one known LinkedIn identity to an Instagram profile, if unambiguous."""
    if fallback:
        url_identity = fallback_identity_from_url(linkedin_url)
        indexed_results = search_indexed_linkedin_profile(
            url_identity["public_id"],
            url_identity["name"],
        )
        identity = identity_from_indexed_linkedin_results(linkedin_url, indexed_results)
        identity = enrich_identity_from_public_context(
            identity, search_public_identity_context(identity["name"])
        )
    else:
        identity = fetch_linkedin_profile(linkedin_url)
    queries = build_instagram_queries(identity)
    candidates = _direct_handle_candidates(identity)
    candidates = _add_public_alias_candidates(identity, candidates)
    candidates = _collect_candidates(queries, candidates)
    preliminary_ranked = _rank(identity, candidates.values())
    candidates = _add_public_candidate_context(identity, candidates, preliminary_ranked)
    ranked_candidates = _rank(identity, candidates.values())
    ranked = ranked_candidates[:MAX_CANDIDATES]
    _add_avatar_urls(identity, ranked)
    ranked = _rerank_with_faces(identity, ranked)
    result = {
        "status": "not_found", "linkedin": identity, "instagram": None,
        "candidates": ranked,
        "stats": {
            "queries_run": len(queries),
            "instagram_candidates_found": len(candidates),
            "candidates_returned": len(ranked),
            "candidate_limit": MAX_CANDIDATES,
            "face_reranking_attempted": bool(identity.get("avatar_path")),
            "public_context_candidates_checked": min(
                CONTEXT_CANDIDATES, len(preliminary_ranked)
            ),
        },
    }
    if not ranked:
        return result
    best, second = ranked[0], ranked[1] if len(ranked) > 1 else None
    face_verified = (
        best.get("face_similarity") is not None
        and best["face_similarity"] >= FACE_MATCH_MIN_SIMILARITY
        and best.get("text_score", 0.0) >= 0.35
        and (second is None or second.get("face_similarity") is None
             or best["face_similarity"] - second["face_similarity"] >= FACE_MATCH_MIN_MARGIN)
    )
    verification = _verification_summary(best, second)
    face_verified = face_verified and "name" in verification["evidence_families"]
    text_verified = (
        verification["score_threshold_met"]
        and verification["margin_threshold_met"]
        and verification["independent_evidence_gate_met"]
    )
    result["verification"] = dict(
        verification,
        face_verification_met=face_verified,
        text_verification_met=text_verified,
    )
    if face_verified or text_verified:
        result.update(status="matched", instagram=best)
    else:
        result["status"] = "ambiguous"
    return result
