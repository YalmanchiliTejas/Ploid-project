# -*- coding: utf-8 -*-
"""The main scraping module."""

from concurrent.futures import ProcessPoolExecutor
from dotenv import load_dotenv

from app.backend.scraping.google_search.google_search import caller_google_search
from app.backend.scraping.linkedin.linkedin import caller_linkedin
from app.backend.scraping.twitter.twitter import caller_twitter


def main_scraping(user_input: dict) -> dict:
    """
    Take user input and scrape all possible information on Google Search, \
        LinkedIn and Twitter.

    Args:
        `user_input`: user input represented as a dictionary.
    Returns:
        `dict`: all scraped information from Google Search, \
            LinkedIn and Twitter.
    """
    load_dotenv("app/backend/scraping/.env")

    full_name = " ".join([user_input["first_name"], user_input["last_name"]])

    with ProcessPoolExecutor(max_workers=3) as pool:
        linkedin_process = pool.submit(
            caller_linkedin,
            user_input=user_input
        )
        google_search_process = pool.submit(
            caller_google_search, user_input=user_input
        )
        twitter_process = pool.submit(
            caller_twitter, query=user_input["twitter_profile"]
            if user_input["twitter_profile"] else full_name
        )

    try:
        # For Python3.9+
        scraping_results = google_search_process.result() | \
            linkedin_process.result() | twitter_process.result()
    except TypeError:
        # For Python <= 3.8
        scraping_results = {
            **google_search_process.result(),
            **linkedin_process.result(),
            **twitter_process.result(),
        }

    # The legacy analysis/visualization pipeline still expects this key. It is
    # intentionally empty now that authenticated Instagram scraping is gone.
    scraping_results["instagram"] = []

    return scraping_results
