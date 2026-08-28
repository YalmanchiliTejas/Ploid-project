import unittest

from run_instagram_batch import _retry_result


class TestInstagramBatch(unittest.TestCase):
    def test_failed_retry_preserves_a_previous_non_error_record(self):
        existing = {"status": "ambiguous", "candidates": [{"username": "lead"}]}
        attempted = {"status": "error", "error": "temporary failure"}
        retained = _retry_result(existing, attempted)
        self.assertEqual(retained["status"], "ambiguous")
        self.assertEqual(retained["last_retry_error"], "temporary failure")

    def test_successful_retry_replaces_the_previous_record(self):
        existing = {"status": "ambiguous"}
        attempted = {"status": "matched", "instagram_username": "best"}
        self.assertIs(_retry_result(existing, attempted), attempted)

    def test_failed_retry_does_not_preserve_an_about_identity(self):
        existing = {
            "status": "ambiguous",
            "linkedin_extracted": {"name": "About"},
        }
        attempted = {"status": "error", "error": "invalid top card"}
        self.assertIs(_retry_result(existing, attempted), attempted)


if __name__ == "__main__":
    unittest.main()
