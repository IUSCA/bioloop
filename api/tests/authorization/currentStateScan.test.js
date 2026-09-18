/**
 * currentStateScan.test.js
 *
 * The views are the single definition of current state: `active_group_user`,
 * `active_collection_dataset`, and `valid_grants`. A service that writes its own
 * `removed_at: null`, `revoked_at: null`, or `is_archived: false` filter has restated one of
 * them, and the restatement drifts. `valid_until` is the usual casualty.
 *
 * `src/state/builtin/` is not scanned. A state container declares example rows standing for a
 * named state, such as an archived collection or an unrevoked grant, and those literals are the
 * state itself rather than a query filtering on it.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * The scan fails on any hit outside the allowlist. Each entry names why the line is not a
 * read of current state, and an entry that no longer matches fails too, so the list shrinks
 * with the code.
 *
 * @see docs/design/groups/access-model.md — Derived relations
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const PATTERNS = [/\bremoved_at: null\b/, /\brevoked_at: null\b/, /\bis_archived: false\b/];
/** Example rows in a state container are the state, not a restatement of a view. */
const SKIP = [path.join('state', 'builtin')];

const WRITE = 'a write sets the column or names the open row it changes';
const DISPLAY = 'a display count, not an access decision';
const OWNER_GATE = 'the create gate excludes an archived owning group ahead of the policy engine, '
  + 'which is the group\'s own state read for a resource that does not exist yet';
const OWNER_LIST = 'the eligible-owner-groups list excludes archived groups itself. Authorization '
  + 'does not read a resource\'s state, so `dataset.contribute` says nothing about it, and the '
  + 'list and the create gate must agree';

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
    file: 'services/datasets_v2/ownership.js',
    line: 'id: owner_group_id, is_archived: false',
    reason: OWNER_GATE,
  },
  {
    file: 'services/datasets_v2/ownership.js',
    line: 'notIn: SYSTEM_PRINCIPAL_GROUP_IDS }, is_archived: false',
    reason: OWNER_LIST,
    count: 2,
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
    if (SKIP.some((skipped) => relative.includes(skipped))) return [];
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
