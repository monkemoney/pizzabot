#!/usr/bin/env python3
"""monitor.py — grants monitor for the farm (Tier 1 of GRANTS-SYSTEM-SPEC.md, ops tool D13).

  monitor.py pull    [--sources grantsgov,cagrants,funders] [--fixtures DIR]   # fetch -> opportunities.csv (dedup, upsert)
  monitor.py score   [--org org.json]                                         # fit score 0-100 + reasons per row
  monitor.py digest  [--top 10] [-o digest.md]                                # the weekly message for Limor
  monitor.py demo                                                              # offline self-test on fixtures/

Sources (layer 1, automatic): Grants.gov Search2 API · California Grants Portal (CKAN datastore on
data.ca.gov) · funder apply-pages from funders.csv (change detection by content hash).
Everything is stdlib; network calls go through urllib and honour HTTPS_PROXY. Live runs happen on
Nave's Mac (the cloud sandbox blocks these hosts); `demo` runs anywhere on the fixtures.
No personal data is involved anywhere in this tool: opportunities and funders only.
"""
import argparse, csv, hashlib, json, os, re, sys, tempfile, urllib.request, urllib.error
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
OPPS = os.path.join(HERE, "opportunities.csv")
FIELDS = ["opp_id", "source", "funder", "program", "url", "type", "amount_min", "amount_max", "deadline", "open_date",
          "status", "eligibility", "categories", "geography", "summary", "first_seen", "last_checked",
          "score", "score_reasons", "decision", "notes"]

SOURCES = {
    "grantsgov": {"search": "https://api.grants.gov/v1/api/search2", "detail": "https://api.grants.gov/v1/api/fetchOpportunity",
                  "keywords": ["nonprofit security", "animal welfare", "veterans mental health", "trauma", "youth mentoring",
                               "community resilience", "urban agriculture", "faith-based community"],
                  "eligibilities": "12,13", "rows": 50},
    # California Grants Portal open-data resource (CKAN). Verify the resource id on data.ca.gov if a 404 comes back.
    "cagrants": {"datastore": "https://data.ca.gov/api/3/action/datastore_search", "resource_id": "111c8c88-21f6-453c-ae2c-b4785a0624f5",
                 "terms": ["nonprofit", "animal", "mental health", "veterans", "youth", "community", "security", "agriculture"], "limit": 200},
}

FIELD_KEYWORDS = {  # org.fields -> words in an opportunity text that indicate the field
    "animal_welfare": ["animal", "humane", "shelter", "rescue", "pet", "veterinar", "livestock"],
    "animal_assisted_therapy": ["animal-assisted", "equine", "therapy animal", "therapeutic"],
    "mental_health": ["mental health", "behavioral health", "wellness", "trauma", "ptsd", "counsel"],
    "veterans": ["veteran", "service member", "military", "soldier"],
    "special_needs": ["disabilit", "special needs", "autism", "developmental"],
    "youth": ["youth", "children", "k-12", "students", "after school", "mentoring"],
    "education": ["education", "learning", "school", "stem"],
    "jewish_community": ["jewish", "synagogue", "faith", "religious", "interfaith", "antisemitism"],
    "community_building": ["community", "neighborhood", "civic", "resilien"],
    "urban_agriculture": ["agricultur", "farm", "garden", "food", "urban ag"],
    "security": ["security", "target hardening", "hate crime", "protect"],
    "trauma": ["trauma", "survivor", "crisis", "healing"],
}
EXCLUDE_WORDS = ["for-profit only", "individuals only", "state agencies only", "tribal governments only", "institutions of higher education only"]
CORE_FIELDS = {"animal_welfare", "animal_assisted_therapy", "mental_health", "trauma", "veterans", "special_needs", "jewish_community", "security", "youth"}
OFF_TOPIC = ["climate", "wastewater", "drinking water", "recycling", "broadband", "digital divide", "transit", "highway", "housing development",
             "wildfire", "energy efficiency", "flood", "levee", "conservancy", "land acquisition", "watershed", "stormwater", "electric vehicle",
             "solar", "sea level", "fisheries", "forest", "groundwater", "port", "rail"]
NONPROFIT_WORDS = ["nonprofit", "non-profit", "501", "community-based", "faith", "community based organization", "cbo", "ngo", "charit"]


# ----------------------------------------------------------------------------- io

def read_opps():
    if not os.path.exists(OPPS):
        return {}
    with open(OPPS, newline="", encoding="utf-8") as f:
        return {r["opp_id"]: r for r in csv.DictReader(f)}


def write_opps(rows):
    with open(OPPS, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in sorted(rows.values(), key=lambda r: (r.get("deadline") or "9999", r["funder"])):
            w.writerow({k: r.get(k, "") for k in FIELDS})


def http_json(url, payload=None, timeout=40):
    req = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"Content-Type": "application/json", "User-Agent": "farm-grants-monitor/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"


def http_text(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def oid(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:10]


def to_iso(s):
    if not s:
        return ""
    s = str(s).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y %H:%M", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(s[:len(fmt) + 4], fmt).date().isoformat()
        except ValueError:
            continue
    m = re.search(r"(\d{4}-\d{2}-\d{2})|(\d{1,2}/\d{1,2}/\d{4})", s)
    return to_iso(m.group(0)) if m else ""


def money_range(*vals):
    """'$30,000 - $300,000' -> (30000, 300000); 'Up to $50,000' -> ('', 50000); '$1.5M' -> (1500000, 1500000).
    Several fields may be passed (min, max, total); all numbers found are pooled."""
    nums = []
    for v in vals:
        if v in (None, ""):
            continue
        for m in re.finditer(r"\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|million|thousand|b|billion)?\b", str(v), re.I):
            try:
                x = float(m.group(1).replace(",", ""))
            except ValueError:
                continue
            unit = (m.group(2) or "").lower()
            x *= {"k": 1e3, "thousand": 1e3, "m": 1e6, "mm": 1e6, "million": 1e6, "b": 1e9, "billion": 1e9}.get(unit, 1)
            if 100 <= x <= 5e10:
                nums.append(int(x))
    if not nums:
        return "", ""
    text = " ".join(str(v) for v in vals if v).lower()
    if len(nums) == 1:
        return ("", nums[0]) if ("up to" in text or "maximum" in text or "max" in text) else (nums[0], nums[0])
    return min(nums), max(nums)


def money(s):
    return money_range(s)[1]


# ----------------------------------------------------------------------------- sources

def pull_grantsgov(cfg, fixtures=None):
    """Grants.gov Search2: one query per keyword, nonprofits eligible (12 = with 501c3, 13 = without)."""
    out = []
    if fixtures:
        data = json.load(open(os.path.join(fixtures, "grantsgov.json"), encoding="utf-8"))
        batches = [data]
    else:
        batches = []
        for kw in cfg["keywords"]:
            try:
                batches.append(http_json(cfg["search"], {"keyword": kw, "oppStatuses": "forecasted|posted",
                                                        "eligibilities": cfg["eligibilities"], "rows": cfg["rows"]}))
            except (urllib.error.URLError, ValueError, TimeoutError) as e:
                print("grantsgov: %s -> %s" % (kw, e), file=sys.stderr)
    for data in batches:
        hits = (data.get("data") or {}).get("oppHits") or data.get("oppHits") or []
        for h in hits:
            num = h.get("number") or h.get("id")
            out.append({
                "opp_id": "gg-" + str(num), "source": "grants.gov", "funder": h.get("agency") or h.get("agencyCode") or "federal",
                "program": h.get("title", ""), "url": "https://www.grants.gov/search-results-detail/%s" % h.get("id", ""),
                "type": "federal", "amount_min": money_range(h.get("awardFloor"))[1], "amount_max": money_range(h.get("awardCeiling"))[1],
                "deadline": to_iso(h.get("closeDate")), "open_date": to_iso(h.get("openDate")), "status": (h.get("oppStatus") or "").lower(),
                "eligibility": "nonprofits" if h.get("eligibilities") in (None, "") else str(h.get("eligibilities")),
                "categories": ";".join(c.get("cfdaNumber", "") if isinstance(c, dict) else str(c) for c in (h.get("cfdaList") or [])),
                "geography": "US", "summary": (h.get("synopsis") or h.get("description") or "")[:300],
            })
    return out


def pull_cagrants(cfg, fixtures=None):
    """California Grants Portal via the data.ca.gov CKAN datastore."""
    out = []
    if fixtures:
        batches = [json.load(open(os.path.join(fixtures, "cagrants.json"), encoding="utf-8"))]
    else:
        batches = []
        for term in cfg["terms"]:
            url = "%s?resource_id=%s&q=%s&limit=%d" % (cfg["datastore"], cfg["resource_id"], urllib.request.quote(term), cfg["limit"])
            try:
                batches.append(http_json(url))
            except (urllib.error.URLError, ValueError, TimeoutError) as e:
                print("cagrants: %s -> %s" % (term, e), file=sys.stderr)
    for data in batches:
        recs = ((data.get("result") or {}).get("records")) or data.get("records") or []
        for r in recs:
            g = {k.lower().replace(" ", ""): v for k, v in r.items()}
            title = g.get("title") or g.get("grant_title") or g.get("granttitle") or ""
            pid = g.get("portalid") or g.get("portal_id") or g.get("_id") or oid(title, g.get("agencydept", ""))
            if not title:
                continue
            out.append({
                "opp_id": "ca-" + str(pid), "source": "grants.ca.gov", "funder": g.get("agencydept") or g.get("agency") or "State of California",
                "program": title, "url": g.get("granturl") or g.get("grant_url") or g.get("url") or "https://www.grants.ca.gov/grants/%s" % pid,
                "type": "state", "amount_min": money_range(g.get("estamounts_min") or g.get("estamountmin"), g.get("estamounts"))[0],
                "amount_max": money_range(g.get("estamounts_max") or g.get("estamountmax"), g.get("estamounts"))[1],
                "deadline": to_iso(g.get("applicationdeadline") or g.get("deadline")), "open_date": to_iso(g.get("opendate")),
                "status": (g.get("status") or "").lower(), "eligibility": g.get("applicanttype") or g.get("applicanttypes") or "",
                "categories": g.get("categories") or "", "geography": g.get("geography") or "CA",
                "summary": (g.get("purpose") or g.get("description") or "")[:300],
            })
    return out


def pull_funders(fixtures=None):
    """Layer 2: hash each funder's apply page; a changed hash = an opportunity to look at."""
    path = os.path.join(HERE, "funders.csv")
    if not os.path.exists(path):
        return []
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8")))
    out, changed = [], 0
    for r in rows:
        url = r.get("apply_url", "")
        if not url or r.get("type", "").endswith("aggregator"):
            continue
        if fixtures:
            text = "fixture page for " + r["funder"] + (" CHANGED" if "Petco" in r["funder"] else "")
        else:
            try:
                text = http_text(url)
            except urllib.error.HTTPError as e:
                r["notes"] = "page blocks bots (HTTP %s) — check by hand monthly" % e.code
                continue
            except (urllib.error.URLError, TimeoutError) as e:
                print("funders: %s -> %s" % (r["funder"], e), file=sys.stderr)
                continue
        h = hashlib.sha1(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).encode("utf-8")).hexdigest()[:12]
        prev = r.get("page_hash", "")
        if prev and prev != h:
            changed += 1
            out.append({"opp_id": "fp-" + oid(r["funder"], h), "source": "funder-page", "funder": r["funder"], "program": "apply page changed — review",
                        "url": url, "type": r.get("type", "foundation"), "amount_min": r.get("p25_usd", ""), "amount_max": r.get("p75_usd", ""),
                        "deadline": "", "open_date": date.today().isoformat(), "status": "review", "eligibility": "", "categories": r.get("lane", ""),
                        "geography": "LA", "summary": "Page content changed since %s" % (r.get("last_checked") or "last run")})
        r["page_hash"], r["last_checked"] = h, date.today().isoformat()
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print("funders: %d pages checked, %d changed" % (len(rows), changed))
    return out


def cmd_pull(a):
    existing = read_opps()
    srcs = a.sources.split(",")
    new = []
    if "grantsgov" in srcs:
        new += pull_grantsgov(SOURCES["grantsgov"], a.fixtures)
    if "cagrants" in srcs:
        new += pull_cagrants(SOURCES["cagrants"], a.fixtures)
    if "funders" in srcs:
        new += pull_funders(a.fixtures)
    today = date.today().isoformat()
    added = updated = 0
    for r in new:
        r["last_checked"] = today
        if r["opp_id"] in existing:
            keep = existing[r["opp_id"]]
            for k in ("first_seen", "score", "score_reasons", "decision", "notes"):
                r[k] = keep.get(k, "")
            updated += 1
        else:
            r["first_seen"] = today
            r.setdefault("decision", "")
            added += 1
        existing[r["opp_id"]] = r
    write_opps(existing)
    print("pull: %d fetched -> %d new, %d updated, %d total -> %s" % (len(new), added, updated, len(existing), os.path.basename(OPPS)))
    return existing


# ----------------------------------------------------------------------------- scoring

def score_row(r, org, today=None):
    """0-100 with reasons. Hard eligibility failures return 0."""
    today = today or date.today()
    text = " ".join(str(r.get(k, "")) for k in ("program", "summary", "categories", "eligibility", "funder")).lower()
    reasons, s = [], 0
    if any(w in text for w in EXCLUDE_WORDS):
        return 0, "excluded: eligibility text"
    if r.get("status") in ("closed", "archived", "expired"):
        return 0, "closed"
    # applicant type gate: a listed applicant type that does not include nonprofits is a hard zero
    elig = str(r.get("eligibility", "")).lower()
    if elig and elig not in ("nonprofits",) and not any(w in elig for w in NONPROFIT_WORDS):
        return 0, "applicant type excludes nonprofits (%s)" % elig[:60]
    # field match (0-40): core fields 14 each; generic fields (community/education/agriculture) 5 each and
    # only on top of a core hit — 'community' alone is how a levee grant scored 81
    hits = [f for f in org["fields"] if any(k in text for k in FIELD_KEYWORDS.get(f, []))]
    core = [f for f in hits if f in CORE_FIELDS]
    generic = [f for f in hits if f not in CORE_FIELDS]
    if core:
        fs = min(40, 14 * len(core) + 5 * len(generic))
    else:
        fs = 6 if generic else 0
    off = [w for w in OFF_TOPIC if w in text]
    if off and not core:
        return min(25, fs + 15), "off-topic (%s); fields %d/40" % (off[0], fs)
    s += fs
    reasons.append("fields %d/40 (%s%s)" % (fs, ",".join(core[:4]) or "no core", ("+" + ",".join(generic[:2])) if generic else ""))
    # amount fit (0-20)
    lo, hi = org["ask_range_usd"]["min"], org["ask_range_usd"]["max"]
    amax, amin = r.get("amount_max") or "", r.get("amount_min") or ""
    if amax == "" and amin == "":
        am = 8; reasons.append("amount unknown 8/20")
    else:
        top = int(amax or amin); bottom = int(amin or 0)
        if bottom > hi * 1.5:
            am = 0; reasons.append("amount too large for us 0/20")
        elif top < lo:
            am = 4; reasons.append("amount small 4/20")
        elif lo <= top <= hi * 1.5:
            am = 20; reasons.append("amount fits 20/20")
        else:
            am = 12; reasons.append("amount partly fits 12/20")
    s += am
    # deadline lead (0-15)
    d = r.get("deadline")
    if d:
        days = (date.fromisoformat(d) - today).days
        if days < 0:
            return 0, "deadline passed"
        dl = 15 if days >= org["capacity"]["min_lead_days"] else (6 if days >= 7 else 2)
        reasons.append("lead %dd %d/15" % (days, dl))
    else:
        dl = 10; reasons.append("no deadline (rolling) 10/15")
    s += dl
    # geography (0-10)
    geo = (str(r.get("geography", "")) + " " + text)
    if any(k in geo.lower() for k in ("los angeles", "la county", "california", " ca ", "statewide")):
        g = 10
    elif r.get("type") == "federal" or "us" in geo.lower():
        g = 7
    else:
        g = 3
    s += g; reasons.append("geo %d/10" % g)
    # burden (0-10): federal heavier
    b = 4 if r.get("type") == "federal" else (7 if r.get("type") == "state" else 10)
    if org["capacity"]["reporting_capacity"] == "low" and r.get("type") == "federal":
        reasons.append("federal reporting burden 4/10")
    else:
        reasons.append("burden %d/10" % b)
    s += b
    # history (0-5): funder in our benchmark list
    funders = load_funder_names()
    hist = 5 if any(fn.lower().split(" foundation")[0] in r.get("funder", "").lower() for fn in funders) else 0
    s += hist
    if hist:
        reasons.append("benchmark funder +5")
    return min(100, s), "; ".join(reasons)


_FN = None
def load_funder_names():
    global _FN
    if _FN is None:
        p = os.path.join(HERE, "funders.csv")
        _FN = [r["funder"] for r in csv.DictReader(open(p, newline="", encoding="utf-8"))] if os.path.exists(p) else []
    return _FN


def cmd_score(a):
    org = json.load(open(a.org, encoding="utf-8"))
    rows = read_opps()
    for r in rows.values():
        r["score"], r["score_reasons"] = score_row(r, org)
    write_opps(rows)
    hi = sum(1 for r in rows.values() if int(r["score"] or 0) >= 70)
    print("score: %d opportunities, %d at 70+, %d zero" % (len(rows), hi, sum(1 for r in rows.values() if int(r["score"] or 0) == 0)))
    return rows


# ----------------------------------------------------------------------------- digest

def render_digest(rows, top=10, today=None):
    today = today or date.today()
    live = [r for r in rows.values() if int(r.get("score") or 0) > 0 and r.get("decision") not in ("rejected", "submitted", "won", "lost")]
    live.sort(key=lambda r: (-int(r["score"]), r.get("deadline") or "9999"))
    new = [r for r in live if r.get("first_seen") == today.isoformat() or r.get("decision", "") == ""]
    soon = sorted([r for r in live if int(r["score"]) >= 50 and r.get("deadline") and 0 <= (date.fromisoformat(r["deadline"]) - today).days <= 45], key=lambda r: r["deadline"])
    L = ["*מענקים — שבוע %s*" % today.strftime("%d.%m"), ""]
    L.append("*החלטות (%d חדשות מעל 70):*" % sum(1 for r in new if int(r["score"]) >= 70))
    for r in [x for x in new if int(x["score"]) >= 70][:top]:
        L.append("• %s — %s · %s · עד %s · ציון %s\n   %s" % (r["funder"][:40], r["program"][:60], amt(r), r.get("deadline") or "רץ", r["score"], r["url"]))
    L += ["", "*מועדים ב-45 יום:*"]
    for r in soon[:5]:
        L.append("• %s · %s · %s" % (r["deadline"], r["funder"][:30], r["program"][:50]))
    if not soon:
        L.append("• אין")
    pipeline = sum(min(int(r["amount_max"] or r["amount_min"] or 0), org_cap()) for r in live if int(r["score"]) >= 70)
    L += ["", "*בצינור:* %d הזדמנויות מעל 70 · עד ~$%s" % (sum(1 for r in live if int(r["score"]) >= 70), format(pipeline, ",")),
          "", "לאשר/לדחות: לענות ״אשר <שם>״ / ״דחה <שם>״ — או בעמודת decision בגיליון."]
    return "\n".join(L)


def org_cap():
    try:
        return int(json.load(open(os.path.join(HERE, "org.json"), encoding="utf-8"))["ask_range_usd"]["max"])
    except Exception:  # noqa: BLE001 — no profile: do not cap
        return 10**9


def amt(r):
    lo, hi = r.get("amount_min") or "", r.get("amount_max") or ""
    if lo and hi:
        return "$%s–%s" % (format(int(lo), ","), format(int(hi), ","))
    if hi or lo:
        return "$%s" % format(int(hi or lo), ",")
    return "סכום לא צוין"


def cmd_digest(a):
    text = render_digest(read_opps(), a.top)
    with open(a.output, "w", encoding="utf-8") as f:
        f.write(text)
    print(text)
    print("\n-> %s" % a.output)


# ----------------------------------------------------------------------------- demo

def cmd_demo(_a):
    global OPPS
    tmp = tempfile.mkdtemp(prefix="grants-demo-")
    OPPS = os.path.join(tmp, "opportunities.csv")
    fx = os.path.join(HERE, "fixtures")
    ns = argparse.Namespace(sources="grantsgov,cagrants", fixtures=fx)
    rows = cmd_pull(ns)
    assert len(rows) == 9, len(rows)
    rng = next(r for r in rows.values() if "Range Test" in r["program"])
    assert rng["amount_min"] == 30000 and rng["amount_max"] == 300000, (rng["amount_min"], rng["amount_max"])
    assert money_range("Up to $50,000") == ("", 50000) and money_range("$1.5M")[1] == 1500000 and money_range("N/A") == ("", "")
    org = json.load(open(os.path.join(HERE, "org.json"), encoding="utf-8"))
    today = date(2026, 9, 29)
    for r in rows.values():
        r["score"], r["score_reasons"] = score_row(r, org, today)
    by = {r["program"][:20]: r for r in rows.values()}
    nsgp = next(r for r in rows.values() if "Nonprofit Security" in r["program"])
    assert int(nsgp["score"]) >= 70, (nsgp["score"], nsgp["score_reasons"])
    closed = next(r for r in rows.values() if "Closed" in r["program"])
    assert int(closed["score"]) == 0 and closed["score_reasons"] == "closed"
    past = next(r for r in rows.values() if "Past Deadline" in r["program"])
    assert int(past["score"]) == 0 and past["score_reasons"] == "deadline passed"
    huge = next(r for r in rows.values() if "Hospital" in r["program"])
    assert int(huge["score"]) < 50 and "too large" in huge["score_reasons"], huge["score_reasons"]
    animal = next(r for r in rows.values() if "Animal" in r["program"])
    assert int(animal["score"]) >= 60 and "animal_welfare" in animal["score_reasons"], animal["score_reasons"]
    levee = next(r for r in rows.values() if "Levee" in r["program"])
    assert int(levee["score"]) <= 25 and "off-topic" in levee["score_reasons"], (levee["score"], levee["score_reasons"])
    agency = next(r for r in rows.values() if "Agencies Only" in r["program"])
    assert int(agency["score"]) == 0 and "applicant type" in agency["score_reasons"], agency["score_reasons"]
    # second pull must not duplicate and must keep decisions
    animal["decision"] = "approved"
    write_opps(rows)
    rows2 = cmd_pull(ns)
    assert len(rows2) == 9 and rows2[animal["opp_id"]]["decision"] == "approved"
    for r in rows2.values():
        r["score"], r["score_reasons"] = score_row(r, org, today)
    text = render_digest(rows2, 10, today)
    assert "Nonprofit Security" in text and "Closed" not in text and "Levee" not in text and "בצינור" in text, text
    print("demo OK: 9 fixture opportunities pulled · NSGP scored %s · closed/past = 0 · oversized penalised · upsert kept decision · digest renders" % nsgp["score"])
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("pull"); s.add_argument("--sources", default="grantsgov,cagrants,funders"); s.add_argument("--fixtures"); s.set_defaults(fn=cmd_pull)
    c = sub.add_parser("score"); c.add_argument("--org", default=os.path.join(HERE, "org.json")); c.set_defaults(fn=cmd_score)
    d = sub.add_parser("digest"); d.add_argument("--top", type=int, default=10); d.add_argument("-o", "--output", default=os.path.join(HERE, "digest.md")); d.set_defaults(fn=cmd_digest)
    e = sub.add_parser("demo"); e.set_defaults(fn=cmd_demo)
    a = p.parse_args(argv); a.fn(a)


if __name__ == "__main__":
    main()
