"""Build steiner_lectures.json: an index of Rudolf Steiner's lectures on rsarchive.org (owner, 2026-11-25).

Index only: date, lecture title, book title, city, GA volume and links. Never the lecture text.
rsarchive.org robots.txt (checked 2026-11-25): "Content-Signal: search=yes,ai-train=no,use=reference",
so building a search index of titles and links is allowed; nothing here trains a model.

Source: the "Lectures by date" pages, one per year (https://rsarchive.org/Dates.php?year=1924).
Each table row is one English translation. A row with a date starts a new lecture; a row without a
date is another translation of the lecture above it.

Run from the repo root (polite: one request every 2 seconds, about 35 requests):
    python3 -I automation/build_steiner_lectures.py            # writes steiner_lectures.json
    python3 -I automation/build_steiner_lectures.py --cache DIR # also keeps the raw pages in DIR
    python3 -I automation/build_steiner_lectures.py --from-cache DIR   # rebuild offline
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://rsarchive.org"
UA = "Mozilla/5.0 (compatible; SophiaCommonsIndexer/1.0; +https://sophiacommons.org)"
DELAY_SECONDS = 2.0
OUT = "steiner_lectures.json"
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
LINK = re.compile(r'<a href="([^"]+)"[^>]*>(.*?)</a>', re.S)
SMALL = re.compile(r"<small>(.*?)</small>", re.S)
TAGS = re.compile(r"<[^>]+>")
YEAR_LINK = re.compile(r"Dates\.php\?year=(\d{4})")


def text(s):
    return re.sub(r"\s+", " ", html.unescape(TAGS.sub(" ", s or ""))).strip()


def first_link(cell):
    m = LINK.search(cell or "")
    return (m.group(1), text(m.group(2))) if m else (None, "")


def absolute(u):
    return BASE + u if u and u.startswith("/") else u


def parse_day(cell, year):
    """'1 Jan <br><a ...>' -> '1924-01-01', or None for a continuation row."""
    m = re.match(r"\s*(\d{1,2})\s+([A-Z][a-z]{2})", text(cell.split("<br")[0]))
    if not m or m.group(2) not in MONTHS:
        return None
    try:
        return dt.date(year, MONTHS[m.group(2)], int(m.group(1))).isoformat()
    except ValueError:
        return None


def parse_year(page, year):
    """All lectures on one year page, each with its translations."""
    body = page.split("<tbody>", 1)[-1]
    lectures = []
    for row in ROW.findall(body):
        cells = CELL.findall(row)
        if len(cells) < 4:
            continue
        date_cell, lecture_cell, book_cell, city_cell = cells[:4]
        volume_cell = cells[4] if len(cells) > 4 else ""
        url, title = first_link(lecture_cell)
        if not url or not title:
            continue
        small = SMALL.search(lecture_cell)
        translation = {"u": absolute(url), "t": title, "by": text(small.group(1)) if small else ""}
        day = parse_day(date_cell, year)
        if day or not lectures:
            de_url = None
            for href, _ in LINK.findall(date_cell):
                if "/German/" in href:
                    de_url = absolute(href)
            book_url, book = first_link(book_cell)
            _, city = first_link(city_cell)
            _, volume = first_link(volume_cell)
            lectures.append({
                "d": day or f"{year}", "t": title, "b": book, "bu": absolute(book_url),
                "c": city or text(city_cell), "ga": volume or text(volume_cell),
                "de": de_url, "en": [translation],
            })
        else:
            lectures[-1]["en"].append(translation)
    return lectures


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def years_from(index_page):
    return sorted({int(y) for y in YEAR_LINK.findall(index_page)})


def load_pages(cache, offline):
    """Yield (year, html). Fetches politely unless offline; keeps pages in cache when given."""
    def get(name, url):
        path = os.path.join(cache, name) if cache else None
        if path and os.path.exists(path) and offline:
            return open(path, encoding="utf-8").read()
        if offline:
            raise SystemExit(f"missing cached page {path}")
        page = fetch(url)
        time.sleep(DELAY_SECONDS)
        if path:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(page)
        return page

    index = get("dates.html", BASE + "/Dates.php")
    years = years_from(index)
    if not years:
        raise SystemExit("no years found on the Dates page; the site layout may have changed")
    for y in years:
        yield y, get(f"y{y}.html", f"{BASE}/Dates.php?year={y}")


def build(pages):
    items = []
    for year, page in pages:
        got = parse_year(page, year)
        print(f"{year}: {len(got)} lectures", file=sys.stderr)
        items.extend(got)
    items.sort(key=lambda x: (x["d"], x["ga"], x["t"]))
    return {
        "source": BASE + "/",
        "built": dt.date.today().isoformat(),
        "note": "Index of titles, dates, places and links only. Texts stay on rsarchive.org.",
        "count": len(items),
        "items": items,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cache", help="folder to keep raw pages in")
    ap.add_argument("--from-cache", help="rebuild from pages saved earlier, no network")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    cache = a.from_cache or a.cache
    if cache:
        os.makedirs(cache, exist_ok=True)
    data = build(load_pages(cache, offline=bool(a.from_cache)))
    if data["count"] < 1000:
        raise SystemExit(f"only {data['count']} lectures found; not writing (layout change?)")
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {a.out}: {data['count']} lectures", file=sys.stderr)


if __name__ == "__main__":
    main()
