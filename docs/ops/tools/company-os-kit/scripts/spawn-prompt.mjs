#!/usr/bin/env node
// Company OS kit — prints the exact prompt to paste into the Agent tool for a brief, and checks the brief has the five parts.
//   node scripts/spawn-prompt.mjs docs/shifts/2026-01-02-head-a-1.md
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { loadConfig } from './lib/config.mjs';

const cfg = loadConfig();

const file = process.argv[2];
if (!file) { console.error('usage: spawn-prompt.mjs <brief.md>'); process.exit(2); }
const path = resolve(file);
const text = readFileSync(path, 'utf8');
const role = /-(head-[a-z]|cos|[a-z][1-3])-\d+\.md$/.exec(basename(path))?.[1] ?? /-(head-[a-z]|cos)\.md$/.exec(basename(path))?.[1];
if (!role) { console.error('the brief file must be named <date>-<role>-<n>.md'); process.exit(2); }
const missing = cfg.briefParts.filter((k) => !text.includes(k));
if (missing.length) console.error(`WARN brief lacks: ${missing.join(' · ')}`);
const who = role === 'cos' ? 'the Chief of Staff' : role.startsWith('head-') ? `Head ${role.slice(-1).toUpperCase()}` : `team ${role}`;
console.log(`You are ${who} of ${cfg.project}. Read and follow ${path} exactly. Work only in your worktree(s) on branch ${role === 'cos' ? 'team/cos' : role.startsWith('head-') ? `head/${role.slice(-1)}` : `team/${role}`}. Reply with the short English summary it asks for.`);
console.log(`\n(spawn: subagent_type general-purpose · model per docs/10-COMPANY-OS.md §3 · run_in_background true)`);
