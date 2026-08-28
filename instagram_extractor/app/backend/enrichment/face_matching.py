"""Optional, local face-embedding comparison for reranking candidates.

The module deliberately loads InsightFace lazily: the normal text-only lookup
continues to work where the optional ML runtime/model is not installed.
"""

from functools import lru_cache
import os


@lru_cache(maxsize=1)
def _face_app():
    """Create one reusable embedding model per process, rather than per photo."""
    from insightface.app import FaceAnalysis

    providers = [provider.strip() for provider in os.getenv(
        "FACE_MATCH_PROVIDERS", "CPUExecutionProvider"
    ).split(",") if provider.strip()]
    app = FaceAnalysis(name=os.getenv("FACE_MATCH_MODEL", "buffalo_l"), providers=providers)
    app.prepare(ctx_id=int(os.getenv("FACE_MATCH_CTX_ID", "-1")), det_size=(640, 640))
    return app


def face_similarity(reference_path, candidate_path):
    """Return cosine similarity of the best detected face in two local images.

    ``None`` means either image did not contain a usable face or the optional
    local face-matching dependency is unavailable.  Callers must not treat it
    as a non-match.
    """
    reference = _best_embedding(reference_path)
    candidate = _best_embedding(candidate_path)
    if reference is None or candidate is None:
        return None
    try:
        import numpy as np
        return round(float(np.dot(reference, candidate)), 4)
    except ImportError:
        return None


@lru_cache(maxsize=1024)
def _best_embedding(image_path):
    """Return a cached face vector for one local image path."""
    if not image_path:
        return None
    try:
        import cv2

        image = cv2.imread(image_path)
        if image is None:
            return None
        app = _face_app()
        faces = app.get(image)
        if not faces:
            return None
        # Profile avatars normally contain one face; for group images select
        # the most clearly detected one. Post-media matching can instead score
        # every face against this same cached reference vector.
        return max(faces, key=lambda face: face.det_score).normed_embedding
    except (ImportError, OSError, ValueError):
        return None
