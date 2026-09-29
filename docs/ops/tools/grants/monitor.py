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
    "animal_welfare": ["animal welfare", "animal rescue", "animal shelter", "humane", "animal care", "rescue animal", "veterinar", "companion animal", "farm animal"],
    "animal_assisted_therapy": ["animal-assisted", "equine", "therapy animal", "therapeutic"],
    "mental_health": ["mental health", "behavioral health", "wellness", "ptsd", "counsel", "emotional support"],
    "veterans": ["veteran", "service member", "soldier", "military famil", "military member"],
    "special_needs": ["disabilit", "special needs", "autism", "developmental"],
    "youth": ["youth", "children's program", "k-12", "students", "after school", "mentoring", "teens", "kids"],
    "education": ["educational program", "environmental education", "school field", "learning program", "stem"],
    "jewish_community": ["jewish", "synagogue", "faith", "religious", "interfaith", "antisemitism"],
    "community_building": ["community-based organization", "neighborhood", "civic engagement", "community program"],
    "urban_agriculture": ["urban agriculture", "community garden", "urban farm", "food access", "farm to school"],
    "security": ["nonprofit security", "physical security", "target hardening", "hate crime", "antisemitism", "security enhancement", "security grant"],
    "trauma": ["trauma-informed", "trauma survivor", "trauma recovery", "post-traumatic", "psychological trauma", "survivor", "crisis", "healing"],
}
EXCLUDE_WORDS = ["for-profit only", "individuals only", "state agencies only", "tribal governments only", "institutions of higher education only"]
CORE_FIELDS = {"animal_welfare", "animal_assisted_therapy", "mental_health", "trauma", "veterans", "special_needs", "jewish_community", "security", "youth"}
OFF_TOPIC = ["climate", "wastewater", "drinking water", "recycling", "broadband", "digital divide", "transit", "highway", "housing development",
             "wildfire", "energy efficiency", "flood", "levee", "conservancy", "land acquisition", "watershed", "stormwater", "electric vehicle",
             "solar", "sea level", "fisheries", "forest", "groundwater", "port", "rail", "hospital", "bond financing", "loan program",
             "boating", "aquatic", "library", "virus", "crop", "rice", "beet", "livestock compensation", "ranch", "extreme heat",
             "river", "trail", "park development", "nutrition incentive", "hazard mitigation", "construction",
             "clinical trial", "research program", "research center", "r01", "u01", "u19", "p30", "r21", "desalination", "postgraduate",
             "cooperative agreement for research", "fellowship", "dissertation", "reentry", "homelessness", "substance use disorder treatment"]
# Deliverables the farm cannot produce. These cap the score EVEN WITH a core hit — the $4M "Military and Civilian
# Partnership for Trauma Readiness" (hospital trauma centres) matched trauma+veterans+mental_health and scored 73.
HARD_OFF = ["trauma center", "trauma care", "acute care", "clinical", "patient", "registry", "protocol", "antimicrobial", "surveillance",
            "epidemiolog", "disease", "infection", "spina bifida", "health outcomes", "data collection", "research", "laborator",
            "pharmac", "vaccine", "diagnos", "marine", "fisheries", "military trauma"]
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

def find_hits(obj, depth=0):
    """Locate the list of opportunity dicts wherever the API put it (data.oppHits today; tolerant to moves)."""
    if depth > 4:
        return []
    if isinstance(obj, list) and obj and isinstance(obj[0], dict) and ("title" in obj[0] or "number" in obj[0]):
        return obj
    if isinstance(obj, dict):
        for k in ("oppHits", "data", "hits", "results", "opportunities"):
            if k in obj:
                got = find_hits(obj[k], depth + 1)
                if got:
                    return got
        for v in obj.values():
            got = find_hits(v, depth + 1)
            if got:
                return got
    return []


GG_VARIANTS = [  # Grants.gov Search2 accepted shapes differ from the docs; each is tried until one returns hits
    {"name": "encoded+pipe", "encode": True, "elig": "12|13", "sort": True},
    {"name": "encoded+comma", "encode": True, "elig": "12,13", "sort": True},
    {"name": "plain+pipe", "encode": False, "elig": "12|13", "sort": True},
    {"name": "encoded+noelig", "encode": True, "elig": "", "sort": True},
    {"name": "plain+noelig+nosort", "encode": False, "elig": "", "sort": False},
    {"name": "singleword", "encode": False, "elig": "", "sort": False, "first_word": True},
]


def gg_body(cfg, kw, v):
    k = kw.split()[0] if v.get("first_word") else kw
    body = {"keyword": urllib.request.quote(k) if v["encode"] else k, "oppStatuses": "forecasted|posted",
            "rows": cfg["rows"], "startRecordNum": 0}
    if v["elig"]:
        body["eligibilities"] = v["elig"]
    if v["sort"]:
        body["sortBy"] = "closeDate|asc"
    return body


def gg_first_working(cfg, kw):
    """Try request shapes in order; return (data, variant) for the first with hits, else the last response."""
    last = ({}, GG_VARIANTS[0])
    for v in GG_VARIANTS:
        data = http_json(cfg["search"], gg_body(cfg, kw, v))
        d = data.get("data") if isinstance(data.get("data"), dict) else {}
        n = d.get("hitCount") or 0
        print("grantsgov probe %-22s hitCount=%s" % (v["name"], n))
        last = (data, v)
        if n:
            return data, v
    return last


def cmd_probe(a):
    cfg = SOURCES["grantsgov"]
    for kw in (a.keyword, "security", "animal"):
        print("keyword: %r" % kw)
        for v in GG_VARIANTS:
            try:
                data = http_json(cfg["search"], gg_body(cfg, kw, v))
                d = data.get("data") if isinstance(data.get("data"), dict) else {}
                print("  %-22s hitCount=%-6s errorcode=%s" % (v["name"], d.get("hitCount"), data.get("errorcode")))
            except Exception as e:  # noqa: BLE001 — a probe reports, never dies
                print("  %-22s ERROR %s" % (v["name"], str(e)[:80]))


AGENCY_SKIP = ["national institutes of health", "national science foundation", "nasa", "department of defense", "naval", "army", "air force",
               "bureau of reclamation", "department of energy", "geological survey", "national oceanic", "nuclear", "darpa", "federal aviation",
               "bureau of land management", "forest service", "fish and wildlife service", "patent", "census", "highway", "transit", "railroad"]
DETAIL_CACHE = os.path.join(HERE, "debug", "gg_details.json")


def gg_detail(cfg, opp_id, cache):
    """fetchOpportunity: synopsis text, award floor/ceiling, applicant types. Cached per id (one call per new hit, ever)."""
    if opp_id in cache:
        return cache[opp_id]
    try:
        data = http_json(cfg["detail"], {"opportunityId": int(opp_id) if str(opp_id).isdigit() else opp_id})
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        cache[opp_id] = {"error": str(e)[:80]}
        return cache[opp_id]
    d = data.get("data") if isinstance(data.get("data"), dict) else data
    syn = d.get("synopsis") or d.get("forecast") or {}
    if not isinstance(syn, dict):
        syn = {}
    types = syn.get("applicantTypes") or d.get("applicantTypes") or []
    out = {
        "summary": re.sub(r"<[^>]+>", " ", str(syn.get("synopsisDesc") or syn.get("forecastDesc") or ""))[:600],
        "amount_min": money_range(syn.get("awardFloor"))[1], "amount_max": money_range(syn.get("awardCeiling"))[1],
        "eligibility": "; ".join(str(t.get("description", t)) if isinstance(t, dict) else str(t) for t in types)[:300] or "nonprofits",
        "categories": "; ".join(str(c.get("description", c)) if isinstance(c, dict) else str(c) for c in (syn.get("fundingActivityCategories") or []))[:200],
    }
    cache[opp_id] = out
    return out


def pull_grantsgov(cfg, fixtures=None, debug=False, detail=True):
    """Grants.gov Search2: one query per keyword, nonprofits eligible (12 = with 501c3, 13 = without)."""
    out = []
    if fixtures:
        data = json.load(open(os.path.join(fixtures, "grantsgov.json"), encoding="utf-8"))
        batches = [data]
    else:
        batches = []
        variant = None   # the first request shape that returns hits is reused for every keyword
        for i, kw in enumerate(cfg["keywords"]):
            try:
                if variant is None:
                    data, variant = gg_first_working(cfg, kw)
                else:
                    data = http_json(cfg["search"], gg_body(cfg, kw, variant))
                batches.append(data)
                if debug and i == 0:
                    os.makedirs(os.path.join(HERE, "debug"), exist_ok=True)
                    with open(os.path.join(HERE, "debug", "grantsgov_first.json"), "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=1)
            except urllib.error.HTTPError as e:
                print("grantsgov: %s -> HTTP %s %s" % (kw, e.code, e.read()[:200].decode("utf-8", "replace")), file=sys.stderr)
            except (urllib.error.URLError, ValueError, TimeoutError) as e:
                print("grantsgov: %s -> %s" % (kw, e), file=sys.stderr)
    skipped_agency = 0
    cache = {}
    if detail and not fixtures and os.path.exists(DETAIL_CACHE):
        try:
            cache = json.load(open(DETAIL_CACHE, encoding="utf-8"))
        except ValueError:
            cache = {}
    for data in batches:
        hits = find_hits(data)
        if not fixtures:
            d = data.get("data") if isinstance(data.get("data"), dict) else {}
            print("grantsgov: errorcode=%s hitCount=%s parsed=%d msg=%s" % (data.get("errorcode"), d.get("hitCount"), len(hits), str(data.get("msg", ""))[:60]))
        for h in hits:
            num = h.get("number") or h.get("id")
            agency = (h.get("agency") or h.get("agencyCode") or "").lower()
            if any(a in agency for a in AGENCY_SKIP):
                skipped_agency += 1
                continue
            out.append({
                "opp_id": "gg-" + str(num), "source": "grants.gov", "funder": h.get("agency") or h.get("agencyCode") or "federal",
                "program": h.get("title", ""), "url": "https://www.grants.gov/search-results-detail/%s" % h.get("id", ""),
                "type": "federal", "amount_min": money_range(h.get("awardFloor"))[1], "amount_max": money_range(h.get("awardCeiling"))[1],
                "deadline": to_iso(h.get("closeDate")), "open_date": to_iso(h.get("openDate")), "status": (h.get("oppStatus") or "").lower(),
                "eligibility": "nonprofits" if h.get("eligibilities") in (None, "") else str(h.get("eligibilities")),
                "categories": ";".join(c.get("cfdaNumber", "") if isinstance(c, dict) else str(c) for c in (h.get("cfdaList") or [])),
                "geography": "US", "summary": (h.get("synopsis") or h.get("description") or "")[:300],
            })
    if detail and not fixtures:
        fetched = 0
        for r in out:
            oid_ = r["url"].rsplit("/", 1)[-1]
            if not oid_:
                continue
            was_cached = oid_ in cache
            det = gg_detail(cfg, oid_, cache)
            fetched += 0 if was_cached else 1
            if "error" not in det:
                for k in ("summary", "amount_min", "amount_max", "eligibility", "categories"):
                    if det.get(k) not in ("", None):
                        r[k] = det[k]
        os.makedirs(os.path.dirname(DETAIL_CACHE), exist_ok=True)
        with open(DETAIL_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f)
        print("grantsgov: %d hits kept, %d skipped by agency, %d details fetched (%d cached)" % (len(out), skipped_agency, fetched, len(cache) - fetched))
    return out


def pull_cagrants(cfg, fixtures=None, include_closed=False):
    """California Grants Portal via the data.ca.gov CKAN datastore."""
    out = []
    if fixtures:
        batches = [json.load(open(os.path.join(fixtures, "cagrants.json"), encoding="utf-8"))]
    else:
        batches = []
        for term in cfg["terms"]:
            url = "%s?resource_id=%s&q=%s&limit=%d" % (cfg["datastore"], cfg["resource_id"], urllib.request.quote(term), cfg["limit"])
            if not include_closed:
                url += "&filters=" + urllib.request.quote(json.dumps({"Status": "active"}))
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
        body = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", text)
        words = [w for w in re.findall(r"[A-Za-z][A-Za-z\-]{3,}", re.sub(r"<[^>]+>", " ", body))]
        h = hashlib.sha1(" ".join(words).lower().encode("utf-8")).hexdigest()[:12]   # digits/nonces/timestamps ignored
        prev = r.get("page_hash", "")
        if prev and prev != h:
            changed += 1
            out.append({"opp_id": "fp-" + oid(r["funder"]), "source": "funder-page", "funder": r["funder"], "program": "apply page changed — review",
                        "url": url, "type": r.get("type", "foundation"), "amount_min": r.get("p25_usd", ""), "amount_max": r.get("p75_usd", ""),
                        "deadline": "", "open_date": date.today().isoformat(), "status": "review", "eligibility": "", "categories": r.get("lane", ""),
                        "geography": "LA", "summary": "Page content changed since %s" % (r.get("last_checked") or "last run")})
        r["page_hash"], r["last_checked"] = h, date.today().isoformat()
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    RUN_STATS.update(funder_pages=len(rows), funder_changed=changed)
    print("funders: %d pages checked, %d changed" % (len(rows), changed))
    return out


RUN_STATS = {}   # filled by pull/score for the run record; resets with the process (one run = one process)


def cmd_pull(a):
    existing = read_opps()
    srcs = a.sources.split(",")
    new = []
    if "grantsgov" in srcs:
        new += pull_grantsgov(SOURCES["grantsgov"], a.fixtures, getattr(a, "debug", False), not getattr(a, "no_detail", False))
    if "cagrants" in srcs:
        new += pull_cagrants(SOURCES["cagrants"], a.fixtures, getattr(a, "include_closed", False))
    if "funders" in srcs:
        new += pull_funders(a.fixtures)
    today = date.today().isoformat()
    added = updated = 0
    seen = {r["opp_id"] for r in new}
    pulled_sources = {r["source"] for r in new}
    stale = 0
    for r in existing.values():
        if r.get("source") in pulled_sources and r["opp_id"] not in seen and r.get("status") != "stale":
            r["status"] = "stale"   # kept for history and decisions; score_row zeroes it
            stale += 1
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
    RUN_STATS.update(fetched=len(new), new=added, updated=updated, stale=stale, total=len(existing))
    print("pull: %d fetched -> %d new, %d updated, %d marked stale, %d total -> %s" % (len(new), added, updated, stale, len(existing), os.path.basename(OPPS)))
    return existing


# ----------------------------------------------------------------------------- scoring

def score_row(r, org, today=None):
    """0-100 with reasons. Hard eligibility failures return 0."""
    today = today or date.today()
    text = " ".join(str(r.get(k, "")) for k in ("program", "summary", "categories", "eligibility", "funder")).lower()
    reasons, s = [], 0
    if r.get("source") == "funder-page":
        return 55, "funder apply page changed — open the link and review (not scored as an opportunity)"
    if any(w in text for w in EXCLUDE_WORDS):
        return 0, "excluded: eligibility text"
    if r.get("status") in ("closed", "archived", "expired"):
        return 0, "closed"
    if r.get("status") == "stale":
        return 0, "stale: no longer returned by its source"
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
    off = [w for w in OFF_TOPIC if re.search(r"\b" + re.escape(w) + r"\b", text)]   # 'port' must not match 'support'
    if off and not core:
        return min(25, fs + 15), "off-topic (%s); fields %d/40" % (off[0], fs)
    if off:   # a core hit next to an off-topic word (a 'youth reentry' programme) is a weaker match, not a disqualified one
        fs = max(0, fs - 15)
        reasons.append("off-topic word (%s) -15" % off[0])
    hard = [w for w in HARD_OFF if w in text]
    if len(hard) >= 2 or (hard and not core):   # one medical word in a mental-health synopsis is normal; two is a hospital
        return min(30, fs), "shape: medical/research deliverable (%s); fields %d/40" % (", ".join(hard[:3]), fs)
    cap = 100 if core else 40   # generic-only ('education', 'community') never reaches the review threshold
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
        elif not amin and top > hi * 5:
            am = 4; reasons.append("ceiling %sx our max ask, floor unknown 4/20" % (top // hi))
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
    return min(cap, s), "; ".join(reasons)


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
    RUN_STATS.update(score70=hi, score50=sum(1 for r in rows.values() if int(r["score"] or 0) >= 50), zero=sum(1 for r in rows.values() if int(r["score"] or 0) == 0))
    print("score: %d opportunities, %d at 70+, %d zero" % (len(rows), hi, RUN_STATS["zero"]))
    return rows


# ----------------------------------------------------------------------------- digest

def render_digest(rows, top=10, today=None):
    today = today or date.today()
    live = [r for r in rows.values() if int(r.get("score") or 0) > 0 and r.get("decision") not in ("rejected", "submitted", "won", "lost")
            and r.get("source") != "funder-page"]
    pages = [r for r in rows.values() if r.get("source") == "funder-page" and r.get("last_checked") == today.isoformat()]
    live.sort(key=lambda r: (-int(r["score"]), r.get("deadline") or "9999"))
    new = [r for r in live if r.get("first_seen") == today.isoformat() or r.get("decision", "") == ""]
    soon = sorted([r for r in live if int(r["score"]) >= 50 and r.get("deadline") and 0 <= (date.fromisoformat(r["deadline"]) - today).days <= 45], key=lambda r: r["deadline"])
    L = ["*מענקים — שבוע %s*" % today.strftime("%d.%m"), ""]
    L.append("*החלטות (%d חדשות מעל 70):*" % sum(1 for r in new if int(r["score"]) >= 70))
    for r in [x for x in new if int(x["score"]) >= 70][:top]:
        L.append("• %s — %s · %s · %s · ציון %s\n   %s" % (r["funder"][:40], r["program"][:60], amt(r),
                 ("מועד " + r["deadline"]) if r.get("deadline") else "ללא מועד (רץ)", r["score"], r["url"]))
    L += ["", "*מועדים ב-45 יום:*"]
    for r in soon[:5]:
        L.append("• %s · %s · %s" % (r["deadline"], r["funder"][:30], r["program"][:50]))
    if not soon:
        L.append("• אין")
    if pages:
        L += ["", "*עמודי קרנות שהשתנו (לפתוח ולבדוק):*"] + ["• %s · %s" % (p["funder"][:40], p["url"]) for p in pages[:20]]
    pipeline = sum(min(int(r["amount_max"] or r["amount_min"] or 0), org_cap()) for r in live if int(r["score"]) >= 70)
    L += ["", "*בצינור:* %d הזדמנויות מעל 70 · סכום בקשה משוער ~$%s (כל הזדמנות נספרת עד תקרת הבקשה שלנו, $%s)"
          % (sum(1 for r in live if int(r["score"]) >= 70), format(pipeline, ","), format(org_cap(), ",")),
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

RUNS = os.path.join(HERE, "runs.csv")
RUN_FIELDS = ["run_at", "runner", "status", "duration_s", "fetched", "new", "updated", "stale", "total", "score70", "score50", "zero",
              "funder_pages", "funder_changed", "error"]


def cmd_run(a):
    """pull + score + digest as one run, recorded as one row in runs.csv — a run that died still leaves a row
    (status=failed), and a week with no row is the failure the weekly reviewer is there to notice."""
    t0 = datetime.now()
    row = {k: "" for k in RUN_FIELDS}
    row.update(run_at=t0.strftime("%Y-%m-%dT%H:%M"), runner=a.runner, status="failed")
    try:
        cmd_pull(a)
        cmd_score(a)
        cmd_digest(a)
        row["status"] = "ok"
    except Exception as e:  # noqa: BLE001 — recorded, then re-raised: the row is the point
        row["error"] = str(e)[:200].replace("\n", " ")
        raise
    finally:
        row.update({k: v for k, v in RUN_STATS.items() if k in RUN_FIELDS})
        row["duration_s"] = int((datetime.now() - t0).total_seconds())
        new_file = not os.path.exists(RUNS)
        with open(RUNS, "a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=RUN_FIELDS)
            if new_file:
                w.writeheader()
            w.writerow(row)
        print("run: %s in %ss -> %s" % (row["status"], row["duration_s"], os.path.basename(RUNS)))


def cmd_demo(_a):
    global OPPS, RUNS
    tmp = tempfile.mkdtemp(prefix="grants-demo-")
    OPPS = os.path.join(tmp, "opportunities.csv")
    RUNS = os.path.join(tmp, "runs.csv")
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
    assert int(huge["score"]) < 50 and ("too large" in huge["score_reasons"] or "off-topic" in huge["score_reasons"]), huge["score_reasons"]
    animal = next(r for r in rows.values() if "Animal" in r["program"])
    assert int(animal["score"]) >= 60 and "animal_welfare" in animal["score_reasons"], animal["score_reasons"]
    levee = next(r for r in rows.values() if "Levee" in r["program"])
    assert int(levee["score"]) <= 25 and "off-topic" in levee["score_reasons"], (levee["score"], levee["score_reasons"])
    tc = dict(nsgp, program="Military and Civilian Partnership for Trauma Readiness", amount_min="", amount_max="4000000",
              summary="grants to high-acuity trauma centers to enable military trauma teams to provide trauma care and acute care")
    sc, why = score_row(tc, org, today)
    assert sc <= 30 and "shape: medical" in why, (sc, why)                      # live run 4: this scored 73
    assert score_row(dict(nsgp, status="stale"), org, today)[0] == 0              # a row its source stopped returning
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
    # the run command leaves exactly one row, with the counts the weekly reviewer reads
    cmd_run(argparse.Namespace(sources="grantsgov,cagrants", fixtures=fx, debug=False, include_closed=False, no_detail=True,
                               org=os.path.join(HERE, "org.json"), top=10, output=os.path.join(tmp, "digest.md"), runner="demo"))
    runs = list(csv.DictReader(open(RUNS, newline="", encoding="utf-8")))
    assert len(runs) == 1 and runs[0]["status"] == "ok" and runs[0]["total"] == "9" and runs[0]["runner"] == "demo", runs
    print("demo OK: 9 fixture opportunities pulled · NSGP scored %s · closed/past = 0 · oversized penalised · upsert kept decision · digest renders" % nsgp["score"])
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("pull"); s.add_argument("--sources", default="grantsgov,cagrants,funders"); s.add_argument("--fixtures")
    s.add_argument("--debug", action="store_true", help="dump the first Grants.gov response to debug/"); s.add_argument("--include-closed", action="store_true")
    s.add_argument("--no-detail", action="store_true", help="skip Grants.gov fetchOpportunity detail calls")
    s.set_defaults(fn=cmd_pull)
    c = sub.add_parser("score"); c.add_argument("--org", default=os.path.join(HERE, "org.json")); c.set_defaults(fn=cmd_score)
    r = sub.add_parser("run", help="pull + score + digest, one row in runs.csv")
    r.add_argument("--sources", default="grantsgov,cagrants,funders"); r.add_argument("--fixtures"); r.add_argument("--debug", action="store_true")
    r.add_argument("--include-closed", action="store_true"); r.add_argument("--no-detail", action="store_true")
    r.add_argument("--org", default=os.path.join(HERE, "org.json")); r.add_argument("--top", type=int, default=10)
    r.add_argument("-o", "--output", default=os.path.join(HERE, "digest.md")); r.add_argument("--runner", default=os.environ.get("GRANTS_RUNNER", "manual"))
    r.set_defaults(fn=cmd_run)
    d = sub.add_parser("digest"); d.add_argument("--top", type=int, default=10); d.add_argument("-o", "--output", default=os.path.join(HERE, "digest.md")); d.set_defaults(fn=cmd_digest)
    pr = sub.add_parser("probe", help="try Grants.gov request shapes and print hit counts"); pr.add_argument("--keyword", default="nonprofit security"); pr.set_defaults(fn=cmd_probe)
    e = sub.add_parser("demo"); e.set_defaults(fn=cmd_demo)
    a = p.parse_args(argv); a.fn(a)


if __name__ == "__main__":
    main()
