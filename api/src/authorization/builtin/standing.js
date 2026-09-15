/**
 * How a held term becomes paths in the caller's standing.
 *
 * The dataset, collection, and group terms decide from `access_paths`, so their paths are the
 * rows of that statement: which group an `admin`, `oversight`, or `member` path runs through,
 * whether a membership is direct, and which grant a `grant` path is, with its type and the
 * collection it arrived through. Every other term contributes one path from its meta.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — A decision returns its paths
 * @see docs/design/groups/access-model.md — The badge vocabulary
 */

const ROW_KINDS = ['admin', 'oversight', 'member', 'grant'];

function pathFromRow(row, term) {
  switch (row.path_kind) {
    case 'grant':
      return {
        kind: 'grant', grant_id: row.grant_id, access_type: row.access_type, collection_id: row.collection_id,
      };
    case 'member':
      return term.meta.rule
        ? {
          kind: 'member', group_id: row.group_id, direct: row.direct, rule: term.meta.rule,
        }
        : { kind: 'member', group_id: row.group_id, direct: row.direct };
    default:
      return { kind: row.path_kind, group_id: row.group_id };
  }
}

/**
 * @param {import('../core/policies/Policy')} term - a term that held
 * @param {{ context: Object }} entities
 * @returns {Object[]}
 */
function expandPath(term, { context }) {
  const { pathKind, rule } = term.meta;
  const rows = context?.access_paths?.rows;
  if (!rows || !ROW_KINDS.includes(pathKind)) return [rule ? { kind: pathKind, rule } : { kind: pathKind }];
  return rows.filter((row) => row.path_kind === pathKind).map((row) => pathFromRow(row, term));
}

module.exports = { expandPath };
