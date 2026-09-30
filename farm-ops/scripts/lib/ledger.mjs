// Company OS kit — pure parsers shared by the scripts. No I/O here; tested in ledger.test.mjs.

/** Ledger lines: `resumed: <role> <d.m> <HH:MM> — <why>` · `paused: …` · `closed-for-day: <role> <d.m> — …` */
export function parseLedger(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = /^(resumed|paused|closed-for-day):\s+(\S+)\s+(\d{1,2}\.\d{1,2})(?:\s+(\d{1,2}:\d{2}))?\s*(?:[A-Za-z]{2,4}\s*)?—\s*(.*)$/.exec(line.trim());
    if (m) out.push({ kind: m[1], role: m[2], day: m[3], time: m[4] ?? null, text: m[5].trim() });
  }
  return out;
}

/** The last event per role, in file order. */
export function lastByRole(events) {
  const map = new Map();
  for (const e of events) map.set(e.role, e);
  return map;
}

/** Usage lines: `<ISO> · <who> · <branch> · <model> · tokens=<n> · tools=<n> · min=<n> · merged=<branch>@<sha>` */
export function parseUsage(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cells = line.split(' · ').map((s) => s.trim());
    if (cells.length < 7) continue;
    const num = (k) => Number((cells.find((c) => c.startsWith(`${k}=`)) ?? '=0').split('=')[1]) || 0;
    const merged = (cells.find((c) => c.startsWith('merged=')) ?? '').slice('merged='.length);
    const at = merged.indexOf('@');
    out.push({
      at: cells[0], who: cells[1], branch: cells[2], model: cells[3],
      tokens: num('tokens'), tools: num('tools'), min: num('min'),
      mergedBranch: at > 0 ? merged.slice(0, at) : merged || null, mergedSha: at > 0 ? merged.slice(at + 1) : null,
    });
  }
  return out;
}

/** Sum tokens/tools/minutes per branch (or per who). */
export function usageTotals(rows, key = 'branch') {
  const t = new Map();
  for (const r of rows) {
    const k = r[key];
    const cur = t.get(k) ?? { runs: 0, tokens: 0, tools: 0, min: 0 };
    cur.runs += 1; cur.tokens += r.tokens; cur.tools += r.tools; cur.min += r.min;
    t.set(k, cur);
  }
  return t;
}

/** changes.log "merged" claims: every line that says `merged <branch>` (head/x, team/x, origin/head/x) — the branch name and,
 *  when present, `run <n>`. A later `CORRECTION of the HH:MM line` retracts the claims of that line. */
export function mergeClaims(text) {
  const lines = String(text ?? '').split('\n');
  const claims = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const time = /·\s*(\d{1,2}:\d{2})/.exec(line)?.[1] ?? null;
    for (const m of line.matchAll(/\bmerged\s+(?:origin\/)?((?:head|team)\/[a-z0-9-]+)(?:\s+run\s+(\d+))?/gi)) {
      claims.push({ line: i + 1, time, branch: m[1], run: m[2] ? Number(m[2]) : null, retracted: false });
    }
    const corr = /CORRECTION of the (\d{1,2}:\d{2}) line/i.exec(line);
    if (corr) for (const c of claims) if (c.time === corr[1] && c.line < i + 1) c.retracted = true;
  }
  return claims;
}

/** Match a claim to the sha of its usage line (same branch; the run number when the `who` carries it). */
export function claimSha(claim, usage) {
  const rows = usage.filter((u) => u.mergedBranch === claim.branch && u.mergedSha);
  if (!rows.length) return null;
  if (claim.run != null) {
    const r = rows.find((u) => new RegExp(`\\brun ${claim.run}\\b`).test(u.who));
    if (r) return r.mergedSha;
  }
  return rows[rows.length - 1].mergedSha;
}
