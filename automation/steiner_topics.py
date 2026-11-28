"""Topic tags for Rudolf Steiner's lectures, so the AI app finds lectures by meaning (owner, 2026-11-25).

"karma" should also find "Karmic Relationships" and lectures on reincarnation whose titles never say karma.
Each lecture gets 1 to 4 topics from the fixed list below, chosen by Claude from the lecture title, the
book title and the other titles in the same volume. Titles only: no lecture text is read or sent.

Results are cached in automation/steiner_topics_cache.json (key: GA|date|title), so a weekly rerun only
tags new lectures. The tags are written into steiner_lectures.json as "k" (lecture) and the topic list
as "topics".

Run from the repo root, after build_steiner_lectures.py:
    python3 -I automation/steiner_topics.py            # needs ANTHROPIC_API_KEY (reads .env)
    python3 -I automation/steiner_topics.py --dry-run  # show what would be tagged, no API calls
"""
import argparse
import collections
import concurrent.futures as cf
import json
import os
import re
import sys
import time
import urllib.request

LECTURES = "steiner_lectures.json"
CACHE = "automation/steiner_topics_cache.json"
MODEL = os.environ.get("STEINER_TOPICS_MODEL", "claude-sonnet-5-5")
WORKERS = 4
MAX_PER_REQUEST = 60      # lectures per API call; big volumes are split

# id: (label, words people use for it). Words are matched at word starts, lower case, accents removed.
TOPICS = {
    "karma": ("Karma and reincarnation", ["karma", "karmic", "reincarnation", "rebirth", "destiny", "previous lives", "past lives"]),
    "death": ("Death and life after death", ["death", "dying", "afterlife", "after death", "life between death", "kamaloka", "devachan"]),
    "dead": ("The dead and our connection to them", ["the dead", "deceased", "departed", "grief", "loved ones who died"]),
    "christ": ("Christ and the Mystery of Golgotha", ["christ", "jesus", "golgotha", "christology", "resurrection", "etheric christ"]),
    "gospels": ("The Gospels and the Bible", ["gospel", "bible", "john", "luke", "matthew", "mark", "apocalypse", "revelation", "genesis", "old testament", "new testament"]),
    "michael": ("Michael and the Michael Age", ["michael", "michaelmas", "archangel michael"]),
    "evil": ("Evil, Lucifer and Ahriman", ["evil", "lucifer", "luciferic", "ahriman", "ahrimanic", "asuras", "sorat", "double"]),
    "hierarchies": ("Angels and the spiritual hierarchies", ["angel", "archangel", "hierarchies", "seraphim", "spiritual beings", "guardian angel"]),
    "elementals": ("Elemental beings and nature spirits", ["elemental", "nature spirits", "gnomes", "undines", "sylphs", "salamanders", "fairies"]),
    "cosmic_evolution": ("Cosmic evolution (Saturn, Sun, Moon, Earth)", ["evolution", "old saturn", "old sun", "old moon", "cosmic evolution", "creation", "akashic"]),
    "ancient": ("Atlantis, Lemuria and ancient cultures", ["atlantis", "lemuria", "egypt", "persia", "ancient india", "greece", "culture epochs", "post-atlantean"]),
    "mysteries": ("Mysteries and initiation", ["mysteries", "initiation", "initiate", "mystery centres", "rosicrucian", "esoteric", "occult"]),
    "meditation": ("Meditation and spiritual development", ["meditation", "spiritual path", "spiritual development", "inner development", "exercises", "higher worlds", "clairvoyance", "verses"]),
    "thinking": ("Thinking, knowledge and freedom", ["thinking", "freedom", "knowledge", "epistemology", "philosophy of freedom", "intuitive thinking", "truth"]),
    "philosophy": ("Philosophy and philosophers", ["philosophy", "philosopher", "nietzsche", "hegel", "kant", "fichte", "schelling", "aristotle", "plato", "materialism"]),
    "goethe": ("Goethe, Faust and Goethean science", ["goethe", "goethean", "faust", "metamorphosis", "phenomenology", "theory of colour"]),
    "science": ("Natural science", ["science", "physics", "chemistry", "light", "warmth", "heat", "astronomy", "mathematics", "geometry"]),
    "human_being": ("The human being: body, soul and spirit", ["human being", "body soul spirit", "anthropology", "man", "soul", "spirit", "threefold human", "fourfold"]),
    "members": ("Etheric, astral body and the I", ["etheric", "astral", "ego", "the i", "life body", "members of the human being", "aura"]),
    "sleep": ("Sleep and dreams", ["sleep", "dreams", "waking", "night"]),
    "senses": ("The senses", ["senses", "twelve senses", "perception", "sense organs"]),
    "education": ("Education and Waldorf schools", ["education", "waldorf", "teaching", "teacher", "school", "pedagogy", "curriculum", "study of man"]),
    "childhood": ("Child development and parenting", ["child", "children", "childhood", "kindergarten", "parenting", "youth", "adolescence", "temperaments"]),
    "curative": ("Curative education and special needs", ["curative education", "special needs", "disability", "camphill", "heilpadagogik"]),
    "medicine": ("Medicine, health and healing", ["medicine", "health", "illness", "disease", "healing", "doctor", "physician", "therapy", "cancer", "mistletoe"]),
    "nutrition": ("Nutrition and food", ["nutrition", "food", "diet", "eating", "vegetarian", "digestion", "sugar", "alcohol"]),
    "agriculture": ("Agriculture and biodynamics", ["agriculture", "biodynamic", "farming", "farm", "soil", "compost", "preparations", "manure"]),
    "animals": ("Animals and bees", ["animals", "bees", "insects", "birds", "ants", "wasps", "animal kingdom"]),
    "plants": ("Plants and the plant world", ["plants", "plant", "trees", "flowers", "roots", "seeds", "botany"]),
    "earth": ("The Earth, minerals and nature", ["earth", "minerals", "crystals", "volcanoes", "earthquakes", "weather", "nature", "rhythms"]),
    "stars": ("Stars, planets and the cosmos", ["stars", "planets", "zodiac", "sun", "moon", "cosmos", "astrology", "comets"]),
    "art": ("Art and the arts", ["art", "arts", "artistic", "beauty", "aesthetics", "sculpture", "poetry"]),
    "painting": ("Painting and colour", ["painting", "colour", "color", "colours"]),
    "eurythmy": ("Eurythmy", ["eurythmy", "movement"]),
    "speech": ("Speech and drama", ["speech", "drama", "language", "word", "recitation", "theatre", "mystery dramas"]),
    "music": ("Music and tone", ["music", "tone", "singing", "musical", "intervals"]),
    "architecture": ("Architecture and the Goetheanum", ["architecture", "goetheanum", "building", "johannesbau", "group sculpture", "representative of humanity"]),
    "social": ("Social threefolding and economics", ["social", "threefolding", "threefold social order", "economics", "economy", "money", "work", "labour", "workers", "society", "rights"]),
    "history": ("History and world events", ["history", "historical", "world war", "war", "politics", "nations", "europe", "america", "russia", "symptomatology"]),
    "folk_souls": ("Folk souls and nations", ["folk souls", "folk spirits", "nations", "peoples", "races", "germany", "england"]),
    "festivals": ("Festivals and the course of the year", ["festival", "festivals", "christmas", "easter", "whitsun", "pentecost", "ascension", "st john", "seasons", "calendar of the soul", "advent", "new year"]),
    "religion": ("Religion and the Christian Community", ["religion", "religious", "christian community", "priests", "sacraments", "communion", "prayer", "renewal"]),
    "grail": ("The Holy Grail and Parzival", ["grail", "parzival", "parsifal", "templars", "knights"]),
    "eastern": ("Eastern wisdom: Buddha, Krishna, the East", ["buddha", "buddhism", "krishna", "bhagavad gita", "east", "eastern", "india", "zarathustra", "yoga"]),
    "society": ("The Anthroposophical Society and movement", ["anthroposophical society", "christmas conference", "foundation stone", "school of spiritual science", "first class", "members", "anthroposophical movement"]),
    "theosophy": ("Theosophy and the Theosophical Society", ["theosophy", "theosophical", "blavatsky", "besant"]),
    "intro": ("Introductions to anthroposophy", ["introduction", "introductory", "what is anthroposophy", "basics", "overview", "foundations"]),
    "memory": ("Memory, consciousness and the soul life", ["memory", "consciousness", "feeling", "willing", "will", "emotions", "soul life", "conscience"]),
    "love": ("Love, morality and ethics", ["love", "morality", "moral", "ethics", "compassion", "conscience", "virtues"]),
    "technology": ("Technology and modern life", ["technology", "machines", "electricity", "modern life", "materialistic age", "computers"]),
}

SYSTEM = (
    "You tag Rudolf Steiner's lectures with topics so readers can find them. You only see titles. "
    "Pick 1 to 4 topic ids per lecture from the allowed list, the ones a reader searching that topic would want. "
    "Use the volume title and the neighbouring lecture titles as context (a lecture called 'Lecture III' in "
    "'The Agriculture Course' is about agriculture). Answer with JSON only."
)


def key_of(lecture):
    return f"{lecture['ga']}|{lecture['d']}|{lecture['t']}"


def load_env_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    try:
        for line in open(".env", encoding="utf-8"):
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    raise SystemExit("ANTHROPIC_API_KEY not set (environment or .env)")


def prompt_for(volume_title, ga, lectures):
    allowed = "\n".join(f"{tid}: {label}" for tid, (label, _) in TOPICS.items())
    lines = "\n".join(f"{i}. {l['t']}" for i, l in enumerate(lectures))
    return (f"Allowed topics (id: label):\n{allowed}\n\nVolume: GA {ga}, {volume_title}\nLectures:\n{lines}\n\n"
            'Return {"0": ["topic_id", ...], "1": [...], ...} with one entry per lecture number.')


def ask_claude(api_key, text, attempts=4):
    body = json.dumps({"model": MODEL, "max_tokens": 4000, "system": SYSTEM,
                       "messages": [{"role": "user", "content": text}]}).encode()
    for n in range(attempts):
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                out = json.load(r)
            raw = "".join(b.get("text", "") for b in out.get("content", []))
            m = re.search(r"\{.*\}", raw, re.S)
            return json.loads(m.group(0)) if m else {}
        except Exception as err:  # noqa: BLE001 - retried, then reported
            if n == attempts - 1:
                raise
            print(f"  retry after error: {err}", file=sys.stderr)
            time.sleep(5 * (n + 1))
    return {}


def clean_tags(tags):
    seen = []
    for t in tags if isinstance(tags, list) else []:
        if t in TOPICS and t not in seen:
            seen.append(t)
    return seen[:4]


def tag_volume(api_key, ga, lectures):
    """Return {key: [topic ids]} for one volume's untagged lectures."""
    out = {}
    title = collections.Counter(l["b"] for l in lectures).most_common(1)[0][0]
    for start in range(0, len(lectures), MAX_PER_REQUEST):
        chunk = lectures[start:start + MAX_PER_REQUEST]
        answer = ask_claude(api_key, prompt_for(title, ga, chunk))
        for i, lecture in enumerate(chunk):
            out[key_of(lecture)] = clean_tags(answer.get(str(i)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    data = json.load(open(LECTURES, encoding="utf-8"))
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    todo = collections.defaultdict(list)
    for lecture in data["items"]:
        if key_of(lecture) not in cache:
            todo[lecture["ga"]].append(lecture)
    print(f"{sum(map(len, todo.values()))} lectures in {len(todo)} volumes need tags", file=sys.stderr)

    if todo and not a.dry_run:
        api_key = load_env_key()
        with cf.ThreadPoolExecutor(WORKERS) as pool:
            jobs = {pool.submit(tag_volume, api_key, ga, ls): ga for ga, ls in todo.items()}
            for n, job in enumerate(cf.as_completed(jobs), 1):
                try:
                    cache.update(job.result())
                except Exception as err:  # noqa: BLE001 - one bad volume should not stop the rest
                    print(f"  GA {jobs[job]} failed: {err}", file=sys.stderr)
                if n % 20 == 0:
                    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
                    print(f"  {n}/{len(jobs)} volumes", file=sys.stderr)
        json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    if a.dry_run:
        return
    tagged = 0
    for lecture in data["items"]:
        tags = cache.get(key_of(lecture)) or []
        if tags:
            lecture["k"] = tags
            tagged += 1
        else:
            lecture.pop("k", None)
    data["topics"] = {tid: {"label": label, "words": words} for tid, (label, words) in TOPICS.items()}
    with open(LECTURES, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"tagged {tagged} of {len(data['items'])} lectures; wrote {LECTURES}", file=sys.stderr)


if __name__ == "__main__":
    main()
