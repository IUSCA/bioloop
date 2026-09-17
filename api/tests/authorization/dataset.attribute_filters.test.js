/**
 * dataset.attribute_filters.test.js
 *
 * What a caller sees of a dataset once an action is allowed. The line drawn here is between
 * a fact about the dataset and a fact about the infrastructure holding it: `is_staged` says
 * the bytes are on fast storage and every viewer gets it, while `staged_path` says where
 * they are and needs view_sensitive_metadata.
 *
 * @see .todo/issues/06-dataset-actions-workflows.md — Open after phase 4
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { datasetPolicies } = require('@/authorization/builtin/policies/dataset');
const { dataset: PUBLIC_ATTRIBUTES } = require('@/authorization/builtin/policies/base_attributes');

/** Every filter list the '*' rules hand out, one per policy class. */
const wildcardFilters = () => datasetPolicies.getAttributeRules('*')
  .map((rule) => rule.attribute_filters);

describe('is_staged is public', () => {
  test('a grant holder with view_metadata alone receives it', () => {
    // The reason it is public: a caller who may request staging has to be able to tell that
    // the request finished. Without this they are told the request was accepted and never
    // told anything more.
    expect(PUBLIC_ATTRIBUTES).toContain('is_staged');
  });

  test('no policy class is denied it', () => {
    for (const filters of wildcardFilters()) {
      expect(filters.includes('*') || filters.includes('is_staged')).toBe(true);
    }
  });

  test('the elevated lists do not name it again', () => {
    // A leftover entry would still work and would say the field is elevated, which it is not.
    const named = wildcardFilters().filter((f) => !f.includes('*'));
    for (const filters of named) {
      expect(filters.filter((a) => a === 'is_staged')).toHaveLength(1);
    }
  });
});

describe('the paths stay behind view_sensitive_metadata', () => {
  test.each(['origin_path', 'archive_path', 'staged_path', 'du_size', 'metadata'])(
    '%s is not public',
    (attr) => {
      expect(PUBLIC_ATTRIBUTES).not.toContain(attr);
    },
  );

  test('view_sensitive_metadata is what unlocks staged_path', () => {
    const unlocked = wildcardFilters().filter((f) => f.includes('staged_path'));
    expect(unlocked.length).toBeGreaterThan(0);
    for (const filters of unlocked) expect(filters).toContain('origin_path');
  });

  test('oversight sees governance metadata and still no paths', () => {
    const oversight = datasetPolicies.getAttributeRules('*')
      .find((rule) => rule.policy?.name?.includes('Oversight'))?.attribute_filters;

    expect(oversight).toBeDefined();
    expect(oversight).toContain('is_staged');
    expect(oversight).toContain('num_files');
    expect(oversight).not.toContain('staged_path');
  });
});

describe('a list shows the public set', () => {
  test('the list action filters every row to the public attributes', () => {
    // No single row is decided on a list, so its one rule applies to every row.
    // @see docs/design/groups/access-model.md — Projection
    expect(datasetPolicies.getAttributeRules('list').map((rule) => rule.attribute_filters))
      .toEqual([PUBLIC_ATTRIBUTES]);
  });

  test('the public set still says whether staging finished', () => {
    expect(PUBLIC_ATTRIBUTES).toContain('is_staged');
  });
});
