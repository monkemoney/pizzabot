#!/usr/bin/env python3
"""cal_events.py — (named so it does not shadow Python's own calendar module) Limor's Apple Calendar as the farm's activity record, grade R (ops tool, D13).

A calendar entry is written BEFORE the event happens, so it is a record made at the time —
the evidence grade funders accept. Runs ON LIMOR'S MAC on .ics files exported from Calendar.app
(select a calendar in the sidebar → File → Export → Export… → one .ics per calendar).
Never writes attendees, notes or descriptions anywhere. Titles and locations go ONLY to the
local file.

  calendar_events.csv  shareable — one row per occurrence: date · hours · calendar · recurring ·
                       tag (from tags.txt, same file as contacts.py) · headcount hint (a number
                       found in the title, e.g. "40 ילדים") · attendees count · at_farm · grade R
  calendar_local.csv   LOCAL — event_id → title · location, for Limor's tagging. Stays on the Mac.

  cal_events.py scan  ~/farm-data/ics/*.ics --tags tags.txt --farm 34.xxxxx,-118.xxxxx -o calendar_events.csv
  cal_events.py demo

Then: timeline.py cluster … --calendar calendar_events.csv  → photo clusters on a calendar day are graded R.
Recurring events (RRULE) are expanded within 2020-06-01 → today: a weekly class is 52 rows a year.
Python 3.9+, standard library only.
"""
import argparse
import csv
import glob
import hashlib
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    LOCAL_TZ = ZoneInfo("America/Los_Angeles")
except Exception:  # noqa: BLE001 — no tz database; fall back to Pacific standard time
    LOCAL_TZ = timezone(timedelta(hours=-8))

WINDOW_START = date(2020, 6, 1)
EVENT_FIELDS = ["event_id", "date", "weekday", "start", "end", "hours", "all_day", "calendar", "recurring",
                "tag", "tags_all", "headcount_hint", "attendees", "at_farm", "has_location", "evidence_grade"]
LOCAL_FIELDS = ["event_id", "date", "calendar", "title", "location"]

DEFAULT_TAGS = [
    "סיור,tour,visit,ביקור", "נובה,nova", "חייל,חיילים,חיילת,soldier,soldiers,idf,צה\"ל,צהל",
    "מילואים,reserve,reservist", "פצוע,פצועים,wounded,הלום,הלומי,ptsd", "בית ספר,ביה\"ס,school",
    "גן ילדים,גני ילדים,kindergarten,preschool", "קייטנה,camp", "טיפול,טיפולי,therapy,therapeutic",
    "צרכים מיוחדים,special needs,autism,אוטיזם", "מתנדב,מתנדבת,מתנדבים,volunteer",
    "תורם,תורמת,donor,donation,תרומה", "אלפקה,אלפקות,alpaca", "יום הולדת,birthday",
    "שבת בחווה,שבתות,shabbat,קהילה,community,חב\"ד,chabad", "עיתונאי,press,כתב,journalist",
    "וטרינר,vet,veterinarian", "אירוע,event,fundraiser,גאלה,gala",
]
_TAG_RE_CACHE = {}


def tag_matches(text, syns):
    """Word-boundary match. A bare substring made 'גן' hit 'מגן דוד אדום' and 'דגן', 'tour' hit
    'tourism', 'camp' hit 'campus'. Hebrew allows one attached prefix letter (ב/ל/מ/ה/ו/ש/כ) and a
    plural/feminine suffix; Latin needs a clean word boundary."""
    t = (text or "").lower()
    for s in syns:
        rx = _TAG_RE_CACHE.get(s)
        if rx is None:
            if re.search(r"[\u0590-\u05FF]", s):
                rx = re.compile(r"(?<![\w\u0590-\u05FF])[ובלכשמה]?" + re.escape(s) + r"(?:ים|ות|יות|י|ה|ת)?(?![\w\u0590-\u05FF])")
            else:
                rx = re.compile(r"(?<![\w])" + re.escape(s) + r"(?:s|es)?(?![\w])")
            _TAG_RE_CACHE[s] = rx
        if rx.search(t):
            return True
    return False


FARM_WORDS = ("keokuk", "farm", "חווה", "kfar saba urban farm", "winnetka")
HEADCOUNT_RE = re.compile(r"(\d{1,3})\s*(?:ילדים|ילדות|חיילים|חיילות|אנשים|משתתפים|נערים|תלמידים|kids|children|people|soldiers|"
                          r"participants|pax|guests|students|adults|teens|families|משפחות|x)\b", re.I)
BARE_NUM_RE = re.compile(r"(?<![\d:/.\-])(\d{1,3})(?![\d:/.\-])")
WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


# ----------------------------------------------------------------------------- ics parsing

def unfold(lines):
    out = []
    for ln in lines:
        ln = ln.rstrip("\r\n")
        if ln[:1] in (" ", "\t") and out:
            out[-1] += ln[1:]
        else:
            out.append(ln)
    return out


def unescape(s):
    return (s or "").replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\;", ";").replace("\\\\", "\\")


def parse_prop(line):
    """'DTSTART;TZID=America/Los_Angeles:20240315T100000' -> ('DTSTART', {'TZID': '...'}, '20240315T100000')"""
    if ":" not in line:
        return None, {}, ""
    head, _, value = line.partition(":")
    # a parameter value may itself contain ':' inside quotes (X-APPLE-STRUCTURED-LOCATION); good enough here
    parts = head.split(";")
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.upper()] = v.strip('"')
    return parts[0].upper(), params, value


def parse_dt(value, params):
    """Returns (datetime or date, all_day). Zulu times are converted to LOCAL_TZ; TZID times are wall time."""
    v = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", v):
        return datetime.strptime(v[:8], "%Y%m%d").date(), True
    m = re.fullmatch(r"(\d{8})T(\d{6})(Z?)", v)
    if not m:
        return None, False
    dt = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
    if m.group(3) == "Z":
        dt = dt.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ).replace(tzinfo=None)
    return dt, False


def parse_ics(text):
    """Yield dicts per VEVENT with the fields we use. Calendar name from X-WR-CALNAME."""
    lines = unfold(text.splitlines())
    calname = ""
    events, cur = [], None
    for ln in lines:
        name, params, value = parse_prop(ln)
        if name == "X-WR-CALNAME":
            calname = unescape(value)
        elif name == "BEGIN" and value.upper() == "VEVENT":
            cur = {"attendees": 0, "exdates": set(), "geo": None}
        elif name == "END" and value.upper() == "VEVENT" and cur is not None:
            events.append(cur)
            cur = None
        elif cur is not None:
            if name == "DTSTART":
                cur["start"], cur["all_day"] = parse_dt(value, params)
            elif name == "DTEND":
                cur["end"], _ = parse_dt(value, params)
            elif name == "SUMMARY":
                cur["title"] = unescape(value)
            elif name == "LOCATION":
                cur["location"] = unescape(value)
            elif name == "UID":
                cur["uid"] = value
            elif name == "RRULE":
                cur["rrule"] = value
            elif name == "EXDATE":
                for part in value.split(","):
                    d, _ = parse_dt(part, params)
                    if d:
                        cur["exdates"].add(d if isinstance(d, date) and not isinstance(d, datetime) else d.date())
            elif name == "RECURRENCE-ID":
                d, _ = parse_dt(value, params)
                if d:
                    cur["recurrence_id"] = d if not isinstance(d, datetime) else d.date()
            elif name == "ATTENDEE":
                cur["attendees"] += 1
            elif name == "STATUS":
                cur["status"] = value.upper()
            elif name == "X-APPLE-STRUCTURED-LOCATION":
                m = re.search(r"geo:(-?\d+\.\d+),(-?\d+\.\d+)", value)
                if m:
                    cur["geo"] = (float(m.group(1)), float(m.group(2)))
    for e in events:
        e["calendar"] = calname
    return events


# ----------------------------------------------------------------------------- recurrence

def parse_rrule(s):
    out = {}
    for part in s.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.upper()] = v
    return out


def expand(ev, window_end, max_occ=2000):
    """Occurrence dates for an event (with or without RRULE), within [WINDOW_START, window_end]."""
    start = ev.get("start")
    if start is None:
        return []
    d0 = start if isinstance(start, date) and not isinstance(start, datetime) else start.date()
    if "rrule" not in ev:
        return [d0] if WINDOW_START <= d0 <= window_end else []
    r = parse_rrule(ev["rrule"])
    freq = r.get("FREQ", "WEEKLY").upper()
    interval = max(1, int(r.get("INTERVAL", "1") or 1))
    count = int(r["COUNT"]) if r.get("COUNT", "").isdigit() else None
    until = None
    if r.get("UNTIL"):
        u, _ = parse_dt(r["UNTIL"], {})
        until = u if isinstance(u, date) and not isinstance(u, datetime) else (u.date() if u else None)
    end = min(window_end, until) if until else window_end
    days = []
    if freq == "WEEKLY":
        byday = [WEEKDAYS[x[-2:]] for x in r.get("BYDAY", "").split(",") if x[-2:] in WEEKDAYS] or [d0.weekday()]
        week0 = d0 - timedelta(days=d0.weekday())
        n = 0
        w = 0
        while len(days) < max_occ:
            base = week0 + timedelta(weeks=w * interval)
            if base > end + timedelta(days=7):
                break
            for wd in sorted(byday):
                d = base + timedelta(days=wd)
                if d < d0:
                    continue
                n += 1
                if count and n > count:
                    break
                if d > end:
                    break
                days.append(d)
            if count and n > count:
                break
            w += 1
    elif freq == "DAILY":
        d, n = d0, 0
        while d <= end and (not count or n < count) and len(days) < max_occ:
            days.append(d)
            d += timedelta(days=interval)
            n += 1
    elif freq == "MONTHLY":
        n = 0
        y, m = d0.year, d0.month
        while len(days) < max_occ:
            try:
                d = date(y, m, d0.day)
            except ValueError:
                d = None
            if d and d > end:
                break
            if d:
                n += 1
                if count and n > count:
                    break
                days.append(d)
            m += interval
            while m > 12:
                m -= 12
                y += 1
            if date(y, m, 1) > end:
                break
    elif freq == "YEARLY":
        n, y = 0, d0.year
        while len(days) < max_occ:
            try:
                d = date(y, d0.month, d0.day)
            except ValueError:
                d = None
            if d and d > end:
                break
            if d:
                n += 1
                if count and n > count:
                    break
                days.append(d)
            y += interval
    else:
        days = [d0]
    ex = ev.get("exdates") or set()
    return [d for d in days if d >= WINDOW_START and d not in ex]


# ----------------------------------------------------------------------------- tagging

def load_tags(path):
    src = open(path, encoding="utf-8").read().splitlines() if path and os.path.exists(path) else DEFAULT_TAGS
    tags = []
    for ln in src:
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = [p.strip().lower() for p in ln.split(",") if p.strip()]
        tags.append((parts[0], parts))
    return tags


def tags_of(text, tags):
    return [tag for tag, syns in tags if tag_matches(text, syns)]


def headcount_hint(title):
    m = HEADCOUNT_RE.search(title or "")
    if m:
        return int(m.group(1))
    nums = [int(x) for x in BARE_NUM_RE.findall(title or "") if 2 <= int(x) <= 300]
    return nums[0] if len(nums) == 1 else ""


def haversine_m(lat1, lon1, lat2, lon2):
    import math
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def at_farm(ev, farm, radius_m=150):
    if ev.get("geo") and farm:
        return 1 if haversine_m(ev["geo"][0], ev["geo"][1], farm[0], farm[1]) <= radius_m else 0
    loc = (ev.get("location") or "").lower()
    if loc:
        return 1 if any(w in loc for w in FARM_WORDS) else 0
    return ""  # unknown — no location on the event


# ----------------------------------------------------------------------------- scan

def scan(paths, tags, farm=None, today=None):
    today = today or date.today()
    all_events = []
    for p in paths:
        with open(p, encoding="utf-8", errors="replace") as f:
            evs = parse_ics(f.read())
        for e in evs:
            e["calendar"] = e.get("calendar") or os.path.splitext(os.path.basename(p))[0]
        all_events.extend(evs)
    overrides = {(e.get("uid"), e["recurrence_id"]) for e in all_events if e.get("recurrence_id")}
    rows, local = [], []
    for e in all_events:
        if e.get("status") == "CANCELLED":
            continue
        title = e.get("title") or ""
        tg = tags_of(title + " " + (e.get("location") or ""), tags)
        start, end = e.get("start"), e.get("end")
        all_day = bool(e.get("all_day"))
        hours = ""
        if not all_day and isinstance(start, datetime) and isinstance(end, datetime):
            hours = round((end - start).total_seconds() / 3600, 2)
        recurring = 1 if e.get("rrule") else 0
        for d in expand(e, today):
            if recurring and (e.get("uid"), d) in overrides and not e.get("recurrence_id"):
                continue  # the override VEVENT carries this occurrence
            eid = hashlib.sha1(("%s|%s" % (e.get("uid", title), d.isoformat())).encode("utf-8")).hexdigest()[:10]
            rows.append({
                "event_id": eid, "date": d.isoformat(), "weekday": d.strftime("%a"),
                "start": start.strftime("%H:%M") if isinstance(start, datetime) else "",
                "end": end.strftime("%H:%M") if isinstance(end, datetime) else "",
                "hours": hours, "all_day": 1 if all_day else 0, "calendar": e.get("calendar", ""),
                "recurring": recurring, "tag": tg[0] if tg else "", "tags_all": ";".join(tg),
                "headcount_hint": headcount_hint(title), "attendees": e.get("attendees", 0),
                "at_farm": at_farm(e, farm), "has_location": 1 if (e.get("location") or e.get("geo")) else 0,
                "evidence_grade": "R",
            })
            local.append({"event_id": eid, "date": d.isoformat(), "calendar": e.get("calendar", ""),
                          "title": title, "location": e.get("location") or ""})
    rows.sort(key=lambda r: r["date"])
    local.sort(key=lambda r: r["date"])
    return rows, local


def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields})


def cmd_scan(args):
    paths = []
    for p in args.ics:
        paths.extend(glob.glob(p) if any(c in p for c in "*?[") else [p])
    if not paths:
        raise SystemExit("no .ics files — Calendar.app: click a calendar in the sidebar → File → Export → Export…")
    farm = tuple(float(x) for x in args.farm.split(",")) if args.farm else None
    rows, local = scan(paths, load_tags(args.tags), farm)
    write_csv(args.output, EVENT_FIELDS, rows)
    lpath = os.path.join(os.path.dirname(os.path.abspath(args.output)), "calendar_local.csv")
    write_csv(lpath, LOCAL_FIELDS, local)
    by_year = defaultdict(Counter)
    for r in rows:
        by_year[r["date"][:4]][r["tag"] or "(untagged)"] += 1
    print("scan: %d .ics files -> %d occurrences (%d tagged, %d recurring rows) -> %s" %
          (len(paths), len(rows), sum(1 for r in rows if r["tag"]), sum(1 for r in rows if r["recurring"]), os.path.basename(args.output)))
    for y in sorted(by_year):
        top = ", ".join("%s %d" % (t, n) for t, n in by_year[y].most_common(6))
        print("  %s  %4d events  · %s" % (y, sum(by_year[y].values()), top))
    print("LOCAL ONLY (titles, locations): %s — Limor tags from here; never upload" % os.path.basename(lpath))
    print("shareable: no title, note, attendee or description exists in %s" % os.path.basename(args.output))


# ----------------------------------------------------------------------------- demo

def synthetic_ics(tmp):
    def ev(uid, title, start, end=None, rrule=None, loc=None, geo=None, attendees=0, exdate=None, all_day=False, status=None):
        lines = ["BEGIN:VEVENT", "UID:%s" % uid, "SUMMARY:%s" % title]
        if all_day:
            lines.append("DTSTART;VALUE=DATE:%s" % start)
            lines.append("DTEND;VALUE=DATE:%s" % (end or start))
        else:
            lines.append("DTSTART;TZID=America/Los_Angeles:%s" % start)
            lines.append("DTEND;TZID=America/Los_Angeles:%s" % end)
        if rrule:
            lines.append("RRULE:%s" % rrule)
        if exdate:
            lines.append("EXDATE;TZID=America/Los_Angeles:%s" % exdate)
        if loc:
            lines.append("LOCATION:%s" % loc)
        if geo:
            lines.append('X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-APPLE-RADIUS=100;X-TITLE="%s":geo:%s,%s' % (loc or "x", geo[0], geo[1]))
        for i in range(attendees):
            lines.append("ATTENDEE;CN=Person %d Example;PARTSTAT=ACCEPTED:mailto:p%d@example.com" % (i, i))
        lines.append("DESCRIPTION:Contact Dana Example 052-1234567 for the bus\\nSecret notes")
        if status:
            lines.append("STATUS:%s" % status)
        lines.append("END:VEVENT")
        return "\r\n".join(lines)
    farm_cal = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:חווה",
        ev("u1", "סיור בית ספר אורות - 40 ילדים", "20240312T100000", "20240312T120000", loc="Keokuk Ave, Winnetka", attendees=2),
        ev("u2", "ריטריט נובה", "20240512", all_day=True, loc="Malibu"),
        ev("u3", "חוג אלפקות שבועי", "20240110T160000", "20240110T170000", rrule="FREQ=WEEKLY;BYDAY=WE;UNTIL=20240630T000000Z",
           geo=(34.2049, -118.5711), exdate="20240214T160000"),
        ev("u4", "פגישה עם דנה", "20240320T090000", "20240320T100000"),
        ev("u5", "טיפול קבוצתי חיילים 12", "20230601T170000", "20230601T190000", loc="חווה", status="CANCELLED"),
        ev("u6", "Farm tour - 25 people", "20190501T100000", "20190501T120000", loc="Keokuk"),  # before window
        "END:VCALENDAR", ""])
    home_cal = "\r\n".join(["BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:Home",
                            ev("h1", "רופא שיניים", "20240305T083000", "20240305T091500"), "END:VCALENDAR", ""])
    p1, p2 = os.path.join(tmp, "farm.ics"), os.path.join(tmp, "home.ics")
    open(p1, "w", encoding="utf-8").write(farm_cal)
    open(p2, "w", encoding="utf-8").write(home_cal)
    return [p1, p2]


def cmd_demo(_args):
    tmp = tempfile.mkdtemp(prefix="calendar-demo-")
    paths = synthetic_ics(tmp)
    rows, local = scan(paths, load_tags(None), farm=(34.2049, -118.5711), today=date(2024, 12, 31))
    out = os.path.join(tmp, "calendar_events.csv")
    write_csv(out, EVENT_FIELDS, rows)
    text = open(out, encoding="utf-8").read()
    for bad in ("Dana", "דנה", "Example", "052", "Secret", "אורות", "Keokuk", "Malibu", "example.com"):
        assert bad not in text, "calendar_events leaked: %s" % bad
    by_uid_title = {l["title"]: l for l in local}
    assert "סיור בית ספר אורות - 40 ילדים" in by_uid_title  # titles live in the LOCAL file only
    tour = next(r for r in rows if r["date"] == "2024-03-12")
    assert tour["tag"] == "סיור" and "בית ספר" in tour["tags_all"] and tour["headcount_hint"] == 40 and tour["at_farm"] == 1 \
        and tour["attendees"] == 2 and tour["hours"] == 2.0 and tour["calendar"] == "חווה", tour
    nova = next(r for r in rows if r["date"] == "2024-05-12")
    assert nova["tag"] == "נובה" and nova["all_day"] == 1 and nova["at_farm"] == 0, nova
    weekly = [r for r in rows if r["recurring"] == 1]
    assert len(weekly) == 24, len(weekly)  # Wednesdays 10 Jan → 26 Jun 2024 = 25, minus the EXDATE
    assert all(r["weekday"] == "Wed" and r["tag"] == "אלפקה" and r["at_farm"] == 1 for r in weekly)
    assert not any(r["date"] == "2024-02-14" for r in weekly), "EXDATE not honoured"
    assert not any(r["date"].startswith("2019") for r in rows), "window not applied"
    assert not any(r["date"] == "2023-06-01" for r in rows), "cancelled event kept"
    meet = next(r for r in rows if r["date"] == "2024-03-20" and r["recurring"] == 0)
    assert meet["tag"] == "" and meet["headcount_hint"] == "" and meet["at_farm"] == "", meet
    assert any(r["calendar"] == "Home" for r in rows)
    print("demo OK: %d .ics -> %d occurrences (%d tagged, %d weekly rows) · titles only in calendar_local.csv · no name/phone/place leaked"
          % (len(paths), len(rows), sum(1 for r in rows if r["tag"]), len(weekly)))
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan", help=".ics files -> calendar_events.csv (+ calendar_local.csv)")
    s.add_argument("ics", nargs="+", help=".ics files or globs (quote the glob)")
    s.add_argument("--tags", default="tags.txt", help="same tags.txt as contacts.py")
    s.add_argument("--farm", help="lat,lon of the farm (from timeline.py's 'farm (inferred)' line)")
    s.add_argument("-o", "--output", default="calendar_events.csv")
    s.set_defaults(fn=cmd_scan)
    d = sub.add_parser("demo")
    d.set_defaults(fn=cmd_demo)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
