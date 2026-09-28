#!/usr/bin/env python3
"""ledger.py — every money export of the farm into one ledger, with no names (ops tool, D13).

Runs ON TIRAN'S MAC. Input: CSV exports from the bank, the card, PayPal, Venmo,
Square, Stripe, Eventbrite, GoFundMe (2023–2025). Output:

  ledger.csv               derived, shareable  — one row per transaction, counterparty as a
                           stable id, category, direction, dedupe flags. No names, no memos.
  counterparties_local.csv LOCAL ONLY          — id -> raw name, totals, first/last date.
                           This is the Donors source; it stays on Tiran's machine.
  money_summary.csv        derived, shareable  — year × month × direction × category × source.
  questions.csv            after reconcile     — ledger rows with no receipt, receipts with no
                           ledger row: the short list for Tiran.

Pipeline
  ledger.py ingest  bank2023.csv bank2024.csv paypal.csv venmo.csv ... -o ledger.csv
  ledger.py reconcile ledger.csv receipts.csv -o ledger.csv       (receipts.csv from mail_ledger.py)
  ledger.py summary ledger.csv -o money_summary.csv
  ledger.py demo                                                  (self-test on synthetic exports)

Formats are detected from the header row: PayPal activity, Venmo statement, Square
transactions, Stripe payments, Eventbrite orders, GoFundMe donations, Bank of America,
Chase, Wells Fargo, and any generic "date / description / amount" CSV.
Sign convention: + money in, − money out. Python 3.9+, standard library only.
"""
import argparse
import csv
import hashlib
import io
import os
import re
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta

LEDGER_FIELDS = [
    "row_id", "date", "year", "month", "source", "source_file", "direction", "amount",
    "currency", "category", "cp_id", "cp_type", "kind", "external_id", "counted",
    "dup_of", "receipt_ref",
]

PLATFORMS = ("paypal", "venmo", "square", "stripe", "eventbrite", "gofundme", "zelle",
             "cash app", "givebutter", "donorbox", "facebook pay", "meta pay")

# category -> keywords matched against the description/counterparty (lowercase).
# Same table lives in mail_ledger.py; keep them identical.
CATEGORIES = [
    ("vet",        ("vet", "veterinar", "animal hospital", "animal clinic", "farrier", "equine")),
    ("feed",       ("chewy", "tractor supply", "feed", "hay", "petco", "petsmart", "grain", "alfalfa")),
    ("insurance",  ("insurance", "state farm", "farmers", "hiscox", "philadelphia ins", "liability")),
    ("web",        ("wix", "squarespace", "godaddy", "google workspace", "gsuite", "domain", "zoom",
                    "canva", "mailchimp", "namecheap")),
    ("utilities",  ("ladwp", "socalgas", "so cal gas", "spectrum", "at&t", "t-mobile", "verizon", "water")),
    ("supplies",   ("home depot", "lowe's", "lowes", "amazon", "costco", "target", "walmart", "smart & final")),
    ("fuel",       ("shell", "chevron", "arco", "76 ", "mobil", "gas station", "fuel")),
    ("fees",       ("fee", "service charge", "monthly maintenance", "chargeback")),
    ("transfer",   ("transfer", "online banking", "xfer", "cashout", "cash out", "payout", "withdrawal", "bank deposit")),
    ("government", ("irs", "franchise tax", "ftb", "secretary of state", "ladbs", "city of los angeles", "county of los angeles")),
    ("professional", ("cpa", "accounting", "attorney", "law office", "legal", "bookkeep")),
]


# ----------------------------------------------------------------------------- helpers

def money(v):
    """'$1,234.56' / '- $10.00' / '(25.00)' / '1234.56 USD' -> float (signed)."""
    if v is None:
        return None
    s = str(v).strip().replace("USD", "").replace("$", "").replace(",", "").replace(" ", "")
    if not s or s in ("-", "--"):
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1]
    if s.startswith("-"):
        neg, s = True, s[1:]
    if s.startswith("+"):
        s = s[1:]
    try:
        x = float(s)
    except ValueError:
        return None
    return -x if neg else x


DATE_FORMATS = ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%Y-%m-%dT%H:%M:%S", "%m/%d/%Y %H:%M",
                "%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%b %d, %Y", "%B %d, %Y",
                "%Y-%m-%dT%H:%M:%SZ", "%m/%d/%Y %I:%M %p", "%d-%b-%Y")


def parse_date(v):
    if not v:
        return None
    s = str(v).strip()
    # ISO with offset / fractional seconds
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s) or re.match(r"(\d{1,2}/\d{1,2}/\d{2,4})", s)
    return parse_date(m.group(1)) if m else None


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def cp_id(name, salt):
    n = norm(name)
    if not n:
        return ""
    return hashlib.sha1((salt + "|" + n).encode("utf-8")).hexdigest()[:10]


ORG_WORDS = ("llc", "inc", "corp", "foundation", "fund", "church", "temple", "school", "center",
             "centre", "association", "society", "ministries", "company", "co.", "ltd", "trust",
             "chabad", "synagogue", "federation", "hospital", "clinic", "farm", "market", "store")


def cp_type(name, direction):
    n = norm(name)
    if not n:
        return "unknown"
    if any(p in n for p in PLATFORMS):
        return "platform"
    if any(w in n.split() or w in n for w in ORG_WORDS):
        return "org"
    words = [w for w in re.split(r"[^a-z'\-]+", n) if w]
    if direction == "in" and 1 < len(words) <= 4 and not re.search(r"\d", n):
        return "person"
    return "merchant" if direction == "out" else "unknown"


def categorize(text, direction, source, kind=""):
    t = norm(text) + " " + norm(kind)
    for cat, kws in CATEGORIES:
        if any(k in t for k in kws):
            return cat
    if direction == "in":
        if "zelle" in t:
            return "zelle_in"   # donation or a paid visit — Tiran decides; the bank cannot tell
        if source in ("eventbrite", "square", "stripe") or any(k in t for k in ("ticket", "booking", "class", "tour", "visit", "workshop")):
            return "program_revenue"
        if source in ("gofundme", "paypal", "venmo", "zelle") or any(k in t for k in ("donation", "gift", "contribution", "tzedakah", "תרומה")):
            return "donation"
        return "income_other"
    return "other"


def sniff_rows(path):
    """Read a CSV that may carry preamble lines (BofA, Venmo). Returns (header, rows)."""
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        lines = f.read().splitlines()
    for i, line in enumerate(lines):
        cells = next(csv.reader([line]))
        keys = [norm(c) for c in cells]
        if len(cells) >= 3 and any(k in ("date", "posting date", "datetime", "created (utc)", "order date",
                                          "transaction date", "post date", "donation date", "created") or
                                    k.startswith("date") for k in keys):
            reader = csv.DictReader(io.StringIO("\n".join(lines[i:])))
            rows = [r for r in reader if r and any((v or "").strip() for v in r.values())]
            return [norm(h) for h in reader.fieldnames or []], rows
    # Wells Fargo style: no header, 5 columns: date, amount, *, , description
    rows = list(csv.reader(lines))
    if rows and len(rows[0]) == 5 and parse_date(rows[0][0]):
        return ["date", "amount", "_", "_", "description"], [
            {"date": r[0], "amount": r[1], "description": r[4]} for r in rows if len(r) == 5]
    return [], []


def col(row, *names):
    low = {norm(k): v for k, v in row.items() if k is not None}
    for n in names:
        if norm(n) in low and (low[norm(n)] or "").strip():
            return low[norm(n)].strip()
    return ""


# ----------------------------------------------------------------------------- adapters
# each returns a list of dicts: date, amount(signed), currency, description, counterparty,
# kind, external_id, source

def detect(header):
    h = set(header)
    if {"gross", "net", "from email address"} & h and "type" in h:
        return "paypal"
    if "datetime" in h and ("amount (total)" in h or "funding source" in h):
        return "venmo"
    if {"gross sales", "net sales", "total collected"} & h:
        return "square"
    if "created (utc)" in h and "amount refunded" in h:
        return "stripe"
    if "order #" in h or ("event name" in h and "total paid" in h):
        return "eventbrite"
    if "donation amount" in h or ("donor name" in h) or ("donation date" in h):
        return "gofundme"
    if "running bal." in h or "running balance" in h:
        return "bofa"
    if "posting date" in h and "details" in h:
        return "chase"
    if "description" in h and "amount" in h:
        return "bank"
    return None


def adapt(fmt, rows, fname):
    out = []
    for r in rows:
        d = a = None
        cur = "USD"
        desc = cp = kind = xid = ""
        if fmt == "paypal":
            d = parse_date(col(r, "date"))
            kind = col(r, "type")
            status = col(r, "status")
            if status and status.lower() not in ("completed", "cleared", "pending", ""):
                continue
            gross, fee = money(col(r, "gross")), money(col(r, "fee"))
            cur = col(r, "currency") or "USD"
            cp = col(r, "name")
            desc = kind + " " + col(r, "subject", "item title", "note")
            xid = col(r, "transaction id")
            if gross is None:
                continue
            if "transfer" in kind.lower() or "withdrawal" in kind.lower() or "bank deposit" in kind.lower():
                out.append(dict(date=d, amount=gross, currency=cur, description=kind, counterparty="PayPal",
                                kind=kind, external_id=xid, source="paypal"))
                continue
            out.append(dict(date=d, amount=gross, currency=cur, description=desc, counterparty=cp,
                            kind=kind, external_id=xid, source="paypal"))
            if fee:
                out.append(dict(date=d, amount=fee if fee < 0 else -fee, currency=cur, description="PayPal fee",
                                counterparty="PayPal", kind="fee", external_id=xid + ":fee", source="paypal"))
            continue
        if fmt == "venmo":
            d = parse_date(col(r, "datetime"))
            a = money(col(r, "amount (total)"))
            kind = col(r, "type")
            frm, to = col(r, "from"), col(r, "to")
            if not d or a is None:
                continue
            if kind.lower() in ("standard transfer", "instant transfer", "transfer"):
                cp, desc = "Venmo", kind
            else:
                cp = frm if a > 0 else to
                desc = kind  # the note is free text and may name people; not carried
            xid = col(r, "id")
            fee = money(col(r, "amount (fee)"))
            out.append(dict(date=d, amount=a, currency="USD", description=desc, counterparty=cp,
                            kind=kind, external_id=xid, source="venmo"))
            if fee:
                out.append(dict(date=d, amount=-abs(fee), currency="USD", description="Venmo fee",
                                counterparty="Venmo", kind="fee", external_id=xid + ":fee", source="venmo"))
            continue
        if fmt == "square":
            d = parse_date(col(r, "date"))
            a = money(col(r, "total collected", "net total", "net sales"))
            fee = money(col(r, "fees", "fee"))
            cp = col(r, "customer name") or "Square customer"
            kind = col(r, "event type", "transaction status") or "sale"
            xid = col(r, "transaction id", "payment id")
            desc = col(r, "description", "item", "details") or "Square sale"
            if fee:
                out.append(dict(date=d, amount=-abs(fee), currency="USD", description="Square fee",
                                counterparty="Square", kind="fee", external_id=xid + ":fee", source="square"))
            out.append(dict(date=d, amount=a, currency="USD", description=desc, counterparty=cp,
                            kind=kind, external_id=xid, source="square"))
            continue
        if fmt == "stripe":
            d = parse_date(col(r, "created (utc)"))
            if norm(col(r, "status")) not in ("paid", "succeeded", ""):
                continue
            a = money(col(r, "amount"))
            fee = money(col(r, "fee"))
            cp = col(r, "customer description", "customer email", "customer name") or "Stripe customer"
            desc = col(r, "description") or "Stripe payment"
            xid = col(r, "id")
            cur = (col(r, "currency") or "usd").upper()
            out.append(dict(date=d, amount=a, currency=cur, description=desc, counterparty=cp,
                            kind="payment", external_id=xid, source="stripe"))
            if fee:
                out.append(dict(date=d, amount=-abs(fee), currency=cur, description="Stripe fee",
                                counterparty="Stripe", kind="fee", external_id=xid + ":fee", source="stripe"))
            continue
        if fmt == "eventbrite":
            d = parse_date(col(r, "order date", "date"))
            a = money(col(r, "total paid", "gross", "amount"))
            if not d or not a:
                continue
            cp = (col(r, "first name") + " " + col(r, "last name")).strip() or col(r, "buyer name", "name")
            desc = col(r, "event name", "ticket type") or "Eventbrite order"
            xid = col(r, "order #", "order id")
            out.append(dict(date=d, amount=abs(a), currency="USD", description=desc, counterparty=cp,
                            kind="ticket", external_id=xid, source="eventbrite"))
            continue
        if fmt == "gofundme":
            d = parse_date(col(r, "donation date", "date"))
            a = money(col(r, "donation amount", "amount"))
            if not d or a is None:
                continue
            cp = col(r, "donor name", "name") or "Anonymous"
            out.append(dict(date=d, amount=abs(a), currency="USD", description="GoFundMe donation",
                            counterparty=cp, kind="donation", external_id=col(r, "donation id", "id"),
                            source="gofundme"))
            continue
        # banks
        if fmt == "bofa":
            d, a, desc = parse_date(col(r, "date")), money(col(r, "amount")), col(r, "description")
        elif fmt == "chase":
            d, a, desc = parse_date(col(r, "posting date")), money(col(r, "amount")), col(r, "description")
            kind = col(r, "type")
        else:
            d, a, desc = parse_date(col(r, "date", "transaction date", "post date")), money(col(r, "amount")), col(r, "description", "memo", "payee")
            if a is None:  # debit / credit columns
                deb, cre = money(col(r, "debit", "withdrawal")), money(col(r, "credit", "deposit"))
                a = (cre or 0) - abs(deb or 0) if (deb is not None or cre is not None) else None
        if not d or a is None:
            continue
        cp = bank_counterparty(desc)
        out.append(dict(date=d, amount=a, currency="USD", description=desc, counterparty=cp,
                        kind=kind or ("credit" if a > 0 else "debit"), external_id=col(r, "check or slip #", "reference", "id"),
                        source="bank"))
    for o in out:
        o["source_file"] = os.path.basename(fname)
    return [o for o in out if o.get("date")]


def bank_counterparty(desc):
    """'ZELLE PAYMENT FROM JOHN DOE 12345' -> 'john doe'; 'CHEWY.COM 800-6724 FL' -> 'chewy.com'."""
    d = norm(desc)
    m = re.search(r"zelle (?:payment )?(?:from|to) ([a-z' \-]+?)(?: conf| \d|$)", d)
    if m:
        return m.group(1).strip()
    m = re.search(r"(?:venmo|paypal|square|stripe|eventbrite|gofundme)", d)
    if m:
        return m.group(0)
    d = re.sub(r"(purchase|pos|debit card|checkcard|recurring|online|payment|des:|id:|indn:|co id:|web|ppd|ccd)\b", " ", d)
    d = re.sub(r"[\d#*]+", " ", d)
    d = re.sub(r"\b[a-z]{2}\b$", "", d.strip())  # trailing state code
    return re.sub(r"\s+", " ", d).strip()[:40]


# ----------------------------------------------------------------------------- ingest

def ingest(files, salt="farm"):
    raw = []
    report = []
    for fp in files:
        header, rows = sniff_rows(fp)
        fmt = detect(header)
        if not fmt:
            report.append((os.path.basename(fp), "UNRECOGNISED header: %s" % header[:8], 0))
            continue
        recs = adapt(fmt, rows, fp)
        report.append((os.path.basename(fp), fmt, len(recs)))
        raw.extend(recs)
    raw.sort(key=lambda r: (r["date"], r["source"], r.get("external_id", "")))

    platforms_present = {r["source"] for r in raw if r["source"] != "bank"}
    seen = set()
    ledger, cps = [], {}
    for i, r in enumerate(raw):
        direction = "in" if r["amount"] > 0 else "out"
        key = (r["source"], r["date"], round(r["amount"], 2), r.get("external_id") or norm(r["description"]))
        dup_of, counted = "", 1
        if key in seen:
            dup_of, counted = "exact", 0
        seen.add(key)
        cat = categorize(r["description"] + " " + r["counterparty"], direction, r["source"], r.get("kind", ""))
        d_low = norm(r["description"] + " " + r["counterparty"])
        if r["source"] == "bank":
            for p in platforms_present:
                if p in d_low:
                    dup_of, counted, cat = "%s payout" % p, 0, "transfer"
        if cat == "transfer" and counted:
            counted = 0  # internal movement, never revenue or expense
        cid = cp_id(r["counterparty"], salt)
        ctype = cp_type(r["counterparty"], direction)
        ledger.append({
            "row_id": "L%05d" % (i + 1), "date": r["date"].isoformat(), "year": r["date"].year,
            "month": r["date"].strftime("%Y-%m"), "source": r["source"], "source_file": r["source_file"],
            "direction": direction, "amount": "%.2f" % abs(r["amount"]), "currency": r["currency"],
            "category": cat, "cp_id": cid, "cp_type": ctype, "kind": r.get("kind", ""),
            "external_id": r.get("external_id", ""), "counted": counted, "dup_of": dup_of, "receipt_ref": "",
        })
        if cid and counted:
            c = cps.setdefault(cid, {"cp_id": cid, "name": r["counterparty"], "cp_type": ctype, "n": 0,
                                     "total_in": 0.0, "total_out": 0.0, "first": r["date"], "last": r["date"],
                                     "sources": set()})
            c["n"] += 1
            c["total_in" if direction == "in" else "total_out"] += abs(r["amount"])
            c["first"], c["last"] = min(c["first"], r["date"]), max(c["last"], r["date"])
            c["sources"].add(r["source"])
    return ledger, cps, report


def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields})


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cmd_ingest(args):
    ledger, cps, report = ingest(args.files, args.salt)
    write_csv(args.output, LEDGER_FIELDS, ledger)
    local = os.path.join(os.path.dirname(os.path.abspath(args.output)), "counterparties_local.csv")
    write_csv(local, ["cp_id", "name", "cp_type", "n", "total_in", "total_out", "first", "last", "sources"],
              sorted(({**c, "total_in": "%.2f" % c["total_in"], "total_out": "%.2f" % c["total_out"],
                       "sources": ";".join(sorted(c["sources"]))} for c in cps.values()),
                     key=lambda c: -float(c["total_in"])))
    for name, fmt, n in report:
        print("  %-32s %-12s %5d rows" % (name, fmt, n))
    counted = [r for r in ledger if r["counted"]]
    print("ingest: %d rows, %d counted, %d deduped/transfers -> %s" % (len(ledger), len(counted), len(ledger) - len(counted), args.output))
    print("LOCAL ONLY (names): %s — never upload this file" % local)
    log_line(args.output, "ingest", sum(n for _, _, n in report), len(ledger))


# ----------------------------------------------------------------------------- reconcile

def reconcile(ledger, receipts, days=3):
    """Match ledger rows to receipts by amount (exact) and date (±days). One receipt per row."""
    by_amt = defaultdict(list)
    for rc in receipts:
        a = money(rc.get("amount"))
        d = parse_date(rc.get("date"))
        if a is None or not d:
            continue
        by_amt[round(abs(a), 2)].append((d, rc))
    used = set()
    for row in ledger:
        if row.get("receipt_ref"):
            continue
        d = parse_date(row["date"])
        cands = by_amt.get(round(float(row["amount"]), 2), [])
        best = None
        for rd, rc in cands:
            if id(rc) in used:
                continue
            gap = abs((rd - d).days)
            if gap <= days and (best is None or gap < best[0]):
                if rc.get("direction") in ("", None, row["direction"]):
                    best = (gap, rc)
        if best:
            used.add(id(best[1]))
            row["receipt_ref"] = best[1].get("msg_id") or best[1].get("id") or "%s:%s" % (best[1].get("date"), best[1].get("from_domain", ""))
            if row["category"] in ("other", "income_other") and best[1].get("category"):
                row["category"] = best[1]["category"]
    # open questions = expenses with no document, and inflows the bank cannot classify.
    # A donation without a receipt is normal and is not a question.
    # Bank and platform fees are documented by the statement itself, so they are not asked about.
    unmatched_rows = [r for r in ledger if str(r["counted"]) == "1" and not r["receipt_ref"]
                      and r["category"] != "fees"
                      and (r["direction"] == "out" or r["category"] in ("income_other", "zelle_in"))]
    unmatched_receipts = [rc for rc in receipts if id(rc) not in used and money(rc.get("amount"))]
    return ledger, unmatched_rows, unmatched_receipts


def cmd_reconcile(args):
    ledger, receipts = read_csv(args.ledger), read_csv(args.receipts)
    ledger, un_rows, un_rcpt = reconcile(ledger, receipts, args.days)
    write_csv(args.output, LEDGER_FIELDS, ledger)
    qpath = args.questions
    with open(qpath, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["side", "date", "direction", "amount", "category", "source_or_domain", "ref", "question"])
        for r in sorted(un_rows, key=lambda r: -float(r["amount"])):
            w.writerow(["ledger", r["date"], r["direction"], r["amount"], r["category"], r["source"], r["row_id"],
                        ("expense without a document — invoice/receipt?" if r["direction"] == "out" else "inflow: donation or payment for a visit?")])
        for rc in un_rcpt:
            w.writerow(["receipt", rc.get("date"), rc.get("direction"), rc.get("amount"), rc.get("category"),
                        rc.get("from_domain"), rc.get("msg_id", ""), "receipt without a bank/platform row — paid how?"])
    matched = sum(1 for r in ledger if r["receipt_ref"])
    print("reconcile: %d ledger rows, %d matched to receipts, %d counted rows open, %d receipts open -> %s, %s"
          % (len(ledger), matched, len(un_rows), len(un_rcpt), args.output, qpath))
    log_line(args.output, "reconcile", len(ledger), matched)


# ----------------------------------------------------------------------------- summary

def summarize(ledger):
    agg = defaultdict(lambda: [0, 0.0])
    for r in ledger:
        if str(r["counted"]) != "1":
            continue
        k = (r["year"], r["month"], r["direction"], r["category"], r["source"])
        agg[k][0] += 1
        agg[k][1] += float(r["amount"])
    return [{"year": k[0], "month": k[1], "direction": k[2], "category": k[3], "source": k[4],
             "n": v[0], "total": "%.2f" % v[1]} for k, v in sorted(agg.items())]


def cmd_summary(args):
    ledger = read_csv(args.ledger)
    rows = summarize(ledger)
    write_csv(args.output, ["year", "month", "direction", "category", "source", "n", "total"], rows)
    years = defaultdict(lambda: defaultdict(float))
    for r in rows:
        years[r["year"]][r["direction"]] += float(r["total"])
    for y in sorted(years):
        print("  %s  in %10.2f   out %10.2f   net %10.2f" % (y, years[y]["in"], years[y]["out"], years[y]["in"] - years[y]["out"]))
    print("summary: %d rows -> %s (shareable: no names)" % (len(rows), args.output))


def log_line(output, step, n_in, n_out):
    path = os.path.join(os.path.dirname(os.path.abspath(output)), "processing_log.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["run_at", "step", "rows_in", "rows_out", "user", "output"])
        w.writerow([datetime.now().isoformat(timespec="seconds"), "ledger." + step, n_in, n_out,
                    os.environ.get("USER", ""), os.path.basename(output)])


# ----------------------------------------------------------------------------- demo

def synthetic_exports(tmp):
    """Five fake exports with the real header shapes. Names are obviously fake."""
    files = {}
    files["bofa_2024.csv"] = "\n".join([
        "Description,,Summary Amt.", "Beginning balance as of 01/01/2024,,\"1,000.00\"", "",
        "Date,Description,Amount,Running Bal.",
        "01/05/2024,\"Zelle payment from DAVID EXAMPLE Conf# abc123\",250.00,\"1,250.00\"",
        "01/09/2024,\"CHEWY.COM 800-6724 FL\",-186.40,\"1,063.60\"",
        "01/15/2024,\"PAYPAL TRANSFER PPD ID: 1234\",\"1,140.00\",\"2,203.60\"",
        "01/20/2024,\"VALLEY ANIMAL HOSPITAL WINNETKA CA\",-420.00,\"1,783.60\"",
        "01/22/2024,\"VENMO CASHOUT\",300.00,\"2,083.60\"",
        "01/28/2024,\"Online Banking transfer to SAV Confirmation# 999\",-500.00,\"1,583.60\"",
        "02/01/2024,\"MONTHLY MAINTENANCE FEE\",-16.00,\"1,567.60\"",
        "02/03/2024,\"HISCOX INSURANCE\",-210.00,\"1,357.60\"",
    ])
    files["paypal.csv"] = "\n".join([
        "\"Date\",\"Time\",\"TimeZone\",\"Name\",\"Type\",\"Status\",\"Currency\",\"Gross\",\"Fee\",\"Net\",\"From Email Address\",\"To Email Address\",\"Transaction ID\"",
        "\"01/12/2024\",\"10:00:00\",\"PST\",\"Sarah Example\",\"Donation Payment\",\"Completed\",\"USD\",\"500.00\",\"-15.00\",\"485.00\",\"s@example.com\",\"farm@example.org\",\"TX1\"",
        "\"01/13/2024\",\"11:00:00\",\"PST\",\"Michael Example\",\"Donation Payment\",\"Completed\",\"USD\",\"700.00\",\"-20.00\",\"680.00\",\"m@example.com\",\"farm@example.org\",\"TX2\"",
        "\"01/14/2024\",\"09:00:00\",\"PST\",\"\",\"General Withdrawal - Bank Account\",\"Completed\",\"USD\",\"-1,140.00\",\"0.00\",\"-1,140.00\",\"\",\"\",\"TX3\"",
        "\"01/13/2024\",\"11:00:00\",\"PST\",\"Michael Example\",\"Donation Payment\",\"Completed\",\"USD\",\"700.00\",\"-20.00\",\"680.00\",\"m@example.com\",\"farm@example.org\",\"TX2\"",
    ])
    files["venmo.csv"] = "\n".join([
        "Account Statement - (@farm-example) - January 1st to January 31st 2024,,,,,,,,,,,,",
        "Account Activity,,,,,,,,,,,,",
        ",ID,Datetime,Type,Status,Note,From,To,Amount (total),Amount (tip),Amount (fee),Funding Source,Destination",
        ",4001,2024-01-18T15:00:00,Payment,Complete,for the goats 🐐,Rachel Example,Farm Example,+ $100.00,,,,",
        ",4002,2024-01-19T15:00:00,Payment,Complete,alpaca visit,Noa Example,Farm Example,+ $200.00,,,,",
        ",4003,2024-01-21T09:00:00,Standard Transfer,Issued,,Farm Example,,- $300.00,,,,Bank *1234",
    ])
    files["eventbrite.csv"] = "\n".join([
        "Order #,Order Date,Attendee Status,First Name,Last Name,Email,Event Name,Ticket Quantity,Ticket Type,Total Paid",
        "9001,01/27/2024,Attending,Dana,Example,d@example.com,Farm Tour Sunday,2,General,40.00",
        "9002,01/27/2024,Attending,Eli,Example,e@example.com,Farm Tour Sunday,4,General,80.00",
    ])
    files["gofundme.csv"] = "\n".join([
        "Donor Name,Donation Amount,Donation Date,Comment",
        "Anonymous,50.00,2024-02-10,",
        "Yael Example,150.00,2024-02-11,Kol hakavod",
    ])
    paths = []
    for name, body in files.items():
        p = os.path.join(tmp, name)
        with open(p, "w", encoding="utf-8") as f:
            f.write(body + "\n")
        paths.append(p)
    return paths


def cmd_demo(_args):
    tmp = tempfile.mkdtemp(prefix="ledger-demo-")
    paths = synthetic_exports(tmp)
    ledger, cps, report = ingest(paths, "demo")
    fmts = {name: fmt for name, fmt, _ in report}
    assert fmts == {"bofa_2024.csv": "bofa", "paypal.csv": "paypal", "venmo.csv": "venmo",
                    "eventbrite.csv": "eventbrite", "gofundme.csv": "gofundme"}, fmts
    out = os.path.join(tmp, "ledger.csv")
    write_csv(out, LEDGER_FIELDS, ledger)
    text = open(out, encoding="utf-8").read()
    # 1. no names, no notes in the shareable file
    for bad in ("Example", "example", "goats", "alpaca visit", "Kol hakavod", "Sarah", "DAVID"):
        assert bad not in text, "ledger leaked: %s" % bad
    # 2. platform payouts in the bank are not counted twice; internal transfer not counted
    by_id = {r["row_id"]: r for r in ledger}
    payouts = [r for r in ledger if r["dup_of"].endswith("payout")]
    assert {r["dup_of"] for r in payouts} == {"paypal payout", "venmo payout"}, payouts
    assert all(r["counted"] == 0 for r in payouts)
    transfers = [r for r in ledger if r["category"] == "transfer"]
    assert all(r["counted"] == 0 for r in transfers) and len(transfers) >= 4, transfers
    # 3. exact duplicate (PayPal TX2 twice) deduped
    assert sum(1 for r in ledger if r["dup_of"] == "exact") == 2, "TX2 + its fee"  # row and fee row
    # 4. totals: in = 250 zelle + 500 + 700 paypal + 100 + 200 venmo + 40 + 80 eventbrite + 50 + 150 gofundme
    tot_in = sum(float(r["amount"]) for r in ledger if r["counted"] and r["direction"] == "in")
    assert abs(tot_in - 2070.0) < 0.01, tot_in
    tot_out = sum(float(r["amount"]) for r in ledger if r["counted"] and r["direction"] == "out")
    assert abs(tot_out - (186.40 + 420 + 16 + 210 + 15 + 20)) < 0.01, tot_out
    # 5. categories
    cats = {(r["category"], r["direction"]) for r in ledger if r["counted"]}
    for need in (("vet", "out"), ("feed", "out"), ("insurance", "out"), ("fees", "out"), ("donation", "in"), ("program_revenue", "in"), ("zelle_in", "in")):
        assert need in cats, (need, cats)
    # 6. counterparties are local and typed; zelle name extracted
    names = {c["name"] for c in cps.values()}
    assert "david example" in names and "Sarah Example" in names, names
    assert all(c["cp_type"] in ("person", "org", "merchant", "platform", "unknown") for c in cps.values())
    donors = [c for c in cps.values() if c["cp_type"] == "person" and c["total_in"] > 0]
    assert len(donors) >= 6, [(c["name"], c["cp_type"]) for c in cps.values()]
    # 7. reconcile against two fake receipts: vet invoice matches, one orphan receipt
    receipts = [{"msg_id": "m1", "date": "2024-01-21", "amount": "420.00", "direction": "out", "category": "vet", "from_domain": "valleyvet.example"},
                {"msg_id": "m2", "date": "2024-03-01", "amount": "99.00", "direction": "out", "category": "web", "from_domain": "wix.com"}]
    ledger, un_rows, un_rcpt = reconcile(ledger, receipts)
    vet = next(r for r in ledger if r["category"] == "vet")
    assert vet["receipt_ref"] == "m1" and len(un_rcpt) == 1 and un_rcpt[0]["msg_id"] == "m2"
    assert all(r["direction"] == "out" or r["category"] == "zelle_in" for r in un_rows), un_rows
    assert len(un_rows) == 3, [(r["category"], r["amount"]) for r in un_rows]  # feed, insurance, zelle-in
    # 8. summary has no names and sums match
    s = summarize(ledger)
    assert abs(sum(float(r["total"]) for r in s if r["direction"] == "in") - 2070.0) < 0.01
    print("demo OK: %d exports -> %d ledger rows (%d counted) · in %.2f out %.2f · %d counterparties (local) · reconcile matched vet invoice, 1 open receipt, %d open rows"
          % (len(paths), len(ledger), sum(1 for r in ledger if r["counted"]), tot_in, tot_out, len(cps), len(un_rows)))
    print("files:", tmp)


# ----------------------------------------------------------------------------- main

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("ingest", help="CSV exports -> ledger.csv (+ counterparties_local.csv)")
    s.add_argument("files", nargs="+")
    s.add_argument("-o", "--output", default="ledger.csv")
    s.add_argument("--salt", default="farm", help="salt for counterparty ids; keep the same across runs")
    s.set_defaults(fn=cmd_ingest)
    r = sub.add_parser("reconcile", help="attach receipts (mail_ledger.py) to ledger rows")
    r.add_argument("ledger")
    r.add_argument("receipts")
    r.add_argument("-o", "--output", default="ledger.csv")
    r.add_argument("--questions", default="questions.csv")
    r.add_argument("--days", type=int, default=3)
    r.set_defaults(fn=cmd_reconcile)
    m = sub.add_parser("summary", help="ledger.csv -> money_summary.csv (year × month × category)")
    m.add_argument("ledger")
    m.add_argument("-o", "--output", default="money_summary.csv")
    m.set_defaults(fn=cmd_summary)
    d = sub.add_parser("demo", help="self-test on synthetic exports")
    d.set_defaults(fn=cmd_demo)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
