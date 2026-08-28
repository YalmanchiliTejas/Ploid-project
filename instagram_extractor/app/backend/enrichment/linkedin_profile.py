"""Fetch and normalize one known public LinkedIn profile."""

import asyncio
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse


def extract_public_id(linkedin_url):
    """Return the public id from a linkedin.com/in/<public-id> URL."""
    value = (linkedin_url or "").strip()
    parsed = urlparse(value if "://" in value else "https://" + value)
    host = parsed.hostname.lower() if parsed.hostname else ""
    parts = [part for part in parsed.path.split("/") if part]
    if (host != "linkedin.com" and not host.endswith(".linkedin.com")) or len(parts) != 2:
        raise ValueError("Expected a LinkedIn public profile URL: linkedin.com/in/<public-id>")
    if parts[0].lower() != "in" or not parts[1]:
        raise ValueError("Expected a LinkedIn public profile URL: linkedin.com/in/<public-id>")
    return parts[1]


def fallback_identity_from_url(linkedin_url):
    """Build the limited identity available without making a LinkedIn request."""
    public_id = extract_public_id(linkedin_url)
    name_parts = [
        part for part in re.split(r"[-_.]+", public_id)
        if part and not part.isdigit()
    ]
    name = " ".join(part.capitalize() for part in name_parts)
    return {
        "linkedin_url": linkedin_url,
        "public_id": public_id,
        "name": name,
        "first_name": name_parts[0].capitalize() if name_parts else "",
        "last_name": name_parts[-1].capitalize() if len(name_parts) > 1 else "",
        "headline": "",
        "location": "",
        "current_company": "",
        "current_title": "",
        "companies": [],
        "schools": [],
        "titles": [],
        "identity_source": "linkedin_url_fallback",
    }


def identity_from_indexed_linkedin_results(linkedin_url, results):
    """Use public search titles/snippets only; never fetch or scrape LinkedIn."""
    identity = fallback_identity_from_url(linkedin_url)
    for result in results:
        title = _text(result.get("title"))
        snippet = _text(result.get("snippet"))
        label = title.split("| LinkedIn", 1)[0].strip()
        name, details = (label.split(" - ", 1) + [""])[:2]
        if not name:
            continue
        current_title, current_company = "", ""
        if " at " in details:
            current_title, current_company = details.rsplit(" at ", 1)
        else:
            # Search titles commonly use "Name - Company | LinkedIn". Do not
            # mislabel that company as a job title when no role is exposed.
            current_company = details
        combined = " ".join((title, snippet))
        schools = re.findall(
            r"(?:Education|School)\s*[:\-]?\s*([^|.]+(?:University|College|School)[^|.]*)",
            combined,
            flags=re.IGNORECASE,
        )
        identity.update({
            "name": name,
            "first_name": name.split()[0] if name.split() else "",
            "last_name": name.split()[-1] if len(name.split()) > 1 else "",
            "current_company": current_company.strip(),
            "current_title": current_title.strip(),
            "companies": [current_company.strip()] if current_company.strip() else [],
            "schools": list(dict.fromkeys(school.strip() for school in schools if school.strip())),
            "titles": [current_title.strip()] if current_title.strip() else [],
        })
        if identity["name"] and any((identity["current_company"], identity["current_title"], identity["schools"])):
            identity["identity_source"] = "indexed_linkedin_search"
            return identity
    return identity


def enrich_identity_from_public_context(identity, results):
    """Conservatively fill missing identity fields from exact-name public snippets."""
    name = _text(identity.get("name"))
    if not name:
        return identity
    for result in results:
        title = _text(result.get("title"))
        snippet = _text(result.get("snippet"))
        label = title.split("| LinkedIn", 1)[0].strip()
        # A title such as "Ada Lovelace - Founder at Example" is high-quality
        # evidence. Ignore pages that merely mention the name in body text.
        match = re.match(r"^{}\s+-\s+(.+)$".format(re.escape(name)), label, re.IGNORECASE)
        if not match:
            continue
        details = match.group(1).strip()
        current_title, current_company = "", ""
        if " at " in details:
            current_title, current_company = details.rsplit(" at ", 1)
        elif details and "linkedin" in title.lower():
            current_company = details
        if current_company and not identity.get("current_company"):
            identity["current_company"] = current_company.strip()
            identity["companies"] = [current_company.strip()]
        if current_title and not identity.get("current_title"):
            identity["current_title"] = current_title.strip()
            identity["titles"] = [current_title.strip()]
        schools = re.findall(
            r"(?:Education|School)\s*[:\-]?\s*([^|.]+(?:University|College|School)[^|.]*)",
            " ".join((title, snippet)), flags=re.IGNORECASE,
        )
        if schools and not identity.get("schools"):
            identity["schools"] = list(dict.fromkeys(
                school.strip() for school in schools if school.strip()
            ))
        if any((identity.get("current_company"), identity.get("current_title"), identity.get("schools"))):
            identity["identity_source"] = "public_identity_context"
            identity["identity_context_url"] = result.get("link", "")
            return identity
    return identity


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _experience_values(profile):
    companies, titles = [], []
    for item in profile.get("experience") or []:
        if not isinstance(item, dict):
            continue
        company = _text(item.get("companyName")) or _text(item.get("company"))
        title = _text(item.get("title"))
        if company and company not in companies:
            companies.append(company)
        if title and title not in titles:
            titles.append(title)
    return companies, titles


def _schools(profile):
    schools = []
    for item in profile.get("education") or []:
        if not isinstance(item, dict):
            continue
        school = _text(item.get("schoolName")) or _text(item.get("school"))
        if school and school not in schools:
            schools.append(school)
    return schools


def _normalize_profile(profile, linkedin_url, public_id):
    profile = profile if isinstance(profile, dict) else {}
    companies, titles = _experience_values(profile)
    first_name = _text(profile.get("firstName"))
    last_name = _text(profile.get("lastName"))
    return {
        "linkedin_url": linkedin_url,
        "public_id": public_id,
        "name": " ".join(part for part in (first_name, last_name) if part),
        "first_name": first_name,
        "last_name": last_name,
        "headline": _text(profile.get("headline")),
        "location": _text(profile.get("locationName")) or _text(profile.get("geoLocationName")),
        "current_company": companies[0] if companies else "",
        "current_title": titles[0] if titles else "",
        "companies": companies,
        "schools": _schools(profile),
        "titles": titles,
    }


def _normalize_scraped_profile(profile, linkedin_url, public_id):
    """Normalize joeyism/linkedin_scraper's v3 ``Person`` model output."""
    profile = profile if isinstance(profile, dict) else {}
    name = _text(profile.get("name"))
    name_parts = name.split()
    experiences = profile.get("experiences") or []
    education = profile.get("educations") or []
    companies = list(dict.fromkeys(
        _text(item.get("institution_name")) for item in experiences
        if isinstance(item, dict) and _text(item.get("institution_name"))
    ))
    titles = list(dict.fromkeys(
        _text(item.get("position_title")) for item in experiences
        if isinstance(item, dict) and _text(item.get("position_title"))
    ))
    schools = list(dict.fromkeys(
        _text(item.get("institution_name")) for item in education
        if isinstance(item, dict) and _text(item.get("institution_name"))
    ))
    return {
        "linkedin_url": linkedin_url,
        "public_id": public_id,
        "name": name,
        "first_name": name_parts[0] if name_parts else "",
        "last_name": name_parts[-1] if len(name_parts) > 1 else "",
        "headline": _text(profile.get("headline")),
        "about": _text(profile.get("about")),
        "location": _text(profile.get("location")),
        "current_company": companies[0] if companies else "",
        "current_title": titles[0] if titles else "",
        "companies": companies,
        "schools": schools,
        "titles": titles,
        "identity_source": "linkedin_scraper",
        "avatar_path": profile.get("avatar_path"),
    }


async def _cache_linkedin_avatar_from_page(page, public_id):
    """Save the authenticated profile portrait for local face comparison."""
    images = page.locator(
        'main img[src*="profile-displayphoto"], '
        'main img[src*="profile-framedphoto"]'
    )
    for index in range(await images.count()):
        image = images.nth(index)
        if not await image.is_visible():
            continue
        destination = (
            Path(os.getenv("AVATAR_CACHE_DIR", "avatar_cache")).resolve()
            / "linkedin"
            / "{}.png".format(re.sub(r"[^a-zA-Z0-9_.-]+", "_", public_id))
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            await image.screenshot(path=str(destination))
        except Exception:
            continue
        try:
            return str(destination.relative_to(Path.cwd()))
        except ValueError:
            return str(destination)
    return None


async def _augment_from_current_profile_dom(page, profile):
    """Fill v3.1.2 fields that its pre-React selectors no longer extract."""
    profile = profile if isinstance(profile, dict) else {}
    main = page.locator("main")
    if not await main.count():
        return profile

    headings = main.locator("h2")
    name = ""
    for index in range(await headings.count()):
        candidate = _text(await headings.nth(index).inner_text())
        if candidate and "notification" not in candidate.lower():
            name = candidate
            break

    sections = main.locator("section")
    top_lines, about = [], ""
    for index in range(await sections.count()):
        lines = [
            line.strip() for line in (await sections.nth(index).inner_text()).splitlines()
            if line.strip()
        ]
        if name and lines and lines[0] == name and not top_lines:
            top_lines = lines
        if lines and lines[0].lower() == "about":
            about = "\n".join(lines[1:])

    if name and _text(profile.get("name")).lower() in {"", "unknown"}:
        profile["name"] = name
    if len(top_lines) >= 3:
        profile["headline"] = _text(profile.get("headline")) or top_lines[1]
        profile["location"] = _text(profile.get("location")) or top_lines[2]
    if about and not _text(profile.get("about")):
        profile["about"] = about

    contact_index = next(
        (index for index, line in enumerate(top_lines) if line.lower() == "contact info"),
        None,
    )
    affiliations = [] if contact_index is None else [
        line for line in top_lines[contact_index + 1:]
        if line.lower() not in {"connections", "connect", "message", "·"}
        and not re.search(r"\b(?:followers?|connections?)\b", line, re.IGNORECASE)
        and not re.match(r"^[\d,+]+$", line)
    ]
    company = affiliations[0] if affiliations else ""
    school = affiliations[1] if len(affiliations) > 1 else ""
    headline = _text(profile.get("headline"))
    title = headline
    for separator in (" at ", " of ", " @ "):
        if separator in headline:
            title = headline.split(separator, 1)[0].strip()
            break
    if company and not profile.get("experiences"):
        profile["experiences"] = [{
            "institution_name": company,
            "position_title": title,
        }]
    if school and not profile.get("educations"):
        profile["educations"] = [{"institution_name": school}]
    return profile


async def _scrape_linkedin_profile(linkedin_url, session_file, headless):
    """Load one user-created Playwright session and scrape one supplied URL."""
    from linkedin_scraper import BrowserManager, PersonScraper
    from linkedin_scraper.core.exceptions import RateLimitError
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError

    class VisibleRateLimitPersonScraper(PersonScraper):
        """Avoid v3.1.2's false positives from serialized React configuration."""

        async def check_rate_limit(self):
            current_url = self.page.url.lower()
            if "/checkpoint" in current_url or "authwall" in current_url:
                raise RateLimitError(
                    "LinkedIn security checkpoint detected.",
                    suggested_wait_time=3600,
                )

            captcha = self.page.locator(
                'iframe[title*="captcha" i]:visible, iframe[src*="captcha" i]:visible'
            )
            if await captcha.count():
                raise RateLimitError(
                    "CAPTCHA challenge detected.", suggested_wait_time=3600
                )

            # The upstream detector uses body.text_content(), which includes
            # LinkedIn's hidden serialized React configuration. Current pages
            # contain a dormant "try again later" toast there, causing every
            # valid profile to be reported as rate-limited. inner_text() limits
            # this check to user-visible page content.
            try:
                visible_text = (
                    await self.page.locator("body").inner_text(timeout=2000)
                ).lower()
            except PlaywrightTimeoutError:
                visible_text = ""
            if any(phrase in visible_text for phrase in (
                "too many requests",
                "rate limit",
                "slow down",
            )):
                raise RateLimitError(
                    "Visible rate limit message detected on page.",
                    suggested_wait_time=1800,
                )

    async with BrowserManager(headless=headless) as browser:
        await browser.load_session(session_file)
        scraper = VisibleRateLimitPersonScraper(browser.page)
        await browser.page.goto(
            linkedin_url, wait_until="domcontentloaded", timeout=60000
        )
        await scraper.check_rate_limit()
        await browser.page.locator("main").wait_for(state="visible", timeout=10000)
        await browser.page.wait_for_timeout(1500)
        current_profile = await _augment_from_current_profile_dom(browser.page, {
            "experiences": [],
            "educations": [],
        })
        if _text(current_profile.get("name")):
            current_profile["avatar_path"] = await _cache_linkedin_avatar_from_page(
                browser.page, extract_public_id(linkedin_url)
            )
            return current_profile

        # Retain compatibility with the package's older page layout if it is
        # served in another locale or LinkedIn experiment.
        person = await scraper.scrape(linkedin_url)
        return person.model_dump()


def fetch_linkedin_profile(linkedin_url):
    """Fetch one profile through joeyism/linkedin_scraper's Playwright client."""
    public_id = extract_public_id(linkedin_url)
    session_file = os.getenv("LINKEDIN_SESSION_FILE", "linkedin_session.json")
    # Profile lookups must never create a visible browser window unless the
    # operator explicitly opts into it for debugging.
    headless = os.getenv("LINKEDIN_SCRAPER_HEADLESS", "true").strip().lower() in {"1", "true", "yes"}
    try:
        profile = asyncio.run(_scrape_linkedin_profile(linkedin_url, session_file, headless))
        print(
            "LINKEDIN SCRAPER RESPONSE for {}:\n{}".format(
                public_id, json.dumps(profile, indent=2, ensure_ascii=False, default=str)
            )
        )
    except ImportError as error:
        raise RuntimeError(
            "linkedin-scraper is not installed. Run `python -m pip install -r requirements.txt` "
            "then `playwright install chromium`."
        ) from error
    except FileNotFoundError as error:
        raise RuntimeError(
            "LinkedIn session file `{}` was not found. Run `python create_linkedin_session.py` first."
            .format(session_file)
        ) from error
    return _normalize_scraped_profile(profile, linkedin_url, public_id)
