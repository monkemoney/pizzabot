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
  1. The live Contacts database — one SQLite store PER ACCOUNT (iCloud, Google, Exchange, "On My Mac"):
       ~/Library/Application Support/AddressBook/Sources/<UUID>/AddressBook-v22.abcddb
       ~/Library/Application Support/AddressBook/AddressBook-v22.abcddb      (root — usually EMPTY on an iCloud Mac)
     Needs Full Disk Access for Terminal, granted IN ADVANCE in System Settings → Privacy & Security
     (macOS never prompts; the symptom without it is 'Operation not permitted'). Creation date per contact kept.
     The tool prints one line per store ('<UUID or root>: N people, G groups') — the biggest one is hers; two
     big ones = the same people in two accounts, rerun with --db pointed at the largest.
  2. A Contacts Archive (Contacts → File → Export → Contacts Archive… → ~/farm-data/Contacts.abbu): --db Contacts.abbu
     The SAME SQLite store, written to a folder you pick, so NO Full Disk Access is needed; creation dates,
     notes and groups are all kept. Inside: X.abbu/AddressBook-v22.abcddb + X.abbu/Sources/*/AddressBook-v22.abcddb
     (auto mode also looks for ~/farm-data/*.abbu). Delete it at the end of the day — it holds every name and phone.
  3. A vCard export (Contacts → select all → File → Export → Export vCard…): --vcf all.vcf
     No creation date; REV = last modified is used instead, and the output says so. Export with
     'Export photos in vCards' OFF and 'Export notes in vCards' ON (Contacts → Settings… → vCard).

Creation date ≈ first meeting ONLY if the account has lived on this Mac since then. A library synced in
later stamps thousands of contacts with the same month — `count` warns when one month holds more than 25%
of all creation dates; the growth curve before that month is then not evidence.

  contacts.py vocab   [--db auto | --db X.abbu | --vcf all.vcf] -o vocab_local.csv --min 5
  contacts.py count   [--db auto | --db X.abbu | --vcf all.vcf] --tags tags.txt -o contacts_counts.csv
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
from collections import Counter
from datetime import datetime, timedelta, timezone

CORE_DATA_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)
DB_NAME = "AddressBook-v22.abcddb"

# Z_PRIMARYKEY maps Z_ENT numbers to entity names. The NUMBERS are assigned per Core Data model version
# (contact 19→22, group 15→19 over the years), so rows are classified by NAME. Every store also holds one
# CNCDContainer row and one ABCDInfo row — neither a person nor a group — which the old bool(ZNAME) rule
# counted as nameless people with year 'unknown'.
PEOPLE_ENTITIES = {"ABCDContact", "ABCDSubscribedContact"}
GROUP_ENTITIES = {"ABCDGroup"}

DEFAULT_TAGS = [
    "סיור,tour,visit,ביקור",
    "נובה,nova",
    "חייל,חיילים,חיילת,soldier,soldiers,idf,צה\"ל,צהל",
    "מילואים,reserve,reservist",
    "פצוע,פצועים,wounded,הלום,הלומי,ptsd",
    "בית ספר,ביה\"ס,school",
    "גן ילדים,גני ילדים,kindergarten,preschool",
    "קייטנה,camp",
    "טיפול,טיפולי,therapy,therapeutic",
    "צרכים מיוחדים,special needs,autism,אוטיזם",
    "מתנדב,מתנדבת,מתנדבים,volunteer",
    "תורם,תורמת,donor,donation,תרומה",
    "אלפקה,אלפקות,alpaca",
    "יום הולדת,birthday",
    "שבת בחווה,שבתות,shabbat,קהילה,community,חב\"ד,chabad",
    "עיתונאי,press,כתב,journalist",
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


STOP = set("the and for from with של את על עם אל לא כן זה זו הוא היא אני אתה מר גב ד״ר דר mr mrs ms dr "
           "iphone whatsapp mobile cell home work phone email inc llc".split())


# ----------------------------------------------------------------------------- sources

class Contact:
    __slots__ = ("text", "created", "modified", "phones", "groups", "is_group", "name")

    def __init__(self):
        self.text, self.created, self.modified = [], None, None
        self.phones, self.groups, self.is_group, self.name = [], [], False, ""


def abbu_dbs(archive):
    """The SQLite stores inside a Contacts Archive (X.abbu): the root one plus one per account under Sources/."""
    archive = archive.rstrip("/")
    return sorted(glob.glob(os.path.join(archive, DB_NAME)) +
                  glob.glob(os.path.join(archive, "Sources", "*", DB_NAME)))


def find_db():
    """Live stores first (need Full Disk Access); otherwise any Contacts Archive saved under ~/farm-data."""
    base = os.path.expanduser("~/Library/Application Support/AddressBook")
    found = sorted(glob.glob(os.path.join(base, "Sources", "*", DB_NAME)) + glob.glob(os.path.join(base, DB_NAME)))
    if found:
        return found
    for arch in sorted(glob.glob(os.path.expanduser("~/farm-data/*.abbu"))):
        found.extend(abbu_dbs(arch))
    return found


def db_label(path):
    """'<UUID>' for a Sources/<UUID>/ store (live or inside an .abbu), 'root' for the top-level one."""
    d = os.path.dirname(os.path.abspath(path))
    if os.path.basename(os.path.dirname(d)) == "Sources":
        return os.path.basename(d)
    return "root"


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
    """Copy the db (+wal) to temp so Contacts' own lock never matters, then read. Returns (people, groups)."""
    tmp = tempfile.mkdtemp(prefix="contacts-")
    try:
        dst = os.path.join(tmp, "ab.db")
        shutil.copy2(path, dst)
        for ext in ("-wal", "-shm"):
            if os.path.exists(path + ext):
                shutil.copy2(path + ext, dst + ext)
        con = sqlite3.connect("file:%s?mode=ro" % dst, uri=True)
        try:
            return _read_db(con)
        finally:
            con.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _read_db(con):
    con.row_factory = sqlite3.Row
    cols = table_cols(con, "ZABCDRECORD")
    if not cols:
        tables = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
        raise SystemExit("ZABCDRECORD not found; tables: %s" % tables[:40])
    # Classify by entity name through Z_PRIMARYKEY (see PEOPLE_ENTITIES); the bool(ZNAME) heuristic is kept
    # ONLY for a store without Z_PRIMARYKEY, where container/info rows would leak in as nameless people.
    entities = None
    if "Z_ENT" in cols:
        try:
            entities = {r[0]: r[1] for r in con.execute("select Z_ENT, Z_NAME from Z_PRIMARYKEY")}
        except sqlite3.Error:
            entities = None
        if entities is not None and not (set(entities.values()) & PEOPLE_ENTITIES):
            entities = None   # a Z_PRIMARYKEY that names no contact entity is not one we understand
    want = ["Z_PK", "Z_ENT", "ZFIRSTNAME", "ZLASTNAME", "ZMIDDLENAME", "ZNICKNAME", "ZORGANIZATION",
            "ZJOBTITLE", "ZDEPARTMENT", "ZNAME", "ZCREATIONDATE", "ZMODIFICATIONDATE"]
    have = [c for c in want if c in cols]
    contacts = {}
    for r in con.execute("select %s from ZABCDRECORD" % ", ".join(have)):
        if entities is not None:
            ent = entities.get(r["Z_ENT"])
            if ent in GROUP_ENTITIES:
                is_group = True
            elif ent in PEOPLE_ENTITIES:
                is_group = False
            else:
                continue   # CNCDContainer, ABCDInfo, anything else: neither a person nor a group
        else:
            is_group = bool(r["ZNAME"]) if "ZNAME" in have else False
        c = Contact()
        c.is_group = is_group
        if is_group:
            c.name = r["ZNAME"] if "ZNAME" in have and r["ZNAME"] else ""
        else:
            c.name = " ".join(str(r[k]) for k in ("ZFIRSTNAME", "ZMIDDLENAME", "ZLASTNAME") if k in have and r[k])
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
    # Group membership: a join table pairing a *CONTACTS column with a *PARENTGROUPS column. Its NAME varies by
    # macOS version because the numbers are entity ids — current (13→26): Z_22PARENTGROUPS (Z_22CONTACTS,
    # Z_19PARENTGROUPS1); older: Z_19PARENTGROUPS (Z_19CONTACTS, Z_15PARENTGROUPS1). Z_18PARENTGROUPS
    # (Z_18CHILDGROUPS, Z_19PARENTGROUPS) is group-inside-group nesting, not membership — no *CONTACTS column,
    # so it is skipped. '_' is a LIKE wildcard: escaped, or every ZABCD* table is scanned too.
    for (tname,) in con.execute("select name from sqlite_master where type='table' and name like 'Z\\_%' escape '\\'"):
        tc = table_cols(con, tname)
        gcol = next((c for c in tc if "PARENTGROUPS" in c.upper() or c.upper().endswith("GROUPS")), None)
        ccol = next((c for c in tc if c.upper().endswith("CONTACTS") or c.upper().endswith("MEMBERS")), None)
        if gcol and ccol:
            for r in con.execute("select %s g, %s c from %s" % (gcol, ccol, tname)):
                g, m = contacts.get(r["g"]), contacts.get(r["c"])
                if g and m and g.is_group and not m.is_group:
                    m.groups.append(g.name)
    people = [c for c in contacts.values() if not c.is_group]
    groups = [c for c in contacts.values() if c.is_group]
    return people, groups


def unfold_vcf(lines):
    """Yield logical vCard lines, joining folded continuations (a line starting with space/tab).
    Streams — a photo-inclusive 40k export can be gigabytes, so the file is never read whole."""
    cur = None
    for ln in lines:
        ln = ln.rstrip("\r\n")
        if ln[:1] in (" ", "\t") and cur is not None:
            cur += ln[1:]
            continue
        if cur is not None:
            yield cur
        cur = ln
    if cur is not None:
        yield cur


def load_vcf(path):
    people, cur = [], None
    n_note = n_cat = n_photo = 0
    with open(path, encoding="utf-8", errors="replace") as f:
        for ln in unfold_vcf(f):
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
                    elif k == "NOTE":
                        n_note += 1
                elif k == "TEL":
                    cur.phones.append(val)
                elif k == "CATEGORIES":
                    cur.groups.extend(v for v in val.split(",") if v)
                    n_cat += 1
                elif k == "PHOTO":
                    n_photo += 1
                elif k == "REV":
                    try:
                        cur.modified = datetime.fromisoformat(val.replace("Z", "+00:00"))
                    except ValueError:
                        pass
    print("vcf: %d cards — %d NOTE, %d CATEGORIES, %d PHOTO lines" % (len(people), n_note, n_cat, n_photo))
    print("reminder: the export must be made with 'Export photos in vCards' OFF and 'Export notes in vCards' ON "
          "(Contacts → Settings… → vCard). 0 NOTE lines = her notes were not exported; PHOTO lines = photos were. "
          "Years here are REV = last modified, not creation.")
    return people, "vcf"


def load(args):
    if getattr(args, "vcf", None):
        return load_vcf(args.vcf)
    if args.db in (None, "auto"):
        dbs = find_db()
        if not dbs:
            raise SystemExit("no Contacts database found — grant Full Disk Access to Terminal (System Settings → Privacy & "
                             "Security → Full Disk Access, then quit and reopen Terminal), or export a Contacts Archive "
                             "(File → Export → Contacts Archive…) and pass --db X.abbu, or a vCard and pass --vcf all.vcf")
    elif args.db.rstrip("/").endswith(".abbu"):
        dbs = abbu_dbs(args.db)
        if not dbs:
            raise SystemExit("no %s inside %s — is it a Contacts Archive (File → Export → Contacts Archive…)?" % (DB_NAME, args.db))
    else:
        dbs = [args.db]
    people, opened, sizes = [], 0, []
    for p in dbs:
        label = db_label(p)
        where = "root %s" % DB_NAME if label == "root" else "Sources/%s" % label
        try:
            got, groups = load_db(p)
        except (sqlite3.Error, SystemExit, OSError) as e:
            # a stale or disabled account leaves a .abcddb that never opens — one bad folder must not abort the run
            print("warning: %s: %s — skipped (a stale or disabled account folder?)" % (where, e), file=sys.stderr)
            continue
        opened += 1
        print("%s: %d people, %d groups" % (label, len(got), len(groups)))
        people.extend(got)
        sizes.append((len(got), p))
    if not opened:
        raise SystemExit("none of the %d Contacts database(s) could be read — see the warnings above" % len(dbs))
    big = [s for s in sizes if s[0] > 100]
    if len(big) > 1:
        print("warning: possible duplicates across accounts — consider --db \"%s\"" % short(max(big)[1]), file=sys.stderr)
    if not people:
        print("warning: 0 people — on an iCloud Mac the root store is empty; the contacts live under Sources/<UUID>/",
              file=sys.stderr)
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
    group_codes = {}
    for c in people:
        blob = (" ".join(c.text) + " " + " ".join(c.groups)).lower()   # a group named "נובה" tags its members
        yr = year_of(c, mode)
        per_year[yr] += 1
        timeline[month_of(c)] += 1
        hit_any = False
        for tag, syns in tags:
            if tag_matches(blob, syns):
                counts[("tag", tag, yr)] += 1
                hit_any = True
        if hit_any:
            counts[("tag", "_any_tag", yr)] += 1
        for g in set(c.groups):
            # group names are Limor's free text (a group can be a family or a person) -> coded in the
            # shareable file; the code -> name map goes to contacts_groups_local.csv on this Mac
            counts[("group", group_codes.setdefault(g, "group_%02d" % (len(group_codes) + 1)), yr)] += 1
        countries = {phone_country(p) for p in c.phones} or {"none"}
        for k in countries:
            counts[("phone_country", k, yr)] += 1
    rows = [{"dimension": d, "key": k, "year": y, "n": n} for (d, k, y), n in sorted(counts.items(), key=lambda kv: (kv[0][0], str(kv[0][2]), -kv[1]))]
    rows += [{"dimension": "all", "key": "contacts", "year": y, "n": n} for y, n in sorted(per_year.items(), key=lambda kv: str(kv[0]))]
    tl = [{"month": m, "created": n} for m, n in sorted(timeline.items())]
    return rows, tl, group_codes


def sync_spike_warning(tl):
    """One month holding more than 25% of all creation dates is how a synced-in library presents: the stamp
    is when the records first landed on THIS Mac, not when she met the people. Returns the warning or None."""
    known = [(r["month"], r["created"]) for r in tl if r["month"] != "unknown"]
    total = sum(n for _, n in known)
    if not total:
        return None
    month, n = max(known, key=lambda mn: mn[1])
    if n * 4 <= total:
        return None
    return ("warning: %s holds %d of %d dated contacts (%d%%) — creation dates look like an iCloud first-sync stamp, "
            "not first-meeting dates — the 2020-2022 curve is not evidence (use the curve from that month on, or --vcf REV years)"
            % (month, n, total, 100 * n // total))


def vocab(people, min_n=5):
    df = Counter()
    for c in people:
        for t in tokens(c):
            if t not in STOP and not t.isdigit():
                df[t] += 1
    return [{"word": w, "contacts": n} for w, n in df.most_common() if n >= min_n]


# ----------------------------------------------------------------------------- commands

def short(path):
    """Paths in printed lines: basename only, or ~ for the home folder — a full path carries her macOS username."""
    home = os.path.expanduser("~")
    p = str(path)
    return p.replace(home, "~") if p.startswith(home) else os.path.basename(p)


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
    print("vocab: %d contacts (%s) -> %d words in ≥%d contacts -> %s" % (len(people), mode, len(rows), args.min, short(args.output)))
    print("LOCAL ONLY — first names are in there. Read it with Limor, pick her tag words into tags.txt.")
    if not os.path.exists(args.tags_out):
        with open(args.tags_out, "w", encoding="utf-8") as f:
            f.write("# one tag per line; synonyms comma-separated; lines starting with # are ignored\n")
            f.write("\n".join(DEFAULT_TAGS) + "\n")
        print("wrote starter tags -> %s (edit it)" % args.tags_out)


def cmd_count(args):
    people, mode = load(args)
    tags = load_tags(args.tags)
    rows, tl, group_codes = count(people, tags, mode)
    write_csv(args.output, ["dimension", "key", "year", "n"], rows)
    tpath = os.path.join(os.path.dirname(os.path.abspath(args.output)), "contacts_timeline.csv")
    write_csv(tpath, ["month", "created"], tl)
    gpath = os.path.join(os.path.dirname(os.path.abspath(args.output)), "contacts_groups_local.csv")
    write_csv(gpath, ["code", "group"], [{"code": c, "group": g} for g, c in group_codes.items()])
    tagged = sum(r["n"] for r in rows if r["dimension"] == "tag" and r["key"] == "_any_tag")
    print("count: %d contacts, %d matched a tag (%s) -> %s, %s" % (len(people), tagged, "creation date" if mode == "db" else "REV = last-modified, not creation", short(args.output), short(tpath)))
    if mode == "db":
        spike = sync_spike_warning(tl)
        if spike:
            print(spike, file=sys.stderr)
    for r in rows:
        if r["dimension"] == "tag" and r["key"] != "_any_tag" and r["n"] >= 5:
            print("  %-22s %s  %5d" % (r["key"], r["year"], r["n"]))
    print("shareable: counts only — no name, phone or email exists in either file")


# ----------------------------------------------------------------------------- demo

def synthetic_db(path, n=600, spike=False, primarykey=True):
    """A store in the real macOS 13→26 shape. spike=True stamps 60% of the contacts into one month (a library
    that was synced in); primarykey=False omits Z_PRIMARYKEY (and the phantom rows) to exercise the ZNAME fallback."""
    import random
    rnd = random.Random(3)
    con = sqlite3.connect(path)
    # Membership join: Z_22PARENTGROUPS (Z_22CONTACTS → contact Z_PK, Z_19PARENTGROUPS1 → group Z_PK) on current
    # macOS — the numbers are Core Data entity ids (ABCDContact 22, ABCDGroup 19). Older macOS used
    # Z_19PARENTGROUPS (Z_19CONTACTS, Z_15PARENTGROUPS1). Z_18PARENTGROUPS (Z_18CHILDGROUPS, Z_19PARENTGROUPS)
    # is group-inside-group nesting, NOT contact membership — load_db must skip it (no *CONTACTS column).
    con.executescript("""
    create table ZABCDRECORD (Z_PK integer primary key, Z_ENT integer, ZFIRSTNAME text, ZLASTNAME text, ZMIDDLENAME text,
        ZNICKNAME text, ZORGANIZATION text, ZJOBTITLE text, ZDEPARTMENT text, ZNAME text, ZCREATIONDATE real, ZMODIFICATIONDATE real);
    create table ZABCDNOTE (Z_PK integer primary key, ZCONTACT integer, ZTEXT text);
    create table ZABCDPHONENUMBER (Z_PK integer primary key, ZOWNER integer, ZFULLNUMBER text);
    create table Z_22PARENTGROUPS (Z_22CONTACTS integer, Z_19PARENTGROUPS1 integer, primary key (Z_22CONTACTS, Z_19PARENTGROUPS1));
    create table Z_18PARENTGROUPS (Z_18CHILDGROUPS integer, Z_19PARENTGROUPS integer, primary key (Z_18CHILDGROUPS, Z_19PARENTGROUPS));
    """)
    ent_contact, ent_group, ent_container, ent_info = 22, 19, 25, 17   # 22/19 are the real current ids; 25/17 illustrative
    if primarykey:
        con.execute("create table Z_PRIMARYKEY (Z_ENT integer primary key, Z_NAME varchar, Z_SUPER integer, Z_MAX integer)")
        con.executemany("insert into Z_PRIMARYKEY values (?, ?, 0, 0)",
                        [(ent_contact, "ABCDContact"), (ent_group, "ABCDGroup"), (ent_container, "CNCDContainer"), (ent_info, "ABCDInfo")])
        # one CNCDContainer + one ABCDInfo row per store — no name, no dates; by the ZNAME rule they were nameless 'people'
        con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT) values (?, ?)", (9100, ent_container))
        con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT) values (?, ?)", (9101, ent_info))
    gid, parent_gid = 9001, 9002
    con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT, ZNAME) values (?, ?, ?)", (gid, ent_group, "נובה 2024"))
    con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT, ZNAME) values (?, ?, ?)", (parent_gid, ent_group, "ארכיון קבוצות"))
    con.execute("insert into Z_18PARENTGROUPS values (?, ?)", (gid, parent_gid))   # group nesting, not membership
    first = ["דנה", "אלי", "נועה", "יוסי", "Sarah", "Michael", "רחל", "David"]
    last = ["Example", "לדוגמה", "Test", "בדיקה"]
    kw = ["סיור", "נובה", "חייל", "מילואים", "", "", "", "בית ספר", "מתנדבת", "tour"]
    start = datetime(2020, 6, 1, tzinfo=timezone.utc)
    first_sync = datetime(2023, 3, 1, tzinfo=timezone.utc)
    for i in range(1, n + 1):
        if spike and i <= n * 6 // 10:
            created = first_sync + timedelta(days=rnd.randint(0, 27))
        else:
            created = start + timedelta(days=rnd.randint(0, 2200))
        k = rnd.choice(kw)
        fn = rnd.choice(first) + (" " + k if k and rnd.random() < 0.7 else "")
        con.execute("insert into ZABCDRECORD (Z_PK, Z_ENT, ZFIRSTNAME, ZLASTNAME, ZORGANIZATION, ZCREATIONDATE, ZMODIFICATIONDATE) values (?,?,?,?,?,?,?)",
                    (i, ent_contact, fn, rnd.choice(last), "Nova community" if k == "נובה" and rnd.random() < 0.5 else None,
                     (created - CORE_DATA_EPOCH).total_seconds(), (created - CORE_DATA_EPOCH).total_seconds() + 86400))
        if k and rnd.random() < 0.3:
            con.execute("insert into ZABCDNOTE (ZCONTACT, ZTEXT) values (?, ?)", (i, "הגיע ל%s עם המשפחה" % k))
        num = "+972 5%d-%07d" % (rnd.randint(0, 8), rnd.randint(0, 9999999)) if rnd.random() < 0.4 else "(818) 555-%04d" % rnd.randint(0, 9999)
        con.execute("insert into ZABCDPHONENUMBER (ZOWNER, ZFULLNUMBER) values (?, ?)", (i, num))
        if k == "נובה":
            con.execute("insert into Z_22PARENTGROUPS values (?, ?)", (i, gid))
    con.commit()
    con.close()


def cmd_demo(_args):
    import contextlib
    import io

    def captured(fn, *a):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            res = fn(*a)
        return res, buf.getvalue()

    tmp = tempfile.mkdtemp(prefix="contacts-demo-")
    # The store laid out exactly as a Contacts Archive (and the live folder) has it: X.abbu/Sources/<UUID>/AddressBook-v22.abcddb
    uuid = "8F026174-DEMO-4000-8000-000000000001"
    arch = os.path.join(tmp, "Contacts.abbu")
    db = os.path.join(arch, "Sources", uuid, DB_NAME)
    os.makedirs(os.path.dirname(db))
    synthetic_db(db)
    raw = sqlite3.connect(db).execute("select count(*) from ZABCDRECORD").fetchone()[0]
    assert raw == 604, raw   # 600 people + 2 groups + CNCDContainer + ABCDInfo
    people, groups = load_db(db)
    mode = "db"
    assert len(people) == 600 and len(groups) == 2, (len(people), len(groups))   # container/info rows are NOT people
    assert all(c.created for c in people) and not any(c.is_group for c in people)
    assert {g.name for g in groups} == {"נובה 2024", "ארכיון קבוצות"}, [g.name for g in groups]
    nova_group = sum(1 for c in people if "נובה 2024" in c.groups)
    assert nova_group > 20, nova_group
    assert not any("ארכיון קבוצות" in c.groups for c in people)   # Z_18PARENTGROUPS nesting is not membership
    v = vocab(people, 5)
    words = {r["word"] for r in v}
    assert {"סיור", "נובה", "חייל", "example"} <= words, words   # first names DO appear -> local only
    rows, tl, group_codes = count(people, load_tags(None), mode)
    out = os.path.join(tmp, "contacts_counts.csv")
    write_csv(out, ["dimension", "key", "year", "n"], rows)
    tpath = os.path.join(tmp, "contacts_timeline.csv")
    write_csv(tpath, ["month", "created"], tl)
    text = open(out, encoding="utf-8").read() + open(tpath, encoding="utf-8").read()
    for bad in ("דנה", "Sarah", "Example", "555", "972", "לדוגמה", tmp, uuid):
        assert bad not in text, "shareable file leaked: %s" % bad
    tag_nova = sum(r["n"] for r in rows if r["dimension"] == "tag" and r["key"] == "נובה")
    nova_code = group_codes.get("נובה 2024")
    assert nova_code and nova_code.startswith("group_"), group_codes
    grp = sum(r["n"] for r in rows if r["dimension"] == "group" and r["key"] == nova_code)
    assert "נובה 2024" not in text, "raw group name reached the shareable file"
    assert grp == nova_group and tag_nova >= grp, (tag_nova, grp)
    il = sum(r["n"] for r in rows if r["dimension"] == "phone_country" and r["key"] == "IL")
    us = sum(r["n"] for r in rows if r["dimension"] == "phone_country" and r["key"] == "US")
    assert il + us == 600 and 150 < il < 330, (il, us)
    assert sum(r["created"] for r in tl) == 600 and tl[0]["month"] >= "2020-06"
    assert sync_spike_warning(tl) is None   # 600 contacts spread over six years: no month dominates
    # --db X.abbu globs every store inside the archive; a stale account folder is warned about and skipped, never fatal
    stale_a = os.path.join(arch, "Sources", "DEADBEEF-0000-4000-8000-000000000002", DB_NAME)   # valid sqlite, no ZABCDRECORD
    stale_b = os.path.join(arch, "Sources", "DEADBEEF-0000-4000-8000-000000000003", DB_NAME)   # not a database at all
    for s in (stale_a, stale_b):
        os.makedirs(os.path.dirname(s))
    con = sqlite3.connect(stale_a)
    con.execute("create table t (x)")
    con.commit()
    con.close()
    with open(stale_b, "wb") as f:
        f.write(b"not a database")
    (p2, m2), log = captured(load, argparse.Namespace(db=arch, vcf=None))
    assert m2 == "db" and len(p2) == 600, len(p2)
    assert "%s: 600 people, 2 groups" % uuid in log, log
    assert log.count("skipped") == 2 and "Sources/DEADBEEF-0000-4000-8000-000000000002" in log and "Sources/DEADBEEF-0000-4000-8000-000000000003" in log, log
    assert "possible duplicates" not in log, log
    # the same people in a second account (iCloud + Google): per-store lines make it visible and a warning names the largest
    dup = os.path.join(arch, "Sources", "0C0FFEE0-0000-4000-8000-000000000004", DB_NAME)
    os.makedirs(os.path.dirname(dup))
    shutil.copy2(db, dup)
    (p3, _), log = captured(load, argparse.Namespace(db=arch, vcf=None))
    assert len(p3) == 1200 and "possible duplicates across accounts — consider --db" in log, log
    # a synced-in library (60% of creation dates in one month), stored WITHOUT Z_PRIMARYKEY so the ZNAME fallback runs too
    spike_db = os.path.join(tmp, "spike", DB_NAME)
    os.makedirs(os.path.dirname(spike_db))
    synthetic_db(spike_db, n=300, spike=True, primarykey=False)
    sp, sg = load_db(spike_db)
    assert len(sp) == 300 and len(sg) == 2, (len(sp), len(sg))
    _, log = captured(cmd_count, argparse.Namespace(db=spike_db, vcf=None, tags=None, output=os.path.join(tmp, "spike_counts.csv")))
    assert "creation dates look like an iCloud first-sync stamp, not first-meeting dates — the 2020-2022 curve is not evidence" in log, log
    assert "warning: 2023-03 holds" in log and "of 300 dated contacts" in log, log   # the sync month is named, not just flagged
    # vcf fallback — folded NOTE and PHOTO lines, read as a stream
    vcf = os.path.join(tmp, "all.vcf")
    with open(vcf, "w", encoding="utf-8") as f:
        f.write("BEGIN:VCARD\nVERSION:3.0\nN:Example;דנה סיור;;;\nFN:דנה סיור Example\nTEL;type=CELL:+972 52-1234567\n"
                "NOTE:הגיעה עם\n  קבוצה של 12\nPHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRg\n AAAQABAAD/2wBDAA\n"
                "CATEGORIES:נובה 2024\nREV:2024-05-12T10:00:00Z\nEND:VCARD\n")
    (vp, vm), log = captured(load_vcf, vcf)
    assert vm == "vcf" and len(vp) == 1 and vp[0].modified and "נובה 2024" in vp[0].groups and "קבוצה של 12" in " ".join(vp[0].text)
    assert "1 NOTE, 1 CATEGORIES, 1 PHOTO" in log and "'Export photos in vCards' OFF" in log and "'Export notes in vCards' ON" in log, log
    print("demo OK: 600 synthetic contacts (+2 groups, container/info rows excluded) -> %d vocab words (local) · tags: nova %d, group %d · "
          "IL %d / US %d · timeline %d months, no sync spike · .abbu: 2 stale stores skipped, duplicate account flagged · "
          "first-sync spike warned · vcf fallback OK" % (len(v), tag_nova, grp, il, us, len(tl)))
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn in (("vocab", cmd_vocab), ("count", cmd_count)):
        s = sub.add_parser(name)
        s.add_argument("--db", default="auto", help="path to AddressBook-v22.abcddb, a Contacts Archive (X.abbu), or 'auto'")
        s.add_argument("--vcf", help="vCard export instead of the database (REV years, not creation)")
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
