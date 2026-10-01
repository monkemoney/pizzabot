// Company OS kit — the one builder of a problems-log row, shared by case.mjs (a person opens a case) and kpi.mjs
// (a breach opens one). Two writers of one row shape is how the shapes drift apart; this file is why they cannot.
import { parseCases } from './registers.mjs';

export const CASE_CLASSES = ['unwalked', 'drift', 'monitor', 'session', 'process', '?'];

/** The next case number for the rows already in docs/cases/LOG.md. */
export const nextCaseNumber = (logText) => { const rows = parseCases(logText); return rows.length ? Math.max(...rows.map((r) => r.n)) + 1 : 1; };

const clean = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');

/** One open case row. `refs` defaults to "—" (what case.mjs always wrote); a KPI breach puts `KPI <id> · <week>` there. */
export function caseRow({ n, date, problem, area, cost = '?', cause = 'not proven yet', cls = '?', refs = '—' }) {
  return `| ${n} | ${date} | ${clean(problem)} | ${clean(area)} | ${clean(cost)} | ${clean(cause)} | ${cls} | — | to come: … | open | ${clean(refs)} | not checked |`;
}
