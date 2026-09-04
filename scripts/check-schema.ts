/**
 * Asserts that every saved project format the app has ever written still opens.
 *
 * Documents from older schemas exist in the world - the app has been live, and
 * its saves sit in localStorage and in downloaded project.json files - so the
 * reader has to keep accepting them. What makes that cheap today is that
 * version 2 only added an optional field, but "it happens to still work" is
 * exactly the kind of thing that stops being true quietly.
 *
 * The fixtures are real exports, not documents built from today's types. That
 * is the point: a synthesised fixture is rewritten by every refactor and so can
 * only ever prove the code agrees with itself, while a file captured from the
 * shipping app keeps testing against what users actually have on disk.
 *
 * ADDING A SCHEMA: export a project.json from the running app, drop it in
 * scripts/fixtures as project-v<n>.json, and add <n> to READABLE_VERSIONS in
 * store.tsx. This file needs no edit - it reads whatever is in that directory -
 * and every earlier fixture keeps being checked.
 *
 * Run via `npm run check:schema`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readProject } from '../src/store';
import { createStarterProject } from '../src/lib/defaults';
import type { WatchfaceProject } from '../src/types';

/** The version every document should come back as, whatever it went in as. */
const CURRENT = createStarterProject('emery').schemaVersion;

const fixtureDir = process.argv[2];
if (!fixtureDir) {
  console.error('schema: no fixture directory given');
  process.exit(1);
}

let failed = 0;

function check(what: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ${what}`);
    return;
  }
  failed += 1;
  console.error(`schema: ${what} - FAILED${detail ? `: ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ *
 * Every captured export still opens, and opens as the current schema
 * ------------------------------------------------------------------ */

const fixtures = readdirSync(fixtureDir)
  .filter((name) => /^project-v\d+\.json$/.test(name))
  .sort();

check('there is at least one captured export to check', fixtures.length > 0);

for (const name of fixtures) {
  const raw = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as Record<string, unknown>;
  const before = raw.elements as { id: string; x: number; y: number; groupId?: string }[];
  const opened = readProject(raw);

  console.log(`  ${name} (schema ${raw.schemaVersion}, ${before.length} elements)`);

  if (!opened) {
    check(`${name} is accepted`, false, 'readProject returned null');
    continue;
  }

  check(`${name} opens as schema ${CURRENT}`, opened.schemaVersion === CURRENT,
    `got ${opened.schemaVersion}`);
  check(`${name} keeps every element`, opened.elements.length === before.length,
    `${before.length} in, ${opened.elements.length} out`);
  check(
    `${name} keeps element identity and position`,
    opened.elements.every((el, i) => {
      const was = before[i]!;
      return el.id === was.id && el.x === was.x && el.y === was.y;
    }),
  );
  check(`${name} keeps its platform`, opened.platform === raw.platform);
  check(`${name} keeps its name`, opened.name === raw.name);
  // The reader merges options over a starter, so a key added after the export
  // was written comes back defined rather than undefined.
  check(
    `${name} has every option defined`,
    Object.values(opened.options).every((v) => v !== undefined),
  );
  // Grouping is the only thing schema 2 added, so it has to survive a document
  // that has it, and must not be invented for one that does not.
  const groupsBefore = before.filter((el) => el.groupId).length;
  check(
    `${name} carries ${groupsBefore} grouped element${groupsBefore === 1 ? '' : 's'} through`,
    opened.elements.filter((el) => el.groupId).length === groupsBefore,
  );
}

/* ------------------------------------------------------------------ *
 * A group of one is not a group
 * ------------------------------------------------------------------ */

const lone = JSON.parse(
  readFileSync(join(fixtureDir, `project-v${CURRENT}.json`), 'utf8'),
) as WatchfaceProject;
lone.elements = lone.elements.map((el, i) =>
  i === 0 ? { ...el, groupId: 'g_only_me' } : { ...el, groupId: undefined },
);
const tidied = readProject(lone);
check(
  'a group left with one member is dropped on load',
  tidied !== null && tidied.elements.every((el) => el.groupId === undefined),
);

/* ------------------------------------------------------------------ *
 * Anything we do not understand is refused rather than guessed at
 * ------------------------------------------------------------------ */

const anyDoc = JSON.parse(readFileSync(join(fixtureDir, fixtures[0]!), 'utf8'));
check('a future schema is refused', readProject({ ...anyDoc, schemaVersion: 99 }) === null);
check('a document with no version is refused', readProject({ elements: [] }) === null);
check(
  'a document with no elements array is refused',
  readProject({ schemaVersion: CURRENT, elements: 'nope' }) === null,
);
check('a non-object is refused', readProject('not a project') === null);
check('null is refused', readProject(null) === null);

if (failed > 0) {
  console.error(`schema: ${failed} check${failed === 1 ? '' : 's'} failed`);
  process.exit(1);
}
console.log(
  `schema: ${fixtures.length} captured export${fixtures.length === 1 ? '' : 's'} still open as version ${CURRENT}`,
);
