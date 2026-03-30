#!/usr/bin/env python3
"""
Batch enrich remaining Sophia Commons directory entries.
Crawls websites with Firecrawl, extracts contacts, generates tags, pushes to Supabase.
"""

import json, time, re, sys, os
import requests
from firecrawl import FirecrawlApp

# ── Config ──
FIRECRAWL_API_KEY = "fc-499584bac759497f95f86dae1bc48d23"
SUPABASE_TOKEN = "sbp_fb7d67067f782e4a564a14f34b7b54f0f5980dbf"
PROJECT_REF = "bnrvgitzbpocratvszgk"
SUPABASE_URL = "https://bnrvgitzbpocratvszgk.supabase.co"

app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

# Get service role key
r = requests.get(f'https://api.supabase.com/v1/projects/{PROJECT_REF}/api-keys',
                 headers={'Authorization': f'Bearer {SUPABASE_TOKEN}'})
SERVICE_KEY = [k['api_key'] for k in r.json() if k['name'] == 'service_role'][0]
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ── Tag generation by category ──
CATEGORY_TAGS = {
    "waldorf": ["waldorf education", "steiner education"],
    "biodynamic": ["biodynamic", "agriculture"],
    "eurythmy": ["eurythmy", "movement arts"],
    "online": ["online resource"],
    "eldercare": ["eldercare", "senior living"],
    "medicine": ["anthroposophic medicine", "health"],
    "camphill": ["camphill", "intentional community", "disabilities"],
    "societies": ["anthroposophical society"],
    "community": ["community"],
    "health": ["health", "anthroposophic medicine"],
    "arts": ["arts"],
    "social_media": ["social media"],
}

def extract_tags_from_text(text, category):
    """Generate tags from crawled text and category."""
    tags = list(CATEGORY_TAGS.get(category, []))
    text_lower = text.lower()

    tag_keywords = {
        "biodynamic": "biodynamic", "waldorf": "waldorf", "eurythmy": "eurythmy",
        "organic": "organic", "farm": "farming", "garden": "gardening",
        "teacher training": "teacher training", "kindergarten": "kindergarten",
        "preschool": "preschool", "high school": "high school",
        "montessori": "montessori", "therapeutic": "therapeutic",
        "curative": "curative education", "camphill": "camphill",
        "lifesharing": "lifesharing", "volunteer": "volunteer",
        "research": "research", "conference": "conferences",
        "workshop": "workshops", "retreat": "retreat",
        "meditation": "meditation", "yoga": "yoga",
        "homeopathic": "homeopathic", "pharmacy": "pharmacy",
        "publishing": "publishing", "podcast": "podcast",
        "magazine": "magazine", "journal": "journal",
        "library": "library", "archive": "archive",
        "certification": "certification", "csa": "CSA",
        "winery": "winery", "vineyard": "vineyard",
        "demeter": "demeter certified", "nonprofit": "nonprofit",
        "charter school": "charter school", "public school": "public school",
        "boarding": "boarding school", "special needs": "special needs",
        "disability": "disabilities", "elder": "eldercare",
        "nursing": "nursing care", "anthroposophy": "anthroposophy",
    }

    for keyword, tag in tag_keywords.items():
        if keyword in text_lower and tag not in tags:
            tags.append(tag)

    return tags[:8]  # Max 8 tags

def extract_contacts(markdown):
    """Extract email, phone, address from markdown text."""
    result = {}

    # Emails
    emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', markdown)
    emails = [e for e in emails if not any(x in e.lower() for x in
              ['example', 'sentry', 'webpack', 'noreply', 'wixpress', 'email.com', 'test', 'domain'])]
    if emails:
        result['email'] = emails[0]

    # Phones (US format)
    phones = re.findall(r'[\(]?\d{3}[\)]?[-.\s]?\d{3}[-.\s]?\d{4}', markdown)
    if phones:
        result['phone'] = phones[0]

    # Addresses
    addr = re.findall(r'\d+\s+[A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way)[.,]?\s*(?:[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})?', markdown)
    if addr:
        result['address'] = addr[0].strip()[:200]

    return result

def build_description(entry, crawl_data):
    """Build enriched description from crawl data."""
    meta_desc = ""
    if crawl_data:
        meta = crawl_data.get("metadata", {})
        meta_desc = meta.get("og_description") or meta.get("description") or ""
        meta_desc = meta_desc.strip()

    # If meta description is good (>30 chars, not just the org name), use it
    if meta_desc and len(meta_desc) > 30:
        # Clean up common noise
        meta_desc = re.sub(r'\s+', ' ', meta_desc)
        return meta_desc[:400]

    # Otherwise keep existing description
    return entry.get("description", "")

def crawl_site(url):
    """Scrape a URL with Firecrawl."""
    try:
        result = app.scrape(url, formats=["markdown"])
        if not result or not result.markdown:
            return None
        meta = result.metadata
        return {
            "markdown": result.markdown[:4000],
            "metadata": {
                "title": getattr(meta, 'title', '') or '',
                "description": getattr(meta, 'description', '') or '',
                "og_description": getattr(meta, 'og_description', '') or '',
            }
        }
    except Exception as e:
        return None

def main():
    # Load entries
    with open('/tmp/unenriched_entries.json') as f:
        entries = json.load(f)

    total = len(entries)
    print(f"Processing {total} entries...\n")

    success = 0
    crawl_fail = 0
    update_fail = 0
    emails_found = 0
    phones_found = 0

    for i, entry in enumerate(entries):
        name = entry['organization_name']
        url = entry.get('website_url', '')
        category = entry.get('category', '')

        sys.stdout.write(f"  [{i+1:3d}/{total}] {name[:50]:50s} ")
        sys.stdout.flush()

        # Crawl
        crawl_data = crawl_site(url) if url else None

        if not crawl_data:
            # Even without crawl, generate tags from existing description
            tags = extract_tags_from_text(entry.get('description', '') + ' ' + name, category)
            update_data = {"tags": tags} if tags else {}
            crawl_fail += 1
            status = "tags-only"
        else:
            markdown = crawl_data["markdown"]
            combined_text = markdown + ' ' + name + ' ' + entry.get('description', '')

            # Extract everything
            tags = extract_tags_from_text(combined_text, category)
            contacts = extract_contacts(markdown)
            new_desc = build_description(entry, crawl_data)

            update_data = {"tags": tags}
            if new_desc and len(new_desc) > len(entry.get('description', '')):
                update_data["description"] = new_desc
            if contacts.get('email') and not entry.get('email'):
                update_data["email"] = contacts['email']
                emails_found += 1
            if contacts.get('phone') and not entry.get('phone'):
                update_data["phone"] = contacts['phone']
                phones_found += 1
            if contacts.get('address'):
                update_data["address"] = contacts['address']

            status = "enriched"

        # Push to Supabase
        if update_data:
            r = requests.patch(
                f"{SUPABASE_URL}/rest/v1/directory_entries",
                headers=HEADERS,
                params={"id": f"eq.{entry['id']}"},
                json=update_data
            )
            if r.status_code == 200 and len(r.json()) > 0:
                success += 1
                print(f"OK ({status})")
            else:
                update_fail += 1
                print(f"UPDATE FAIL ({r.status_code})")
        else:
            print("skip")

        # Rate limit
        time.sleep(1.5)

    print(f"\n{'='*60}")
    print(f"BATCH ENRICHMENT COMPLETE")
    print(f"{'='*60}")
    print(f"Total processed:  {total}")
    print(f"Updated:          {success}")
    print(f"Crawl failures:   {crawl_fail} (tags still added from existing data)")
    print(f"Update failures:  {update_fail}")
    print(f"New emails found: {emails_found}")
    print(f"New phones found: {phones_found}")

if __name__ == "__main__":
    main()
