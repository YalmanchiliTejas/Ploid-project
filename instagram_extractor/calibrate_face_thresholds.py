"""Calibrate face match/mismatch thresholds from labeled local image pairs."""

import argparse
import json

from dotenv import load_dotenv

from app.backend.enrichment.face_calibration import calibrate_thresholds
from app.backend.enrichment.face_matching import compare_face_images


def _load_pairs(path):
    with open(path, encoding="utf-8") as source:
        value = json.load(source)
    pairs = value.get("pairs", value) if isinstance(value, dict) else value
    if not isinstance(pairs, list):
        raise ValueError("Expected a JSON list or an object containing a `pairs` list.")
    return pairs


def main():
    parser = argparse.ArgumentParser(
        description="Calibrate face thresholds from labeled same/different-person image pairs."
    )
    parser.add_argument("input", help="JSON file containing labeled image-path pairs")
    parser.add_argument("--output", default="face_calibration.json")
    parser.add_argument("--max-false-match-rate", type=float, default=0.01)
    parser.add_argument("--max-false-mismatch-rate", type=float, default=0.01)
    args = parser.parse_args()
    load_dotenv()

    samples, skipped = [], 0
    for pair in _load_pairs(args.input):
        comparison = compare_face_images(
            pair.get("reference_paths") or [pair.get("reference_path")],
            pair.get("candidate_paths") or [pair.get("candidate_path")],
        )
        if comparison["similarity"] is None:
            skipped += 1
            continue
        samples.append({
            "same_person": bool(pair["same_person"]),
            "similarity": comparison["similarity"],
        })
    calibration = calibrate_thresholds(
        samples,
        max_false_match_rate=args.max_false_match_rate,
        max_false_mismatch_rate=args.max_false_mismatch_rate,
    )
    calibration["usable_pairs"] = len(samples)
    calibration["skipped_inconclusive_pairs"] = skipped
    with open(args.output, "w", encoding="utf-8") as destination:
        json.dump(calibration, destination, indent=2)
        destination.write("\n")
    print("Wrote calibrated thresholds to {}".format(args.output))
    print("Set FACE_MATCH_CALIBRATION_FILE={} to use them.".format(args.output))


if __name__ == "__main__":
    main()
