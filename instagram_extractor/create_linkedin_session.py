"""Create and save a LinkedIn Playwright session.

Credential login and subsequent profile scraping both run headlessly by
default. A headed browser remains available as an explicit debugging override.
"""

import asyncio
import os

from dotenv import load_dotenv


def _enabled(value):
    return value.strip().lower() in {"1", "true", "yes"}


async def _visible_locator(
    page, selectors, field_name, timeout=30000, extra_locators=None
):
    """Find the first visible variant of a LinkedIn login control."""
    # Keep these as selector-based locators instead of returning a numbered
    # element. LinkedIn re-renders this React tree shortly after page load, so
    # an nth() locator can point at a node that no longer exists.
    locators = [locator.first for locator in (extra_locators or ())]
    locators.extend(
        page.locator("{}:visible".format(selector)).first for selector in selectors
    )
    deadline = asyncio.get_running_loop().time() + timeout / 1000
    while asyncio.get_running_loop().time() < deadline:
        for locator in locators:
            if await locator.count() and await locator.is_visible():
                return locator
        await asyncio.sleep(0.1)

    title = await page.title()
    raise RuntimeError(
        "LinkedIn did not show its {} field (URL: {!r}, title: {!r})."
        .format(field_name, page.url, title)
    )


async def _login_with_credentials(page, email, password):
    """Log in using Playwright without relying on one hard-coded field id."""
    await page.goto(
        "https://www.linkedin.com/login",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    # Allow LinkedIn's client-rendered login tree to replace the initial
    # server-rendered tree before retaining locators.
    await page.wait_for_timeout(1500)
    username = await _visible_locator(page, (
        "#username",
        'input[name="session_key"]',
        'input[autocomplete="username"]',
        'input[type="email"]',
    ), "email/username", extra_locators=(
        page.get_by_role("textbox", name="Email or phone", exact=True),
    ))
    password_input = await _visible_locator(page, (
        "#password",
        'input[name="session_password"]',
        'input[autocomplete="current-password"]',
        'input[type="password"]',
    ), "password")
    submit = await _visible_locator(page, (
        'button[type="submit"]',
        'input[type="submit"]',
    ), "sign-in button", extra_locators=(
        page.get_by_role("button", name="Sign in", exact=True),
    ))

    await username.fill(email)
    await password_input.fill(password)
    await submit.click()

    # A successful LinkedIn login creates the li_at authentication cookie.
    # Checking it is more reliable than assuming LinkedIn always redirects to
    # /feed or renders a particular navigation component.
    deadline = asyncio.get_running_loop().time() + 30
    while asyncio.get_running_loop().time() < deadline:
        cookies = await page.context.cookies("https://www.linkedin.com")
        if any(cookie.get("name") == "li_at" for cookie in cookies):
            return
        await asyncio.sleep(0.5)

    title = await page.title()
    raise RuntimeError(
        "LinkedIn did not create an authenticated session after submitting the "
        "credentials (URL: {!r}, title: {!r}). Check the login message shown "
        "in the Playwright window."
        .format(page.url, title)
    )


async def main():
    from linkedin_scraper import BrowserManager, wait_for_manual_login

    load_dotenv()
    session_file = os.getenv("LINKEDIN_SESSION_FILE", "linkedin_session.json")
    email = os.getenv("LINKEDIN_EMAIL") or os.getenv("LINKEDIN_LOGIN")
    password = os.getenv("LINKEDIN_PASSWORD")
    has_credentials = bool(email and password)
    headless = _enabled(os.getenv("LINKEDIN_SESSION_HEADLESS", "true"))
    if not has_credentials and headless:
        raise RuntimeError(
            "Manual login needs a visible Playwright window. Set "
            "LINKEDIN_SESSION_HEADLESS=false, or provide LINKEDIN_EMAIL and "
            "LINKEDIN_PASSWORD for headless login."
        )
    async with BrowserManager(headless=headless) as browser:
        if email and password:
            print("Signing in with the configured LinkedIn credentials via Playwright.")
            await _login_with_credentials(browser.page, email=email, password=password)
        else:
            await browser.page.goto(
                "https://www.linkedin.com/login", wait_until="domcontentloaded"
            )
            print("Sign in to LinkedIn in the opened browser window.")
            await wait_for_manual_login(browser.page, timeout=300000)
        await browser.save_session(session_file)
    print("Saved LinkedIn session to {}".format(session_file))


if __name__ == "__main__":
    asyncio.run(main())
