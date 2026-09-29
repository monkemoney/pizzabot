#!/usr/bin/env python3
"""seed_funders.py — build funders.csv (layer-2 monitoring list) from the benchmark research.

Reads docs/ops/research/*_grants.csv (990 Schedule I / 990-PF Part XV extractions) and the peer
list, writes funders.csv: one row per funder with grant count, median/quartiles, how many grants
went to our peers, plus a hand-maintained block of government programs. Re-run whenever the
research folder grows; hand edits go in funders_manual.csv (merged, never overwritten).
"""
import csv, os, re, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.join(HERE, "..", "..", "research")

FUNDERS = {  # research file -> (display name, EIN, type, apply url, cycle, lane for the farm)
    "jcf_grants.csv": ("Jewish Community Foundation of Los Angeles", "95-6111928", "DAF/community foundation", "https://www.jewishfoundationla.org/", "rolling (donor-advised); Cutting Edge grants annual", "donors at the table who hold funds here"),
    "federation_la_grants.csv": ("Jewish Federation of Greater Los Angeles", "95-1643388", "federation", "https://www.jewishla.org/", "annual allocations + emergency", "healing program; special-needs partnership"),
    "annenberg_grants.csv": ("Annenberg Foundation", "23-7017870", "private foundation", "https://annenberg.org/grantmaking/", "LOI year-round", "rescue program; LA animal funder"),
    "ahmanson_grants.csv": ("Ahmanson Foundation", "95-6089998", "private foundation", "https://theahmansonfoundation.org/", "LOI year-round; capital", "capital: shade, therapy space, vehicle"),
    "petco_love_grants.csv": ("Petco Love", "27-1164370", "corporate foundation", "https://petcolove.org/grants/", "invest grants annual + product", "rescue: cash plus veterinary supplies"),
    "parsons_grants.csv": ("Ralph M. Parsons Foundation", "95-6091545", "private foundation", "https://rmpf.org/", "quarterly", "healing, year 2"),
    "weingart_grants.csv": ("Weingart Foundation", "95-6054814", "private foundation", "https://weingartfnd.org/", "by invitation", "weak fit"),
}
GOV = [
    ("FEMA/Cal OES Nonprofit Security Grant Program (NSGP)", "", "federal via state", "https://www.caloes.ca.gov/office-of-the-director/policy-administration/finance-administration/grants-management/homeland-security-emergency-management-programs/infrastructure-protection-grants/", "annual; CA app window ~Apr-May", "security; awarded FY2025 $190K", 190000),
    ("California State Nonprofit Security Grant Program (CSNSGP)", "", "state", "https://www.caloes.ca.gov/category/grant-announcements-category/california-state-nonprofit-security-grant-program/", "annual RFP", "security, second site/upgrades", 200000),
    ("LA County Department of Mental Health — community partnerships", "", "county", "https://dmh.lacounty.gov/", "RFS/RFP cycles", "healing program contract (Wolf Connection model)", 100000),
    ("LA County Department of Animal Care and Control — partner grants", "", "county", "https://animalcare.lacounty.gov/", "varies", "rescue partnership", 25000),
    ("City of LA Department of Cultural Affairs — community arts", "", "city", "https://culturela.org/grants/", "annual", "education/community events", 15000),
    ("LA Neighborhood Council — Neighborhood Purposes Grants (Winnetka NC)", "", "city", "https://empowerla.org/", "rolling", "small program support; local visibility", 5000),
    ("California Grants Portal (all state agencies)", "", "state aggregator", "https://www.grants.ca.gov/", "continuous", "monitor source", 0),
    ("Grants.gov (all federal)", "", "federal aggregator", "https://www.grants.gov/", "continuous", "monitor source", 0),
]
PEERS = set()
PEER_NAMES = []   # 990-PF recipients carry no EIN, so peers are also matched by name
for ln in open(os.path.join(HERE, "..", "eins_benchmark.txt"), encoding="utf-8"):
    ln = ln.strip()
    if ln and not ln.startswith("#"):
        PEERS.add(ln.split()[0])
        if "#" in ln:
            PEER_NAMES.append(re.sub(r"\(.*?\)", "", ln.split("#", 1)[1]).strip().lower())
_bench = os.path.join(RESEARCH, "bench.csv")
if os.path.exists(_bench):
    PEER_NAMES += [r["name"].lower() for r in csv.DictReader(open(_bench, encoding="utf-8")) if r.get("name")]
PEER_NAMES = sorted({n for n in PEER_NAMES if len(n) > 6})

def is_peer(g):
    if norm_ein(g.get("recipient_ein")) in PEERS:
        return True
    rec = (g.get("recipient") or "").lower()
    return any(n.split(" /")[0][:18] in rec for n in PEER_NAMES)

def norm_ein(e): return (e or "").replace("-", "").strip()

def main():
    rows = []
    for fname, (name, ein, ftype, url, cycle, lane) in FUNDERS.items():
        p = os.path.join(RESEARCH, fname)
        if not os.path.exists(p):
            continue
        grants = list(csv.DictReader(open(p, encoding="utf-8")))
        amts = sorted(float(g["amount"]) for g in grants if g.get("amount") and float(g["amount"]) > 0)
        q = statistics.quantiles(amts, n=4) if len(amts) >= 4 else [amts[0], amts[len(amts)//2], amts[-1]]
        to_peers = [g for g in grants if is_peer(g)]
        animal = [g for g in grants if any(k in (g.get("recipient", "") + " " + g.get("purpose", "")).lower() for k in ("animal", "rescue", "humane", "spca", "wildlife", "equestrian", "horse", "farm"))]
        rows.append({"funder": name, "ein": ein, "type": ftype, "apply_url": url, "cycle": cycle, "lane": lane,
                     "grants_n": len(grants), "total_usd": int(sum(amts)), "median_usd": int(statistics.median(amts)),
                     "p25_usd": int(q[0]), "p75_usd": int(q[2]), "grants_to_peers": len(to_peers),
                     "grants_animal_related": len(animal), "typical_ask_usd": int(statistics.median(amts)),
                     "source": fname, "last_checked": "", "page_hash": "", "notes": ""})
    for name, ein, ftype, url, cycle, lane, typical in GOV:
        rows.append({"funder": name, "ein": ein, "type": ftype, "apply_url": url, "cycle": cycle, "lane": lane,
                     "grants_n": "", "total_usd": "", "median_usd": "", "p25_usd": "", "p75_usd": "", "grants_to_peers": "",
                     "grants_animal_related": "", "typical_ask_usd": typical, "source": "manual", "last_checked": "", "page_hash": "", "notes": ""})
    manual = os.path.join(HERE, "funders_manual.csv")
    if os.path.exists(manual):
        rows.extend(csv.DictReader(open(manual, encoding="utf-8")))
    fields = list(rows[0].keys())
    with open(os.path.join(HERE, "funders.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
    print("funders.csv: %d funders (%d from research, %d government/manual)" % (len(rows), len(FUNDERS), len(rows) - len(FUNDERS)))
    for r in rows[:7]:
        print("  %-45s n=%5s median=%8s to_peers=%3s animal=%4s" % (r["funder"][:45], r["grants_n"], r["median_usd"], r["grants_to_peers"], r["grants_animal_related"]))

if __name__ == "__main__":
    main()
