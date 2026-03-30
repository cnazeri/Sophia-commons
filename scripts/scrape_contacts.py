#!/usr/bin/env python3
"""
Scrape contact information (emails, phone numbers) for Sophia Commons directory entries
that are missing them. Uses Firecrawl for scraping and updates Supabase via REST API.
"""

import re
import sys
import time
import json
import requests
from urllib.parse import urlparse

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
from firecrawl import FirecrawlApp

# ── Config ──────────────────────────────────────────────────────────────────
FIRECRAWL_API_KEY = "fc-499584bac759497f95f86dae1bc48d23"
SUPABASE_URL = "https://bnrvgitzbpocratvszgk.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJucnZnaXR6YnBvY3JhdHZzemdrIiwi"
    "cm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3Nzg1NSwiZXhwIjoyMDg5"
    "ODUzODU1fQ.sPDaXVtz5fJ2ziXwEImbTvNr012IFlTZEXIZds6rzRY"
)
RATE_LIMIT_SECONDS = 2.0  # Between each Firecrawl API call

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

# Domains that Firecrawl cannot scrape -- skip entirely
UNSUPPORTED_DOMAINS = [
    "facebook.com", "fb.com", "twitter.com", "x.com",
    "instagram.com", "tiktok.com", "youtube.com", "youtu.be",
    "spotify.com", "apple.com/podcast", "podcasts.apple.com",
    "linkedin.com", "pinterest.com", "reddit.com",
    "amazon.com", "amzn.to", "play.google.com",
]

# Junk email patterns to filter out
JUNK_EMAIL_PATTERNS = [
    "noreply", "no-reply", "example", "test@", "wixpress",
    "sentry", "webpack", "domain.com", "email@", "your@",
    "info@example", "name@", "user@", "someone@", "placeholder",
    "changeme", "foo@", "bar@", "sample@", ".png", ".jpg", ".gif",
    "sass", ".css", ".js", "localhost", "yourname", "youremail",
    "protection", "cloudflare", "@sentry", "wix.com", "@w3.org",
    "@2x.", "encoded", "%40", "gutenberg", "@media",
]

# Common contact page paths to try (reduced set -- most impactful first)
CONTACT_PATHS = [
    "/contact",
    "/contact-us",
    "/about",
    "",  # homepage as fallback
]

# ── Helpers ─────────────────────────────────────────────────────────────────

def is_unsupported_url(url: str) -> bool:
    """Check if URL is from a domain Firecrawl cannot scrape."""
    try:
        host = urlparse(url).hostname or ""
        host = host.lower()
        for domain in UNSUPPORTED_DOMAINS:
            if domain in host:
                return True
    except Exception:
        pass
    return False


def is_junk_email(email: str) -> bool:
    email_lower = email.lower()
    for pattern in JUNK_EMAIL_PATTERNS:
        if pattern in email_lower:
            return True
    local = email_lower.split("@")[0]
    if len(local) > 40:
        return True
    return False


def extract_emails(text: str) -> list[str]:
    """Extract valid emails from text, filtering junk."""
    pattern = r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
    raw = set(re.findall(pattern, text))
    return [e for e in raw if not is_junk_email(e)]


def extract_phones(text: str) -> list[str]:
    """Extract phone numbers (10+ digits) from text."""
    patterns = [
        r'\+?1[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}',
        r'\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}',
    ]
    phones = set()
    for p in patterns:
        for match in re.findall(p, text):
            digits = re.sub(r'\D', '', match)
            if len(digits) == 10:
                phones.add(f"({digits[:3]}) {digits[3:6]}-{digits[6:]}")
            elif len(digits) == 11 and digits[0] == '1':
                digits = digits[1:]
                phones.add(f"({digits[:3]}) {digits[3:6]}-{digits[6:]}")
    # Filter out obvious non-phone numbers (all zeros, sequential, etc.)
    valid = []
    for ph in phones:
        d = re.sub(r'\D', '', ph)
        if d == "0000000000" or d == "1234567890":
            continue
        valid.append(ph)
    return valid


def normalize_url(url: str) -> str:
    """Ensure URL has scheme."""
    url = url.strip().rstrip("/")
    if not url.startswith("http"):
        url = "https://" + url
    return url


# ── Supabase helpers ────────────────────────────────────────────────────────

def fetch_entries_missing_contacts() -> list[dict]:
    """Fetch entries with website_url but missing email or phone."""
    # Fetch ALL entries, then filter in Python (avoids PostgREST filter syntax issues)
    all_rows = []
    offset = 0
    page_size = 500
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/directory_entries",
            headers=HEADERS,
            params={
                "select": "id,organization_name,website_url,email,phone",
                "limit": str(page_size),
                "offset": str(offset),
            },
        )
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break
        all_rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    print(f"Total rows fetched: {len(all_rows)}")

    # Filter: has website, missing email (highest priority)
    missing_email = [
        r for r in all_rows
        if r.get("website_url") and not r.get("email")
    ]
    missing_email.sort(key=lambda r: r.get("organization_name") or "")
    print(f"Entries missing EMAIL (with website): {len(missing_email)}")

    # Filter: has website + email, missing phone
    missing_phone_only = [
        r for r in all_rows
        if r.get("website_url") and r.get("email") and not r.get("phone")
    ]
    missing_phone_only.sort(key=lambda r: r.get("organization_name") or "")
    print(f"Entries missing PHONE (has email, with website): {len(missing_phone_only)}")

    return missing_email + missing_phone_only


def update_entry(entry_id: str, updates: dict) -> bool:
    """PATCH an entry in Supabase."""
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/directory_entries?id=eq.{entry_id}",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=updates,
    )
    return resp.status_code in (200, 204)


# ── Scraping ────────────────────────────────────────────────────────────────

def scrape_one(url: str, app: FirecrawlApp) -> str:
    """Scrape a single URL with rate-limit backoff. Returns markdown or empty string."""
    for attempt in range(3):
        try:
            result = app.scrape(url, formats=["markdown"])
            if hasattr(result, 'markdown') and result.markdown:
                return result.markdown
            elif isinstance(result, dict) and result.get("markdown"):
                return result["markdown"]
            return ""
        except Exception as e:
            err_str = str(e)
            if "Rate Limit" in err_str or "429" in err_str:
                wait = 10 * (attempt + 1)
                print(f"    Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise
    return ""


def scrape_contact_info(website_url: str, app: FirecrawlApp) -> dict:
    """Try common contact pages and extract emails/phones."""
    base_url = normalize_url(website_url)
    found_emails = []
    found_phones = []

    for path in CONTACT_PATHS:
        url = base_url + path
        try:
            content = scrape_one(url, app)
            if not content:
                time.sleep(RATE_LIMIT_SECONDS)
                continue

            emails = extract_emails(content)
            phones = extract_phones(content)
            found_emails.extend(emails)
            found_phones.extend(phones)

            # If we found an email, stop trying more pages
            if emails:
                break

        except Exception as e:
            err_str = str(e)
            if any(s in err_str for s in ["404", "403", "timeout", "Not Supported"]):
                pass  # silently skip
            else:
                print(f"    Error scraping {url}: {err_str[:120]}")

        time.sleep(RATE_LIMIT_SECONDS)

    return {
        "emails": list(dict.fromkeys(found_emails)),
        "phones": list(dict.fromkeys(found_phones)),
    }


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Sophia Commons -- Contact Scraper")
    print("=" * 60)

    app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

    entries = fetch_entries_missing_contacts()
    print(f"\nTotal entries to process: {len(entries)}")
    print("-" * 60)

    stats = {
        "processed": 0,
        "emails_found": 0,
        "phones_found": 0,
        "updated": 0,
        "errors": 0,
        "skipped_unsupported": 0,
        "skipped_no_website": 0,
    }

    for i, entry in enumerate(entries):
        entry_id = entry["id"]
        name = entry.get("organization_name") or "Unknown"
        website = entry.get("website_url")
        existing_email = entry.get("email")
        existing_phone = entry.get("phone")

        if not website:
            stats["skipped_no_website"] += 1
            continue

        # Skip unsupported platforms
        if is_unsupported_url(website):
            stats["skipped_unsupported"] += 1
            print(f"[{i+1}/{len(entries)}] {name} -- SKIP (unsupported platform)")
            continue

        print(f"\n[{i+1}/{len(entries)}] {name}")
        print(f"  Website: {website}")
        print(f"  Current: email={existing_email or '(none)'}, phone={existing_phone or '(none)'}")

        try:
            result = scrape_contact_info(website, app)
        except Exception as e:
            print(f"  SCRAPE ERROR: {e}")
            stats["errors"] += 1
            time.sleep(RATE_LIMIT_SECONDS)
            continue

        stats["processed"] += 1

        emails = result["emails"]
        phones = result["phones"]

        updates = {}
        if not existing_email and emails:
            updates["email"] = emails[0]
            stats["emails_found"] += 1
            print(f"  -> Found email: {emails[0]}")
            if len(emails) > 1:
                print(f"     (also found: {', '.join(emails[1:])})")

        if not existing_phone and phones:
            updates["phone"] = phones[0]
            stats["phones_found"] += 1
            print(f"  -> Found phone: {phones[0]}")

        if updates:
            success = update_entry(entry_id, updates)
            if success:
                stats["updated"] += 1
                print(f"  -> Updated in Supabase!")
            else:
                print(f"  -> FAILED to update Supabase")
                stats["errors"] += 1
        else:
            print(f"  -> No new contact info found")

    # Final report
    print("\n" + "=" * 60)
    print("FINAL STATS")
    print("=" * 60)
    print(f"  Processed:          {stats['processed']}")
    print(f"  Emails found:       {stats['emails_found']}")
    print(f"  Phones found:       {stats['phones_found']}")
    print(f"  DB updated:         {stats['updated']}")
    print(f"  Errors:             {stats['errors']}")
    print(f"  Skipped (platform): {stats['skipped_unsupported']}")
    print(f"  Skipped (no URL):   {stats['skipped_no_website']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
