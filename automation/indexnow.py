#!/usr/bin/env python3
"""Tell IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also feeds ChatGPT search)
about every URL in the live sitemap. The key file /e3215b7ec0b01b92545c239d0e656f20.txt must be deployed first.

Usage: python3 automation/indexnow.py
"""
import re
import sys
import requests

SITE = "https://sophiacommons.org"
KEY = "e3215b7ec0b01b92545c239d0e656f20"
BATCH = 10000   # IndexNow accepts up to 10,000 URLs per request


def main() -> None:
    if requests.get(f"{SITE}/{KEY}.txt", timeout=20).text.strip() != KEY:
        sys.exit("Key file is not live yet: deploy first.")
    urls = re.findall(r"<loc>([^<]+)</loc>", requests.get(f"{SITE}/sitemap.xml", timeout=30).text)
    for i in range(0, len(urls), BATCH):
        r = requests.post("https://api.indexnow.org/indexnow", timeout=60, json={
            "host": "sophiacommons.org", "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt",
            "urlList": urls[i:i + BATCH]})
        print(f"submitted {len(urls[i:i + BATCH])} URLs: HTTP {r.status_code}")


if __name__ == "__main__":
    main()
