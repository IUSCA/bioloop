/**
 * attributeRuleOrdering.test.js
 *
 * A caller who matches several attribute rules sees the union of what each rule shows, so the
 * order rules are declared in decides nothing. The test checks that for every pair of rules in
 * every list, and keeps the report of lists that are not ordered by set inclusion: those are the
 * lists first-match would have got wrong.
 *
 * Filter lists cannot be compared as patterns: `['*']` and `['id', 'name']` are orderable only
 * against a row. So each list is projected over one representative row per resource type,
 * built from the Prisma schema with every scalar column set and every nested path the filters
 * name filled in, and the projected key sets are compared.
 *
 * The test reports every list that is not ordered and pins the report. A list that becomes
 * unordered fails here; a list that is fixed fails here too, so the pin is updated by hand.
 *
 * @see docs/design/groups/access-model.md — Projection
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { Prisma } = require('@prisma/client');

const { policyRegistry } = require('@/authorization');
const { projectObject } = require('@/utils/expression');
const { createFilterFunction } = require('@/authorization/core/attributeFilters');

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

/** Every list's representative row, rules, and each rule's projected key set. */
function projectedLists() {
  const lists = [];
  policyRegistry.listTypes().forEach((resourceType) => {
    const modelName = MODEL_OF[resourceType];
    if (!modelName) return;
    const { attributeRules } = policyRegistry.get(resourceType).export();
    Object.entries(attributeRules).forEach(([action, rules]) => {
      const row = scalarRow(modelName);
      rules.forEach((rule) => rule.attribute_filters.forEach((f) => fillPath(row, f)));
      const keys = rules.map((rule) => new Set(keyPaths(projectObject(row, rule.attribute_filters))));
      lists.push({
        resourceType, action, row, rules, keys,
      });
    });
  });
  return lists;
}

function unorderedLists() {
  const report = [];
  projectedLists().forEach(({ resourceType, action, keys }) => {
    keys.forEach((earlier, i) => {
      keys.slice(i + 1).forEach((later, offset) => {
        const missing = [...later].filter((k) => !earlier.has(k));
        if (missing.length) {
          const fields = missing.sort().join(', ');
          report.push(`${resourceType}.${action}: rule ${i} lacks ${fields} that rule ${i + 1 + offset} shows`);
        }
      });
    });
  });
  return report;
}

test('a caller matching two rules sees every key either rule shows', () => {
  const lost = [];
  projectedLists().forEach(({
    resourceType, action, row, rules, keys,
  }) => {
    rules.forEach((a, i) => rules.slice(i + 1).forEach((b, offset) => {
      const j = i + 1 + offset;
      const seen = new Set(keyPaths(createFilterFunction([a.attribute_filters, b.attribute_filters])(row)));
      const missing = [...keys[i], ...keys[j]].filter((k) => !seen.has(k));
      if (missing.length) lost.push(`${resourceType}.${action} rules ${i}+${j}: ${[...new Set(missing)].sort()}`);
    }));
  });
  expect(lost).toEqual([]);
});

test('the lists first-match would get wrong are still the known ones', () => {
  // The dataset oversight rule sits above the sensitive-metadata grant rule. Under first-match an
  // overseer who also held DATASET:VIEW_SENSITIVE_METADATA lost these paths; the union keeps them.
  expect(unorderedLists()).toEqual([
    'dataset.*: rule 1 lacks archive_path, origin_path, staged_path that rule 2 shows',
  ]);
});
