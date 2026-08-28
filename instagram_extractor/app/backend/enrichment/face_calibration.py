"""Threshold calibration helpers for labeled face-comparison samples."""


def _rate(values, predicate):
    return sum(1 for value in values if predicate(value)) / len(values) if values else 0.0


def calibrate_thresholds(samples, max_false_match_rate=0.01,
                         max_false_mismatch_rate=0.01):
    """Choose a conservative gray-zone pair from labeled cosine similarities."""
    genuine = sorted(float(sample["similarity"]) for sample in samples if sample["same_person"])
    impostor = sorted(float(sample["similarity"]) for sample in samples if not sample["same_person"])
    if not genuine or not impostor:
        raise ValueError("Calibration requires both same-person and different-person samples.")

    match_candidates = sorted(set(genuine + impostor))
    match_threshold = next((
        threshold for threshold in match_candidates
        if _rate(impostor, lambda score: score >= threshold) <= max_false_match_rate
    ), max(match_candidates) + 1e-6)

    mismatch_candidates = sorted(set(genuine + impostor), reverse=True)
    mismatch_threshold = next((
        threshold for threshold in mismatch_candidates
        if threshold < match_threshold
        and _rate(genuine, lambda score: score <= threshold) <= max_false_mismatch_rate
    ), min(match_candidates) - 1e-6)

    return {
        "match_threshold": round(match_threshold, 4),
        "mismatch_threshold": round(mismatch_threshold, 4),
        "same_person_samples": len(genuine),
        "different_person_samples": len(impostor),
        "max_false_match_rate": max_false_match_rate,
        "max_false_mismatch_rate": max_false_mismatch_rate,
        "observed_false_match_rate": round(
            _rate(impostor, lambda score: score >= match_threshold), 6
        ),
        "observed_false_mismatch_rate": round(
            _rate(genuine, lambda score: score <= mismatch_threshold), 6
        ),
    }
