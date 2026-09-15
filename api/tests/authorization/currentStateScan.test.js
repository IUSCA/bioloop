/**
 * currentStateScan.test.js
 *
 * The views are the single definition of current state: `active_group_user`,
 * `active_collection_dataset`, `valid_grants`, and `effective_restriction`. A service that
 * writes its own `removed_at: null`, `revoked_at: null`, or `is_archived: false` filter has
 * restated one of them, and the restatement drifts. `valid_until` is the usual casualty.
 *
 * The scan fails on any hit outside the allowlist. Each entry names why the line is not a
 * read of current state, and an entry that no longer matches fails too, so the list shrinks
 * with the code.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Current state has one definition
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const PATTERNS = [/\bremoved_at: null\b/, /\brevoked_at: null\b/, /\bis_archived: false\b/];

const WRITE = 'a write sets the column or names the open row it changes';
const DISPLAY = 'a display count, not an access decision';
const RESTRICTION = 'archive state read beside effective_restriction; Phase 6 moves it to the restriction '
  + 'check';

const ALLOWLIST = [
  { file: 'services/groups.js', line: 'is_archived: false,', reason: WRITE },
  { file: 'services/collections.js', line: 'is_archived: false,', reason: WRITE },
  {
    file: 'services/grants/index.js', line: 'where: { id: grant_id, revoked_at: null },', reason: WRITE, count: 2,
  },
  { file: 'services/grants/index.js', line: 'where: { subject_id, resource_id, revoked_at: null },', reason: WRITE },
  {
    file: 'services/system.js', line: 'where: { is_archived: false },', reason: DISPLAY, count: 2,
  },
  {
    file: 'services/datasets_v2/ownership.js', line: 'is_archived: false', reason: RESTRICTION, count: 3,
  },
];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function hits() {
  return sourceFiles(SRC).flatMap((file) => {
    const relative = path.relative(SRC, file);
    return fs.readFileSync(file, 'utf8').split('\n')
      .map((text, index) => ({ file: relative, lineNumber: index + 1, text: text.trim() }))
      .filter(({ text }) => !text.startsWith('//') && !text.startsWith('*'))
      .filter(({ text }) => PATTERNS.some((pattern) => pattern.test(text)));
  });
}

const allowedBy = (hit) => ALLOWLIST.find((entry) => entry.file === hit.file && hit.text.includes(entry.line));

test('no service restates a current-state view outside the allowlist', () => {
  const unlisted = hits().filter((hit) => !allowedBy(hit)).map((hit) => `${hit.file}:${hit.lineNumber} ${hit.text}`);
  expect(unlisted).toEqual([]);
});

test('every allowlist entry still matches the code it excuses', () => {
  const found = hits();
  const stale = ALLOWLIST
    .map((entry) => ({ entry, matched: found.filter((hit) => allowedBy(hit) === entry).length }))
    .filter(({ entry, matched }) => matched !== (entry.count ?? 1))
    .map(({ entry, matched }) => `${entry.file} "${entry.line}": expected ${entry.count ?? 1}, found ${matched}`);
  expect(stale).toEqual([]);
});
