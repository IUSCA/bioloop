/**
 * attributeRuleOrdering.test.js
 *
 * An attribute rule list stops at the first rule whose policy matches. That is safe only when
 * every earlier rule's projection is a superset of every later rule's, because a caller who
 * matches two rules then loses nothing by getting the earlier one.
 *
 * Filter lists cannot be compared as patterns: `['*']` and `['id', 'name']` are orderable only
 * against a row. So each list is projected over one representative row per resource type,
 * built from the Prisma schema with every scalar column set and every nested path the filters
 * name filled in, and the projected key sets are compared.
 *
 * The test reports every list that is not ordered and pins the report. A list that becomes
 * unordered fails here; a list that is fixed fails here too, so the pin is updated by hand.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Projection: a path list, not a field set
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { Prisma } = require('@prisma/client');

const { policyRegistry } = require('@/authorization');
const { projectObject } = require('@/utils/expression');

const MODEL_OF = {
  group: 'group',
  collection: 'collection',
  dataset: 'dataset',
  grant: 'grant',
  access_request: 'access_request',
  user: 'user',
};

/** A row with every scalar column of the model set. */
function scalarRow(modelName) {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  const row = {};
  model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')
    .forEach((f) => { row[f.name] = `${modelName}.${f.name}`; });
  return row;
}

/** Makes every nested path a filter names exist on the row, with a two-element array for `[*]`. */
function fillPath(row, filter) {
  const parts = filter.replace(/^!/, '').split('.');
  let node = row;
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    const arrayMatch = part.match(/^(.+)\[\*\]$/);
    if (part === '*') return;
    if (arrayMatch) {
      const key = arrayMatch[1];
      if (!Array.isArray(node[key])) node[key] = [{}, {}];
      if (last) return;
      // Continue into the first element; the second is filled by the same call's recursion.
      const rest = parts.slice(i + 1).join('.');
      node[key].forEach((el) => fillPath(el, rest));
      node = null;
      return;
    }
    if (node === null) return;
    if (last) {
      if (!(part in node)) node[part] = `leaf:${filter}`;
    } else {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
      node = node[part];
    }
  });
}

/** Every leaf key path of a projected object, as strings. */
function keyPaths(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object') return [prefix];
  if (Array.isArray(obj)) return obj.flatMap((el) => keyPaths(el, `${prefix}[]`));
  const entries = Object.entries(obj);
  if (!entries.length) return [prefix];
  return entries.flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

function unorderedLists() {
  const report = [];
  policyRegistry.listTypes().forEach((resourceType) => {
    const modelName = MODEL_OF[resourceType];
    if (!modelName) return;
    const { attributeRules } = policyRegistry.get(resourceType).export();
    Object.entries(attributeRules).forEach(([action, rules]) => {
      const row = scalarRow(modelName);
      rules.forEach((rule) => rule.attribute_filters.forEach((f) => fillPath(row, f)));
      const projected = rules.map((rule) => new Set(keyPaths(projectObject(row, rule.attribute_filters))));
      projected.forEach((earlier, i) => {
        projected.slice(i + 1).forEach((later, offset) => {
          const missing = [...later].filter((k) => !earlier.has(k));
          if (missing.length) {
            const later_index = i + 1 + offset;
            const fields = missing.sort().join(', ');
            report.push(`${resourceType}.${action}: rule ${i} lacks ${fields} that rule ${later_index} shows`);
          }
        });
      });
    });
  });
  return report;
}

test('every attribute rule list is ordered by set inclusion, except the pinned ones', () => {
  // Pinned. The dataset oversight rule sits above the sensitive-metadata grant rule, so an
  // overseer who also holds DATASET:VIEW_SENSITIVE_METADATA sees the overseer's fields and
  // loses the paths. Phase 5 replaces first-match with the union over path kinds.
  expect(unorderedLists()).toEqual([
    'dataset.*: rule 1 lacks archive_path, origin_path, staged_path that rule 2 shows',
  ]);
});
