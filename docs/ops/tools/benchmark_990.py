#!/usr/bin/env python3
"""
benchmark_990.py — 990 benchmark + "who funds whom", from ProPublica Nonprofit Explorer (free, no key).

Ops tool (docs/ops). Not product code. stdlib only. Run from the Mac (the cloud sandbox is egress-blocked).

USAGE
  # 1) financials for a list of EINs -> CSV (one row per filing year)
  python3 benchmark_990.py orgs 954776451 464050562 --out bench.csv
  python3 benchmark_990.py orgs --file eins.txt --out bench.csv

  # 2) discover comparables (public charities in CA, keyword) -> CSV
  python3 benchmark_990.py search "animal therapy" --state CA --pages 3 --out found.csv
  python3 benchmark_990.py search "urban farm" --state CA --ntee 4 --out found.csv      # ntee 4 = Human Services... (see NTEE_MAJOR)

  # 3) grants MADE by a funder (990 Schedule I / 990-PF Part XV) -> CSV of recipients
  #    Reads ProPublica's RENDERED filing (see the grants section below) — no manual download needed.
  #    --max N = how many filing years back (default 1, newest first), --year YYYY = one specific year.
  python3 benchmark_990.py grants 956111928 --out jcf_grants.csv
  python3 benchmark_990.py grants --xml 202343189349300000_public.xml --out grants.csv

  # 4) raw JSON for one org (to see every field the API returns)
  python3 benchmark_990.py raw 923007627

NOTES
  - formtype: 0 = Form 990, 1 = 990-EZ, 2 = 990-PF (private foundation). 990-N (e-Postcard, <$50K) has NO financial data.
  - Religious orgs may have no filings at all (Kfar Saba: expect empty).
  - Field names differ between 990 and 990-PF; unknown fields are left blank. Use `raw` to inspect.
  - Be polite: ~2 requests/second max (SLEEP).
  - `grants` does NOT use the API: it has no object_id field, and /nonprofits/download-xml is behind a
    JS bot check (403 for any script). It scrapes the org page for object_ids and parses the rendered
    filing, whose <span id> attributes carry each value's XML XPath — so rows come from the document
    structure, not column positions. Verified against JCF FY2024: 1063 rows = the count the filing
    itself declares on Schedule I Part II line 2. `--xml` still parses a hand-downloaded XML.
"""
import argparse, collections, csv, gzip, html as htmlmod, io, json, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

BASE = "https://projects.propublica.org/nonprofits/api/v2"
SLEEP = 0.5
UA = {"User-Agent": "benchmark_990/1.0 (nonprofit research; contact: navemarom01@gmail.com)"}

NTEE_MAJOR = {1: "Arts/Culture", 2: "Education", 3: "Environment/Animals", 4: "Health", 5: "Human Services",
              6: "International", 7: "Public/Societal Benefit", 8: "Religion", 9: "Mutual/Membership", 10: "Unknown"}

# 990 (public charity) fields we care about, in output order. (ProPublica names.)
FIN_FIELDS = [
    ("tax_prd_yr", "year"), ("formtype", "form"), ("totrevenue", "total_revenue"),
    ("totfuncexpns", "total_expenses"), ("totcntrbgfts", "contributions"), ("totprgmrevnue", "program_revenue"),
    ("invstmntinc", "investment_income"), ("totassetsend", "total_assets"), ("totliabend", "total_liabilities"),
    ("pdf_url", "pdf"),
]
# 990-PF equivalents (best effort; verify with `raw`)
PF_FALLBACK = {"totrevenue": ["totrcptperbks", "totrevenue"], "totfuncexpns": ["totexpnspbks", "totfuncexpns"],
               "totcntrbgfts": ["contrrcvd", "totcntrbgfts"], "totassetsend": ["totassetsend", "fairmrktvalamt"]}
FORM = {0: "990", 1: "990-EZ", 2: "990-PF"}


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_bytes(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        enc = (r.headers.get("Content-Encoding") or "").lower()
    if enc == "gzip" or data[:2] == b"\x1f\x8b":          # S3 stores the rendered filings gzipped
        data = gzip.GzipFile(fileobj=io.BytesIO(data)).read()
    return data


def get_text(url):
    return get_bytes(url).decode("utf-8", "replace")


def norm_ein(raw):
    """EIN as 9 digits. Tolerates inline '# comment', dashes, spaces. '' if no EIN found."""
    head = str(raw).split("#", 1)[0]
    digits = re.sub(r"\D", "", head)
    return digits


def fetch_org(ein):
    ein = norm_ein(ein)
    if not ein:
        raise ValueError("no EIN digits found")
    return get_json(f"{BASE}/organizations/{ein}.json")


def pick(f, key):
    if key in f and f[key] not in (None, ""):
        return f[key]
    for alt in PF_FALLBACK.get(key, []):
        if alt in f and f[alt] not in (None, ""):
            return f[alt]
    return ""


def cmd_orgs(args):
    eins = [norm_ein(e) for e in (args.eins or []) if norm_ein(e)]
    if args.file:
        for l in open(args.file):
            e = norm_ein(l)
            if e: eins.append(e)
    rows = []
    for ein in eins:
        try:
            d = fetch_org(ein)
        except Exception as e:
            print(f"!! {ein}: {e}", file=sys.stderr)
            rows.append({"ein": ein, "name": "", "error": str(e)})
            continue
        o = d.get("organization", {})
        base = {"ein": o.get("ein", ein), "name": o.get("name", ""), "city": o.get("city", ""), "state": o.get("state", ""),
                "ntee": o.get("ntee_code", ""), "subsection": o.get("subsection_code", ""), "ruling": o.get("ruling_date", ""),
                "error": ""}
        filings = d.get("filings_with_data", []) or []
        if not filings:
            r = dict(base); r["year"] = ""; r["form"] = "NO FINANCIAL DATA (990-N / none)"
            wo = d.get("filings_without_data", []) or []
            r["pdf"] = "; ".join(str(x.get("tax_prd_yr", "")) for x in wo[:5])
            rows.append(r); time.sleep(SLEEP); continue
        for f in sorted(filings, key=lambda x: x.get("tax_prd_yr", 0), reverse=True):
            r = dict(base)
            for src, dst in FIN_FIELDS:
                v = pick(f, src)
                r[dst] = FORM.get(v, v) if src == "formtype" else v
            rows.append(r)
        print(f"ok {base['name']} ({ein}): {len(filings)} filings", file=sys.stderr)
        time.sleep(SLEEP)
    cols = ["ein", "name", "city", "state", "ntee", "subsection", "ruling", "year", "form", "total_revenue", "total_expenses",
            "contributions", "program_revenue", "investment_income", "total_assets", "total_liabilities", "pdf", "error"]
    write_csv(rows, cols, args.out)


def cmd_search(args):
    rows = []
    for page in range(args.pages):
        q = {"q": args.query, "page": page}
        if args.state: q["state[id]"] = args.state
        if args.ntee: q["ntee[id]"] = args.ntee
        if args.c_code: q["c_code[id]"] = args.c_code
        url = f"{BASE}/search.json?" + urllib.parse.urlencode(q)
        d = get_json(url)
        orgs = d.get("organizations", []) or []
        for o in orgs:
            rows.append({"ein": o.get("ein"), "name": o.get("name"), "city": o.get("city"), "state": o.get("state"),
                         "ntee": o.get("ntee_code"), "subsection": o.get("subseccd"), "income_amount": o.get("income_amount"),
                         "revenue_amount": o.get("revenue_amount"), "asset_amount": o.get("asset_amount")})
        print(f"page {page}: {len(orgs)} (total {d.get('total_results')}, pages {d.get('num_pages')})", file=sys.stderr)
        if page + 1 >= (d.get("num_pages") or 1): break
        time.sleep(SLEEP)
    write_csv(rows, ["ein", "name", "city", "state", "ntee", "subsection", "income_amount", "revenue_amount", "asset_amount"], args.out)


def local(tag):
    return tag.split("}", 1)[-1]


def text_of(el, *names):
    """First descendant whose local-name is in names -> text."""
    for sub in el.iter():
        if local(sub.tag) in names and (sub.text or "").strip():
            return sub.text.strip()
    return ""


def parse_grants_xml(data, source=""):
    """Schedule I (990) RecipientTable + 990-PF Part XV GrantOrContributionPdDurYrGrp."""
    root = ET.fromstring(data)
    filer = text_of(root, "BusinessNameLine1Txt") or ""
    year = text_of(root, "TaxYr", "TaxYear")
    out = []
    for el in root.iter():
        n = local(el.tag)
        if n in ("RecipientTable", "GrantOrContributionPdDurYrGrp", "GrantsToOrganizationsGrp"):
            out.append({
                "funder": filer, "tax_year": year, "schedule": "990-SchI" if n == "RecipientTable" else "990-PF-XV",
                "recipient": text_of(el, "BusinessNameLine1Txt", "RecipientPersonNm"),
                "recipient_ein": text_of(el, "RecipientEIN", "EIN"),
                "city": text_of(el, "CityNm"), "state": text_of(el, "StateAbbreviationCd"),
                "amount": text_of(el, "CashGrantAmt", "Amt", "TotalGrantAmt"),
                "purpose": text_of(el, "PurposeOfGrantTxt", "GrantOrContributionPurposeTxt"),
                "source": source,
            })
    return out


# --- grants via ProPublica's RENDERED filings -------------------------------------------------
# The API exposes no object_id, and /nonprofits/download-xml sits behind a JS bot check (403 for any
# script, browser headers included). The rendered filing does work, and it is not a downgrade: the IRS
# stylesheet stamps every value's XML XPath into a <span id>, so rows are rebuilt from the document
# STRUCTURE (field names, not column positions) — the same field names parse_grants_xml() uses.
ORG_PAGE = "https://projects.propublica.org/nonprofits/organizations"
GRANT_FORMS = ("IRS990ScheduleI", "IRS990PF")     # 990 Schedule I; 990-PF Part XV
GRANT_GROUPS = ("RecipientTable", "GrantOrContributionPdDurYrGrp", "GrantsToOrganizationsGrp")
SPAN_RE = re.compile(r'<span[^>]*\bid="([^"]+)"[^>]*>(.*?)</span>', re.S)


def _clean(frag):
    return re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"(?s)<[^>]+>", "", frag))).strip()


def _first(d, *names):
    for n in names:
        if d.get(n):
            return d[n]
    return ""


def _num(v):
    v = str(v).replace(",", "").replace("$", "").strip()
    return v if re.fullmatch(r"-?\d+(\.\d+)?", v) else v


def org_filings(ein):
    """[{year, object_id}] newest first, scraped from the org page (the API has no object_id)."""
    page = get_text(f"{ORG_PAGE}/{norm_ein(ein)}")
    out, starts = [], [m.start() for m in re.finditer(r'class="single-filing-period', page)]
    for a, b in zip(starts, starts[1:] + [len(page)]):
        blk = page[a:b]
        yr = re.search(r"id='filing(\d{4})'", blk)
        for oid in dict.fromkeys(re.findall(r"object_id=(\d+)", blk)):
            out.append({"year": yr.group(1) if yr else "", "object_id": oid})
    return out


def filing_forms(ein, object_id):
    """Rendered-form URLs this filing actually has, read off its own 'full filing' page.

    Read rather than guessed: a 990-T carries no Schedule I, and the page lists every rendered part —
    so a schedule split across several files is fetched whole instead of truncated at the first.
    """
    page = get_text(f"{ORG_PAGE}/{norm_ein(ein)}/{object_id}/full")
    urls = re.findall(r'src=[\'"](https://[^\'"]*?/full_text/%s/(\w+))[\'"]' % object_id, page)
    return [u for u, form in dict.fromkeys(urls) if form in GRANT_FORMS]


def parse_grants_html(page, source="", funder="", year=""):
    """Rebuild grant rows from a rendered filing via the XPath in each value's <span id>."""
    groups = collections.defaultdict(dict)
    for xp, frag in SPAN_RE.findall(page):
        val = _clean(frag)
        if not val:
            continue
        g = re.search(r"/(%s)\[(\d+)\]/(.*)$" % "|".join(GRANT_GROUPS), xp)
        if not g:
            continue
        leaf = re.sub(r"\[\d+\]$", "", g.group(3).split("/")[-1])
        groups[(g.group(1), int(g.group(2)))].setdefault(leaf, val)
    rows = []
    for (grp, _i), f in sorted(groups.items(), key=lambda kv: kv[0][1]):
        rows.append({
            "funder": funder, "tax_year": year,
            "schedule": "990-SchI" if grp == "RecipientTable" else "990-PF-XV",
            "recipient": _first(f, "BusinessNameLine1Txt", "RecipientPersonNm"),
            "recipient_ein": _first(f, "RecipientEIN", "EIN"),
            "city": f.get("CityNm", ""), "state": f.get("StateAbbreviationCd", ""),
            "amount": _num(_first(f, "CashGrantAmt", "Amt", "TotalGrantAmt")),
            "purpose": _first(f, "PurposeOfGrantTxt", "GrantOrContributionPurposeTxt"),
            "source": source,
        })
    return rows


def cmd_grants(args):
    rows = []
    if args.xml:
        for path in args.xml:
            rows += parse_grants_xml(open(path, "rb").read(), source=path)
    else:
        funder = ""
        try:
            funder = fetch_org(args.ein).get("organization", {}).get("name", "")
        except Exception as e:
            print(f"-- could not read org name: {e}", file=sys.stderr)
        filings = org_filings(args.ein)
        if args.year:
            filings = [f for f in filings if f["year"] == str(args.year)]
        if not filings:
            print("No filings found on the org page.", file=sys.stderr)
        years_done = 0
        for f in filings:
            if years_done >= args.max:
                break
            try:
                urls = filing_forms(args.ein, f["object_id"])
            except Exception as e:
                print(f"!! {f['year']} {f['object_id']}: {e}", file=sys.stderr)
                continue
            if not urls:
                # normal: a 990-T filing in the same year carries no grant schedule
                time.sleep(SLEEP)
                continue
            before = len(rows)
            for url in urls:
                try:
                    rows += parse_grants_html(get_text(url), source=url, funder=funder, year=f["year"])
                except Exception as e:
                    print(f"!! {f['year']} {url}: {e}", file=sys.stderr)
                time.sleep(SLEEP)
            got = len(rows) - before
            print(f"ok {f['year']} ({f['object_id']}): {got} grant rows", file=sys.stderr)
            if got:
                years_done += 1
            time.sleep(SLEEP)
        if not rows:
            print("No grants extracted. Fallback: download the filing XML by hand and use --xml.", file=sys.stderr)

    def amt(r):
        try:
            return (0, -float(r["amount"]))
        except (TypeError, ValueError):
            return (1, 0)          # rows with no amount sort last, not in the middle
    rows.sort(key=amt)
    write_csv(rows, ["funder", "tax_year", "schedule", "recipient", "recipient_ein", "city", "state", "amount", "purpose", "source"], args.out)


def cmd_raw(args):
    print(json.dumps(fetch_org(args.ein), indent=2, ensure_ascii=False))


def write_csv(rows, cols, out):
    fh = open(out, "w", newline="", encoding="utf-8") if out else sys.stdout
    w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows: w.writerow({c: r.get(c, "") for c in cols})
    if out:
        fh.close(); print(f"wrote {len(rows)} rows -> {out}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    a = sp.add_parser("orgs"); a.add_argument("eins", nargs="*"); a.add_argument("--file"); a.add_argument("--out"); a.set_defaults(fn=cmd_orgs)
    s = sp.add_parser("search"); s.add_argument("query"); s.add_argument("--state"); s.add_argument("--ntee", type=int, help="1-10, see NTEE_MAJOR")
    s.add_argument("--c_code", type=int, default=3, help="501(c) code, default 3"); s.add_argument("--pages", type=int, default=2); s.add_argument("--out"); s.set_defaults(fn=cmd_search)
    g = sp.add_parser("grants"); g.add_argument("ein", nargs="?"); g.add_argument("--xml", nargs="*"); g.add_argument("--year"); g.add_argument("--max", type=int, default=1); g.add_argument("--out"); g.set_defaults(fn=cmd_grants)
    r = sp.add_parser("raw"); r.add_argument("ein"); r.set_defaults(fn=cmd_raw)
    args = ap.parse_args()
    if args.cmd == "grants" and not args.ein and not args.xml:
        ap.error("grants: give an EIN or --xml file(s)")
    args.fn(args)


if __name__ == "__main__":
    main()
