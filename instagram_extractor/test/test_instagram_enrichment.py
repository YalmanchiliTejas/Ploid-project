# -*- coding: utf-8 -*-

import unittest
from unittest.mock import patch

from app.backend.enrichment.instagram_matching import score_instagram_candidate
from app.backend.enrichment.instagram_search import (
    build_instagram_queries, extract_instagram_username, normalize_instagram_url,
    search_instagram_candidate_context, search_public_social_aliases,
)
from app.backend.enrichment.profile_avatar import extract_og_image
from app.backend.enrichment.linkedin_profile import (
    enrich_identity_from_public_context, extract_public_id, fallback_identity_from_url,
    identity_from_indexed_linkedin_results, _normalize_scraped_profile,
)
from app.backend.enrichment.pipeline import (
    _direct_handle_candidates, _rerank_with_faces, _verification_summary,
    find_instagram_from_linkedin,
)


IDENTITY = {
    "linkedin_url": "https://www.linkedin.com/in/john-smith-123/",
    "public_id": "john-smith-123",
    "name": "John Smith", "first_name": "John", "last_name": "Smith",
    "headline": "", "location": "San Francisco", "current_company": "Google",
    "current_title": "Software Engineer", "companies": ["Google"],
    "schools": ["Purdue University"], "titles": ["Software Engineer"],
}


class TestInstagramEnrichment(unittest.TestCase):
    def setUp(self):
        IDENTITY.pop("avatar_path", None)
        alias_patcher = patch(
            "app.backend.enrichment.pipeline.search_public_social_aliases",
            return_value=[],
        )
        alias_patcher.start()
        self.addCleanup(alias_patcher.stop)
        context_patcher = patch(
            "app.backend.enrichment.pipeline.search_instagram_candidate_context",
            return_value={},
        )
        context_patcher.start()
        self.addCleanup(context_patcher.stop)

    def test_extracts_only_a_linkedin_public_id(self):
        self.assertEqual(extract_public_id(IDENTITY["linkedin_url"]), "john-smith-123")
        self.assertEqual(
            extract_public_id("https://cz.linkedin.com/in/tomaskupka"), "tomaskupka"
        )
        with self.assertRaises(ValueError):
            extract_public_id("https://www.linkedin.com/company/google/")

    def test_fallback_identity_uses_only_the_public_url(self):
        identity = fallback_identity_from_url("https://www.linkedin.com/in/john-smith-123/")
        self.assertEqual(identity["name"], "John Smith")
        self.assertEqual(identity["identity_source"], "linkedin_url_fallback")

    def test_indexed_linkedin_metadata_can_supply_identity_fields(self):
        identity = identity_from_indexed_linkedin_results(
            IDENTITY["linkedin_url"],
            [{"title": "John Smith - Software Engineer at Google | LinkedIn", "snippet": ""}],
        )
        self.assertEqual(identity["current_company"], "Google")
        self.assertEqual(identity["current_title"], "Software Engineer")
        self.assertEqual(identity["identity_source"], "indexed_linkedin_search")

    def test_public_context_enriches_only_an_exact_name_title(self):
        identity = fallback_identity_from_url(IDENTITY["linkedin_url"])
        enriched = enrich_identity_from_public_context(identity, [{
            "link": "https://www.linkedin.com/in/john-smith-123/",
            "title": "John Smith - Software Engineer at Google | LinkedIn",
            "snippet": "",
        }])
        self.assertEqual(enriched["current_title"], "Software Engineer")
        self.assertEqual(enriched["current_company"], "Google")
        self.assertEqual(enriched["identity_source"], "public_identity_context")

    def test_normalizes_linkedin_scraper_person_data(self):
        identity = _normalize_scraped_profile({
            "name": "John Smith", "location": "San Francisco",
            "about": "Building useful products.",
            "experiences": [{"position_title": "Engineer", "institution_name": "Google"}],
            "educations": [{"institution_name": "Purdue University"}],
        }, IDENTITY["linkedin_url"], "john-smith-123")
        self.assertEqual(identity["current_title"], "Engineer")
        self.assertEqual(identity["current_company"], "Google")
        self.assertEqual(identity["schools"], ["Purdue University"])
        self.assertEqual(identity["identity_source"], "linkedin_scraper")

    def test_normalizes_only_instagram_profiles(self):
        self.assertEqual(
            normalize_instagram_url("https://instagram.com/johnsmith/?hl=en"),
            "https://www.instagram.com/johnsmith/",
        )
        self.assertEqual(extract_instagram_username("https://www.instagram.com/johnsmith/"), "johnsmith")
        self.assertIsNone(normalize_instagram_url("https://instagram.com/p/post-id/"))
        self.assertIsNone(normalize_instagram_url("https://example.com/johnsmith"))

    def test_extracts_absolute_or_relative_open_graph_images(self):
        self.assertEqual(
            extract_og_image(
                '<meta property="og:image" content="/profile-photo.jpg">',
                "https://www.instagram.com/johnsmith/",
            ),
            "https://www.instagram.com/profile-photo.jpg",
        )
        self.assertIsNone(extract_og_image("<title>No avatar</title>", "https://example.com/"))

    def test_builds_site_restricted_queries(self):
        queries = build_instagram_queries(IDENTITY)
        self.assertTrue(queries)
        self.assertTrue(all(query.startswith("site:instagram.com") for query in queries))
        self.assertIn('"Google"', queries[0])
        self.assertIn('site:instagram.com "John" "Google"', queries)
        self.assertIn('site:instagram.com "Smith" "San Francisco"', queries)
        self.assertIn('site:instagram.com "john-smith-123"', queries)

    def test_unenriched_fallback_searches_first_name_filter(self):
        identity = fallback_identity_from_url(IDENTITY["linkedin_url"])
        queries = build_instagram_queries(identity)
        self.assertIn('site:instagram.com "John Smith"', queries)
        self.assertIn('site:instagram.com "John"', queries)

    def test_name_is_required_for_a_high_score(self):
        candidate = {
            "username": "johnsmith", "url": "https://www.instagram.com/johnsmith/",
            "search_hits": 3, "titles": ["John Smith - Google"],
            "snippets": ["Software Engineer from Purdue University in San Francisco"],
        }
        match = score_instagram_candidate(IDENTITY, candidate)
        self.assertGreaterEqual(match["score"], 0.80)
        candidate["username"] = "google_employee"
        candidate["titles"] = ["Google employee"]
        candidate["snippets"] = ["Purdue University Software Engineer in San Francisco"]
        self.assertLess(score_instagram_candidate(IDENTITY, candidate)["score"], 0.60)

    def test_exact_full_name_handle_is_a_strong_fallback_candidate(self):
        fallback = fallback_identity_from_url("https://www.linkedin.com/in/tim-suchanek-08219346/")
        match = score_instagram_candidate(fallback, {
            "username": "tim_suchanek",
            "url": "https://www.instagram.com/tim_suchanek/",
            "search_hits": 1,
            "titles": [],
            "snippets": [],
        })
        self.assertEqual(match["score"], 0.75)
        self.assertEqual(match["confidence"], "medium")
        self.assertIn("exact_username_full_name_match", match["evidence"])

    def test_seeds_exact_full_name_handle_without_search_results(self):
        identity = dict(IDENTITY, public_id="johnsmith")
        candidates = _direct_handle_candidates(identity)
        self.assertIn("johnsmith", candidates)
        self.assertEqual(
            candidates["johnsmith"]["url"],
            "https://www.instagram.com/johnsmith/",
        )

    def test_guessed_direct_full_name_handle_is_not_automatically_matched(self):
        identity = dict(IDENTITY, public_id="johnsmith", identity_source="linkedin_scraper")
        match = score_instagram_candidate(identity, {
            "username": "johnsmith",
            "url": "https://www.instagram.com/johnsmith/",
            "search_hits": 0,
            "titles": [],
            "snippets": [],
            "direct_handle": True,
        })
        self.assertLess(match["score"], 0.80)
        self.assertIn("direct_exact_full_name_handle", match["evidence"])

    def test_linkedin_slug_found_by_multiple_searches_is_strong_evidence(self):
        identity = dict(
            IDENTITY,
            public_id="johnasmith",
            identity_source="linkedin_scraper",
        )
        match = score_instagram_candidate(identity, {
            "username": "johnasmith",
            "url": "https://www.instagram.com/johnasmith/",
            "search_hits": 2,
            "titles": ["John Smith (@johnasmith)"],
            "snippets": [],
            "matched_queries": [
                'site:instagram.com "johnasmith"',
                'site:instagram.com "John Smith"',
            ],
        })
        self.assertGreaterEqual(match["score"], 0.80)
        self.assertIn("exact_linkedin_slug_match", match["evidence"])
        self.assertIn("linkedin_slug_search_verified", match["evidence"])
        self.assertEqual(set(match["evidence_families"]), {"name", "shared_slug"})
        self.assertTrue(
            _verification_summary(match, {"score": 0.433})[
                "independent_evidence_gate_met"
            ]
        )

    def test_kayteeta_style_alias_stays_ambiguous_without_other_evidence(self):
        identity = dict(
            IDENTITY,
            name="Katie Ta", first_name="Katie", last_name="Ta",
            public_id="quynhanhkatieta", current_company="Deloitte",
            companies=["Deloitte"], schools=["Designlab"],
            identity_source="linkedin_scraper",
        )
        match = score_instagram_candidate(identity, {
            "username": "kayteeta",
            "url": "https://www.instagram.com/kayteeta/",
            "search_hits": 1,
            "titles": ["Katie Ta (@kayteeta)"],
            "snippets": [],
            "cross_platform_alias_hits": 1,
            "alias_sources": [{
                "url": "https://example.com/kayteeta",
                "title": "Katie Ta", "snippet": "",
                "domain": "example.com", "relationship": "identity_profile",
            }],
        })
        self.assertEqual(match["score"], 0.503)
        self.assertEqual(set(match["evidence_families"]), {"name", "alias"})
        self.assertFalse(
            _verification_summary(match, {"score": 0.433})[
                "independent_evidence_gate_met"
            ]
        )

    @patch("app.backend.enrichment.pipeline.face_similarity", return_value=0.0)
    def test_clear_face_mismatch_adds_bounded_negative_evidence(self, mock_face):
        ranked = [{
            "username": "johnsmith", "url": "https://www.instagram.com/johnsmith/",
            "score": 0.70, "avatar_path": "candidate.jpg",
            "evidence": [], "evidence_families": ["name"],
        }]
        result = _rerank_with_faces({"avatar_path": "linkedin.jpg"}, ranked)
        self.assertEqual(result[0]["score"], 0.62)
        self.assertEqual(result[0]["face_score_penalty"], 0.08)
        self.assertIn("face_similarity_mismatch", result[0]["negative_evidence"])

    def test_cross_platform_alias_alone_cannot_be_matched(self):
        identity = dict(IDENTITY, identity_source="linkedin_scraper")
        match = score_instagram_candidate(identity, {
            "username": "jdesigns",
            "url": "https://www.instagram.com/jdesigns/",
            "search_hits": 2,
            "titles": ["John Smith (@jdesigns)"],
            "snippets": [],
            "matched_queries": ['site:instagram.com "John Smith"'],
            "cross_platform_alias_hits": 1,
        })
        self.assertLess(match["score"], 0.80)
        self.assertIn("cross_platform_alias_supported", match["evidence"])
        self.assertNotIn("alias", match["evidence_families"])

    def test_alias_and_name_do_not_pass_independent_evidence_gate(self):
        verification = _verification_summary({
            "score": 0.85,
            "evidence_families": ["name", "alias"],
            "alias_source_domain_count": 1,
        }, {"score": 0.40})
        self.assertFalse(verification["alias_has_independent_support"])
        self.assertFalse(verification["independent_evidence_gate_met"])

    def test_explicit_alias_with_independent_employer_can_be_confirmed(self):
        identity = dict(IDENTITY, identity_source="linkedin_scraper")
        match = score_instagram_candidate(identity, {
            "username": "jdesigns",
            "url": "https://www.instagram.com/jdesigns/",
            "search_hits": 1,
            "titles": ["John Smith (@jdesigns) - UX at Google"],
            "snippets": [],
            "cross_platform_alias_hits": 1,
            "alias_sources": [{
                "url": "https://john.example/about",
                "title": "John Smith",
                "snippet": "Instagram: @jdesigns",
                "domain": "john.example",
                "relationship": "explicit_instagram_link",
            }],
        })
        self.assertGreaterEqual(match["score"], 0.80)
        self.assertTrue(match["alias_independently_corroborated"])
        self.assertEqual(set(match["evidence_families"]), {"name", "employment", "alias"})
        verification = _verification_summary(match, {"score": 0.40})
        self.assertTrue(verification["independent_evidence_gate_met"])

    @patch("app.backend.enrichment.instagram_search._search_web")
    def test_collects_school_and_location_from_candidate_post_context(self, mock_search):
        mock_search.return_value = [{
            "link": "https://www.instagram.com/p/example-post/",
            "title": "John Smith (@johnasmith) on Instagram",
            "snippet": "Back at Purdue University in San Francisco.",
        }]
        context = search_instagram_candidate_context(
            dict(IDENTITY, schools=["Purdue University"]),
            "johnasmith",
        )
        self.assertGreater(context["school_context_hits"], 0)
        self.assertGreater(context["location_context_hits"], 0)
        self.assertEqual(
            context["post_context_urls"],
            ["https://www.instagram.com/p/example-post/"],
        )

    @patch("app.backend.enrichment.instagram_search._search_web")
    def test_extracts_public_handle_associated_with_exact_name(self, mock_search):
        mock_search.return_value = [{
            "link": "https://example.com/interview",
            "title": "An interview with John Smith (@jdesigns)",
            "snippet": "John Smith discusses product design.",
        }]
        aliases = search_public_social_aliases("John Smith")
        self.assertEqual(aliases[0]["username"], "jdesigns")
        self.assertEqual(
            aliases[0]["supporting_results"][0]["relationship"], "mention"
        )

    @patch("app.backend.enrichment.instagram_search._search_web")
    def test_extracts_alias_from_exact_name_social_profile_url(self, mock_search):
        mock_search.return_value = [{
            "link": "https://medium.com/@jdesigns",
            "title": "John Smith – Medium",
            "snippet": "Read writing from John Smith.",
        }]
        aliases = search_public_social_aliases("John Smith")
        self.assertEqual(aliases[0]["username"], "jdesigns")
        self.assertEqual(
            aliases[0]["supporting_results"][0]["relationship"], "identity_profile"
        )

    @patch("app.backend.enrichment.pipeline.face_similarity", return_value=None)
    @patch("app.backend.enrichment.pipeline.cache_profile_avatar", return_value="avatar_cache/linkedin/john-smith.jpg")
    @patch("app.backend.enrichment.pipeline.search_instagram_web")
    @patch("app.backend.enrichment.pipeline.fetch_linkedin_profile")
    def test_returns_ambiguous_candidates_when_scores_are_close(self, mock_profile, mock_search, mock_avatar, mock_face):
        mock_profile.return_value = IDENTITY
        mock_search.return_value = [
            {"link": "https://instagram.com/johnsmith/", "title": "John Smith Google", "snippet": "Purdue University"},
            {"link": "https://instagram.com/john_smith23/", "title": "John Smith Google", "snippet": "Purdue University"},
        ]
        result = find_instagram_from_linkedin(IDENTITY["linkedin_url"])
        self.assertEqual(result["status"], "ambiguous")
        self.assertIsNone(result["instagram"])
        self.assertEqual(len(result["candidates"]), 2)
        self.assertEqual(result["linkedin"]["avatar_path"], "avatar_cache/linkedin/john-smith.jpg")
        self.assertEqual(result["candidates"][0]["avatar_path"], "avatar_cache/linkedin/john-smith.jpg")

    @patch("app.backend.enrichment.pipeline.face_similarity", side_effect=[0.31, 0.87])
    @patch("app.backend.enrichment.pipeline.cache_profile_avatar", return_value="avatar_cache/profile.jpg")
    @patch("app.backend.enrichment.pipeline.search_instagram_web")
    @patch("app.backend.enrichment.pipeline.fetch_linkedin_profile")
    def test_face_similarity_reranks_the_text_top_ten(self, mock_profile, mock_search, mock_avatar, mock_face):
        mock_profile.return_value = IDENTITY
        mock_search.return_value = [
            {"link": "https://instagram.com/johnsmith/", "title": "John Smith", "snippet": ""},
            {"link": "https://instagram.com/john_smith23/", "title": "John Smith", "snippet": ""},
        ]
        result = find_instagram_from_linkedin(IDENTITY["linkedin_url"])
        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["instagram"]["username"], "john_smith23")
        self.assertEqual(result["instagram"]["face_similarity"], 0.87)
        self.assertGreater(result["instagram"]["face_score_bonus"], 0.10)
        self.assertGreater(
            result["instagram"]["score"], result["instagram"]["text_score"]
        )
        self.assertEqual(mock_face.call_count, 2)

    @patch("app.backend.enrichment.pipeline.face_similarity", return_value=None)
    @patch("app.backend.enrichment.pipeline.cache_profile_avatar", return_value=None)
    @patch("app.backend.enrichment.pipeline.search_instagram_web")
    @patch("app.backend.enrichment.pipeline.fetch_linkedin_profile")
    def test_returns_at_most_ten_ranked_candidates(self, mock_profile, mock_search, mock_avatar, mock_face):
        mock_profile.return_value = IDENTITY
        mock_search.return_value = [
            {
                "link": "https://instagram.com/johnsmith{}/".format(index),
                "title": "John Smith", "snippet": "Google",
            }
            for index in range(25)
        ]
        result = find_instagram_from_linkedin(IDENTITY["linkedin_url"])
        self.assertEqual(len(result["candidates"]), 10)
        self.assertEqual(result["stats"]["instagram_candidates_found"], 26)
        self.assertEqual(result["stats"]["candidates_returned"], 10)

    @patch("app.backend.enrichment.pipeline.face_similarity", return_value=None)
    @patch("app.backend.enrichment.pipeline.cache_profile_avatar", return_value=None)
    @patch("app.backend.enrichment.pipeline.search_instagram_web")
    @patch("app.backend.enrichment.pipeline.search_public_identity_context", return_value=[])
    @patch("app.backend.enrichment.pipeline.search_indexed_linkedin_profile")
    @patch("app.backend.enrichment.pipeline.fetch_linkedin_profile")
    def test_fallback_never_calls_linkedin_api(self, mock_profile, mock_index, mock_context, mock_search, mock_avatar, mock_face):
        mock_index.return_value = []
        mock_search.return_value = [
            {"link": "https://instagram.com/johnsmith/", "title": "John Smith", "snippet": ""},
        ]
        result = find_instagram_from_linkedin(IDENTITY["linkedin_url"], fallback=True)
        mock_profile.assert_not_called()
        self.assertEqual(result["linkedin"]["identity_source"], "linkedin_url_fallback")
        self.assertEqual(result["status"], "ambiguous")


if __name__ == "__main__":
    unittest.main()
