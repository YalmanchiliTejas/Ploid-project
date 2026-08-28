"""CLI for the LinkedIn-to-Instagram enrichment pipeline."""

import argparse
import json

from dotenv import load_dotenv

from app.backend.enrichment import find_instagram_from_linkedin


def _print_extracted_linkedin_information(identity):
    print("LINKEDIN INFORMATION EXTRACTED:")
    labels = (
        ("Name", identity.get("name")),
        ("Headline", identity.get("headline")),
        ("About", identity.get("about")),
        ("Current title", identity.get("current_title")),
        ("Current company", identity.get("current_company")),
        ("Location", identity.get("location")),
        ("Schools", ", ".join(identity.get("schools") or [])),
        ("Source", identity.get("identity_source")),
    )
    for label, value in labels:
        print("- {}: {}".format(label, value or "not found"))


def main():
    parser = argparse.ArgumentParser(description="Find the likely Instagram account for a LinkedIn URL.")
    parser.add_argument("linkedin_url", help="https://www.linkedin.com/in/<public-id>/")
    parser.add_argument(
        "--fallback",
        action="store_true",
        help="Do not call LinkedIn; derive limited search terms from the public URL.",
    )
    args = parser.parse_args()
    load_dotenv()
    result = find_instagram_from_linkedin(args.linkedin_url, fallback=args.fallback)
    _print_extracted_linkedin_information(result.get("linkedin") or {})
    instagram = result.get("instagram") or {}
    if result.get("status") == "matched" and instagram.get("url"):
        print(
            "MATCH: This Instagram account matches the LinkedIn profile: {}".format(
                instagram["url"]
            )
        )
    print(json.dumps(
        result,
        indent=2,
        ensure_ascii=False,
    ))


if __name__ == "__main__":
    main()
