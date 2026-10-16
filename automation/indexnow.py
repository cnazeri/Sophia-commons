#!/usr/bin/env python3
"""Tell IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also feeds ChatGPT search)
about URLs. Default: every URL in the live sitemap. --recent: only listings, events and news
added or changed in the last RECENT_DAYS days (the daily job uses this). The key file /e3215b7ec0b01b92545c239d0e656f20.txt must be deployed first.

Usage: python3 automation/indexnow.py [--recent]   (--recent needs SUPABASE_URL + service key)
"""
import re
import sys
from datetime import datetime, timedelta, timezone
from os import environ

import requests

SITE = "https://sophiacommons.org"
KEY = "e3215b7ec0b01b92545c239d0e656f20"
BATCH = 10000   # IndexNow accepts up to 10,000 URLs per request
RECENT_DAYS = 2
# table -> (date column, page path), all public pages
RECENT = {"directory_entries": ("updated_at", "/listing/"), "events": ("created_at", "/event/"), "news": ("published_at", "/article/")}


def recent_urls() -> list[str]:
    base = environ["SUPABASE_URL"].rstrip("/")
    key = environ.get("SUPABASE_SERVICE_ROLE_KEY") or environ["SUPABASE_SERVICE_KEY"]
    h = {"apikey": key, "Authorization": "Bearer " + key}
    since = (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)).isoformat()
    status = {"directory_entries": "eq.approved", "events": "in.(upcoming,ongoing)", "news": "eq.published"}
    urls = []
    for table, (col, path) in RECENT.items():
        rows = requests.get(f"{base}/rest/v1/{table}", headers=h, timeout=30, params={
            "select": "id", col: "gte." + since, "status": status[table], "limit": "5000"}).json()
        urls += [f"{SITE}{path}{r['id']}" for r in rows]
    return urls


def main() -> None:
    if requests.get(f"{SITE}/{KEY}.txt", timeout=20).text.strip() != KEY:
        sys.exit("Key file is not live yet: deploy first.")
    if "--recent" in sys.argv:
        urls = recent_urls()
        if not urls:
            print("nothing new to submit")
            return
    else:
        urls = re.findall(r"<loc>([^<]+)</loc>", requests.get(f"{SITE}/sitemap.xml", timeout=30).text)
    for i in range(0, len(urls), BATCH):
        r = requests.post("https://api.indexnow.org/indexnow", timeout=60, json={
            "host": "sophiacommons.org", "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt",
            "urlList": urls[i:i + BATCH]})
        print(f"submitted {len(urls[i:i + BATCH])} URLs: HTTP {r.status_code}")


if __name__ == "__main__":
    main()
