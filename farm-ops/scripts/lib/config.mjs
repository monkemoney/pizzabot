// Company OS kit — one config, read by every script (os.config.json at the repo root). Defaults keep the kit working
// before the file is filled in; `main`, the timezone and the silence rule used to be literals in four scripts.
import { existsSync, readFileSync } from 'node:fs';

export const DEFAULTS = {
  project: '<Project name>', mainBranch: 'main', timezone: 'UTC', ownerLanguage: 'en',
  silenceHours: 48, pausedAlertHours: 24, caseStaleDays: 14,
  briefParts: ['Goal of the run', 'Read first', 'Report a short English summary', 'Never contact'],
};

export function loadConfig(path = 'os.config.json') {
  if (!existsSync(path)) return { ...DEFAULTS };
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(path, 'utf8')) }; } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
}

/** Local wall-clock stamp `YYYY-MM-DD HH:MM` in the configured timezone (what humans read in logs and the board). */
export function stamp(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}
