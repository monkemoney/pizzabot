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
  #    a) from a filing XML you downloaded (ProPublica org page -> filing -> "XML"), or
  #    b) best-effort auto-download by object_id when the API exposes it
  python3 benchmark_990.py grants 956111928 --out jcf_grants.csv
  python3 benchmark_990.py grants --xml 202343189349300000_public.xml --out grants.csv

  # 4) raw JSON for one org (to see every field the API returns)
  python3 benchmark_990.py raw 923007627

NOTES
  - formtype: 0 = Form 990, 1 = 990-EZ, 2 = 990-PF (private foundation). 990-N (e-Postcard, <$50K) has NO financial data.
  - Religious orgs may have no filings at all (Kfar Saba: expect empty).
  - Field names differ between 990 and 990-PF; unknown fields are left blank. Use `raw` to inspect.
  - Be polite: ~2 requests/second max (SLEEP).
"""
import argparse, csv, json, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

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
        return r.read()


def fetch_org(ein):
    ein = str(ein).replace("-", "").strip()
    return get_json(f"{BASE}/organizations/{ein}.json")


def pick(f, key):
    if key in f and f[key] not in (None, ""):
        return f[key]
    for alt in PF_FALLBACK.get(key, []):
        if alt in f and f[alt] not in (None, ""):
            return f[alt]
    return ""


def cmd_orgs(args):
    eins = list(args.eins or [])
    if args.file:
        eins += [l.strip() for l in open(args.file) if l.strip() and not l.startswith("#")]
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


def cmd_grants(args):
    rows = []
    if args.xml:
        for p in args.xml:
            rows += parse_grants_xml(open(p, "rb").read(), source=p)
    else:
        d = fetch_org(args.ein)
        filings = sorted(d.get("filings_with_data", []) or [], key=lambda x: x.get("tax_prd_yr", 0), reverse=True)
        if args.year: filings = [f for f in filings if str(f.get("tax_prd_yr")) == str(args.year)]
        got = False
        for f in filings[: args.max]:
            oid = f.get("object_id") or f.get("objectid")
            if not oid:
                print(f"-- {f.get('tax_prd_yr')}: no object_id in API; open the filing on ProPublica and download the XML, then run with --xml", file=sys.stderr)
                continue
            url = f"https://projects.propublica.org/nonprofits/download-xml?object_id={oid}"
            try:
                rows += parse_grants_xml(get_bytes(url), source=url); got = True
                print(f"ok {f.get('tax_prd_yr')}: {len(rows)} grant rows so far", file=sys.stderr)
            except Exception as e:
                print(f"!! {f.get('tax_prd_yr')}: {e}", file=sys.stderr)
            time.sleep(SLEEP)
        if not got and not rows:
            print("No grants extracted. Fallback: download the filing XML manually and use --xml.", file=sys.stderr)
    # sort by amount desc where numeric
    def amt(r):
        try: return -float(r["amount"])
        except: return 0
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
