#!/usr/bin/env python3
"""runlog.py — the learning layer of the extraction system (ops tool, D13).

Every checklist step is logged as it runs: when it started, when it ended, whether it worked,
what failed, what fixed it. At the end `report` writes RUNREPORT.md — the ONLY narrative that
travels back to Nave's remote session — and `manifest` writes manifest.json, the data contract
the future monitoring system reads (which files, how many rows, which columns, which tool
versions, schema version). Nothing personal: notes are refused if they look like a phone
number, an email, a path with a username, or a long digit run.

  runlog.py start 7                          # step 7 began (id = checklist number, or any short label)
  runlog.py done  7 --status ok|fail|skip|workaround [--error "class"] [--fix "what"] [--note "..."]
  runlog.py note  7 --note "..."             # observation mid-step
  runlog.py answer 4 --text "Mac since 2022, iCloud since 2019"   # Limor's answers 1-7 (no names)
  runlog.py manifest                          # -> manifest.json (shareable files, rows, columns, hashes, env)
  runlog.py report                            # -> RUNREPORT.md (paste back to Nave)
  runlog.py demo

Storage: runlog.jsonl in the working folder, append-only. Python 3.9+, standard library only.
"""
import argparse
import csv
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
from collections import OrderedDict, defaultdict
from datetime import datetime

SCHEMA_VERSION = "1.0"
LOG = "runlog.jsonl"

# checklist step -> (section, title). Any other id is accepted as an ad-hoc step.
STEPS = OrderedDict([
    ("1", ("A", "bundle → AirDrop → ~/farm-data · Claude Code")), ("2", ("A", "library full? disk? Photos quit")),
    ("3", ("A", "uv + python3.13 + osxphotos")), ("4", ("A", "Full Disk Access → FDA OK")),
    ("5", ("B", "timeline demo")), ("6", ("B", "osxphotos --count")), ("7", ("B", "osxphotos --json export")),
    ("8", ("B", "scrub + cluster (+calendar)")), ("9", ("B", "farm coordinates confirmed")), ("10", ("B", "events_seed look together")),
    ("11", ("C", "contacts vocab + tags.txt")), ("12", ("C", "contacts count")),
    ("13", ("C2", "calendar .ics exports")), ("14", ("C2", "cal_events scan")),
    ("15", ("D", "Wix: invite Tiran")), ("16", ("D", "Wix: payments summary")), ("17", ("D", "Wix: payments header row")),
    ("18", ("E", "Instagram export started")),
    ("19", ("F", "delete raw · ls")), ("20", ("F", "FDA + Contacts permission removed")),
])
SECTION_NAMES = {"A": "setup", "B": "photos", "C": "contacts", "C2": "calendar", "D": "wix", "E": "instagram", "F": "close", "X": "ad-hoc"}

# the data contract: shareable files and the columns the monitoring system may rely on
CONTRACT = OrderedDict([
    ("events_seed_share.csv", ["event_id", "date", "weekday", "place", "first_time", "last_time", "photos", "videos", "max_faces",
                               "favorites", "albums", "ig_posts", "ig_caption", "cal_events", "cal_tag", "cal_headcount", "cal_hours",
                               "type", "population", "headcount", "partner", "evidence_grade", "notes"]),
    ("calendar_events.csv", ["event_id", "date", "weekday", "start", "end", "hours", "all_day", "calendar", "recurring", "tag",
                             "tags_all", "headcount_hint", "attendees", "at_farm", "has_location", "evidence_grade"]),
    ("contacts_counts.csv", ["dimension", "key", "year", "n"]),
    ("contacts_timeline.csv", ["month", "created"]),
    ("tags.txt", None),
    ("ledger.csv", ["row_id", "date", "year", "month", "source", "source_file", "direction", "amount", "currency", "category",
                    "cp_id", "cp_type", "kind", "external_id", "counted", "dup_of", "receipt_ref"]),
    ("money_summary.csv", ["year", "month", "direction", "category", "source", "n", "total"]),
    ("receipts_summary.csv", ["month", "direction", "category", "from_kind", "n", "total"]),
    ("questions.csv", None),
    ("raw/checks/wix_payments_summary.csv", None),
])
LOCAL_ONLY = ["photos_meta.json", "photos_meta.csv", "events_seed.csv", "albums_local.csv", "vocab_local.csv",
              "contacts_groups_local.csv", "calendar_local.csv", "counterparties_local.csv", "receipts.csv",
              "processing_log.csv", "raw/", "ics/", "local/", "accountant/", "Contacts.abbu", "all.vcf"]
TOOLS = ["timeline.py", "contacts.py", "cal_events.py", "ledger.py", "mail_ledger.py", "runlog.py"]

PII_RE = re.compile(r"(\d[\d\-\s().]{6,}\d)|(@[\w.]+)|(/Users/\w+)|(\b\+?\d{9,}\b)")


# ----------------------------------------------------------------------------- log

def now():
    return datetime.now().isoformat(timespec="seconds")


def check_note(text):
    if text and PII_RE.search(text):
        raise SystemExit("note refused: looks like a phone/email/path/digit run. Describe without identifiers.")
    return text or ""


def append(rec, path=LOG):
    rec = {"ts": now(), **rec}
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def read_log(path=LOG):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if ln:
                try:
                    out.append(json.loads(ln))
                except ValueError:
                    continue
    return out


def cmd_start(a):
    append({"event": "start", "step": a.step, "note": check_note(a.note)}, a.log)
    print("▶ %s %s" % (a.step, STEPS.get(a.step, ("X", ""))[1]))


def cmd_done(a):
    rec = append({"event": "done", "step": a.step, "status": a.status, "error": check_note(a.error),
                  "fix": check_note(a.fix), "note": check_note(a.note)}, a.log)
    mark = {"ok": "✓", "fail": "✗", "skip": "–", "workaround": "~"}[a.status]
    print("%s %s %s %s" % (mark, a.step, STEPS.get(a.step, ("X", ""))[1], ("· " + rec["note"]) if rec["note"] else ""))


def cmd_note(a):
    append({"event": "note", "step": a.step, "note": check_note(a.note)}, a.log)
    print("· noted")


def cmd_answer(a):
    append({"event": "answer", "q": a.q, "text": check_note(a.text)}, a.log)
    print("· answer %s recorded" % a.q)


# ----------------------------------------------------------------------------- manifest

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def csv_shape(path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        header = next(r, [])
        n = sum(1 for _ in r)
    return header, n


def environment():
    env = {"macos": platform.mac_ver()[0] or platform.platform(), "python": platform.python_version(),
           "schema_version": SCHEMA_VERSION}
    for tool, args in (("osxphotos", ["osxphotos", "--version"]), ("uv", ["uv", "--version"])):
        try:
            out = subprocess.run(args, capture_output=True, text=True, timeout=20).stdout.strip()
            env[tool] = out.split("\n")[0][:60]
        except Exception:  # noqa: BLE001 — tool absent is a fact to record, not an error
            env[tool] = "not found"
    return env


def build_manifest(root="."):
    files = []
    drift = []
    for name, cols in CONTRACT.items():
        p = os.path.join(root, name)
        entry = {"file": name, "present": os.path.exists(p)}
        if entry["present"]:
            entry["bytes"] = os.path.getsize(p)
            entry["sha256_16"] = sha256(p)
            if name.endswith(".csv"):
                header, n = csv_shape(p)
                entry["rows"] = n
                entry["columns"] = header
                if cols is not None and header != cols:
                    entry["schema_drift"] = True
                    drift.append(name)
            else:
                with open(p, encoding="utf-8", errors="replace") as f:
                    entry["rows"] = sum(1 for ln in f if ln.strip() and not ln.startswith("#"))
        files.append(entry)
    local = [{"file": n, "present": os.path.exists(os.path.join(root, n))} for n in LOCAL_ONLY]
    tools = {t: (sha256(os.path.join(root, t)) if os.path.exists(os.path.join(root, t)) else None) for t in TOOLS}
    return {"generated": now(), "schema_version": SCHEMA_VERSION, "environment": environment(),
            "shareable": files, "schema_drift": drift, "local_only_present": [l["file"] for l in local if l["present"]],
            "tools_sha256_16": tools}


def cmd_manifest(a):
    m = build_manifest(a.root)
    with open(a.output, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
    present = [x for x in m["shareable"] if x["present"]]
    print("manifest: %d/%d shareable files present, %s -> %s" % (len(present), len(m["shareable"]),
          ("SCHEMA DRIFT in %s" % ", ".join(m["schema_drift"])) if m["schema_drift"] else "schema OK", a.output))
    if m["local_only_present"]:
        print("local-only files still here (fine until close): %s" % ", ".join(m["local_only_present"]))


# ----------------------------------------------------------------------------- report

def summarize(log):
    steps = OrderedDict()
    answers = OrderedDict()
    for r in log:
        if r.get("event") == "answer":
            answers[r["q"]] = r["text"]
            continue
        st = steps.setdefault(r["step"], {"step": r["step"], "starts": [], "done": None, "notes": []})
        if r["event"] == "start":
            st["starts"].append(r["ts"])
        elif r["event"] == "note":
            st["notes"].append(r["note"])
        elif r["event"] == "done":
            st["done"] = r
    for st in steps.values():
        t0 = st["starts"][0] if st["starts"] else None
        t1 = st["done"]["ts"] if st["done"] else None
        st["minutes"] = round((datetime.fromisoformat(t1) - datetime.fromisoformat(t0)).total_seconds() / 60, 1) if (t0 and t1) else None
        st["attempts"] = len(st["starts"])
        st["status"] = st["done"]["status"] if st["done"] else ("open" if t0 else "never started")
    return steps, answers


def render_report(log, manifest):
    steps, answers = summarize(log)
    lines = ["# RUN REPORT · farm-data · %s" % now()[:16], "",
             "schema %s · macOS %s · python %s · osxphotos %s" % (SCHEMA_VERSION, manifest["environment"].get("macos"),
                                                                    manifest["environment"].get("python"), manifest["environment"].get("osxphotos")), ""]
    # sections
    per_sec = defaultdict(list)
    for sid, (sec, title) in STEPS.items():
        per_sec[sec].append((sid, title, steps.get(sid)))
    for sid, st in steps.items():
        if sid not in STEPS:
            per_sec["X"].append((sid, "(ad-hoc)", st))
    marks = {"ok": "✓", "fail": "✗", "skip": "–", "workaround": "~", "open": "…", "never started": " "}
    total_min = 0.0
    lines += ["## Steps", "", "| | step | what | min | attempts | error → fix / note |", "|---|---|---|---|---|---|"]
    for sec in list(SECTION_NAMES):
        if not per_sec.get(sec):
            continue
        lines.append("| **%s** | | **%s** | | | |" % (sec, SECTION_NAMES[sec]))
        for sid, title, st in per_sec[sec]:
            if st is None:
                lines.append("| %s | %s | %s | | | not run |" % (marks[" "], sid, title))
                continue
            total_min += st["minutes"] or 0
            d = st["done"] or {}
            detail = " ".join(x for x in [
                ("error: " + d["error"]) if d.get("error") else "",
                ("→ fix: " + d["fix"]) if d.get("fix") else "",
                ("· " + d["note"]) if d.get("note") else "",
                ("· notes: " + " | ".join(st["notes"])) if st["notes"] else ""] if x)
            lines.append("| %s | %s | %s | %s | %s | %s |" % (marks.get(st["status"], "?"), sid, title,
                         "" if st["minutes"] is None else st["minutes"], st["attempts"], detail))
    lines += ["", "total logged: %.0f min · steps ok %d · workaround %d · fail %d · skip %d · open %d" % (
        total_min, *[sum(1 for s in steps.values() if s["status"] == k) for k in ("ok", "workaround", "fail", "skip", "open")]), ""]
    # lessons candidates
    cand = [s for s in steps.values() if s["status"] in ("fail", "workaround", "skip") or s["attempts"] > 1 or (s["minutes"] or 0) > 30]
    lines += ["## Lesson candidates (every fail, workaround, skip, retry, or step over 30 min)", ""]
    if not cand:
        lines.append("none — the run went as written")
    for s in cand:
        d = s["done"] or {}
        lines.append("- **%s** %s — %s%s%s%s" % (s["step"], STEPS.get(s["step"], ("", "(ad-hoc)"))[1], s["status"],
                     (" · %d attempts" % s["attempts"]) if s["attempts"] > 1 else "",
                     (" · %.0f min" % s["minutes"]) if s["minutes"] else "",
                     ((" · " + " / ".join(x for x in (d.get("error", ""), d.get("fix", ""), d.get("note", "")) if x))) if d else ""))
    # answers
    lines += ["", "## Limor's answers", ""]
    if not answers:
        lines.append("none recorded")
    for q, t in answers.items():
        lines.append("- %s: %s" % (q, t))
    # manifest
    lines += ["", "## Outputs (manifest)", "", "| file | rows | schema | sha256/16 |", "|---|---|---|---|"]
    for x in manifest["shareable"]:
        if x["present"]:
            lines.append("| %s | %s | %s | %s |" % (x["file"], x.get("rows", ""), "DRIFT" if x.get("schema_drift") else "ok", x["sha256_16"]))
        else:
            lines.append("| %s | – | not produced | |" % x["file"])
    if manifest["local_only_present"]:
        lines += ["", "local-only still present: " + ", ".join(manifest["local_only_present"]) + " (delete raw ones at close)"]
    lines += ["", "tools: " + ", ".join("%s %s" % (t, h or "missing") for t, h in manifest["tools_sha256_16"].items()), ""]
    lines += ["## Next", "", "Paste this file to Nave's remote session. He folds the lesson candidates into the runbooks and tools, "
              "rebuilds the bundle, and the next run starts from the corrected process."]
    return "\n".join(lines)


def cmd_report(a):
    log = read_log(a.log)
    manifest = build_manifest(a.root)
    text = render_report(log, manifest)
    with open(a.output, "w", encoding="utf-8") as f:
        f.write(text)
    if PII_RE.search(text):
        print("WARNING: the report contains something that looks like an identifier — read it before pasting", file=sys.stderr)
    print(text)
    print("\n-> %s (shareable)" % a.output)


# ----------------------------------------------------------------------------- demo

def cmd_demo(_a):
    tmp = tempfile.mkdtemp(prefix="runlog-demo-")
    log = os.path.join(tmp, LOG)
    def a(**kw):
        base = {"log": log, "note": None, "error": None, "fix": None}
        base.update(kw)
        return argparse.Namespace(**base)
    cmd_start(a(step="3")); cmd_done(a(step="3", status="workaround", error="python3.13 not found", fix="source ~/.local/bin/env"))
    cmd_start(a(step="7")); cmd_note(argparse.Namespace(log=log, step="7", note="0 bytes for 20 min, CPU busy")); cmd_done(a(step="7", status="ok"))
    cmd_start(a(step="16")); cmd_done(a(step="16", status="skip", note="no time; Tiran day 2"))
    cmd_answer(argparse.Namespace(log=log, q="4", text="Mac since 2022, iCloud since 2019"))
    # PII refusal
    for bad in ("call 818-555-0199", "mail limor@example.com", "/Users/limor/x"):
        try:
            check_note(bad)
            raise AssertionError("PII accepted: " + bad)
        except SystemExit:
            pass
    # manifest with a contract file, a drifted one, a local-only one
    with open(os.path.join(tmp, "contacts_timeline.csv"), "w", encoding="utf-8") as f:
        f.write("month,created\n2020-06,11\n2020-07,9\n")
    with open(os.path.join(tmp, "contacts_counts.csv"), "w", encoding="utf-8") as f:
        f.write("dimension,key,year,n,EXTRA\ntag,נובה,2024,53,x\n")
    open(os.path.join(tmp, "vocab_local.csv"), "w").write("word,contacts\n")
    for t in TOOLS:
        src = os.path.join(os.path.dirname(os.path.abspath(__file__)), t)
        if os.path.exists(src):
            open(os.path.join(tmp, t), "wb").write(open(src, "rb").read())
    m = build_manifest(tmp)
    assert m["schema_drift"] == ["contacts_counts.csv"], m["schema_drift"]
    assert next(x for x in m["shareable"] if x["file"] == "contacts_timeline.csv")["rows"] == 2
    assert "vocab_local.csv" in m["local_only_present"]
    text = render_report(read_log(log), m)
    assert "| ~ | 3 |" in text and "| ✓ | 7 |" in text and "| – | 16 |" in text, text
    assert "python3.13 not found" in text and "Mac since 2022" in text and "DRIFT" in text
    assert "Lesson candidates" in text and "**3**" in text and "**16**" in text and "**7**" not in text.split("Lesson candidates")[1].split("## Limor")[0]
    print("demo OK: 3 steps logged (workaround/ok/skip) · 1 answer · PII notes refused · manifest flags schema drift + local-only file · report renders")
    print("files:", tmp)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--log", default=LOG)
    p.add_argument("--root", default=".")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("start"); s.add_argument("step"); s.add_argument("--note"); s.set_defaults(fn=cmd_start)
    d = sub.add_parser("done"); d.add_argument("step"); d.add_argument("--status", required=True, choices=["ok", "fail", "skip", "workaround"])
    d.add_argument("--error"); d.add_argument("--fix"); d.add_argument("--note"); d.set_defaults(fn=cmd_done)
    n = sub.add_parser("note"); n.add_argument("step"); n.add_argument("--note", required=True); n.set_defaults(fn=cmd_note)
    q = sub.add_parser("answer"); q.add_argument("q"); q.add_argument("--text", required=True); q.set_defaults(fn=cmd_answer)
    m = sub.add_parser("manifest"); m.add_argument("-o", "--output", default="manifest.json"); m.set_defaults(fn=cmd_manifest)
    r = sub.add_parser("report"); r.add_argument("-o", "--output", default="RUNREPORT.md"); r.set_defaults(fn=cmd_report)
    e = sub.add_parser("demo"); e.set_defaults(fn=cmd_demo)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
