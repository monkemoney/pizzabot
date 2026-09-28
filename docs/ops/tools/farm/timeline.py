#!/usr/bin/env python3
"""timeline.py — the photo gallery as the farm's event timeline (ops tool, D13).

Runs ON LIMOR'S MAC. Reads metadata only, never an image. Writes derived CSVs
with no names, no captions, no file paths. Only the derived CSV leaves the machine.

Pipeline
  1. osxphotos query --json --from-date 2020-06-01 --not-hidden > photos_meta.json   (on the Mac)
     (no trash flag: the default query already excludes Recently Deleted and scrub
     filters `intrash` again; `--not-in-trash` does not exist and would abort the run)
  2. timeline.py scrub   photos_meta.json  -o photos_meta.csv              (drops persons/titles/paths)
  3. timeline.py cluster photos_meta.csv   -o events_seed.csv [--farm auto] (one row per event)
     optional: --instagram <Instagram export folder (instagram-<user>-<date>-<id>/)
                           or a posts_*.json / posts.json / stories.json file>
               joins same-day post captions
  4. rm photos_meta.json                                                    (raw export deleted)

Self-check on synthetic data (no real photos needed):
  timeline.py demo

Python 3.9+, standard library only — macOS's bundled python3 (3.9.6) runs it.
osxphotos is the only external tool and is used for step 1 only; it needs
Python >= 3.10, so it gets its own interpreter via uv
(`uv tool install --python 3.13 osxphotos`) — never the system pip, which
silently installs a 2024 version that predates Photos 11.
"""
import argparse
import csv
import json
import math
import os
import random
import re
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

SCRUBBED_FIELDS = [
    "uuid", "date", "latitude", "longitude", "city", "albums",
    "favorite", "is_video", "faces_count",
]

EVENT_FIELDS = [
    "event_id", "date", "weekday", "place", "first_time", "last_time",
    "photos", "videos", "max_faces", "favorites", "albums",
    "ig_posts", "ig_caption",
    # blank — Limor fills these in the sheet
    "type", "population", "headcount", "partner", "evidence_grade", "notes",
]

# Fields that may carry a person's name, a path or free text. Never copied.
# This set is DOCUMENTATION, not the mechanism: scrub_records() builds a NEW dict
# from SCRUBBED_FIELDS only and write_csv() drops extras, so nothing outside
# SCRUBBED_FIELDS can reach photos_meta.csv whether or not it is listed here.
# The raw osxphotos JSON (non-shallow) also carries `library` (full path to the
# library, i.e. the macOS username), `person_info` (names + face counts),
# `search_info` (Photos' people/scene search terms), `ai_caption`, `album_info`,
# `import_info`, `cloud_metadata`, `exif_info` — which is why photos_meta.json
# itself must be deleted at the end of the day (pipeline step 4).
DROPPED_FIELDS = {
    "persons", "faces", "face_info", "person_info", "title", "description",
    "keywords", "labels", "ai_caption", "path", "path_edited", "path_raw",
    "path_live_photo", "filename", "original_filename", "library", "exif",
    "exif_info", "comments", "likes", "search_info", "search_info_normalized",
    "place", "score", "album_info", "import_info", "cloud_metadata",
}


# ----------------------------------------------------------------------------- helpers

def parse_dt(s):
    """osxphotos writes ISO 8601 with offset, e.g. 2024-03-15T10:22:31-07:00."""
    if not s:
        return None
    s = str(s).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def to_float(v):
    try:
        if v in (None, "", "None"):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, str):
        v = v.strip()
        if not v:
            return []
        if v.startswith("["):
            try:
                return json.loads(v)
            except ValueError:
                pass
        return [x.strip() for x in v.split(";") if x.strip()]
    return [v]


def faces_count_of(rec):
    """Number of detected faces. Names are never read, only counted.
    osxphotos JSON has NO `faces` key. Faces live in `face_info` (a list of face
    dicts — each carries the person's name, so the field must stay dropped) and
    in `persons` (list of names; unnamed faces appear as '_UNKNOWN_'). `faces`
    is still probed for other exporters, but on osxphotos only `face_info` fires."""
    n = 0
    for key in ("faces", "face_info"):
        v = rec.get(key)
        if isinstance(v, list):
            n = max(n, len(v))
    v = rec.get("persons")
    if isinstance(v, list):
        n = max(n, len(v))
    return n


def city_of(rec):
    """City label for the `offsite: <city>` place (only use of `place`).
    osxphotos `place` is PlaceInfo.asdict(): `address` is a dict or NULL (no
    reverse geocode), `names` is a dict whose values are LISTS, e.g.
    names.city == ["Malibu"]. address.city first; when address is null or has
    no city, fall through to names.city / names.sub_administrative_area."""
    place = rec.get("place")
    if isinstance(place, dict):
        addr = place.get("address")
        if not isinstance(addr, dict):
            addr = {}
        city = addr.get("city") or addr.get("sub_locality")
        if city:
            return str(city)
        names = place.get("names")
        if isinstance(names, dict):
            for k in ("city", "sub_administrative_area"):
                v = names.get(k)
                if isinstance(v, list):
                    v = next((x for x in v if x), None)
                if v:
                    return str(v)
    return rec.get("city") or ""


def fix_mojibake(s):
    """Instagram exports UTF-8 text re-encoded as Latin-1."""
    if not isinstance(s, str):
        return ""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


# ----------------------------------------------------------------------------- scrub

def scrub_records(records):
    """osxphotos JSON records -> scrubbed rows. Pure function, tested by `demo`."""
    rows = []
    for rec in records:
        if not isinstance(rec, dict):
            continue
        if rec.get("intrash") or rec.get("hidden"):
            continue
        dt = parse_dt(rec.get("date"))
        if not dt:
            continue
        rows.append({
            "uuid": rec.get("uuid", ""),
            "date": dt.isoformat(),
            "latitude": to_float(rec.get("latitude")),
            "longitude": to_float(rec.get("longitude")),
            "city": city_of(rec),
            "albums": ";".join(str(a) for a in as_list(rec.get("albums"))),
            "favorite": 1 if rec.get("favorite") else 0,
            "is_video": 1 if rec.get("ismovie") else 0,
            "faces_count": faces_count_of(rec),
        })
    return rows


def load_photos_json(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        # some tools wrap the list
        for k in ("photos", "results", "data"):
            if isinstance(data.get(k), list):
                return data[k]
        return [data]
    return data


def cmd_scrub(args):
    records = load_photos_json(args.input)
    rows = scrub_records(records)
    write_csv(args.output, SCRUBBED_FIELDS, rows)
    print(f"scrub: {len(records)} records in, {len(rows)} rows out -> {args.output}")
    print("dropped: persons, face_info, titles, descriptions, keywords, paths, filenames, library path")


def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields})


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ----------------------------------------------------------------------------- cluster

def infer_farm(rows, cell=0.001):
    """The farm is where most photos are taken: the densest ~100 m cell."""
    counts = Counter()
    for r in rows:
        lat, lon = to_float(r.get("latitude")), to_float(r.get("longitude"))
        if lat is None or lon is None:
            continue
        counts[(round(lat / cell), round(lon / cell))] += 1
    if not counts:
        return None
    (klat, klon), n = counts.most_common(1)[0]
    return (klat * cell, klon * cell, n)


def farm_or_not(r, farm, radius_m):
    lat, lon = to_float(r.get("latitude")), to_float(r.get("longitude"))
    if lat is None or lon is None:
        return "no-gps", None
    if farm and haversine_m(lat, lon, farm[0], farm[1]) <= radius_m:
        return "farm", (lat, lon)
    return "offsite", (lat, lon)


def group_offsite(items, within_m=1000):
    """Greedy grouping of one day's off-site photos: a photo joins the first
    group whose centre is within `within_m`, else starts a new one. Grid
    rounding was tried first and split one retreat across a cell boundary."""
    groups = []  # [centre_lat, centre_lon, [items]]
    for it in items:
        lat, lon = it[3]
        for g in groups:
            if haversine_m(lat, lon, g[0], g[1]) <= within_m:
                g[2].append(it)
                n = len(g[2])
                g[0] += (lat - g[0]) / n
                g[1] += (lon - g[1]) / n
                break
        else:
            groups.append([lat, lon, [it]])
    return [g[2] for g in groups]


def cluster_rows(rows, farm, radius_m=150, min_photos=5, since=None):
    by_day = defaultdict(lambda: {"farm": [], "no-gps": [], "offsite": []})
    for r in rows:
        dt = parse_dt(r.get("date"))
        if not dt:
            continue
        day = dt.date()
        if since and day < since:
            continue
        kind, coords = farm_or_not(r, farm, radius_m)
        by_day[day][kind].append((dt, r, r.get("city") or "", coords))

    events = []
    for day in sorted(by_day):
        buckets = by_day[day]
        candidates = [("farm", buckets["farm"]), ("no-gps", buckets["no-gps"])]
        candidates += [("offsite", g) for g in group_offsite(buckets["offsite"])]
        out_n = 0
        for kind, items in candidates:
            if len(items) < min_photos:
                continue
            items.sort(key=lambda x: x[0])
            if kind == "offsite":
                out_n += 1
                cities = Counter(c for _, _, c, _ in items if c)
                place = "offsite: " + (cities.most_common(1)[0][0] if cities else
                                      "%.3f,%.3f" % (items[0][3][0], items[0][3][1]))
                event_id = "%s-out%02d" % (day.isoformat(), out_n)
            else:
                place = kind
                event_id = "%s-%s" % (day.isoformat(), kind)
            albums = Counter()
            for _, r, _, _ in items:
                for a in as_list(r.get("albums")):
                    albums[a] += 1
            events.append({
                "event_id": event_id,
                "date": day.isoformat(),
                "weekday": day.strftime("%a"),
                "place": place,
                "first_time": items[0][0].strftime("%H:%M"),
                "last_time": items[-1][0].strftime("%H:%M"),
                "photos": sum(1 for _, r, _, _ in items if str(r.get("is_video", "0")) != "1"),
                "videos": sum(1 for _, r, _, _ in items if str(r.get("is_video", "0")) == "1"),
                "max_faces": max(int(to_float(r.get("faces_count")) or 0) for _, r, _, _ in items),
                "favorites": sum(1 for _, r, _, _ in items if str(r.get("favorite", "0")) == "1"),
                "albums": ";".join(a for a, _ in albums.most_common(3)),
                "ig_posts": 0, "ig_caption": "",
                "type": "", "population": "", "headcount": "", "partner": "",
                "evidence_grade": "E", "notes": "",
            })
    return events


# ----------------------------------------------------------------------------- instagram

IG_FILE_RE = re.compile(r"^(posts_\d+|posts|archived_posts|stories|reels)\.json$")


def _ig_first_media(d):
    media = d.get("media")
    if isinstance(media, list) and media and isinstance(media[0], dict):
        return media[0]
    return None


def ig_caption_ts(it):
    """(caption, unix timestamp) of one export item — ('', None) when undated.
    Two shapes Instagram emits:
      legacy posts_<n>.json / reels.json / stories.json entries:
        {"media": [{"uri", "creation_timestamp", "title"}], "title"?, "creation_timestamp"?}
        single-image posts carry both only inside media[0]; carousels at post level.
      newer posts.json / archived_posts.json entries (a superset of posts_<n>.json):
        {"timestamp", "label_values": [{"label", "value"?, "media"?: [{"title", "creation_timestamp"}]}]}
        caption = a label_values value (a "Caption"/"Title"-labelled one preferred)
        or nested media[0].title; timestamp = item timestamp or media[0].creation_timestamp."""
    ts = it.get("creation_timestamp") or it.get("timestamp")
    cap = it.get("title") or ""
    m = _ig_first_media(it)
    if m:
        ts = ts or m.get("creation_timestamp")
        cap = cap or m.get("title") or ""
    lvs = it.get("label_values")
    if isinstance(lvs, list):
        # rank: a "Caption"/"Title"-labelled value > nested media title > any other
        # value (last resort — "Post type": "Image" must never become the caption)
        labelled, nested, other = "", "", ""
        for lv in lvs:
            if not isinstance(lv, dict):
                continue
            val = lv.get("value")
            if isinstance(val, str) and val.strip():
                label = str(lv.get("label") or "").lower()
                if any(w in label for w in ("caption", "title", "text")):
                    labelled = labelled or val
                else:
                    other = other or val
            lm = _ig_first_media(lv)
            if lm:
                ts = ts or lm.get("creation_timestamp")
                nested = nested or lm.get("title") or ""
        cap = cap or labelled or nested or other
    try:
        ts = int(ts) if ts else None
    except (TypeError, ValueError):
        ts = None
    return (cap if isinstance(cap, str) else ""), ts


def load_instagram(path):
    """Instagram 'Download your information' (JSON). Accepts the export folder
    (instagram-<user>-<date>-<id>/ — walked recursively, so both
    your_instagram_activity/media/ of 2025+ exports and your_instagram_activity/content/
    of 2023-2024 exports are found) or a single posts_*.json / posts.json /
    archived_posts.json / stories.json / reels.json file.
    posts.json (label_values shape) repeats every posts_<n>.json post, so entries
    are deduplicated by (day, caption) — an undated-caption post by (day, timestamp).
    Returns {YYYY-MM-DD: [caption, ...]} in the machine's local timezone."""
    files = []
    if os.path.isdir(path):
        for root, _, names in os.walk(path):
            for n in names:
                if IG_FILE_RE.match(n):
                    files.append(os.path.join(root, n))
        files.sort()
    else:
        files = [path]
    by_day = defaultdict(list)
    seen = set()
    for fp in files:
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    items.extend(v)
        for it in items:
            if not isinstance(it, dict):
                continue
            cap, ts = ig_caption_ts(it)
            if not ts:
                continue
            day = datetime.fromtimestamp(ts, tz=timezone.utc).astimezone().date().isoformat()
            cap = fix_mojibake(cap).replace("\n", " ").strip()
            key = (day, cap) if cap else (day, "", ts)
            if key in seen:
                continue
            seen.add(key)
            by_day[day].append(cap)
    return by_day


def join_instagram(events, ig_by_day, max_len=200):
    for e in events:
        caps = ig_by_day.get(e["date"], [])
        if caps:
            e["ig_posts"] = len(caps)
            e["ig_caption"] = (max(caps, key=len) or "")[:max_len]
    return events


# ----------------------------------------------------------------------------- commands

def parse_farm(arg, rows):
    if arg is None or arg == "auto":
        f = infer_farm(rows)
        if f:
            print("farm (inferred, densest 100 m cell): %.5f, %.5f  (%d photos) — confirm with Limor" % f)
        else:
            print("farm: no GPS in data; everything will be 'no-gps'")
        return f
    if arg == "none":
        return None
    lat, lon = (float(x) for x in arg.split(","))
    return (lat, lon, 0)


def cmd_cluster(args):
    rows = read_csv(args.input)
    farm = parse_farm(args.farm, rows)
    since = datetime.strptime(args.since, "%Y-%m-%d").date() if args.since else None
    events = cluster_rows(rows, farm, args.radius, args.min_photos, since)
    if args.instagram:
        ig = load_instagram(args.instagram)
        join_instagram(events, ig)
        print("instagram: %d days with posts" % len(ig))
    write_csv(args.output, EVENT_FIELDS, events)
    n_farm = sum(1 for e in events if e["place"] == "farm")
    print("cluster: %d rows -> %d events (%d at the farm, %d off-site/no-gps) -> %s"
          % (len(rows), len(events), n_farm, len(events) - n_farm, args.output))
    log_line(args.output, "cluster", len(rows), len(events))


def log_line(output, step, n_in, n_out):
    """Processing log next to the output: date · step · rows in/out · user."""
    path = os.path.join(os.path.dirname(os.path.abspath(output)), "processing_log.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["run_at", "step", "rows_in", "rows_out", "user", "output"])
        w.writerow([datetime.now().isoformat(timespec="seconds"), step, n_in, n_out,
                    os.environ.get("USER", ""), os.path.basename(output)])


# ----------------------------------------------------------------------------- demo / self-test

def synthetic_library(seed=7):
    """~1,000 fake osxphotos records: farm days, two retreats, noise, names to be dropped."""
    rnd = random.Random(seed)
    farm = (34.2049, -118.5711)      # placeholder, not the real address
    tz = timezone(timedelta(hours=-7))
    names = ["Alice Example", "Bob Example", "_UNKNOWN_"]
    recs = []
    start = datetime(2024, 3, 1, tzinfo=tz)
    # 30 farm event days, 8-40 photos each
    for d in range(30):
        day = start + timedelta(days=d * 5)
        n = rnd.randint(8, 40)
        for i in range(n):
            t = day.replace(hour=rnd.randint(9, 17), minute=rnd.randint(0, 59))
            recs.append({
                "uuid": "F%03d-%03d" % (d, i), "date": t.isoformat(),
                "latitude": farm[0] + rnd.uniform(-0.0006, 0.0006),
                "longitude": farm[1] + rnd.uniform(-0.0006, 0.0006),
                "albums": ["Soldiers retreat"] if d % 3 == 0 else [],
                "persons": rnd.sample(names, rnd.randint(0, 3)),
                "face_info": [{"name": "Alice Example", "uuid": "f"}] * rnd.randint(0, 6),
                "person_info": [{"name": "Alice Example", "facecount": 1}],
                "title": "Group with Alice", "description": "Alice and Bob at the farm",
                "path": "/Users/limor/Pictures/x.jpg", "favorite": rnd.random() < 0.1,
                "library": "/Users/limor/Pictures/Photos Library.photoslibrary",
                "search_info": {"people": ["Alice Example"]}, "ai_caption": "Alice smiling",
                "ismovie": rnd.random() < 0.15, "intrash": False, "hidden": False,
                "place": {"address": {"city": "Los Angeles"}},
            })
    # 2 off-site retreats (Malibu), 12 photos each
    for k, day in enumerate((datetime(2024, 5, 12, tzinfo=tz), datetime(2024, 9, 3, tzinfo=tz))):
        for i in range(12):
            t = day.replace(hour=10 + i // 3, minute=rnd.randint(0, 59))
            recs.append({"uuid": "R%d-%02d" % (k, i), "date": t.isoformat(),
                         "latitude": 34.0259 + rnd.uniform(-0.001, 0.001),
                         "longitude": -118.7798 + rnd.uniform(-0.001, 0.001),
                         "albums": ["Malibu retreat"], "persons": ["_UNKNOWN_"] * 8,
                         "face_info": [{"name": "_UNKNOWN_"}] * 8,
                         # both osxphotos place shapes: address.city, and null address
                         # with names.city as a list (city_of must read either)
                         "place": {"address": {"city": "Malibu"}} if i % 2 == 0 else
                                  {"address": None, "names": {"city": ["Malibu"], "country": ["US"]}}})
    # noise: 200 single photos on random days, some without GPS, 3 in trash
    for i in range(200):
        t = start + timedelta(days=rnd.randint(0, 200), hours=rnd.randint(7, 21))
        rec = {"uuid": "N%03d" % i, "date": t.isoformat(), "persons": ["Alice Example"],
               "intrash": i < 3}
        if rnd.random() < 0.7:
            rec["latitude"], rec["longitude"] = 34.0 + rnd.random(), -118.9 + rnd.random()
        recs.append(rec)
    return recs, farm


def cmd_demo(_args):
    recs, farm = synthetic_library()
    tmp = tempfile.mkdtemp(prefix="timeline-demo-")
    raw, meta, out = (os.path.join(tmp, n) for n in ("photos_meta.json", "photos_meta.csv", "events_seed.csv"))
    with open(raw, "w", encoding="utf-8") as f:
        json.dump(recs, f)
    rows = scrub_records(load_photos_json(raw))
    write_csv(meta, SCRUBBED_FIELDS, rows)

    # 1. nothing personal survives the scrub
    text = open(meta, encoding="utf-8").read()
    for bad in ("Alice", "Bob", "_UNKNOWN_", "/Users/", "Group with", "limor", "smiling"):
        assert bad not in text, "scrub leaked: %s" % bad
    assert set(csv.DictReader(open(meta)).fieldnames) == set(SCRUBBED_FIELDS)
    # 2. trash is skipped, faces are counted not named
    assert len(rows) == len(recs) - 3, (len(rows), len(recs))
    assert max(int(r["faces_count"]) for r in rows) == 8
    # city from either osxphotos place shape (address.city / null address + names.city list)
    assert city_of({"place": {"address": {"city": "Malibu"}}}) == "Malibu"
    assert city_of({"place": {"address": None, "names": {"city": ["Malibu"]}}}) == "Malibu"
    assert city_of({"place": {"address": {"street": "x"}, "names": {"city": [], "sub_administrative_area": ["LA County"]}}}) == "LA County"
    assert city_of({"place": {}}) == ""

    # 3. farm inferred within 150 m of the true centre; clusters found
    f = infer_farm(rows)
    assert f and haversine_m(f[0], f[1], farm[0], farm[1]) < 150, f
    events = cluster_rows(rows, f, 150, 5)
    n_farm = sum(1 for e in events if e["place"] == "farm")
    n_out = [e for e in events if e["place"].startswith("offsite")]
    assert n_farm == 30, n_farm
    assert len(n_out) == 2 and all(e["place"] == "offsite: Malibu" for e in n_out), n_out
    assert all(e["max_faces"] == 8 and e["photos"] == 12 for e in n_out), n_out
    assert not any(e["place"] == "no-gps" for e in events), "noise clustered"

    # 4. instagram join by day, mojibake fixed. The export holds BOTH shapes for the
    #    same post — posts_1.json (legacy media[]) and posts.json (label_values) —
    #    so the join must yield ONE caption per day, not two.
    ig_root = os.path.join(tmp, "ig", "instagram-demo-2024-09-30-1")
    ig_media = os.path.join(ig_root, "your_instagram_activity", "media")      # 2025+ layout
    ig_content = os.path.join(ig_root, "your_instagram_activity", "content")  # 2023-2024 layout
    os.makedirs(ig_media)
    os.makedirs(ig_content)
    la = timezone(timedelta(hours=-7))
    ts = int(datetime(2024, 5, 12, 12, 0, tzinfo=la).timestamp())
    ts2 = int(datetime(2024, 9, 3, 13, 0, tzinfo=la).timestamp())
    cap = "ריטריט לחיילים במליבו"  # Hebrew
    cap2 = "יום עבודה בחווה עם קבוצה חדשה"
    moj, moj2 = (c.encode("utf-8").decode("latin-1") for c in (cap, cap2))
    with open(os.path.join(ig_media, "posts_1.json"), "w", encoding="utf-8") as fh:
        json.dump([{"media": [{"uri": "x", "creation_timestamp": ts, "title": moj}]}], fh)
    with open(os.path.join(ig_media, "posts.json"), "w", encoding="utf-8") as fh:
        json.dump([
            # the same 2024-05-12 post again, label_values shape (caption only nested in media)
            {"timestamp": ts, "label_values": [
                {"label": "Post type", "value": "Image"},
                {"label": "Media", "media": [{"uri": "x", "creation_timestamp": ts, "title": moj}]}]},
            # a post that exists ONLY in posts.json: caption in a label_values value, no media
            {"timestamp": ts2, "label_values": [{"label": "Caption", "value": moj2}]},
        ], fh)
    with open(os.path.join(ig_content, "stories.json"), "w", encoding="utf-8") as fh:
        json.dump({"ig_stories": [{"uri": "s", "creation_timestamp": ts2 + 60, "title": "story"}]}, fh)
    ig = load_instagram(os.path.join(tmp, "ig"))
    assert ig["2024-05-12"] == [cap], ig["2024-05-12"]          # deduped across the two files
    assert sorted(ig["2024-09-03"]) == sorted([cap2, "story"]), ig["2024-09-03"]  # content/ read too
    join_instagram(events, ig)
    e = next(e for e in events if e["date"] == "2024-05-12")
    assert e["ig_posts"] == 1 and e["ig_caption"] == cap, e
    e2 = next(e for e in events if e["date"] == "2024-09-03")
    assert e2["ig_posts"] == 2 and e2["ig_caption"] == cap2, e2
    # a single posts.json file (not a folder) works the same
    assert load_instagram(os.path.join(ig_media, "posts.json"))["2024-05-12"] == [cap]

    # 5. --since keeps only new clusters (monthly run)
    later = cluster_rows(rows, f, 150, 5, since=datetime(2024, 8, 1).date())
    assert all(e["date"] >= "2024-08-01" for e in later) and len(later) < len(events)

    write_csv(out, EVENT_FIELDS, events)
    # 6. the shareable file carries no name, no path, no photo title/description
    text = open(out, encoding="utf-8").read()
    for bad in ("Alice", "Bob", "_UNKNOWN_", "/Users/", "Group with", "limor", "smiling"):
        assert bad not in text, "events_seed leaked: %s" % bad
    print("demo OK: %d synthetic records -> %d scrubbed rows -> %d events (%d farm, %d off-site)"
          % (len(recs), len(rows), len(events), n_farm, len(n_out)))
    print("sample:", {k: e[k] for k in ("event_id", "place", "photos", "max_faces", "ig_caption")})
    print("files:", tmp)


# ----------------------------------------------------------------------------- main

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scrub", help="osxphotos JSON -> photos_meta.csv (no names, no paths)")
    s.add_argument("input")
    s.add_argument("-o", "--output", default="photos_meta.csv")
    s.set_defaults(fn=cmd_scrub)

    c = sub.add_parser("cluster", help="photos_meta.csv -> events_seed.csv")
    c.add_argument("input")
    c.add_argument("-o", "--output", default="events_seed.csv")
    c.add_argument("--farm", default="auto", help="'auto' (densest cell), 'none', or 'lat,lon'")
    c.add_argument("--radius", type=float, default=150, help="metres counted as 'at the farm'")
    c.add_argument("--min-photos", type=int, default=5)
    c.add_argument("--since", help="YYYY-MM-DD — only events from this day (monthly run)")
    c.add_argument("--instagram",
                   help="Instagram export folder (instagram-<user>-<date>-<id>/) "
                        "or a posts_*.json / posts.json / stories.json file")
    c.set_defaults(fn=cmd_cluster)

    d = sub.add_parser("demo", help="self-test on synthetic data")
    d.set_defaults(fn=cmd_demo)

    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
