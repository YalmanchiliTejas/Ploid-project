import unittest
from unittest.mock import patch

import numpy as np

from app.backend.enrichment.face_calibration import calibrate_thresholds
from app.backend.enrichment.face_matching import compare_face_images


def _face(path, index, embedding, size=100):
    vector = np.asarray(embedding, dtype=float)
    vector /= np.linalg.norm(vector)
    return {
        "image_path": path,
        "face_index": index,
        "image_width": 200,
        "image_height": 200,
        "bbox": [0, 0, size, size],
        "face_width": size,
        "face_height": size,
        "detection_score": 0.95,
        "blur_score": 100.0,
        "pose_degrees": [0.0, 0.0, 0.0],
        "landmark_coverage": 1.0,
        "alignment_score": 1.0,
        "occlusion_risk": "unknown",
        "quality_score": 0.95,
        "_embedding": vector,
    }


def _analysis(path, embeddings, size=100):
    return {
        "image_path": path,
        "image_width": 200,
        "image_height": 200,
        "face_count": len(embeddings),
        "faces": [_face(path, index, value, size) for index, value in enumerate(embeddings)],
    }


class TestFaceMatchingQuality(unittest.TestCase):
    def _compare(self, analyses, reference_paths=("reference.jpg",),
                 candidate_paths=("candidate.jpg",)):
        with patch(
            "app.backend.enrichment.face_matching._analyze_image",
            side_effect=lambda path: analyses.get(path),
        ):
            return compare_face_images(
                reference_paths,
                candidate_paths,
                match_threshold=0.8,
                mismatch_threshold=0.1,
            )

    def test_compares_every_detected_candidate_face(self):
        result = self._compare({
            "reference.jpg": _analysis("reference.jpg", [[1, 0]]),
            "candidate.jpg": _analysis("candidate.jpg", [[0, 1], [1, 0]]),
        })
        self.assertEqual(result["outcome"], "match")
        self.assertEqual(result["best_pair"]["candidate_face_index"], 1)

    def test_suppresses_negative_evidence_for_group_photo(self):
        result = self._compare({
            "reference.jpg": _analysis("reference.jpg", [[1, 0]]),
            "candidate.jpg": _analysis("candidate.jpg", [[0, 1], [-1, 0]]),
        })
        self.assertEqual(result["outcome"], "inconclusive")
        self.assertEqual(result["reason"], "multi_face_negative_evidence_suppressed")

    def test_rejects_faces_smaller_than_quality_gate(self):
        result = self._compare({
            "reference.jpg": _analysis("reference.jpg", [[1, 0]], size=30),
            "candidate.jpg": _analysis("candidate.jpg", [[1, 0]]),
        })
        self.assertEqual(result["outcome"], "inconclusive")
        self.assertEqual(result["reason"], "no_usable_face")
        reasons = result["reference_images"][0]["faces"][0]["quality_reasons"]
        self.assertIn("face_too_small", reasons)

    def test_uses_recurring_multi_image_template(self):
        result = self._compare({
            "reference.jpg": _analysis("reference.jpg", [[1, 0]]),
            "candidate.jpg": _analysis("candidate.jpg", [[1, 0]]),
            "candidate-2.jpg": _analysis("candidate-2.jpg", [[0.98, 0.1]]),
        }, candidate_paths=("candidate.jpg", "candidate-2.jpg"))
        self.assertEqual(result["outcome"], "match")
        self.assertEqual(result["comparison_method"], "quality_weighted_recurring_template")
        self.assertEqual(result["template_image_count"], 2)

    def test_calibrates_separate_match_and_mismatch_thresholds(self):
        calibration = calibrate_thresholds([
            {"same_person": True, "similarity": 0.82},
            {"same_person": True, "similarity": 0.75},
            {"same_person": False, "similarity": 0.12},
            {"same_person": False, "similarity": -0.1},
        ], max_false_match_rate=0.0, max_false_mismatch_rate=0.0)
        self.assertGreater(
            calibration["match_threshold"], calibration["mismatch_threshold"]
        )
        self.assertEqual(calibration["observed_false_match_rate"], 0.0)
        self.assertEqual(calibration["observed_false_mismatch_rate"], 0.0)


if __name__ == "__main__":
    unittest.main()
