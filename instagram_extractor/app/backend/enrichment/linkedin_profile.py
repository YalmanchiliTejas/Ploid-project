"""Fetch and normalize one known public LinkedIn profile."""

import asyncio
import json
import os
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse


def normalize_linkedin_url(linkedin_url):
    """Return an absolute HTTPS URL suitable for browser navigation."""
    value = (linkedin_url or "").strip()
    if value.lower().startswith("http://"):
        return "https://" + value[len("http://"):]
    if not value.lower().startswith("https://"):
        return "https://" + value
    return value


def extract_public_id(linkedin_url):
    """Return the public id from a linkedin.com/in/<public-id> URL."""
    value = normalize_linkedin_url(linkedin_url)
    parsed = urlparse(value)
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


_INVALID_PROFILE_NAMES = {
    "about", "activity", "contact info", "education", "experience",
    "honors & awards", "interests", "join linkedin", "languages",
    "licenses & certifications", "linkedin", "people also viewed",
    "projects", "recommendations", "sign in", "skills", "volunteering",
}


def _is_invalid_profile_name(value):
    """Reject navigation and section labels accidentally read as a name."""
    normalized = re.sub(r"\s+", " ", _text(value)).strip().lower()
    return not normalized or normalized in _INVALID_PROFILE_NAMES


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
        # Keep the visible DOM evidence so a single-profile run can show
        # exactly which LinkedIn page components supplied the identity.
        "page_components": profile.get("page_components") or {},
        "experiences": experiences,
        "educations": education,
    }


async def _cache_linkedin_avatar_from_page(page, public_id):
    """Download the largest authenticated portrait, falling back to a screenshot."""
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
        attributes = await image.evaluate("""element => ({
            src: element.getAttribute('src') || '',
            currentSrc: element.currentSrc || '',
            srcset: element.getAttribute('srcset') || ''
        })""")
        source_url = _largest_srcset_url(
            attributes.get("srcset", ""),
            attributes.get("currentSrc") or attributes.get("src", ""),
            page.url,
        )
        if source_url:
            try:
                response = await page.context.request.get(
                    source_url,
                    headers={"Referer": page.url},
                    timeout=30000,
                )
                content_type = response.headers.get("content-type", "").split(";", 1)[0]
                content = await response.body()
                if response.ok and content_type.startswith("image/") and content:
                    extension = {
                        "image/jpeg": "jpg", "image/png": "png",
                        "image/webp": "webp", "image/avif": "avif",
                    }.get(content_type, "img")
                    destination = destination.with_suffix("." + extension)
                    destination.write_bytes(content)
                    return _relative_path(destination)
            except Exception:
                # The authenticated CDN URL can expire between DOM extraction
                # and download. Retain the rendered-image fallback below.
                pass
        try:
            await image.screenshot(path=str(destination))
        except Exception:
            continue
        return _relative_path(destination)
    return None


def _relative_path(path):
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def _largest_srcset_url(srcset, fallback, page_url):
    """Select the largest advertised image candidate from an HTML srcset."""
    candidates = []
    for position, item in enumerate((srcset or "").split(",")):
        parts = item.strip().rsplit(None, 1)
        if not parts:
            continue
        descriptor = parts[1].lower() if len(parts) == 2 else ""
        try:
            size = float(descriptor[:-1]) if descriptor.endswith(("w", "x")) else 0.0
        except ValueError:
            size = 0.0
        candidates.append((size, -position, parts[0]))
    selected = max(candidates)[2] if candidates else fallback
    return urljoin(page_url, selected) if selected else None


async def _first_visible_text(locator):
    for index in range(await locator.count()):
        element = locator.nth(index)
        try:
            if await element.is_visible():
                value = _text(await element.inner_text())
                if value:
                    return value
        except Exception:
            continue
    return ""


async def _first_visible_component(root, selectors):
    """Return the selector and text for the first visible DOM match."""
    for selector in selectors:
        locator = root.locator(selector)
        for index in range(await locator.count()):
            element = locator.nth(index)
            try:
                if not await element.is_visible():
                    continue
                value = _text(await element.inner_text())
            except Exception:
                continue
            if value:
                return {"selector": selector, "text": value}
    return {"selector": "", "text": ""}


def _clean_component_lines(value):
    """Compact repeated accessibility text without inventing field values."""
    output = []
    for line in (value or "").splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if line and (not output or output[-1] != line):
            output.append(line)
    return output


async def _profile_section_component(section, section_name, section_index, heading, matched_by):
    """Capture visible list items from one Experience or Education section."""
    entries = []
    items = section.locator("li")
    for index in range(min(await items.count(), 20)):
        item = items.nth(index)
        try:
            if not await item.is_visible():
                continue
            lines = _clean_component_lines(await item.inner_text())
        except Exception:
            continue
        if not lines:
            continue
        joined = " ".join(lines).lower()
        if joined.startswith("show all ") or joined in {"experience", "education"}:
            continue
        # Nested LinkedIn list elements can expose the same text more than
        # once. Retain a stable, readable set for inspection.
        if lines not in entries:
            entries.append(lines[:12])
        if len(entries) >= 10:
            break
    return {
        "heading": section_name,
        "visible_heading": heading,
        "selector": "main section:nth-of-type({})".format(section_index + 1),
        "matched_by": matched_by,
        "entries": entries,
        "raw_lines": _clean_component_lines(await section.inner_text())[:60],
    }


async def _visible_profile_sections(main):
    components = {"experience": [], "education": [], "sections_seen": []}
    sections = main.locator("section")
    for index in range(await sections.count()):
        section = sections.nth(index)
        try:
            if not await section.is_visible():
                continue
            lines = _clean_component_lines(await section.inner_text())
        except Exception:
            continue
        heading_component = await _first_visible_component(
            section, ("h2", "h3", '[role="heading"]')
        )
        heading = heading_component["text"] or (lines[0] if lines else "")
        try:
            element_ids = await section.locator("[id]").evaluate_all(
                "elements => elements.map(element => element.id).filter(Boolean)"
            )
        except Exception:
            element_ids = []
        normalized_ids = {value.strip().lower() for value in element_ids}
        components["sections_seen"].append({
            "index": index + 1,
            "heading": heading,
            "heading_selector": heading_component["selector"],
            "element_ids": element_ids[:10],
            "visible_line_count": len(lines),
            "preview": lines[:8],
        })
        for section_name in components:
            if section_name == "sections_seen":
                continue
            heading_match = heading.strip().lower() == section_name
            id_match = section_name in normalized_ids
            if heading_match or id_match:
                components[section_name].append(
                    await _profile_section_component(
                        section,
                        section_name.title(),
                        index,
                        heading,
                        "heading" if heading_match else "element id",
                    )
                )
                break
    return components


async def _load_lazy_profile_sections(page):
    """Scroll through the profile so LinkedIn renders below-fold sections."""
    positions = []
    for fraction in (0.20, 0.40, 0.60, 0.80, 1.0):
        position = await page.evaluate(
            "fraction => {"
            " const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);"
            " const y = Math.floor(height * fraction);"
            " window.scrollTo(0, y);"
            " return {fraction, y, height};"
            "}",
            fraction,
        )
        positions.append(position)
        await page.wait_for_timeout(400)
    await page.evaluate("window.scrollTo(0, 0)")
    await page.wait_for_timeout(250)
    return positions


async def _augment_from_current_profile_dom(page, profile):
    """Fill v3.1.2 fields that its pre-React selectors no longer extract."""
    profile = profile if isinstance(profile, dict) else {}
    main = page.locator("main")
    if not await main.count():
        return profile

    # Current LinkedIn desktop pages expose the profile name as an h1 or with
    # text-heading-xlarge. h2 is a last-resort fallback because most section
    # labels (About, Experience, Education) are h2 elements too.
    name_component = await _first_visible_component(main, (
        "h1",
        ".text-heading-xlarge",
        '[data-anonymize="person-name"]',
        "h2",
    ))
    name = name_component["text"]
    if _is_invalid_profile_name(name):
        # A generic h2 may be a section label. Search every candidate while
        # retaining the selector that ultimately supplied the valid name.
        name = ""
        for selector in ("h1", ".text-heading-xlarge", '[data-anonymize="person-name"]', "h2"):
            candidates = main.locator(selector)
            for index in range(await candidates.count()):
                try:
                    candidate = _text(await candidates.nth(index).inner_text())
                except Exception:
                    continue
                if not _is_invalid_profile_name(candidate):
                    name = candidate
                    name_component = {"selector": selector, "text": candidate}
                    break
            if name:
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
    headline_component = await _first_visible_component(main, (
        ".text-body-medium.break-words",
        '[data-anonymize="headline"]',
    ))
    location_component = await _first_visible_component(main, (
        ".text-body-small.inline.t-black--light.break-words",
        '[data-anonymize="location"]',
    ))
    headline = headline_component["text"]
    location = location_component["text"]
    if not headline and len(top_lines) >= 2:
        headline = top_lines[1]
        headline_component = {"selector": "top profile section line 2", "text": headline}
    if not location and len(top_lines) >= 3:
        location = top_lines[2]
        location_component = {"selector": "top profile section line 3", "text": location}
    profile["headline"] = _text(profile.get("headline")) or headline
    profile["location"] = _text(profile.get("location")) or location
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
            title, headline_company = (
                part.strip() for part in headline.split(separator, 1)
            )
            company = company or headline_company
            break
    if company and not profile.get("experiences"):
        profile["experiences"] = [{
            "institution_name": company,
            "position_title": title,
        }]
    if school and not profile.get("educations"):
        profile["educations"] = [{"institution_name": school}]

    section_components = await _visible_profile_sections(main)
    profile["page_components"] = {
        "name": name_component,
        "headline": headline_component,
        "location": location_component,
        "experience": section_components["experience"],
        "education": section_components["education"],
        "sections_seen": section_components["sections_seen"],
    }
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
        scroll_positions = await _load_lazy_profile_sections(browser.page)
        current_profile = await _augment_from_current_profile_dom(browser.page, {
            "experiences": [],
            "educations": [],
        })
        current_profile.setdefault("page_components", {})["lazy_load_scroll"] = (
            scroll_positions
        )
        current_name = _text(current_profile.get("name"))
        current_url = browser.page.url.lower()
        if (
            _is_invalid_profile_name(current_name)
            or "/login" in current_url
            or "/uas/login" in current_url
        ):
            raise RuntimeError(
                "LinkedIn did not expose a valid profile top card (received {!r}). "
                "Refresh the session with `python create_linkedin_session.py` if needed."
                .format(current_name)
            )
        if current_name:
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
    linkedin_url = normalize_linkedin_url(linkedin_url)
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
