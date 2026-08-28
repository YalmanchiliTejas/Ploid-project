"""CLI for the LinkedIn-to-Instagram enrichment pipeline."""

import argparse
import json

from dotenv import load_dotenv

from app.backend.enrichment import find_instagram_from_linkedin
from app.backend.enrichment.linkedin_profile import fetch_linkedin_profile


def _print_extracted_linkedin_information(identity):
    print("LINKEDIN INFORMATION EXTRACTED:")
    labels = (
        ("Name", identity.get("name")),
        ("Headline", identity.get("headline")),
        ("About", identity.get("about")),
        ("Current title", identity.get("current_title")),
        ("Current company", identity.get("current_company")),
        ("Companies/workplaces", ", ".join(identity.get("companies") or [])),
        ("Location", identity.get("location")),
        ("Schools", ", ".join(identity.get("schools") or [])),
        ("Source", identity.get("identity_source")),
    )
    for label, value in labels:
        print("- {}: {}".format(label, value or "not found"))


def _print_linkedin_page_components(identity):
    components = identity.get("page_components") or {}
    print("\nLINKEDIN PAGE COMPONENTS:")
    if not components:
        print("- not available (the fallback/search-index mode does not read the LinkedIn DOM)")
        return

    for key in ("name", "headline", "location"):
        component = components.get(key) or {}
        print("- {}: {}".format(key.title(), component.get("text") or "not found"))
        print("  selector: {}".format(component.get("selector") or "not matched"))

    for key, label in (("experience", "Workplaces / Experience"), ("education", "Education")):
        print("- {}:".format(label))
        sections = components.get(key) or []
        if not sections:
            print("  section not matched")
            continue
        for section in sections:
            print("  matched selector: {} ({})".format(
                section.get("selector") or "unknown",
                section.get("matched_by") or "unknown rule",
            ))
            entries = section.get("entries") or []
            if entries:
                for index, lines in enumerate(entries, 1):
                    print("  {}. {}".format(index, " | ".join(lines)))
            else:
                print("  section matched, but no visible <li> entries were found")
            print("  raw visible lines:")
            for line in section.get("raw_lines") or []:
                print("    > {}".format(line))

    print("- Section detection diagnostic:")
    sections_seen = components.get("sections_seen") or []
    if not sections_seen:
        print("  no visible <main><section> elements found")
    for section in sections_seen:
        ids = ", ".join(section.get("element_ids") or []) or "none"
        print("  {}. heading={!r}; ids={}; visible lines={}".format(
            section.get("index"), section.get("heading") or "",
            ids, section.get("visible_line_count", 0),
        ))
        preview = " | ".join(section.get("preview") or [])
        if preview:
            print("     preview: {}".format(preview))


def main():
    parser = argparse.ArgumentParser(description="Find the likely Instagram account for a LinkedIn URL.")
    parser.add_argument("linkedin_url", help="https://www.linkedin.com/in/<public-id>/")
    parser.add_argument(
        "--fallback",
        action="store_true",
        help="Do not call LinkedIn; derive limited search terms from the public URL.",
    )
    parser.add_argument(
        "--linkedin-only",
        action="store_true",
        help="Inspect LinkedIn fields and visible page components without searching Instagram.",
    )
    args = parser.parse_args()
    load_dotenv()
    if args.linkedin_only:
        if args.fallback:
            parser.error("--linkedin-only cannot be combined with --fallback")
        identity = fetch_linkedin_profile(args.linkedin_url)
        _print_extracted_linkedin_information(identity)
        _print_linkedin_page_components(identity)
        print("\nNORMALIZED LINKEDIN JSON:")
        print(json.dumps(identity, indent=2, ensure_ascii=False))
        return

    result = find_instagram_from_linkedin(args.linkedin_url, fallback=args.fallback)
    identity = result.get("linkedin") or {}
    _print_extracted_linkedin_information(identity)
    _print_linkedin_page_components(identity)
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
