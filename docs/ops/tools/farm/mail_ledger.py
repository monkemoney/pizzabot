#!/usr/bin/env python3
"""mail_ledger.py — the receipts and invoices hiding in the farm's Gmail (ops tool, D13).

Runs ON TIRAN'S MAC against a Google Takeout .mbox of the labelled mail
(Farm/Receipts/2023..2025 — see DAY2-MONEY.md for the saved searches).
Reads each message once, extracts the amount, direction and category, files
PDF attachments for the accountant, and never writes a message body anywhere.

  receipts.csv          LOCAL — one row per money email: date · sender domain · subject ·
                        direction · amount · category · attachment names. Subjects can carry
                        a donor's name, so this file stays with counterparties_local.csv.
                        It is the input to `ledger.py reconcile`.
  attachments/YYYY/     LOCAL — the PDFs, renamed  YYYY-MM-DD_domain_original.pdf
  receipts_summary.csv  shareable — month × direction × category × sender kind: n, total.

Pipeline
  mail_ledger.py scan  takeout.mbox -o receipts.csv --attachments ./attachments [--since 2023-01-01]
  mail_ledger.py summary receipts.csv -o receipts_summary.csv
  mail_ledger.py demo

Python 3.9+, standard library only.
"""
import argparse
import csv
import email
import email.policy
import html
import mailbox
import os
import re
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from email.utils import parseaddr, parsedate_to_datetime

RECEIPT_FIELDS = ["msg_id", "date", "from_domain", "from_kind", "subject", "direction", "amount",
                  "currency", "amounts_all", "category", "attachments", "has_pdf", "confidence"]

# Same table as ledger.py CATEGORIES; keep identical.
CATEGORIES = [
    # transfer first: a payout from a platform that is also a vendor (Wix) is a transfer, not a web bill
    ("transfer",   ("transfer", "online banking", "xfer", "cashout", "cash out", "payout", "withdrawal", "bank deposit")),
    ("fees",       ("fee", "service charge", "monthly maintenance", "chargeback")),
    ("vet",        ("vet", "veterinar", "animal hospital", "animal clinic", "farrier", "equine")),
    ("feed",       ("chewy", "tractor supply", "feed", "hay", "petco", "petsmart", "grain", "alfalfa")),
    ("insurance",  ("insurance", "state farm", "farmers", "hiscox", "philadelphia ins", "liability", "policy")),
    ("web",        ("wix", "squarespace", "godaddy", "google workspace", "gsuite", "domain", "zoom",
                    "canva", "mailchimp", "namecheap")),
    ("utilities",  ("ladwp", "socalgas", "so cal gas", "spectrum", "at&t", "t-mobile", "verizon", "water")),
    ("supplies",   ("home depot", "lowe's", "lowes", "amazon", "costco", "target", "walmart", "smart & final")),
    ("fuel",       ("shell", "chevron", "arco", "76 ", "mobil", "gas station", "fuel")),
    ("government", ("irs", "franchise tax", "ftb", "secretary of state", "ladbs", "city of los angeles", "county of los angeles")),
    ("professional", ("cpa", "accounting", "attorney", "law office", "legal", "bookkeep")),
]

PLATFORM_DOMAINS = ("paypal", "venmo", "squareup", "square", "stripe", "eventbrite", "gofundme",
                    "zelle", "givebutter", "donorbox", "classy", "benevity", "networkforgood",
                    "paypalgivingfund", "cash.app")
PERSONAL_DOMAINS = ("gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "me.com",
                    "aol.com", "walla.co.il", "walla.com", "live.com", "msn.com", "protonmail.com")

IN_WORDS = ("you received", "payment received", "you've received", "sent you", "paid you", "donation received",
            "new donation", "donated", "a donation", "donation from", "contribution", "thank you for your donation",
            "payout", "you got paid", "ticket sales", "order confirmation for your event", "תרומה", "התקבל תשלום")
OUT_WORDS = ("your receipt", "receipt for your payment", "receipt from", "invoice", "your order", "order confirmation",
             "payment confirmation", "thank you for your purchase", "thanks for your order", "you paid", "you sent",
             "payment to", "has been charged", "subscription", "renewal", "statement is ready", "bill",
             "קבלה", "חשבונית", "אישור תשלום", "הזמנתך")
DONATION_WORDS = ("donation", "donate", "gift", "contribution", "tzedakah", "תרומה", "sponsor")

MONEY_RE = re.compile(r"(?:(?:US\$|USD|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?))|(?:(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?(?:USD|dollars))", re.I)
# ordered: the first pattern that matches wins. Gross before net (PayPal lists gross, fee, net).
TOTAL_RES = [re.compile(r"(?:%s)[^$\d\n]{0,40}(?:US\$|USD|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)" % w, re.I)
             for w in ("gross", "order total|grand total|total charged|amount due|total paid|total amount",
                       "sent you|received|donated|donation of", "charged|paid|payment of", r"\btotal\b", r"\bamount\b", r"\bnet\b")]


# ----------------------------------------------------------------------------- extraction

def strip_html(s):
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    return html.unescape(re.sub(r"\s+", " ", s))


def message_text(msg, limit=200000):
    """Plain text of the message for amount extraction. Never stored."""
    parts = []
    for part in msg.walk():
        if part.get_content_maintype() != "text" or part.get_filename():
            continue
        try:
            payload = part.get_content()
        except Exception:  # noqa: BLE001 — malformed part; skip it, the mail still counts
            continue
        if not isinstance(payload, str):
            continue
        parts.append(strip_html(payload) if part.get_content_subtype() == "html" else payload)
        if sum(len(p) for p in parts) > limit:
            break
    return "\n".join(parts)[:limit]


def attachments_of(msg):
    out = []
    for part in msg.walk():
        fn = part.get_filename()
        if fn:
            out.append((fn, part))
    return out


def amounts(text):
    vals = []
    for m in MONEY_RE.finditer(text):
        raw = m.group(1) or m.group(2)
        try:
            v = float(raw.replace(",", ""))
        except (TypeError, ValueError):
            continue
        if 0 < v < 1_000_000:
            vals.append(round(v, 2))
    return vals


def pick_amount(subject, text):
    """The amount the email is about: first in the subject, then one labelled total/amount,
    then the largest in the body (PayPal mails list gross, fee, net — gross is the largest)."""
    subj = amounts(subject)
    if subj:
        return subj[0], "subject"
    for rx in TOTAL_RES:
        m = rx.search(text)
        if m:
            try:
                return float(m.group(1).replace(",", "")), "labelled"
            except ValueError:
                continue
    body = amounts(text)
    if body:
        return max(body), "largest"
    return None, ""


def domain_of(addr):
    _, a = parseaddr(addr or "")
    return a.rsplit("@", 1)[-1].lower() if "@" in a else ""


def from_kind(domain):
    if not domain:
        return "unknown"
    if any(p in domain for p in PLATFORM_DOMAINS):
        return "platform"
    if domain in PERSONAL_DOMAINS:
        return "person"
    return "vendor"


def direction_of(subject, text, kind, domain):
    s = (subject or "").lower()
    t = (text or "")[:4000].lower()
    if any(w in s for w in IN_WORDS) or (kind == "platform" and any(w in t for w in IN_WORDS)):
        if not any(w in s for w in ("your receipt", "you paid", "you sent", "invoice")):
            return "in", "words"
    if any(w in s for w in OUT_WORDS) or any(w in t[:1500] for w in OUT_WORDS):
        return "out", "words"
    if kind == "vendor":
        return "out", "vendor"
    if kind == "person" and any(w in s + t[:1500] for w in DONATION_WORDS):
        return "in", "person+donation"
    return "", ""


def categorize(subject, domain, text, direction):
    head = (subject + " " + domain).lower()
    for cat, kws in CATEGORIES:
        if any(k in head for k in kws):
            return cat
    if direction == "in" and any(k in head for k in DONATION_WORDS):
        return "donation"
    body = text[:2000].lower()
    for cat, kws in CATEGORIES:
        if cat in ("fees", "transfer"):
            continue  # a fee line inside a donation receipt is not the receipt's category
        if any(k in body for k in kws):
            return cat
    t = head + " " + body
    if direction == "in":
        if any(k in t for k in DONATION_WORDS):
            return "donation"
        if any(k in t for k in ("ticket", "booking", "class", "tour", "visit", "workshop", "order")):
            return "program_revenue"
        return "income_other"
    return "other"


def scan_message(msg, since=None):
    """One mbox message -> receipt row or None. Pure, tested by demo."""
    try:
        dt = parsedate_to_datetime(msg.get("Date"))
    except (TypeError, ValueError, IndexError):
        return None
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    day = dt.astimezone().date()
    if since and day < since:
        return None
    subject = str(msg.get("Subject") or "").replace("\n", " ").strip()
    domain = domain_of(msg.get("From"))
    kind = from_kind(domain)
    text = message_text(msg)
    amt, how = pick_amount(subject, text)
    atts = attachments_of(msg)
    names = [fn for fn, _ in atts]
    has_pdf = any(fn.lower().endswith(".pdf") for fn in names)
    if amt is None and not has_pdf:
        return None  # not a money email
    direction, dhow = direction_of(subject, text, kind, domain)
    cat = categorize(subject, domain, text, direction)
    conf = "high" if (how in ("subject", "labelled") and dhow == "words") else ("medium" if amt else "low")
    return {
        "msg_id": (msg.get("Message-ID") or "").strip()[:80] or "%s:%s" % (day, domain),
        "date": day.isoformat(), "from_domain": domain, "from_kind": kind,
        "subject": subject[:120], "direction": direction,
        "amount": "%.2f" % amt if amt is not None else "", "currency": "USD",
        "amounts_all": ";".join("%.2f" % v for v in sorted(set(amounts(subject + " " + text)))[:8]),
        "category": cat, "attachments": ";".join(names)[:200], "has_pdf": 1 if has_pdf else 0,
        "confidence": conf,
    }, atts


def save_attachments(atts, row, root):
    saved = 0
    for fn, part in atts:
        if not fn.lower().endswith(".pdf"):
            continue
        year_dir = os.path.join(root, row["date"][:4])
        os.makedirs(year_dir, exist_ok=True)
        safe = re.sub(r"[^A-Za-z0-9._\-֐-׿]+", "_", fn)[:80]
        target = os.path.join(year_dir, "%s_%s_%s" % (row["date"], (row["from_domain"] or "x").split(".")[0], safe))
        try:
            payload = part.get_payload(decode=True)
        except Exception:  # noqa: BLE001 — undecodable part is logged as missing, not fatal
            payload = None
        if not payload:
            continue
        with open(target, "wb") as f:
            f.write(payload)
        saved += 1
    return saved


def scan_mbox(path, since=None, attachments_dir=None):
    box = mailbox.mbox(path, factory=lambda f: email.message_from_binary_file(f, policy=email.policy.default))
    rows, n_msgs, n_pdf = [], 0, 0
    for msg in box:
        n_msgs += 1
        res = scan_message(msg, since)
        if not res:
            continue
        row, atts = res
        if attachments_dir:
            n_pdf += save_attachments(atts, row, attachments_dir)
        rows.append(row)
    return rows, n_msgs, n_pdf


# ----------------------------------------------------------------------------- io / commands

def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields})


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def log_line(output, step, n_in, n_out):
    path = os.path.join(os.path.dirname(os.path.abspath(output)), "processing_log.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["run_at", "step", "rows_in", "rows_out", "user", "output"])
        w.writerow([datetime.now().isoformat(timespec="seconds"), "mail_ledger." + step, n_in, n_out,
                    os.environ.get("USER", ""), os.path.basename(output)])


def cmd_scan(args):
    since = datetime.strptime(args.since, "%Y-%m-%d").date() if args.since else None
    rows, n_msgs, n_pdf = scan_mbox(args.mbox, since, args.attachments)
    rows.sort(key=lambda r: r["date"])
    write_csv(args.output, RECEIPT_FIELDS, rows)
    by_dir = defaultdict(int)
    for r in rows:
        by_dir[r["direction"] or "?"] += 1
    print("scan: %d messages -> %d money emails (in %d · out %d · unclear %d), %d PDFs filed -> %s"
          % (n_msgs, len(rows), by_dir["in"], by_dir["out"], by_dir["?"], n_pdf, args.output))
    print("LOCAL ONLY (subjects): %s — feed it to `ledger.py reconcile`, do not upload" % args.output)
    log_line(args.output, "scan", n_msgs, len(rows))


def summarize(rows):
    agg = defaultdict(lambda: [0, 0.0])
    for r in rows:
        if not r.get("amount"):
            continue
        k = (r["date"][:7], r["direction"] or "?", r["category"], r["from_kind"])
        agg[k][0] += 1
        agg[k][1] += float(r["amount"])
    return [{"month": k[0], "direction": k[1], "category": k[2], "from_kind": k[3], "n": v[0], "total": "%.2f" % v[1]}
            for k, v in sorted(agg.items())]


def cmd_summary(args):
    rows = read_csv(args.receipts)
    out = summarize(rows)
    write_csv(args.output, ["month", "direction", "category", "from_kind", "n", "total"], out)
    print("summary: %d receipts -> %d rows -> %s (shareable: no subjects, no domains)" % (len(rows), len(out), args.output))


# ----------------------------------------------------------------------------- demo

def build_message(frm, to, subject, date, text_body, html_body=None, pdf_name=None):
    from email.message import EmailMessage
    m = EmailMessage(policy=email.policy.SMTP)  # 7-bit folding: Hebrew subjects get RFC 2047-encoded
    m["From"], m["To"], m["Subject"], m["Date"] = frm, to, subject, date
    m["Message-ID"] = "<%s@demo>" % (re.sub(r"[^A-Za-z0-9]", "", subject)[:20] or "heb")
    m.set_content(text_body)
    if html_body:
        m.add_alternative(html_body, subtype="html")
    if pdf_name:
        m.add_attachment(b"%PDF-1.4 demo", maintype="application", subtype="pdf", filename=pdf_name)
    return m


def synthetic_mbox(path):
    msgs = [
        build_message("service@paypal.com", "farm@example.org", "You received a donation from Sarah Example",
                      "Fri, 12 Jan 2024 10:00:00 -0800",
                      "Sarah Example sent you $500.00 USD\nGross $500.00 USD\nFee -$15.00 USD\nNet $485.00 USD"),
        build_message("no-reply@chewy.com", "farm@example.org", "Your Chewy.com order #123 has shipped",
                      "Tue, 09 Jan 2024 08:00:00 -0800", "Order total: $186.40",
                      "<html><body><p>Order total: <b>$186.40</b></p></body></html>"),
        build_message("billing@valleyvet.example", "farm@example.org", "Invoice 4471 — Valley Animal Hospital",
                      "Sat, 20 Jan 2024 09:00:00 -0800", "Please find your invoice attached. Amount due: $420.00",
                      pdf_name="Invoice_4471.pdf"),
        build_message("limor.friend@gmail.com", "farm@example.org", "the alpacas!!",
                      "Sun, 21 Jan 2024 12:00:00 -0800", "loved the visit, see you Friday. Names: Dana, Eli, Noa."),
        build_message("noreply@hiscox.com", "farm@example.org", "Your policy renewal — payment confirmation",
                      "Sat, 03 Feb 2024 09:00:00 -0800", "We have charged $210.00 to your card ending 1234."),
        build_message("orders@eventbrite.com", "farm@example.org", "Order confirmation for your event: Farm Tour Sunday",
                      "Sat, 27 Jan 2024 09:00:00 -0800", "Dana Example bought 2 tickets. Ticket sales: $40.00"),
        build_message("mazkirut@shul.example", "farm@example.org", "קבלה על תרומה — 150 USD",
                      "Sun, 11 Feb 2024 09:00:00 -0800", "מצורפת קבלה על תרומתך בסך 150 USD", pdf_name="kabala_150.pdf"),
        build_message("old@vendor.example", "farm@example.org", "Receipt $99.00", "Sun, 01 Jan 2022 09:00:00 -0800", "Total $99.00"),
    ]
    box = mailbox.mbox(path)
    for m in msgs:
        box.add(m.as_bytes())  # mailbox's own generator cannot fold non-ASCII headers
    box.flush()
    box.close()
    return len(msgs)


def cmd_demo(_args):
    tmp = tempfile.mkdtemp(prefix="mail-ledger-demo-")
    mbox_path = os.path.join(tmp, "takeout.mbox")
    n = synthetic_mbox(mbox_path)
    att = os.path.join(tmp, "attachments")
    rows, n_msgs, n_pdf = scan_mbox(mbox_path, since=datetime(2023, 1, 1).date(), attachments_dir=att)
    out = os.path.join(tmp, "receipts.csv")
    write_csv(out, RECEIPT_FIELDS, rows)
    text = open(out, encoding="utf-8").read()
    assert n_msgs == n, n_msgs
    by_dom = {r["from_domain"]: r for r in rows}
    # 1. the personal chat with names and no money is not a receipt; the 2022 mail is excluded by --since
    assert "gmail.com" not in by_dom and "vendor.example" not in by_dom, by_dom.keys()
    assert "Dana, Eli" not in text and "loved the visit" not in text and "card ending" not in text, "body leaked"
    assert len(rows) == 6, len(rows)
    # 2. amounts and directions
    pp = by_dom["paypal.com"]
    assert pp["direction"] == "in" and pp["amount"] == "500.00" and pp["category"] == "donation", pp
    ch = by_dom["chewy.com"]
    assert ch["direction"] == "out" and ch["amount"] == "186.40" and ch["category"] == "feed", ch
    vet = by_dom["valleyvet.example"]
    assert vet["direction"] == "out" and vet["amount"] == "420.00" and vet["category"] == "vet" and vet["has_pdf"] == 1, vet
    ins = by_dom["hiscox.com"]
    assert ins["direction"] == "out" and ins["amount"] == "210.00" and ins["category"] == "insurance", ins
    eb = by_dom["eventbrite.com"]
    assert eb["direction"] == "in" and eb["amount"] == "40.00" and eb["category"] == "program_revenue", eb
    heb = by_dom["shul.example"]
    assert heb["amount"] == "150.00" and heb["category"] == "donation" and heb["has_pdf"] == 1, heb
    # 3. PDFs filed by year with date + domain prefix
    files = sorted(os.listdir(os.path.join(att, "2024")))
    assert n_pdf == 2 and files[0].startswith("2024-01-20_valleyvet_") and len(files) == 2, files
    # 4. summary carries no subjects/domains
    s = summarize(rows)
    stext = "\n".join(",".join(str(v) for v in r.values()) for r in s)
    assert "paypal" not in stext and "Invoice" not in stext
    assert abs(sum(float(r["total"]) for r in s if r["direction"] == "out") - (186.40 + 420 + 210)) < 0.01
    print("demo OK: %d messages -> %d receipts (in %d · out %d) · %d PDFs filed · summary %d rows"
          % (n, len(rows), sum(r["direction"] == "in" for r in rows), sum(r["direction"] == "out" for r in rows), n_pdf, len(s)))
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan", help="Takeout .mbox -> receipts.csv (+ PDFs filed)")
    s.add_argument("mbox")
    s.add_argument("-o", "--output", default="receipts.csv")
    s.add_argument("--attachments", help="folder to file PDF attachments by year")
    s.add_argument("--since", help="YYYY-MM-DD")
    s.set_defaults(fn=cmd_scan)
    m = sub.add_parser("summary", help="receipts.csv -> receipts_summary.csv (shareable)")
    m.add_argument("receipts")
    m.add_argument("-o", "--output", default="receipts_summary.csv")
    m.set_defaults(fn=cmd_summary)
    d = sub.add_parser("demo", help="self-test on a synthetic mbox")
    d.set_defaults(fn=cmd_demo)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
