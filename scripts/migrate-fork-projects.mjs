#!/usr/bin/env node
// migrate-fork-projects: one-off conversion of the pre-5.3 fork's Redis project
// data to the upstream 5.3+ layout. Dry run by default; --apply writes.
//
//   node scripts/migrate-fork-projects.mjs [--apply]
//
// Credentials: {"KV_REST_API_URL": "https://<db>.upstash.io", "KV_REST_API_TOKEN": "…"}
// as JSON on stdin. Never arguments or environment variables.
//
// Fork layout:      project:<id>        raw JSON {id,name,description?,createdAt,updatedAt,studyCount}
//                   project-studies:<id> set of study ids; study JSON also carries projectId
// Upstream layout:  project:<id>        'oi:project:' + {"id","name","createdAt","updatedAt"} (exactly those 4)
//                   study-project:<sid> project id
//
// Writes only `project:<id>` (rewritten) and `study-project:<sid>` (SET NX). It never
// touches study JSON, never deletes anything, and leaves the old `project-studies:*`
// sets in place so the old data stays recoverable. Back up the database first.
// The report prints counts and ids only, never project names.

import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const PROJECT_PREFIX = 'oi:project:';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STUDY_ID = /^[A-Za-z0-9-]{1,128}$/;
const MAX_NAME = 200;

const isInt = (v) => Number.isSafeInteger(v) && v >= 0;
const isSpace = (cp) =>
  cp === 32 || cp === 160 || cp === 5760 || (cp >= 8192 && cp <= 8202) ||
  cp === 8232 || cp === 8233 || cp === 8239 || cp === 8287 || cp === 12288 || cp === 65279;

// Mirrors the Lua valid_name in src/lib/storage/redisProjects.ts.
export function validName(v) {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_NAME) return false;
  let first;
  let last;
  for (const ch of v) {
    const cp = ch.codePointAt(0);
    if (cp < 32 || (cp >= 127 && cp <= 159) || (cp >= 0xd800 && cp <= 0xdfff)) return false;
    first ??= cp;
    last = cp;
  }
  return !isSpace(first) && !isSpace(last);
}

function parseJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function convertProject(id, raw) {
  if (typeof raw === 'string' && raw.startsWith(PROJECT_PREFIX)) return { status: 'already' };
  if (!UUID_V4.test(id)) return { status: 'skip', reason: 'id is not a lowercase UUID v4' };
  const p = parseJson(raw);
  if (!p || typeof p !== 'object' || p.id !== id) return { status: 'skip', reason: 'unreadable record' };
  const name = typeof p.name === 'string' ? p.name.trim() : p.name;
  if (!validName(name)) return { status: 'skip', reason: 'name is not valid upstream' };
  if (!isInt(p.createdAt) || !isInt(p.updatedAt)) return { status: 'skip', reason: 'bad timestamps' };
  const updatedAt = Math.max(p.createdAt, p.updatedAt);
  return {
    status: 'convert',
    value: PROJECT_PREFIX + JSON.stringify({ id, name, createdAt: p.createdAt, updatedAt }),
  };
}

function studyProjectId(raw) {
  const text = typeof raw === 'string' && raw.startsWith('oi:study:') ? raw.slice(9) : raw;
  const s = parseJson(text);
  return s && typeof s.projectId === 'string' ? s.projectId : null;
}

/**
 * exec(['CMD', ...args]) -> result. Returns the plan: what would be written.
 * Only reads happen here.
 */
export async function planMigration(exec) {
  const plan = { projects: [], memberships: [], skippedProjects: [], conflicts: [], orphans: [], already: 0 };
  const asList = (v) => (Array.isArray(v) ? v.map(String) : []);
  const projectIds = asList(await exec(['SMEMBERS', 'all-projects']));
  const valid = new Set();
  for (const id of projectIds) {
    const r = convertProject(id, await exec(['GET', `project:${id}`]));
    if (r.status === 'already') { plan.already++; valid.add(id); }
    else if (r.status === 'convert') { plan.projects.push({ id, value: r.value }); valid.add(id); }
    else plan.skippedProjects.push({ id, reason: r.reason });
  }

  // Membership: the study's own projectId is authoritative; the old set is the fallback.
  const wanted = new Map();
  for (const sid of asList(await exec(['SMEMBERS', 'all-studies']))) {
    if (!STUDY_ID.test(sid)) continue;
    const pid = studyProjectId(await exec(['GET', `study:${sid}`]));
    if (pid) wanted.set(sid, { pid, via: 'study' });
  }
  for (const pid of projectIds) {
    for (const sid of asList(await exec(['SMEMBERS', `project-studies:${pid}`]))) {
      const have = wanted.get(sid);
      if (!have) wanted.set(sid, { pid, via: 'set' });
      else if (have.pid !== pid) plan.conflicts.push({ studyId: sid, studyJson: have.pid, set: pid });
    }
  }
  for (const [sid, { pid }] of wanted) {
    if (!valid.has(pid)) { plan.orphans.push({ studyId: sid, projectId: pid }); continue; }
    const existing = await exec(['GET', `study-project:${sid}`]);
    if (existing === pid) continue;
    if (existing) { plan.conflicts.push({ studyId: sid, studyJson: pid, existing }); continue; }
    plan.memberships.push({ studyId: sid, projectId: pid });
  }
  return plan;
}

export async function applyPlan(exec, plan) {
  for (const p of plan.projects) await exec(['SET', `project:${p.id}`, p.value]);
  for (const m of plan.memberships) await exec(['SET', `study-project:${m.studyId}`, m.projectId, 'NX']);
}

function makeExec({ url, token }) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.upstash.io')) {
    throw new Error('KV_REST_API_URL must be https on a *.upstash.io host.');
  }
  return async (command) => {
    const res = await fetch(u.origin, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(`Redis ${command[0]} failed: ${body.error ?? res.status}`);
    return body.result;
  };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
  let creds;
  try {
    creds = JSON.parse(await readStdin());
  } catch {
    console.error('Pipe {"KV_REST_API_URL": "...", "KV_REST_API_TOKEN": "..."} on stdin.');
    process.exit(2);
  }
  const exec = makeExec({ url: creds.KV_REST_API_URL, token: creds.KV_REST_API_TOKEN });
  const plan = await planMigration(exec);
  console.log(JSON.stringify({
    mode: values.apply ? 'apply' : 'dry-run',
    projectsToRewrite: plan.projects.length,
    projectsAlreadyUpstream: plan.already,
    projectsSkipped: plan.skippedProjects,
    membershipsToWrite: plan.memberships.length,
    conflicts: plan.conflicts,
    orphanMemberships: plan.orphans,
  }, null, 2));
  if (values.apply) {
    if (plan.conflicts.length || plan.skippedProjects.length) {
      console.error('Refusing to apply with conflicts or skipped projects. Resolve them first.');
      process.exit(3);
    }
    await applyPlan(exec, plan);
    console.log('Applied. Old project-studies:* sets were left in place.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
