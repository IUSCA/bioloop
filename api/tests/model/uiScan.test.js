/**
 * uiScan.test.js
 *
 * A static scan over `ui/src/pages/v2` and `ui/src/components/v2` for the rule of the UI layer: a
 * v2 page gates on a capability the API sent, on standing the API sent, and on a display-only
 * fact. It does not re-derive restriction, identity, state, grant activity, implication, or
 * "may request" from raw fields.
 *
 * Each rule reports `file:line` hits. A hit that is display-only is listed in `ALLOWED` with its
 * reason, and an entry that no longer matches any line fails the scan too, so the list cannot
 * outlive the code it excuses.
 *
 * @see docs/design/groups/access-model-verification-plan.md — The UI layer
 */

const fs = require('fs');
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { policyRegistry } = require('@/authorization');

const UI_SRC = path.join(__dirname, '..', '..', '..', 'ui', 'src');
const ROOTS = ['pages/v2', 'components/v2'];

/** Capabilities the API derives outside the action tables. @see src/authorization/index.js — mayRequestAccess */
const DERIVED_CAPABILITIES = ['request_access'];

const RAW_FIELDS = /\b(is_archived|is_deleted|revoked_at|valid_until|requester_id|subject_id)\b/;
const REQUEST_STATUSES = /["'](DRAFT|UNDER_REVIEW|APPROVED|PARTIALLY_APPROVED|REJECTED|WITHDRAWN)["']/;
const GATE_ATTRIBUTE = /(v-if|v-else-if|v-show|:disabled)="([^"]*)"?/;
const TESTS_A_VALUE = /===|!==|&&|\|\||!\w|!!/;

const RAW = 'raw-field';
const STATUS = 'request-status';

/**
 * Display-only hits as `[rule, file, match, reason]`. `file` is relative to ui/src; `match` is a
 * substring of the flagged line.
 */
const ALLOWED = [
  // Raw fields shown as text, badges, or alerts, or used to build a form. None offers a control.
  [RAW, 'pages/v2/home.vue', 'v-if="group.is_archived"', 'Archived badge'],
  [RAW, 'pages/v2/datasets/[id]/index.vue', 'VaAlert v-if="dataset.is_deleted"', 'deleted notice'],
  [RAW, 'pages/v2/groups/[id]/index.vue', 'v-if="group.is_archived"', 'Archived badge'],
  [RAW, 'pages/v2/collections/[id]/index.vue', 'v-if="collection.is_archived"', 'Archived badge'],
  [RAW, 'components/v2/grants/GrantProvenanceBox.vue', 'revoked_at', 'revocation provenance'],
  [RAW, 'components/v2/grants/MyAccessTab.vue', 'row.valid_until', 'expiry date'],
  [RAW, 'components/v2/datasets/DatasetOverviewTab.vue', 'Badge v-if="props.dataset.is_deleted"', 'Deleted badge'],
  [RAW, 'components/v2/groups/GroupCard.vue', 'v-if="group.is_archived"', 'Archived badge'],
  [RAW, 'components/v2/audit/templates/grants/GrantCreated.vue', 'valid_until', 'audit record text'],
  [RAW, 'components/v2/audit/utils/UserToken.vue', 'subject_id', 'the word "you" in an audit row'],
  [RAW, 'components/v2/grants/SubjectPanelHeader.vue', 'is_archived === true', 'archived group label'],
  [RAW, 'components/v2/access-requests/RequestContextHeader.vue', '!!props.request?.requester_id', 'self label'],
  [RAW, 'components/v2/access-requests/RequestDetailsCard.vue', '!!props.request?.requester_id', 'self label'],
  [RAW, 'components/v2/groups/GroupCreateModal.vue', 'auth.user?.subject_id ?', 'the new group\'s admin list'],
  [RAW, 'components/v2/groups/EditGroupMemberRoleModal.vue', '!!props.member?.user?.subject_id', 'form validity'],
  // Decision 4 blocks mutations on a soft-deleted dataset in Phase 6; until then this copy stays.
  [RAW, 'components/v2/datasets/DatasetOverviewTab.vue', 'canArchive && !props.dataset.is_deleted', 'Phase 6'],
  // A decided request shows its outcome; no control depends on it.
  [STATUS, 'pages/v2/access-requests/[id].vue', '"PARTIALLY_APPROVED", "REJECTED"].includes(', 'outcome section'],
  [STATUS, 'components/v2/access-requests/AccessRequestCard.vue', 'DECIDED.includes(props.request.status)', 'outcome'],
  // The two issue-form selectors normalise a selection, and GrantRow names what a grant confers.
  ['implies', 'components/v2/grants/issue/AccessTypeSelector.vue', 'implies', 'selection normaliser'],
  ['implies', 'components/v2/access-requests/RequestAccessForm.vue', 'implies', 'selection normaliser'],
  ['implies', 'components/v2/grants/GrantRow.vue', 'implies', '"Also confers" text'],
].map(([rule, file, match, reason]) => ({
  rule, file, match, reason,
}));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(vue|js)$/.test(entry.name) ? [full] : [];
  });
}

const files = ROOTS.flatMap((root) => walk(path.join(UI_SRC, root)))
  .map((full) => ({ file: path.relative(UI_SRC, full), lines: fs.readFileSync(full, 'utf8').split('\n') }));

const isComment = (line) => /^\s*(\/\/|\*|\/\*|<!--)/.test(line);

/** Every line a rule flags, as `{ rule, file, line, text }`. */
function scan() {
  const actions = new Set(policyRegistry.listTypes().flatMap((type) => policyRegistry.get(type).getActionNames()));
  const hits = [];
  files.forEach(({ file, lines }) => {
    let computedDepth = 0;
    lines.forEach((text, index) => {
      if (isComment(text)) return;
      const add = (rule) => hits.push({
        rule, file, line: index + 1, text: text.trim(),
      });

      [...text.matchAll(/\bcan\(["']([a-z_]+)["']\)/g)].forEach(([, name]) => {
        if (!actions.has(name) && !DERIVED_CAPABILITIES.includes(name)) add(`unknown-capability:${name}`);
      });
      if (/\b(uiPersona|user_role|caller_role)\b/.test(text)) add('persona');
      if (/auth(Store)?\??\.(canAdmin|hasRole)\b/.test(text)) add('session-role');

      // A raw field inside a gate attribute, or tested inside a computed that may feed one. A
      // computed's body runs until its parentheses close; three lines covers the ones here.
      if (/\bcomputed\(/.test(text)) computedDepth = 3;
      if (RAW_FIELDS.test(text)) {
        const attribute = text.match(GATE_ATTRIBUTE);
        const gated = attribute && RAW_FIELDS.test(attribute[2]);
        if (gated || (computedDepth > 0 && TESTS_A_VALUE.test(text))) add(RAW);
      }
      if (computedDepth > 0) computedDepth -= 1;

      const joined = `${text} ${lines[index + 1] ?? ''}`;
      const comparesStatus = REQUEST_STATUSES.test(joined) && /\bstatus\b/.test(joined)
        && /(===|!==|\.includes\()/.test(text);
      if ((comparesStatus || /\.includes\([\w.?]*\.status\)/.test(text))
        && (file.includes('access-requests') || /request/i.test(joined))) add(STATUS);
      if (/\.implies\b/.test(text)) add('implies');
    });
  });
  return hits;
}

const matchesEntry = (hit, entry) => entry.rule === hit.rule && entry.file === hit.file
  && hit.text.includes(entry.match);

test('no v2 file re-derives what the API decides', () => {
  const hits = scan();
  const offending = hits.filter((hit) => !ALLOWED.some((entry) => matchesEntry(hit, entry)))
    .map((h) => `${h.rule} ${h.file}:${h.line} ${h.text}`);
  expect(offending).toEqual([]);

  const stale = ALLOWED.filter((entry) => !hits.some((hit) => matchesEntry(hit, entry)))
    .map((entry) => `${entry.rule} ${entry.file} "${entry.match}"`);
  expect(stale).toEqual([]);
});

test('the scan reads the v2 tree it names', () => {
  // Forced unless the walk found the pages and components it scans.
  expect(files.length).toBeGreaterThan(100);
  expect(files.some((f) => f.file === 'pages/v2/groups/[id]/index.vue')).toBe(true);
});
