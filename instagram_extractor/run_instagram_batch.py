"""Run LinkedIn-to-Instagram lookups from a text file into one JSON file."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os

from dotenv import load_dotenv

from app.backend.enrichment import find_instagram_from_linkedin


def _urls(path):
    with open(path, encoding="utf-8") as source:
        return [line.strip() for line in source if line.strip() and not line.lstrip().startswith("#")]


def _record(linkedin_url, fallback):
    try:
        result = find_instagram_from_linkedin(linkedin_url, fallback=fallback)
        instagram = result.get("instagram") or {}
        identity = result.get("linkedin") or {}
        candidates = result.get("candidates") or []
        leading_candidate = candidates[0] if candidates else {}
        return {
            "linkedin_url": linkedin_url,
            "status": result["status"],
            "instagram_url": instagram.get("url"),
            "instagram_username": instagram.get("username"),
            "score": instagram.get("score"),
            "text_score": instagram.get("text_score"),
            "face_score_bonus": instagram.get("face_score_bonus"),
            "face_score_penalty": instagram.get("face_score_penalty"),
            "face_similarity": instagram.get("face_similarity"),
            "face_match_available": instagram.get("face_match_available", False),
            "confidence": instagram.get("confidence"),
            "verification": result.get("verification", {}),
            # Keep confirmed matches distinct, while making a discovered but
            # ambiguous leading candidate visible at the top level.
            "potential_instagram_url": leading_candidate.get("url"),
            "potential_instagram_username": leading_candidate.get("username"),
            "potential_score": leading_candidate.get("score"),
            "linkedin_extracted": {
                "name": identity.get("name"),
                "headline": identity.get("headline"),
                "about": identity.get("about"),
                "current_title": identity.get("current_title"),
                "current_company": identity.get("current_company"),
                "location": identity.get("location"),
                "schools": identity.get("schools", []),
                "source": identity.get("identity_source"),
            },
            "candidates": [
                {
                    "instagram_url": candidate.get("url"),
                    "instagram_username": candidate.get("username"),
                    "score": candidate.get("score"),
                    "text_score": candidate.get("text_score"),
                    "face_score_bonus": candidate.get("face_score_bonus"),
                    "face_score_penalty": candidate.get("face_score_penalty"),
                    "face_similarity": candidate.get("face_similarity"),
                    "face_match_available": candidate.get("face_match_available", False),
                    "confidence": candidate.get("confidence"),
                    "evidence": candidate.get("evidence", []),
                    "signals": candidate.get("signals", {}),
                    "search_hits": candidate.get("search_hits", 0),
                    "matched_queries": candidate.get("matched_queries", []),
                    "evidence_families": candidate.get("evidence_families", []),
                    "negative_evidence": candidate.get("negative_evidence", []),
                    "alias_bonus": candidate.get("alias_bonus", 0.0),
                    "alias_reliable": candidate.get("alias_reliable", False),
                    "alias_independently_corroborated": candidate.get(
                        "alias_independently_corroborated", False
                    ),
                    "alias_sources": candidate.get("alias_sources", []),
                    "school_context_hits": candidate.get("school_context_hits", 0),
                    "location_context_hits": candidate.get("location_context_hits", 0),
                    "observed_location_terms": candidate.get("observed_location_terms", []),
                    "post_context_urls": candidate.get("post_context_urls", []),
                }
                for candidate in candidates
            ],
        }
    except Exception as error:  # Keep one failed profile from stopping the batch.
        return {
            "linkedin_url": linkedin_url,
            "status": "error",
            "error_type": type(error).__name__,
            "error": str(error),
        }


def _write_output(path, urls, records):
    profiles = [records[url] for url in urls if url in records]
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as destination:
        json.dump({"profiles": profiles}, destination, indent=2, ensure_ascii=False)
        destination.write("\n")
    os.replace(temporary, path)


def _existing_records(path):
    try:
        with open(path, encoding="utf-8") as source:
            profiles = json.load(source).get("profiles", [])
    except (FileNotFoundError, json.JSONDecodeError, OSError, AttributeError):
        return {}
    return {
        profile["linkedin_url"]: profile for profile in profiles
        if isinstance(profile, dict) and profile.get("linkedin_url")
    }


def main():
    parser = argparse.ArgumentParser(description="Resolve a file of LinkedIn URLs to Instagram URLs.")
    parser.add_argument("input", nargs="?", default="linkedin_urls.txt", help="one LinkedIn URL per line")
    parser.add_argument("--output", default="instagram_profiles.json", help="combined JSON output path")
    parser.add_argument(
        "--fallback",
        action="store_true",
        help="Do not call LinkedIn; derive limited search terms from each public URL.",
    )
    parser.add_argument(
        "--workers", type=int, default=2,
        help="number of profiles to process concurrently (default: 2)",
    )
    parser.add_argument(
        "--restart", action="store_true",
        help="ignore completed records already present in the output file",
    )
    parser.add_argument(
        "--retry-ambiguous", action="store_true",
        help="reprocess ambiguous records while retaining matched records",
    )
    args = parser.parse_args()
    load_dotenv()

    urls = _urls(args.input)
    records = {} if args.restart else _existing_records(args.output)
    pending_urls = [
        url for url in urls
        if (
            url not in records
            or records[url].get("status") == "error"
            or (args.retry_ambiguous and records[url].get("status") == "ambiguous")
        )
    ]
    if records:
        print("Resuming with {} previously saved profile(s).".format(len(records)))
    workers = max(1, min(args.workers, len(pending_urls) or 1))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        pending = {
            executor.submit(_record, url, args.fallback): url for url in pending_urls
        }
        for future in as_completed(pending):
            url = pending[future]
            records[url] = future.result()
            _write_output(args.output, urls, records)
            record = records[url]
            identity = record.get("linkedin_extracted") or {}
            displayed_match = record.get("instagram_url")
            if not displayed_match and record.get("potential_instagram_url"):
                displayed_match = "potential: {}".format(record["potential_instagram_url"])
            print(
                "[{}/{}] {} | {} | {}".format(
                    len([item for item in urls if item in records]),
                    len(urls),
                    identity.get("name") or url,
                    record.get("status"),
                    displayed_match or "no Instagram candidate found",
                ),
                flush=True,
            )

    _write_output(args.output, urls, records)
    print("Wrote {} profiles to {}".format(len(records), args.output))


if __name__ == "__main__":
    main()
