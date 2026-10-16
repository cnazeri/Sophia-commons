#!/usr/bin/env python3
"""
Sophia Commons :: Facebook upkeep (daily, from .github/workflows/weekly.yml)
============================================================================
1. New listings (created in the last LOOKBACK_DAYS days) with a website but no facebook_url:
   read the site, take its first Facebook page link (or first group link), add it to
   facebook_pages (Podcasts & Media > Facebook Pages & Groups) and set the listing's facebook_url.
2. Pages and groups added in the last LOOKBACK_DAYS days without a picture: fetch the public
   profile picture (pages) or link-preview image (public groups), cut it to a 96 px square and
   store it in the listing-photos bucket under fb/<slug>.jpg.
Only fills empty fields. Same rules as the one-off scripts (scripts/find_facebook_pages.py,
load_facebook_pages.py, fetch_facebook_avatars.py), which stay local.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY locally)
Run locally: python3 automation/facebook_daily.py --dry-run
"""
import argparse
import io
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from os import environ

import requests
from PIL import Image

LOOKBACK_DAYS = 3
AVATAR_SIZE = 96
BUCKET = "listing-photos"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
FB_CRAWLER_UA = {"User-Agent": "facebookexternalhit/1.1", "Accept-Language": "en"}
FB_LINK = re.compile(r'https?://(?:www\.|m\.|[a-z]{2}-[a-z]{2}\.)?facebook\.com/([^"\'\s<>?#]+)', re.I)
OG_IMAGE = re.compile(r'property="og:image"\s+content="([^"]+)"')
SKIP = {"sharer", "sharer.php", "share", "share.php", "plugins", "tr", "dialog", "login", "policy.php", "privacy",
        "help", "events", "hashtag", "watch", "photo.php", "photo", "story.php", "permalink.php", "l.php",
        "profile.php", "facebook", "2008", "people", "reel", "reels", "videos", "wordpresscom", "wix",
        "squarespace", "weebly", "jimdo", "godaddy", "media", "ads", "search", "policies"}
CATEGORY_MAP = {"waldorf": "waldorf", "biodynamic": "biodynamic", "christian_community": "christian_community",
                "camphill": "camphill", "eurythmy": "eurythmy", "medicine": "medicine", "eldercare": "camphill"}


def log(*a):
    print(datetime.now(timezone.utc).strftime("%H:%M:%S"), *a, flush=True)


def first_facebook_link(html: str) -> str | None:
    """The site's own page if it links one, else its first group."""
    pages, groups = [], []
    for m in FB_LINK.finditer(html):
        path = m.group(1).strip("/").split("/")
        head = path[0].lower()
        if head == "groups" and len(path) > 1:
            groups.append(f"https://www.facebook.com/groups/{path[1]}/")
        elif head == "pages" and len(path) > 2:
            pages.append(f"https://www.facebook.com/{path[1]}/{path[2]}/")
        elif head not in SKIP and not head.endswith(".php") and not head.isdigit() and re.match(r"^[a-z0-9.\-_]{3,}$", head):
            pages.append(f"https://www.facebook.com/{path[0]}/")
    return (pages or groups or [None])[0]


def slug_of(url: str) -> str:
    path = url.lower().split("facebook.com/")[1].strip("/")
    return ("fb-" + re.sub(r"[^a-z0-9.]+", "-", path)).strip("-")[:80]


def picture_url(url: str, kind: str) -> str | None:
    path = url.split("facebook.com/")[1].strip("/")
    if kind == "page" and "/" not in path:
        r = requests.get(f"https://graph.facebook.com/{path}/picture", params={"type": "large", "redirect": "false"}, timeout=15)
        data = r.json().get("data", {}) if r.ok else {}
        if data.get("is_silhouette"):
            return None
        if data.get("url"):
            return data["url"]
    r = requests.get(url, headers=FB_CRAWLER_UA, timeout=15)
    m = OG_IMAGE.search(r.text) if r.ok else None
    return m.group(1).replace("&amp;", "&") if m else None


def square_jpeg(data: bytes) -> bytes:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85, optimize=True)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--days", type=int, default=LOOKBACK_DAYS)
    args = ap.parse_args()
    base = environ.get("SUPABASE_URL", "").rstrip("/")
    key = environ.get("SUPABASE_SERVICE_ROLE_KEY") or environ.get("SUPABASE_SERVICE_KEY")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    H = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}
    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()

    # 1. new listings -> their Facebook page
    rows = requests.get(base + "/rest/v1/directory_entries", headers=H, timeout=60, params={
        "select": "id,organization_name,category,country,website_url", "status": "eq.approved",
        "created_at": "gte." + since, "facebook_url": "is.null", "website_url": "not.is.null", "limit": "200"}).json()
    added = 0
    for row in rows:
        try:
            r = requests.get(row["website_url"], headers=UA, timeout=15)
            link = first_facebook_link(r.text) if r.ok else None
        except requests.RequestException:
            link = None
        if not link:
            continue
        # Already listed means another listing (or an umbrella body such as a national federation)
        # owns it: a congregation linking its national page must not get that as its own page.
        known = requests.get(base + "/rest/v1/facebook_pages", headers=H, timeout=30,
                             params={"select": "slug", "slug": "eq." + slug_of(link)}).json()
        if known:
            continue
        kind = "group" if "/groups/" in link else "page"
        log(f"  fb   {row['organization_name']}  <- {link}")
        if args.dry_run:
            added += 1
            continue
        requests.post(base + "/rest/v1/facebook_pages", timeout=30, params={"on_conflict": "slug"},
                      headers={**H, "Prefer": "resolution=ignore-duplicates,return=minimal"}, json={
                          "slug": slug_of(link), "url": link, "kind": kind,
                          "name": row["organization_name"] + (" (group)" if kind == "group" else ""),
                          "category": CATEGORY_MAP.get(row.get("category"), "anthroposophy"),
                          "country": row.get("country"), "listing_id": row["id"], "listing_count": 1,
                          "source": "website-scan"})
        if kind == "page":
            requests.patch(base + "/rest/v1/directory_entries", headers=H, timeout=30,
                           params={"id": "eq." + row["id"], "facebook_url": "is.null"}, json={"facebook_url": link})
        added += 1
    log(f"facebook links: {added} of {len(rows)} new listings")

    # 2. recent pages and groups -> picture
    pages = requests.get(base + "/rest/v1/facebook_pages", headers=H, timeout=60, params={
        "select": "slug,url,kind", "avatar_url": "is.null", "active": "eq.true",
        "created_at": "gte." + since, "limit": "100"}).json()
    pics = 0
    for p in pages:
        time.sleep(0.5)
        try:
            src = picture_url(p["url"], p["kind"])
            img = requests.get(src, timeout=20) if src else None
            if not img or not img.ok or not img.headers.get("content-type", "").startswith("image/"):
                continue
            jpg = square_jpeg(img.content)
        except Exception as exc:  # one bad page must not stop the job
            log(f"  !    {p['slug']}: {exc.__class__.__name__}")
            continue
        if args.dry_run:
            pics += 1
            continue
        path = f"fb/{p['slug']}.jpg"
        up = requests.post(f"{base}/storage/v1/object/{BUCKET}/{path}", data=jpg, timeout=30,
                           headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "image/jpeg",
                                    "x-upsert": "true", "cache-control": "max-age=31536000"})
        if up.ok:
            requests.patch(base + "/rest/v1/facebook_pages", headers=H, timeout=30, params={"slug": "eq." + p["slug"]},
                           json={"avatar_url": f"{base}/storage/v1/object/public/{BUCKET}/{path}"})
            pics += 1
    log(f"facebook pictures: {pics} of {len(pages)} recent pages" + (" (dry run)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
