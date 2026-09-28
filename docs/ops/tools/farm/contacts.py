#!/usr/bin/env python3
"""contacts.py — Limor's Contacts as the participant ledger, counted, never listed (ops tool, D13).

Runs ON LIMOR'S MAC. Her Contacts hold tens of thousands of people with keywords in the
name/company/notes ("סיור", "נובה", free-style). This tool never writes a name, a phone
or an email anywhere. It writes:

  vocab_local.csv       LOCAL — words that appear in ≥ N contacts (to discover her tags).
                        Common first names appear here too, so it stays on the Mac.
  tags.txt              you edit — one tag per line, synonyms comma-separated.
  contacts_counts.csv   shareable — dimension × key × year → n   (tag / group / phone_country)
  contacts_timeline.csv shareable — month → contacts created (the community's growth curve)

Source, in order of preference:
  1. The Contacts database (creation date per contact = when she met them):
       ~/Library/Application Support/AddressBook/**/AddressBook-v22.abcddb   (needs Full Disk Access)
  2. A vCard export (Contacts → select all → File → Export → Export vCard…): --vcf all.vcf
     (no creation date; REV = last modified is used instead, and the output says so)

  contacts.py vocab   [--db auto | --vcf all.vcf] -o vocab_local.csv --min 5
  contacts.py count   [--db auto | --vcf all.vcf] --tags tags.txt -o contacts_counts.csv
  contacts.py demo

Python 3.9+, standard library only (sqlite3 is stdlib).
"""
import argparse
import csv
import glob
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

CORE_DATA_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)

DEFAULT_TAGS = [
    "סיור,tour,visit,ביקור",
    "נובה,nova",
    "חייל,חיילים,חיילת,soldier,soldiers,idf,צה\"ל,צהל",
    "מילואים,reserve,reservist",
    "פצוע,פצועים,wounded,הלום,הלומי,ptsd",
    "בית ספר,ביה\"ס,school",
    "גן,kindergarten,preschool",
    "קייטנה,camp",
    "טיפול,טיפולי,therapy,therapeutic",
    "צרכים מיוחדים,special needs,autism,אוטיזם",
    "מתנדב,מתנדבת,מתנדבים,volunteer",
    "תורם,תורמת,donor,donation,תרומה",
    "אלפקה,אלפקות,alpaca",
    "יום הולדת,birthday",
    "שבת,shabbat,קהילה,community,חב\"ד,chabad",
    "עיתונאי,press,כתב,journalist",
]

STOP = set("the and for from with של את על עם אל לא כן זה זו הוא היא אני אתה מר גב ד״ר דר mr mrs ms dr "
           "iphone whatsapp mobile cell home work phone email inc llc".split())


# ----------------------------------------------------------------------------- sources

class Contact:
    __slots__ = ("text", "created", "modified", "phones", "groups", "is_group", "name")

    def __init__(self):
        self.text, self.created, self.modified = [], None, None
        self.phones, self.groups, self.is_group, self.name = [], [], False, ""


def find_db():
    pats = [os.path.expanduser("~/Library/Application Support/AddressBook/Sources/*/AddressBook-v22.abcddb"),
            os.path.expanduser("~/Library/Application Support/AddressBook/AddressBook-v22.abcddb")]
    found = []
    for p in pats:
        found.extend(glob.glob(p))
    return found


def cd_date(v):
    if v in (None, "", 0):
        return None
    try:
        return CORE_DATA_EPOCH + timedelta(seconds=float(v))
    except (TypeError, ValueError):
        return None


def table_cols(con, table):
    try:
        return [r[1] for r in con.execute("PRAGMA table_info(%s)" % table)]
    except sqlite3.Error:
        return []


def load_db(path):
    """Copy the db (+wal) to temp so Contacts' own lock never matters, then read."""
    tmp = tempfile.mkdtemp(prefix="contacts-")
    dst = os.path.join(tmp, "ab.db")
    shutil.copy2(path, dst)
    for ext in ("-wal", "-shm"):
        if os.path.exists(path + ext):
            shutil.copy2(path + ext, dst + ext)
    con = sqlite3.connect("file:%s?mode=ro" % dst, uri=True)
    con.row_factory = sqlite3.Row
    cols = table_cols(con, "ZABCDRECORD")
    if not cols:
        tables = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
        raise SystemExit("ZABCDRECORD not found; tables: %s" % tables[:40])
    want = ["Z_PK", "Z_ENT", "ZFIRSTNAME", "ZLASTNAME", "ZMIDDLENAME", "ZNICKNAME", "ZORGANIZATION",
            "ZJOBTITLE", "ZDEPARTMENT", "ZNAME", "ZCREATIONDATE", "ZMODIFICATIONDATE"]
    have = [c for c in want if c in cols]
    rows = con.execute("select %s from ZABCDRECORD" % ", ".join(have)).fetchall()
    contacts = {}
    for r in rows:
        c = Contact()
        c.name = " ".join(str(r[k]) for k in ("ZFIRSTNAME", "ZMIDDLENAME", "ZLASTNAME") if k in have and r[k])
        c.is_group = bool(r["ZNAME"]) if "ZNAME" in have else False
        if c.is_group:
            c.name = r["ZNAME"]
        c.text = [str(r[k]) for k in ("ZFIRSTNAME", "ZMIDDLENAME", "ZLASTNAME", "ZNICKNAME", "ZORGANIZATION",
                                      "ZJOBTITLE", "ZDEPARTMENT") if k in have and r[k]]
        c.created = cd_date(r["ZCREATIONDATE"]) if "ZCREATIONDATE" in have else None
        c.modified = cd_date(r["ZMODIFICATIONDATE"]) if "ZMODIFICATIONDATE" in have else None
        contacts[r["Z_PK"]] = c
    # notes
    ncols = table_cols(con, "ZABCDNOTE")
    if "ZTEXT" in ncols and "ZCONTACT" in ncols:
        for r in con.execute("select ZCONTACT, ZTEXT from ZABCDNOTE where ZTEXT is not null"):
            if r["ZCONTACT"] in contacts:
                contacts[r["ZCONTACT"]].text.append(str(r["ZTEXT"]))
    # phones (only the country prefix is ever kept)
    pcols = table_cols(con, "ZABCDPHONENUMBER")
    if "ZFULLNUMBER" in pcols and "ZOWNER" in pcols:
        for r in con.execute("select ZOWNER, ZFULLNUMBER from ZABCDPHONENUMBER where ZFULLNUMBER is not null"):
            if r["ZOWNER"] in contacts:
                contacts[r["ZOWNER"]].phones.append(str(r["ZFULLNUMBER"]))
    # group membership: a join table Z_<n>CONTACTS / Z_<n>PARENTGROUPS (name varies by version)
    for (tname,) in con.execute("select name from sqlite_master where type='table' and name like 'Z_%'"):
        tc = table_cols(con, tname)
        gcol = next((c for c in tc if "PARENTGROUPS" in c.upper() or c.upper().endswith("GROUPS")), None)
        ccol = next((c for c in tc if c.upper().endswith("CONTACTS") or c.upper().endswith("MEMBERS")), None)
        if gcol and ccol:
            for r in con.execute("select %s g, %s c from %s" % (gcol, ccol, tname)):
                g, m = contacts.get(r["g"]), contacts.get(r["c"])
                if g and m and g.is_group:
                    m.groups.append(g.name)
    con.close()
    shutil.rmtree(tmp, ignore_errors=True)
    people = [c for c in contacts.values() if not c.is_group]
    return people, "db"


def unfold_vcf(lines):
    out = []
    for ln in lines:
        if ln[:1] in (" ", "\t") and out:
            out[-1] += ln[1:]
        else:
            out.append(ln)
    return out


def load_vcf(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        lines = unfold_vcf(f.read().splitlines())
    people, cur = [], None
    for ln in lines:
        if ln.startswith("BEGIN:VCARD"):
            cur = Contact()
        elif ln.startswith("END:VCARD"):
            if cur:
                people.append(cur)
            cur = None
        elif cur is not None and ":" in ln:
            key, val = ln.split(":", 1)
            k = key.split(";")[0].upper()
            k = k.split(".")[-1]  # item1.X-ABLabel -> X-ABLabel
            if k in ("FN", "N", "ORG", "NOTE", "NICKNAME", "TITLE", "X-ABLABEL"):
                cur.text.append(val.replace(";", " ").replace("\\n", " ").replace("\\,", ","))
                if k == "FN":
                    cur.name = val
            elif k == "TEL":
                cur.phones.append(val)
            elif k == "CATEGORIES":
                cur.groups.extend(v for v in val.split(",") if v)
            elif k == "REV":
                try:
                    cur.modified = datetime.fromisoformat(val.replace("Z", "+00:00"))
                except ValueError:
                    pass
    return people, "vcf"


def load(args):
    if getattr(args, "vcf", None):
        return load_vcf(args.vcf)
    dbs = find_db() if args.db in (None, "auto") else [args.db]
    if not dbs:
        raise SystemExit("no Contacts database found — grant Full Disk Access to Terminal, or export a vCard and pass --vcf")
    people = []
    for p in dbs:
        got, _ = load_db(p)
        people.extend(got)
    return people, "db"


# ----------------------------------------------------------------------------- analysis

TOKEN_RE = re.compile(r"[A-Za-z֐-׿][A-Za-z֐-׿'\"׳״\-]{1,}")


def tokens(c):
    return {t.lower().strip("'\"׳״-") for t in TOKEN_RE.findall(" ".join(c.text)) if len(t) > 1}


def phone_country(num):
    d = re.sub(r"\D", "", num or "")
    if not d:
        return "unknown"
    if d.startswith("972") or (d.startswith("0") and len(d) in (9, 10) and d[1] in "5"):
        return "IL"
    if d.startswith("1") and len(d) == 11:
        return "US"
    if len(d) == 10 and d[0] in "23456789":
        return "US"
    return "other"


def year_of(c, mode):
    d = c.created if mode == "db" else c.modified
    return d.astimezone().year if d else "unknown"


def month_of(c):
    d = c.created or c.modified
    return d.astimezone().strftime("%Y-%m") if d else "unknown"


def load_tags(path):
    tags = []
    src = open(path, encoding="utf-8").read().splitlines() if path and os.path.exists(path) else DEFAULT_TAGS
    for ln in src:
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = [p.strip().lower() for p in ln.split(",") if p.strip()]
        tags.append((parts[0], parts))
    return tags


def count(people, tags, mode):
    counts = Counter()
    per_year = Counter()
    timeline = Counter()
    for c in people:
        blob = (" ".join(c.text) + " " + " ".join(c.groups)).lower()   # a group named "נובה" tags its members
        yr = year_of(c, mode)
        per_year[yr] += 1
        timeline[month_of(c)] += 1
        hit_any = False
        for tag, syns in tags:
            if any(s in blob for s in syns):
                counts[("tag", tag, yr)] += 1
                hit_any = True
        if hit_any:
            counts[("tag", "_any_tag", yr)] += 1
        for g in set(c.groups):
            counts[("group", g, yr)] += 1
        countries = {phone_country(p) for p in c.phones} or {"none"}
        for k in countries:
            counts[("phone_country", k, yr)] += 1
    rows = [{"dimension": d, "key": k, "year": y, "n": n} for (d, k, y), n in sorted(counts.items(), key=lambda kv: (kv[0][0], str(kv[0][2]), -kv[1]))]
    rows += [{"dimension": "all", "key": "contacts", "year": y, "n": n} for y, n in sorted(per_year.items(), key=lambda kv: str(kv[0]))]
    tl = [{"month": m, "created": n} for m, n in sorted(timeline.items())]
    return rows, tl


def vocab(people, min_n=5):
    df = Counter()
    for c in people:
        for t in tokens(c):
            if t not in STOP and not t.isdigit():
                df[t] += 1
    return [{"word": w, "contacts": n} for w, n in df.most_common() if n >= min_n]


# ----------------------------------------------------------------------------- commands

def write_csv(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def cmd_vocab(args):
    people, mode = load(args)
    rows = vocab(people, args.min)
    write_csv(args.output, ["word", "contacts"], rows)
    print("vocab: %d contacts (%s) -> %d words in ≥%d contacts -> %s" % (len(people), mode, len(rows), args.min, args.output))
    print("LOCAL ONLY — first names are in there. Read it with Limor, pick her tag words into tags.txt.")
    if not os.path.exists(args.tags_out):
        with open(args.tags_out, "w", encoding="utf-8") as f:
            f.write("# one tag per line; synonyms comma-separated; lines starting with # are ignored\n")
            f.write("\n".join(DEFAULT_TAGS) + "\n")
        print("wrote starter tags -> %s (edit it)" % args.tags_out)


def cmd_count(args):
    people, mode = load(args)
    tags = load_tags(args.tags)
    rows, tl = count(people, tags, mode)
    write_csv(args.output, ["dimension", "key", "year", "n"], rows)
    tpath = os.path.join(os.path.dirname(os.path.abspath(args.output)), "contacts_timeline.csv")
    write_csv(tpath, ["month", "created"], tl)
    tagged = sum(r["n"] for r in rows if r["dimension"] == "tag" and r["key"] == "_any_tag")
    print("count: %d contacts, %d matched a tag (%s) -> %s, %s" % (len(people), tagged, "creation date" if mode == "db" else "REV = last-modified, not creation", args.output, tpath))
    for r in rows:
        if r["dimension"] == "tag" and r["key"] != "_any_tag" and r["n"] >= 5:
            print("  %-22s %s  %5d" % (r["key"], r["year"], r["n"]))
    print("shareable: counts only — no name, phone or email exists in either file")


# ----------------------------------------------------------------------------- demo

def synthetic_db(path, n=600):
    import random
    rnd = random.Random(3)
    con = sqlite3.connect(path)
    con.executescript("""
    create table ZABCDRECORD (Z_PK integer primary key, Z_ENT integer, ZFIRSTNAME text, ZLASTNAME text, ZMIDDLENAME text,
        ZNICKNAME text, ZORGANIZATION text, ZJOBTITLE text, ZDEPARTMENT text, ZNAME text, ZCREATIONDATE real, ZMODIFICATIONDATE real);
    create table ZABCDNOTE (Z_PK integer primary key, ZCONTACT integer, ZTEXT text);
    create table ZABCDPHONENUMBER (Z_PK integer primary key, ZOWNER integer, ZFULLNUMBER text);
    create table Z_19PARENTGROUPS (Z_19CONTACTS integer, Z_22PARENTGROUPS integer);
    """)
    first = ["דנה", "אלי", "נועה", "יוסי", "Sarah", "Michael", "רחל", "David"]
    last = ["Example", "לדוגמה", "Test", "בדיקה"]
    kw = ["סיור", "נובה", "חייל", "מילואים", "", "", "", "בית ספר", "מתנדבת", "tour"]
    gid = 9001
    con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT, ZNAME) values (?, 1, ?)", (gid, "נובה 2024"))
    start = datetime(2020, 6, 1, tzinfo=timezone.utc)
    for i in range(1, n + 1):
        created = start + timedelta(days=rnd.randint(0, 2200))
        k = rnd.choice(kw)
        fn = rnd.choice(first) + (" " + k if k and rnd.random() < 0.7 else "")
        con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT, ZFIRSTNAME, ZLASTNAME, ZORGANIZATION, ZCREATIONDATE, ZMODIFICATIONDATE) values (?,?,?,?,?,?,?)",
                    (i, 0, fn, rnd.choice(last), "Nova community" if k == "נובה" and rnd.random() < 0.5 else None,
                     (created - CORE_DATA_EPOCH).total_seconds(), (created - CORE_DATA_EPOCH).total_seconds() + 86400))
        if k and rnd.random() < 0.3:
            con.execute("insert into ZABCDNOTE (ZCONTACT, ZTEXT) values (?, ?)", (i, "הגיע ל%s עם המשפחה" % k))
        num = "+972 5%d-%07d" % (rnd.randint(0, 8), rnd.randint(0, 9999999)) if rnd.random() < 0.4 else "(818) 555-%04d" % rnd.randint(0, 9999)
        con.execute("insert into ZABCDPHONENUMBER (ZOWNER, ZFULLNUMBER) values (?, ?)", (i, num))
        if k == "נובה":
            con.execute("insert into Z_19PARENTGROUPS values (?, ?)", (i, gid))
    con.commit()
    con.close()


def cmd_demo(_args):
    tmp = tempfile.mkdtemp(prefix="contacts-demo-")
    db = os.path.join(tmp, "AddressBook-v22.abcddb")
    synthetic_db(db)
    people, mode = load_db(db)
    assert mode == "db" and len(people) == 600, len(people)
    assert all(c.created for c in people) and not any(c.is_group for c in people)
    nova_group = sum(1 for c in people if "נובה 2024" in c.groups)
    assert nova_group > 20, nova_group
    v = vocab(people, 5)
    words = {r["word"] for r in v}
    assert {"סיור", "נובה", "חייל", "example"} <= words, words   # first names DO appear -> local only
    rows, tl = count(people, load_tags(None), mode)
    out = os.path.join(tmp, "contacts_counts.csv")
    write_csv(out, ["dimension", "key", "year", "n"], rows)
    text = open(out, encoding="utf-8").read()
    for bad in ("דנה", "Sarah", "Example", "555", "972", "לדוגמה"):
        assert bad not in text, "counts leaked: %s" % bad
    tag_nova = sum(r["n"] for r in rows if r["dimension"] == "tag" and r["key"] == "נובה")
    grp = sum(r["n"] for r in rows if r["dimension"] == "group" and r["key"] == "נובה 2024")
    assert grp == nova_group and tag_nova >= grp, (tag_nova, grp)
    il = sum(r["n"] for r in rows if r["dimension"] == "phone_country" and r["key"] == "IL")
    us = sum(r["n"] for r in rows if r["dimension"] == "phone_country" and r["key"] == "US")
    assert il + us == 600 and 150 < il < 330, (il, us)
    assert sum(r["created"] for r in tl) == 600 and tl[0]["month"] >= "2020-06"
    # vcf fallback
    vcf = os.path.join(tmp, "all.vcf")
    with open(vcf, "w", encoding="utf-8") as f:
        f.write("BEGIN:VCARD\nVERSION:3.0\nN:Example;דנה סיור;;;\nFN:דנה סיור Example\nTEL;type=CELL:+972 52-1234567\n"
                "NOTE:הגיעה עם\n  קבוצה של 12\nCATEGORIES:נובה 2024\nREV:2024-05-12T10:00:00Z\nEND:VCARD\n")
    vp, vm = load_vcf(vcf)
    assert vm == "vcf" and len(vp) == 1 and vp[0].modified and "נובה 2024" in vp[0].groups and "קבוצה של 12" in " ".join(vp[0].text)
    print("demo OK: 600 synthetic contacts -> %d vocab words (local) · tags: nova %d, group %d · IL %d / US %d · timeline %d months · vcf fallback OK"
          % (len(v), tag_nova, grp, il, us, len(tl)))
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn in (("vocab", cmd_vocab), ("count", cmd_count)):
        s = sub.add_parser(name)
        s.add_argument("--db", default="auto", help="path to AddressBook-v22.abcddb, or 'auto'")
        s.add_argument("--vcf", help="vCard export instead of the database")
        s.set_defaults(fn=fn)
        if name == "vocab":
            s.add_argument("-o", "--output", default="vocab_local.csv")
            s.add_argument("--min", type=int, default=5, help="word must appear in at least this many contacts")
            s.add_argument("--tags-out", default="tags.txt")
        else:
            s.add_argument("--tags", default="tags.txt")
            s.add_argument("-o", "--output", default="contacts_counts.csv")
    d = sub.add_parser("demo")
    d.set_defaults(fn=cmd_demo)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
