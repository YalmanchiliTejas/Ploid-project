"""Run LinkedIn-to-Instagram lookups from a text file into one JSON file."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path

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
        social_fallback = result.get("social_fallback") or {}
        twitter = social_fallback.get("twitter") or {}
        facebook = social_fallback.get("facebook") or {}
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
            "face_outcome": instagram.get("face_outcome", "inconclusive"),
            "face_match_available": instagram.get("face_match_available", False),
            "face_comparison": instagram.get("face_comparison", {}),
            "confidence": instagram.get("confidence"),
            "verification": result.get("verification", {}),
            "refinement": result.get("refinement", {}),
            # Keep confirmed matches distinct, while making a discovered but
            # ambiguous leading candidate visible at the top level.
            "potential_instagram_url": leading_candidate.get("url"),
            "potential_instagram_username": leading_candidate.get("username"),
            "potential_score": leading_candidate.get("score"),
            "twitter_url": twitter.get("url"),
            "twitter_username": twitter.get("username"),
            "facebook_url": facebook.get("url"),
            "facebook_username": facebook.get("username"),
            "social_fallback": social_fallback,
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
                    "face_outcome": candidate.get("face_outcome", "inconclusive"),
                    "face_match_available": candidate.get("face_match_available", False),
                    "face_comparison": candidate.get("face_comparison", {}),
                    "confidence": candidate.get("confidence"),
                    "evidence": candidate.get("evidence", []),
                    "signals": candidate.get("signals", {}),
                    "display_name_variant": candidate.get("display_name_variant", False),
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
                    "company_context_hits": candidate.get("company_context_hits", 0),
                    "observed_company_terms": candidate.get("observed_company_terms", []),
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


_EXCEL_COLUMNS = (
    ("Name", "name"),
    ("LinkedIn URL", "linkedin_url"),
    ("Status", "status"),
    ("Instagram Username", "instagram_username"),
    ("Instagram URL", "instagram_url"),
    ("Account Type", "account_type"),
    ("Twitter/X URL", "twitter_url"),
    ("Facebook URL", "facebook_url"),
    ("Score", "score"),
    ("Confidence", "confidence"),
    ("Current Company", "current_company"),
    ("Current Title", "current_title"),
    ("Location", "location"),
    ("Face Outcome", "face_outcome"),
    ("Face Similarity", "face_similarity"),
    ("Error", "error"),
)


def _excel_path(json_path, configured_path=None):
    """Return the configured workbook path or place it beside the JSON output."""
    if configured_path:
        return configured_path
    return str(Path(json_path).with_suffix(".xlsx"))


def _spreadsheet_row(record, include_potential=False):
    """Flatten one final batch record into spreadsheet-friendly columns."""
    identity = record.get("linkedin_extracted") or {}
    instagram_url = record.get("instagram_url")
    instagram_username = record.get("instagram_username")
    score = record.get("score")
    account_type = "confirmed" if instagram_url else ""
    if not instagram_url and include_potential:
        instagram_url = record.get("potential_instagram_url")
        instagram_username = record.get("potential_instagram_username")
        score = record.get("potential_score")
        account_type = "potential" if instagram_url else ""
    return {
        "name": identity.get("name"),
        "linkedin_url": record.get("linkedin_url"),
        "status": record.get("status"),
        "instagram_username": instagram_username,
        "instagram_url": instagram_url,
        "account_type": account_type,
        "twitter_url": record.get("twitter_url"),
        "facebook_url": record.get("facebook_url"),
        "score": score,
        "confidence": record.get("confidence"),
        "current_company": identity.get("current_company"),
        "current_title": identity.get("current_title"),
        "location": identity.get("location"),
        "face_outcome": record.get("face_outcome"),
        "face_similarity": record.get("face_similarity"),
        "error": record.get("error"),
    }


def _safe_excel_value(value):
    """Prevent untrusted profile text from being interpreted as an Excel formula."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def _add_excel_sheet(workbook, title, rows):
    from openpyxl.styles import Font

    sheet = workbook.create_sheet(title)
    sheet.append([heading for heading, _ in _EXCEL_COLUMNS])
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for row in rows:
        sheet.append([
            _safe_excel_value(row.get(field)) for _, field in _EXCEL_COLUMNS
        ])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    sheet.column_dimensions["A"].width = 24
    sheet.column_dimensions["B"].width = 42
    sheet.column_dimensions["C"].width = 14
    sheet.column_dimensions["D"].width = 24
    sheet.column_dimensions["E"].width = 42
    sheet.column_dimensions["G"].width = 36
    sheet.column_dimensions["H"].width = 42
    for column in (2, 5, 7, 8):
        for cell in list(sheet.columns)[column - 1][1:]:
            if isinstance(cell.value, str) and cell.value.startswith(("http://", "https://")):
                cell.hyperlink = cell.value
                cell.style = "Hyperlink"
    return sheet


def _write_excel(path, urls, records):
    """Atomically export confirmed accounts and the complete review queue."""
    from openpyxl import Workbook

    profiles = [records[url] for url in urls if url in records]
    workbook = Workbook()
    workbook.remove(workbook.active)
    _add_excel_sheet(
        workbook,
        "Final Accounts",
        [_spreadsheet_row(profile) for profile in profiles if profile.get("instagram_url")],
    )
    _add_excel_sheet(
        workbook,
        "All Results",
        [_spreadsheet_row(profile, include_potential=True) for profile in profiles],
    )
    temporary = str(path) + ".tmp.xlsx"
    workbook.save(temporary)
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


def _retry_result(existing, attempted):
    """Keep usable saved evidence when a live retry fails transiently."""
    existing_name = ((existing or {}).get("linkedin_extracted") or {}).get("name", "")
    invalid_existing_name = existing_name.strip().lower() in {
        "about", "activity", "education", "experience", "sign in", "linkedin",
    }
    if (
        attempted.get("status") == "error"
        and existing
        and existing.get("status") != "error"
        and not invalid_existing_name
    ):
        retained = dict(existing)
        retained["last_retry_error_type"] = attempted.get("error_type")
        retained["last_retry_error"] = attempted.get("error")
        return retained
    return attempted


def main():
    parser = argparse.ArgumentParser(description="Resolve a file of LinkedIn URLs to Instagram URLs.")
    parser.add_argument("input", nargs="?", default="linkedin_urls.txt", help="one LinkedIn URL per line")
    parser.add_argument("--output", default="instagram_profiles.json", help="combined JSON output path")
    parser.add_argument(
        "--excel-output",
        help="Excel output path (default: the JSON output name with an .xlsx extension)",
    )
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
        help="reprocess ambiguous/inconclusive records and inconclusive face matches",
    )
    args = parser.parse_args()
    load_dotenv()
    excel_output = _excel_path(args.output, args.excel_output)

    urls = _urls(args.input)
    records = {} if args.restart else _existing_records(args.output)
    pending_urls = [
        url for url in urls
        if (
            url not in records
            or records[url].get("status") == "error"
            or (
                args.retry_ambiguous
                and (
                    records[url].get("status") in {"ambiguous", "inconclusive"}
                    or records[url].get("face_outcome") == "inconclusive"
                )
            )
        )
    ]
    if records:
        print("Resuming with {} previously saved profile(s).".format(len(records)))
    workers = max(1, min(args.workers, len(pending_urls) or 1))
    completed_count = len(urls) - len(pending_urls)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        pending = {
            executor.submit(_record, url, args.fallback): url for url in pending_urls
        }
        for future in as_completed(pending):
            url = pending[future]
            completed_count += 1
            attempted = future.result()
            records[url] = _retry_result(records.get(url), attempted)
            _write_output(args.output, urls, records)
            _write_excel(excel_output, urls, records)
            record = records[url]
            identity = record.get("linkedin_extracted") or {}
            displayed_match = record.get("instagram_url")
            if not displayed_match and record.get("potential_instagram_url"):
                displayed_match = "potential: {}".format(record["potential_instagram_url"])
            status = record.get("status")
            if attempted.get("status") == "error" and record is not attempted:
                status = "retry failed; retained {}".format(status)
            print(
                "[{}/{}] {} | {} | {} | workplace: {} | location: {} | source: {}".format(
                    completed_count,
                    len(urls),
                    identity.get("name") or url,
                    status,
                    displayed_match or "no Instagram candidate found",
                    identity.get("current_company") or "not found",
                    identity.get("location") or "not found",
                    identity.get("source") or "not found",
                ),
                flush=True,
            )

    _write_output(args.output, urls, records)
    _write_excel(excel_output, urls, records)
    print("Wrote {} profiles to {}".format(len(records), args.output))
    print("Wrote Excel results to {}".format(excel_output))


if __name__ == "__main__":
    main()
