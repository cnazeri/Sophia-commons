#!/usr/bin/env python3
"""
Sophia Commons :: finish new directory listings (daily)
=======================================================
A listing approved in the admin panel has a name, a place and maybe a website, but no map pin and
no picture. For approved listings created in the last LOOKBACK_DAYS days this job:
  1. adds latitude/longitude from OpenStreetMap (Nominatim, 1 request per second) so it shows on the map;
  2. adds a picture from the listing's own website (its og:image / twitter:image share image),
     resized to 480 px wide and stored in the public listing-photos bucket.
It only fills empty fields, never overwrites.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY locally)
Run locally:  python3 automation/new_listings.py --dry-run [--days 30]
"""
import argparse, html, io, re, sys, time
from datetime import datetime, timedelta, timezone
from os import environ
from urllib.parse import urljoin
import requests
from PIL import Image, ImageOps

LOOKBACK_DAYS = 14
BUCKET = "listing-photos"
MAX_W = 480
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
NOMINATIM = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA = {"User-Agent": "SophiaCommonsBot/1.0 (+https://sophiacommons.org)"}


def log(*a):
    print(datetime.now(timezone.utc).strftime("%H:%M:%S"), *a, flush=True)


# ── geocoding ───────────────────────────────────────────────────────────────
def place_queries(row):
    """Most specific first: full address, then city + country, then the free-text location."""
    loc, country = row.get("location") or "", row.get("country") or ""
    qs = [row.get("address"),
          ", ".join(x for x in (row.get("city"), row.get("region"), country) if x),
          loc if country.lower() in loc.lower() else ", ".join(x for x in (loc, country) if x)]
    out = []
    for q in qs:
        q = (q or "").strip(" ,")
        # a bare country or "International" would drop a pin in the middle of nowhere
        if q and q not in out and q.lower() not in (country.lower(), "international", "online", "worldwide", "global"):
            out.append(q)
    return out


# Nominatim result types too coarse for a map pin (a whole country or state)
TOO_COARSE = {"continent", "country", "state", "region", "province", "ocean", "sea"}


ONLINE_CATEGORIES = {"online", "social_media"}
ONLINE_WORD = re.compile(r"\b(online|virtual|facebook|international|worldwide)\b", re.I)


def is_online(row):
    """Online groups and pages have no street address: they belong in the list, not on the map."""
    place = " ".join(x or "" for x in (row.get("location"), row.get("city"), row.get("address")))
    return row.get("category") in ONLINE_CATEGORIES or bool(ONLINE_WORD.search(place)) \
        or "(facebook)" in (row.get("organization_name") or "").lower()


def geocode(row):
    if is_online(row):
        return None
    for q in place_queries(row):
        time.sleep(1.1)   # Nominatim usage policy: at most 1 request per second
        try:
            r = requests.get(NOMINATIM, params={"format": "jsonv2", "limit": 1, "q": q}, headers=NOMINATIM_UA, timeout=20)
            hits = r.json() if r.ok else []
        except Exception as e:
            log("  ! geocode failed", q, type(e).__name__)
            continue
        if hits and hits[0].get("addresstype") not in TOO_COARSE:
            return float(hits[0]["lat"]), float(hits[0]["lon"]), q
    return None


# ── pictures ────────────────────────────────────────────────────────────────
META_IMG = re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::secure_url)?|twitter:image)["\'][^>]*>', re.I)
CONTENT = re.compile(r'content=["\']([^"\']+)["\']', re.I)


def share_image_url(page_url):
    try:
        r = requests.get(page_url, headers=UA, timeout=20)
        if not r.ok:
            return None
    except Exception:
        return None
    for tag in META_IMG.findall(r.text[:300000]):
        m = CONTENT.search(tag)
        if m:
            return urljoin(r.url, html.unescape(m.group(1).strip()))
    return None


def is_logo(im):
    w, h = im.size
    if w / h > 2.2 or w / h < 0.6:
        return True
    px = list(im.convert("RGBA").resize((64, 64)).getdata())
    light = sum(1 for r, g, b, a in px if a < 40 or (r > 235 and g > 235 and b > 235))
    return light / len(px) > 0.45


def prepare_image(img_url):
    """Return (bytes, ext, content_type, is_logo) or None when the image is broken or too small."""
    try:
        r = requests.get(img_url, headers=UA, timeout=20)
        r.raise_for_status()
        im = Image.open(io.BytesIO(r.content))
        im.load()
    except Exception:
        return None
    im = ImageOps.exif_transpose(im)
    if im.width < 150 or im.height < 100:
        return None
    logo = is_logo(im)
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    if logo and im.mode in ("RGBA", "LA", "P"):
        im.convert("RGBA").save(buf, "PNG", optimize=True)
        return buf.getvalue(), "png", "image/png", True
    src = im.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(src, mask=src.split()[3])
    bg.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
    return buf.getvalue(), "jpg", "image/jpeg", logo


# ── main ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="look things up but write nothing")
    ap.add_argument("--days", type=int, default=LOOKBACK_DAYS)
    args = ap.parse_args()

    base = environ.get("SUPABASE_URL", "").rstrip("/")
    key = environ.get("SUPABASE_SERVICE_ROLE_KEY") or environ.get("SUPABASE_SERVICE_KEY")
    if not base or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    H = {"apikey": key, "Authorization": "Bearer " + key}
    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()

    r = requests.get(base + "/rest/v1/directory_entries", headers=H, timeout=60, params={
        "select": "id,organization_name,category,website_url,address,location,city,region,country,latitude,longitude,photo_url",
        "status": "eq.approved", "created_at": "gte." + since,
        "or": "(latitude.is.null,photo_url.is.null)", "order": "created_at.desc", "limit": "200"})
    r.raise_for_status()
    rows = r.json()
    log(f"{len(rows)} recent listings need a map pin or a picture (last {args.days} days)")

    pins = pics = 0
    for row in rows:
        patch = {}
        if row["latitude"] is None:
            hit = geocode(row)
            if hit:
                patch.update(latitude=hit[0], longitude=hit[1])
                log(f"  pin  {row['organization_name']}  <- {hit[2]}")
            elif not is_online(row):
                log(f"  ?    {row['organization_name']}: place not found")
        if row["photo_url"] is None and row["website_url"]:
            img = share_image_url(row["website_url"])
            prepared = prepare_image(img) if img else None
            if prepared:
                data, ext, ctype, logo = prepared
                path = f"og/{row['id']}.{ext}"
                if not args.dry_run:
                    up = requests.post(f"{base}/storage/v1/object/{BUCKET}/{path}", data=data, timeout=60,
                                       headers={**H, "Content-Type": ctype, "x-upsert": "true"})
                    if not up.ok:
                        log(f"  ! upload failed for {row['organization_name']}: {up.status_code}")
                        prepared = None
                if prepared:
                    patch["photo_url"] = f"{base}/storage/v1/object/public/{BUCKET}/{path}" + ("#contain" if logo else "")
                    log(f"  pic  {row['organization_name']}  <- {img}")
        if not patch:
            continue
        if not args.dry_run:
            w = requests.patch(base + "/rest/v1/directory_entries", params={"id": "eq." + row["id"]},
                               json=patch, headers={**H, "Content-Type": "application/json"}, timeout=30)
            if not w.ok:
                log(f"  ! could not update {row['organization_name']}: {w.status_code} {w.text[:120]}")
                continue
        pins += "latitude" in patch
        pics += "photo_url" in patch
    log(f"done: {pins} map pins, {pics} pictures" + (" (dry run, nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
