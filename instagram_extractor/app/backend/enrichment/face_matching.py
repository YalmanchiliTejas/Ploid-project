"""Quality-aware local face comparison for optional candidate reranking.

The module loads InsightFace lazily so text-only enrichment remains available
without the optional ML runtime. A comparison has three outcomes: ``match``,
``mismatch``, or ``inconclusive``. Low-quality and multi-face observations are
never treated as negative identity evidence.
"""

from functools import lru_cache
import json
import os
from pathlib import Path


DEFAULT_MATCH_THRESHOLD = 0.45
DEFAULT_MISMATCH_THRESHOLD = 0.05
DEFAULT_MIN_FACE_SIZE = 64
DEFAULT_MIN_DETECTION_SCORE = 0.75
DEFAULT_MIN_BLUR_SCORE = 35.0
DEFAULT_MAX_ABS_POSE = 35.0
DEFAULT_MIN_LANDMARK_COVERAGE = 0.8
DEFAULT_MIN_ALIGNMENT_SCORE = 0.6
TEMPLATE_CLUSTER_THRESHOLD = 0.35


def _float_setting(name, default):
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return float(default)


@lru_cache(maxsize=8)
def _read_calibration(path, modified_time):
    del modified_time  # Included in the cache key so edits are picked up.
    try:
        with open(path, encoding="utf-8") as source:
            calibration = json.load(source)
        return (
            float(calibration["match_threshold"]),
            float(calibration["mismatch_threshold"]),
        )
    except (FileNotFoundError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def configured_thresholds():
    """Load calibrated thresholds when configured, otherwise use environment defaults."""
    calibration_path = os.getenv("FACE_MATCH_CALIBRATION_FILE", "").strip()
    if calibration_path:
        path = Path(calibration_path).expanduser().resolve()
        try:
            calibrated = _read_calibration(str(path), path.stat().st_mtime_ns)
        except OSError:
            calibrated = None
        if calibrated and calibrated[0] > calibrated[1]:
            return calibrated
    return (
        _float_setting("FACE_MATCH_MIN_SIMILARITY", DEFAULT_MATCH_THRESHOLD),
        _float_setting("FACE_MISMATCH_MAX_SIMILARITY", DEFAULT_MISMATCH_THRESHOLD),
    )


@lru_cache(maxsize=1)
def _face_app():
    """Create one reusable embedding model per process."""
    from insightface.app import FaceAnalysis

    providers = [provider.strip() for provider in os.getenv(
        "FACE_MATCH_PROVIDERS", "CPUExecutionProvider"
    ).split(",") if provider.strip()]
    app = FaceAnalysis(name=os.getenv("FACE_MATCH_MODEL", "buffalo_l"), providers=providers)
    app.prepare(ctx_id=int(os.getenv("FACE_MATCH_CTX_ID", "-1")), det_size=(640, 640))
    return app


def _normalized(vector):
    import numpy as np

    norm = float(np.linalg.norm(vector))
    return vector / norm if norm else vector


def _quality_reasons(observation):
    reasons = []
    min_size = _float_setting("FACE_MATCH_MIN_FACE_SIZE", DEFAULT_MIN_FACE_SIZE)
    if min(observation["face_width"], observation["face_height"]) < min_size:
        reasons.append("face_too_small")
    if observation["detection_score"] < _float_setting(
        "FACE_MATCH_MIN_DETECTION_SCORE", DEFAULT_MIN_DETECTION_SCORE
    ):
        reasons.append("low_detection_confidence")
    if observation["blur_score"] < _float_setting(
        "FACE_MATCH_MIN_BLUR_SCORE", DEFAULT_MIN_BLUR_SCORE
    ):
        reasons.append("heavy_blur")
    if max((abs(value) for value in observation["pose_degrees"]), default=0.0) > _float_setting(
        "FACE_MATCH_MAX_ABS_POSE", DEFAULT_MAX_ABS_POSE
    ):
        reasons.append("extreme_pose")
    if observation["landmark_coverage"] < _float_setting(
        "FACE_MATCH_MIN_LANDMARK_COVERAGE", DEFAULT_MIN_LANDMARK_COVERAGE
    ):
        reasons.append("unreliable_landmarks")
    if observation.get("alignment_score", observation["landmark_coverage"]) < _float_setting(
        "FACE_MATCH_MIN_ALIGNMENT_SCORE", DEFAULT_MIN_ALIGNMENT_SCORE
    ):
        reasons.append("poor_alignment")
    return reasons


def _public_observation(observation):
    output = {key: value for key, value in observation.items() if key != "_embedding"}
    reasons = _quality_reasons(observation)
    output["quality_reasons"] = reasons
    output["usable"] = not reasons
    return output


def _observe_face(image, face, image_path, face_index):
    import cv2
    import numpy as np

    image_height, image_width = image.shape[:2]
    x1, y1, x2, y2 = [float(value) for value in face.bbox]
    left, top = max(int(x1), 0), max(int(y1), 0)
    right, bottom = min(int(x2 + 0.999), image_width), min(int(y2 + 0.999), image_height)
    crop = image[top:bottom, left:right]
    if crop.size:
        grayscale = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(grayscale, cv2.CV_64F).var())
    else:
        blur_score = 0.0

    landmarks = getattr(face, "kps", None)
    if landmarks is None or len(landmarks) == 0:
        landmark_coverage = 0.0
        alignment_score = 0.0
    else:
        finite = np.isfinite(landmarks).all(axis=1)
        inside = (
            (landmarks[:, 0] >= 0) & (landmarks[:, 0] < image_width)
            & (landmarks[:, 1] >= 0) & (landmarks[:, 1] < image_height)
        )
        landmark_coverage = float(np.mean(finite & inside))
        landmark_face_width = max(x2 - x1, 0.0)
        if len(landmarks) >= 5 and landmark_face_width:
            eye_distance = float(np.linalg.norm(landmarks[1] - landmarks[0]))
            vertical_order = float(
                np.mean(landmarks[:2, 1]) < landmarks[2, 1]
                < np.mean(landmarks[3:5, 1])
            )
            alignment_score = min(
                landmark_coverage * min(eye_distance / (landmark_face_width * 0.25), 1.0)
                * (0.5 + 0.5 * vertical_order),
                1.0,
            )
        else:
            alignment_score = 0.0

    pose = getattr(face, "pose", None)
    pose_degrees = [round(float(value), 2) for value in pose] if pose is not None else []
    face_width, face_height = max(x2 - x1, 0.0), max(y2 - y1, 0.0)
    size_quality = min(min(face_width, face_height) / 112.0, 1.0)
    detection_quality = min(max((float(face.det_score) - 0.5) / 0.5, 0.0), 1.0)
    blur_quality = min(blur_score / 100.0, 1.0)
    pose_quality = max(1.0 - max((abs(value) for value in pose_degrees), default=0.0) / 60.0, 0.0)
    quality_score = round(float(np.mean([
        size_quality, detection_quality, blur_quality, pose_quality,
        landmark_coverage, alignment_score,
    ])), 3)
    occlusion_risk = (
        "possible" if landmark_coverage < 1.0 or alignment_score < 0.6 else "unknown"
    )
    return {
        "image_path": image_path,
        "face_index": face_index,
        "image_width": image_width,
        "image_height": image_height,
        "bbox": [round(value, 2) for value in (x1, y1, x2, y2)],
        "face_width": round(face_width, 2),
        "face_height": round(face_height, 2),
        "detection_score": round(float(face.det_score), 4),
        "blur_score": round(blur_score, 2),
        "pose_degrees": pose_degrees,
        "landmark_coverage": round(landmark_coverage, 3),
        "alignment_score": round(alignment_score, 3),
        "occlusion_risk": occlusion_risk,
        "quality_score": quality_score,
        "_embedding": face.normed_embedding,
    }


@lru_cache(maxsize=1024)
def _analyze_image(image_path):
    if not image_path:
        return None
    try:
        import cv2

        image = cv2.imread(image_path)
        if image is None:
            return None
        faces = _face_app().get(image)
        observations = [
            _observe_face(image, face, image_path, index)
            for index, face in enumerate(faces)
        ]
        return {
            "image_path": image_path,
            "image_width": int(image.shape[1]),
            "image_height": int(image.shape[0]),
            "face_count": len(observations),
            "faces": observations,
        }
    except (ImportError, OSError, RuntimeError, ValueError):
        return None


def analyze_face_images(image_paths):
    """Return serializable face and quality metadata for local images."""
    analyses = []
    for path in dict.fromkeys(path for path in image_paths or [] if path):
        analysis = _analyze_image(path)
        if not analysis:
            continue
        analyses.append({
            **{key: value for key, value in analysis.items() if key != "faces"},
            "faces": [_public_observation(face) for face in analysis["faces"]],
        })
    return analyses


def _usable_observations(analyses):
    return [
        face for analysis in analyses for face in analysis["faces"]
        if not _quality_reasons(face)
    ]


def _weighted_template(observations):
    import numpy as np

    if not observations:
        return None
    weighted = sum(
        observation["_embedding"] * max(observation["quality_score"], 0.01)
        for observation in observations
    )
    return _normalized(np.asarray(weighted))


def _cluster_observations(observations):
    """Greedily group recurring candidate faces across associated images."""
    import numpy as np

    clusters = []
    for observation in sorted(
        observations, key=lambda item: item["quality_score"], reverse=True
    ):
        best_cluster, best_similarity = None, -1.0
        for cluster in clusters:
            similarity = float(np.dot(
                observation["_embedding"], _weighted_template(cluster)
            ))
            if similarity > best_similarity:
                best_cluster, best_similarity = cluster, similarity
        if best_cluster is not None and best_similarity >= TEMPLATE_CLUSTER_THRESHOLD:
            best_cluster.append(observation)
        else:
            clusters.append([observation])
    return clusters


def compare_face_images(reference_paths, candidate_paths, match_threshold=None,
                        mismatch_threshold=None):
    """Compare all usable faces and return a quality-aware tri-state result."""
    import numpy as np

    reference_paths = list(dict.fromkeys(path for path in reference_paths or [] if path))
    candidate_paths = list(dict.fromkeys(path for path in candidate_paths or [] if path))
    reference_analyses = [analysis for path in reference_paths if (analysis := _analyze_image(path))]
    candidate_analyses = [analysis for path in candidate_paths if (analysis := _analyze_image(path))]
    references = _usable_observations(reference_analyses)
    candidates = _usable_observations(candidate_analyses)
    configured_match, configured_mismatch = configured_thresholds()
    result = {
        "outcome": "inconclusive",
        "similarity": None,
        "match_threshold": float(
            match_threshold if match_threshold is not None else configured_match
        ),
        "mismatch_threshold": float(
            mismatch_threshold if mismatch_threshold is not None else configured_mismatch
        ),
        "reference_images": analyze_face_images(reference_paths),
        "candidate_images": analyze_face_images(candidate_paths),
        "reference_usable_face_count": len(references),
        "candidate_usable_face_count": len(candidates),
        "candidate_has_multiple_faces": any(
            analysis["face_count"] > 1 for analysis in candidate_analyses
        ),
        "reference_has_multiple_faces": any(
            analysis["face_count"] > 1 for analysis in reference_analyses
        ),
        "comparison_method": None,
        "best_pair": None,
        "reason": None,
    }
    if not reference_analyses or not candidate_analyses:
        result["reason"] = "image_unavailable"
        return result
    if not references or not candidates:
        result["reason"] = "no_usable_face"
        return result

    pair_scores = []
    for reference in references:
        for candidate in candidates:
            pair_scores.append((
                float(np.dot(reference["_embedding"], candidate["_embedding"])),
                reference, candidate,
            ))
    best_pair_score, best_reference, best_candidate = max(pair_scores, key=lambda item: item[0])

    reference_template = _weighted_template(references)
    clusters = _cluster_observations(candidates)
    recurring_clusters = [
        cluster for cluster in clusters
        if len({item["image_path"] for item in cluster}) >= 2
    ]
    if recurring_clusters:
        template_scores = [
            (float(np.dot(reference_template, _weighted_template(cluster))), cluster)
            for cluster in recurring_clusters
        ]
        similarity, selected_cluster = max(template_scores, key=lambda item: item[0])
        result["comparison_method"] = "quality_weighted_recurring_template"
        result["template_image_count"] = len({
            item["image_path"] for item in selected_cluster
        })
    else:
        similarity = best_pair_score
        result["comparison_method"] = "best_usable_face_pair"
        result["template_image_count"] = 1

    result["similarity"] = round(similarity, 4)
    result["best_pair"] = {
        "similarity": round(best_pair_score, 4),
        "reference_image_path": best_reference["image_path"],
        "reference_face_index": best_reference["face_index"],
        "candidate_image_path": best_candidate["image_path"],
        "candidate_face_index": best_candidate["face_index"],
    }
    if similarity >= result["match_threshold"]:
        result["outcome"] = "match"
        result["reason"] = "similarity_above_match_threshold"
    else:
        single_face_evidence = bool(reference_analyses and candidate_analyses) and all(
            analysis["face_count"] == 1
            and len(_usable_observations([analysis])) == 1
            for analysis in reference_analyses
        ) and all(
            analysis["face_count"] == 1
            and len(_usable_observations([analysis])) == 1
            for analysis in candidate_analyses
        )
        if single_face_evidence and similarity <= result["mismatch_threshold"]:
            result["outcome"] = "mismatch"
            result["reason"] = "high_quality_single_face_below_mismatch_threshold"
        elif result["candidate_has_multiple_faces"] or result["reference_has_multiple_faces"]:
            result["reason"] = "multi_face_negative_evidence_suppressed"
        else:
            result["reason"] = "similarity_in_uncertain_range"
    return result


def face_similarity(reference_path, candidate_path):
    """Backward-compatible similarity accessor for one image on each side."""
    result = compare_face_images([reference_path], [candidate_path])
    return result["similarity"]
