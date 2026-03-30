#!/usr/bin/env python3
"""
Enrich Sophia Commons directory entries by crawling organization websites with Firecrawl.
Outputs enriched SQL and a JSON report.
"""

import json
import time
import re
import os
from firecrawl import FirecrawlApp

FIRECRAWL_API_KEY = "fc-499584bac759497f95f86dae1bc48d23"
app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

# Current entries extracted from seed_directory.sql
ENTRIES = [
    {"name": "General Anthroposophical Society at the Goetheanum", "url": "https://goetheanum.ch/en/society", "category": "societies", "location": "Dornach", "country": "Switzerland"},
    {"name": "Goetheanum School of Spiritual Science", "url": "https://goetheanum.ch/en/school", "category": "waldorf", "location": "Dornach", "country": "Switzerland"},
    {"name": "Anthroposophical Society in America", "url": "https://anthroposophy.org/", "category": "societies", "location": "Ann Arbor, MI", "country": "USA"},
    {"name": "Association of Waldorf Schools of North America", "url": "https://www.waldorfeducation.org/", "category": "waldorf", "location": "Sacramento, CA", "country": "USA"},
    {"name": "Alliance for Public Waldorf Education", "url": "https://www.publicwaldorf.org/", "category": "waldorf", "location": "Sacramento, CA", "country": "USA"},
    {"name": "Rudolf Steiner School NYC", "url": "https://www.steiner.edu/", "category": "waldorf", "location": "New York, NY", "country": "USA"},
    {"name": "Green Meadow Waldorf School", "url": "https://www.greenmeadow.org/", "category": "waldorf", "location": "Spring Valley, NY", "country": "USA"},
    {"name": "Highland Hall Waldorf School", "url": "https://highlandhall.org/", "category": "waldorf", "location": "Northridge, CA", "country": "USA"},
    {"name": "Sacramento Waldorf School", "url": "https://www.sacwaldorf.org/", "category": "waldorf", "location": "Fair Oaks, CA", "country": "USA"},
    {"name": "Hawthorne Valley Waldorf School", "url": "https://hawthornevalley.org/", "category": "waldorf", "location": "Ghent, NY", "country": "USA"},
    {"name": "Sunbridge Institute", "url": "https://www.sunbridge.edu/", "category": "waldorf", "location": "Chestnut Ridge, NY", "country": "USA"},
    {"name": "Threefold Educational Foundation", "url": "https://threefold.org/", "category": "community", "location": "Chestnut Ridge, NY", "country": "USA"},
    {"name": "Fellowship Community", "url": "https://www.fellowshipcommunity.org/", "category": "community", "location": "Spring Valley, NY", "country": "USA"},
    {"name": "Camphill Association of North America", "url": "https://www.camphill.org/", "category": "community", "location": None, "country": None},
    {"name": "Camphill Village USA (Copake)", "url": "https://camphillvillage.org/", "category": "community", "location": "Copake, NY", "country": "USA"},
    {"name": "Demeter USA", "url": "https://demeter-usa.org/", "category": "agriculture", "location": "Phoenixville, PA", "country": "USA"},
    {"name": "Biodynamic Association", "url": "https://www.biodynamics.com/", "category": "agriculture", "location": "Milwaukee, WI", "country": "USA"},
    {"name": "Hawthorne Valley Farm", "url": "https://hawthornevalley.org/", "category": "agriculture", "location": "Ghent, NY", "country": "USA"},
    {"name": "Physicians' Association for Anthroposophic Medicine", "url": "https://anthroposophicmedicine.org/", "category": "health", "location": "Ann Arbor, MI", "country": "USA"},
    {"name": "Weleda USA", "url": "https://www.weleda.com/", "category": "health", "location": "Irvington, NY", "country": "USA"},
    {"name": "Klinik Arlesheim", "url": "https://www.klinik-arlesheim.ch/", "category": "health", "location": "Arlesheim", "country": "Switzerland"},
    {"name": "Eurythmy Spring Valley", "url": "https://www.eurythmy.org/", "category": "arts", "location": "Chestnut Ridge, NY", "country": "USA"},
    {"name": "SteinerBooks / Anthroposophic Press", "url": "https://steinerbooks.org/", "category": "online", "location": "Spencertown, NY", "country": "USA"},
    {"name": "Rudolf Steiner Archive", "url": "https://rsarchive.org/", "category": "online", "location": "Interlochen, MI", "country": "USA"},
    {"name": "Waldorf Early Childhood Association of North America", "url": "https://waldorfearlychildhood.org/", "category": "waldorf", "location": None, "country": None},
    {"name": "Emerson College", "url": "https://emerson.org.uk/", "category": "waldorf", "location": "Forest Row", "country": "UK"},
    {"name": "Alanus University", "url": "https://www.alanus.edu/en/home", "category": "waldorf", "location": "Alfter", "country": "Germany"},
    {"name": "The Christian Community", "url": "https://www.thechristiancommunity.org/", "category": "community", "location": None, "country": None},
    {"name": "LILIPOH Magazine", "url": "https://lilipoh.com/", "category": "online", "location": None, "country": None},
    {"name": "Rudolf Steiner House - London", "url": "https://rsh.anth.org.uk/", "category": "societies", "location": "London", "country": "UK"},
]

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "Directory", "enriched_directory.json")

def crawl_site(url, name):
    """Scrape a single page with Firecrawl and extract useful info."""
    try:
        print(f"  Crawling: {name} ({url})")
        result = app.scrape(url, formats=["markdown"])

        if not result or not result.markdown:
            print(f"    -> No content returned")
            return None

        markdown = result.markdown[:3000]
        meta = result.metadata

        return {
            "markdown_excerpt": markdown,
            "title": getattr(meta, 'title', '') or '',
            "description": getattr(meta, 'description', '') or '',
            "og_description": getattr(meta, 'og_description', '') or '',
        }
    except Exception as e:
        print(f"    -> Error: {e}")
        return None

def enrich_entry(entry, crawl_data):
    """Combine existing entry with crawled data for richer info."""
    enriched = dict(entry)

    if crawl_data:
        # Build enriched description from crawl
        parts = []
        if crawl_data.get("og_description"):
            parts.append(crawl_data["og_description"])
        elif crawl_data.get("description"):
            parts.append(crawl_data["description"])

        # Extract phone numbers from markdown
        phone_pattern = r'[\(]?\d{3}[\)]?[-.\s]?\d{3}[-.\s]?\d{4}'
        phones = re.findall(phone_pattern, crawl_data.get("markdown_excerpt", ""))
        if phones:
            enriched["phone_found"] = phones[0]

        # Extract emails
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = re.findall(email_pattern, crawl_data.get("markdown_excerpt", ""))
        # Filter out common non-contact emails
        emails = [e for e in emails if not any(x in e.lower() for x in ['example', 'sentry', 'webpack', 'noreply'])]
        if emails:
            enriched["email_found"] = emails[0]

        # Extract address patterns
        address_pattern = r'\d+\s+[A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Court|Ct)[.,]?\s*(?:[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})?'
        addresses = re.findall(address_pattern, crawl_data.get("markdown_excerpt", ""))
        if addresses:
            enriched["address_found"] = addresses[0].strip()

        enriched["crawl_description"] = " ".join(parts)[:500] if parts else ""
        enriched["crawl_title"] = crawl_data.get("title", "")
        enriched["markdown_excerpt"] = crawl_data.get("markdown_excerpt", "")[:1500]

    return enriched

def main():
    print(f"Starting enrichment crawl for {len(ENTRIES)} priority entries...\n")

    enriched_entries = []

    for i, entry in enumerate(ENTRIES):
        print(f"[{i+1}/{len(ENTRIES)}] {entry['name']}")
        crawl_data = crawl_site(entry["url"], entry["name"])
        enriched = enrich_entry(entry, crawl_data)
        enriched_entries.append(enriched)

        # Rate limit: ~1 request per 2 seconds
        if i < len(ENTRIES) - 1:
            time.sleep(2)

    # Save results
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(enriched_entries, f, indent=2)

    # Summary
    found_emails = sum(1 for e in enriched_entries if e.get("email_found"))
    found_phones = sum(1 for e in enriched_entries if e.get("phone_found"))
    found_addresses = sum(1 for e in enriched_entries if e.get("address_found"))
    found_descriptions = sum(1 for e in enriched_entries if e.get("crawl_description"))

    print(f"\n{'='*50}")
    print(f"ENRICHMENT COMPLETE")
    print(f"{'='*50}")
    print(f"Total crawled:        {len(enriched_entries)}")
    print(f"New descriptions:     {found_descriptions}")
    print(f"Emails discovered:    {found_emails}")
    print(f"Phones discovered:    {found_phones}")
    print(f"Addresses discovered: {found_addresses}")
    print(f"\nResults saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
