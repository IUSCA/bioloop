/**
 * Validation and configuration coverage for the baseline seed.
 *
 * None of this touches the database. The JSON readers take their directory from
 * `global.__basedir` at call time, so each test points that at a fixture directory it
 * writes itself.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ROLES, GRANT_ACCESS_TYPES, GRANT_ACCESS_TYPE_IMPLICATIONS, GRANT_PRESETS,
} = require('@/constants');
const {
  collectUsersFromJSON,
  collectImportSourcesFromJSON,
  SeedError,
  USER_FILES,
  IMPORT_SOURCES_FILE,
} = require('../prisma/seed_baseline');

let fixtureDir;
let originalBasedir;

beforeEach(() => {
  originalBasedir = global.__basedir;
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-baseline-'));
  global.__basedir = fixtureDir;
});

afterEach(() => {
  global.__basedir = originalBasedir;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

function writeFixture(name, value) {
  fs.writeFileSync(path.join(fixtureDir, name), JSON.stringify(value));
}

describe('collectUsersFromJSON', () => {
  test('returns nothing when no files are present', () => {
    expect(collectUsersFromJSON()).toEqual([]);
  });

  test('tags each user with the role its file confers', () => {
    writeFixture('admins.json', [{ name: 'Ada', username: 'ada', email: 'ada@example.edu' }]);
    writeFixture('users.json', [{ name: 'Bo', username: 'bo', email: 'bo@example.edu' }]);

    const users = collectUsersFromJSON();
    expect(users).toHaveLength(2);
    expect(users.find((u) => u.username === 'ada').role_id).toBe(1);
    expect(users.find((u) => u.username === 'bo').role_id).toBe(3);
  });

  test('trims surrounding whitespace', () => {
    writeFixture('users.json', [{ name: ' Ada ', username: ' ada ', email: ' ada@example.edu ' }]);
    expect(collectUsersFromJSON()[0]).toMatchObject({
      name: 'Ada', username: 'ada', email: 'ada@example.edu',
    });
  });

  test('refuses a user missing a required field, naming the file and index', () => {
    writeFixture('users.json', [{ name: 'Ada', username: 'ada' }]);
    expect(() => collectUsersFromJSON()).toThrow(SeedError);
    expect(() => collectUsersFromJSON()).toThrow(/users\.json\[0\] is missing email/);
  });

  test('reports every problem in one pass', () => {
    writeFixture('users.json', [{ name: 'Ada' }, 'not an object', { username: 'bo' }]);
    try {
      collectUsersFromJSON();
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(SeedError);
      expect(e.message).toMatch(/users\.json\[0\]/);
      expect(e.message).toMatch(/users\.json\[1\] is not an object/);
      expect(e.message).toMatch(/users\.json\[2\]/);
    }
  });

  test('refuses the same person listed in two files', () => {
    writeFixture('admins.json', [{ name: 'Ada', username: 'ada', email: 'ada@example.edu' }]);
    writeFixture('users.json', [{ name: 'Ada', username: 'ada2', email: 'ADA@example.edu' }]);
    expect(() => collectUsersFromJSON()).toThrow(/email .* appears in both admins\.json\[0\] and users\.json\[0\]/);
  });

  test('refuses two people sharing a username', () => {
    writeFixture('users.json', [
      { name: 'Ada', username: 'ada', email: 'ada@example.edu' },
      { name: 'Ada B', username: 'Ada', email: 'adab@example.edu' },
    ]);
    expect(() => collectUsersFromJSON()).toThrow(/username "Ada" appears in both/);
  });
});

describe('collectImportSourcesFromJSON', () => {
  test('returns nothing when the file is absent', () => {
    expect(collectImportSourcesFromJSON()).toEqual([]);
  });

  test('fills the optional fields with null', () => {
    writeFixture(IMPORT_SOURCES_FILE, [{ path: '/data/bioloop/genomics' }]);
    expect(collectImportSourcesFromJSON()).toEqual([{
      path: '/data/bioloop/genomics',
      label: null,
      description: null,
      sort_order: null,
      mounted_path: null,
    }]);
  });

  test('refuses a source with no path', () => {
    writeFixture(IMPORT_SOURCES_FILE, [{ label: 'Genomics' }]);
    expect(() => collectImportSourcesFromJSON()).toThrow(/missing the required "path" field/);
  });

  test('refuses a relative path', () => {
    writeFixture(IMPORT_SOURCES_FILE, [{ path: 'data/genomics' }]);
    expect(() => collectImportSourcesFromJSON()).toThrow(/is not absolute/);
  });

  test('refuses a repeated path', () => {
    writeFixture(IMPORT_SOURCES_FILE, [{ path: '/data/g' }, { path: '/data/g' }]);
    expect(() => collectImportSourcesFromJSON()).toThrow(/appears in both/);
  });
});

describe('the seeded configuration is self-consistent', () => {
  test('every user file confers a role that exists', () => {
    const roleIds = new Set(ROLES.map((r) => r.id));
    USER_FILES.forEach(({ file, role_id }) => {
      expect([file, roleIds.has(role_id)]).toEqual([file, true]);
    });
  });

  test('every access type implication names an access type that exists', () => {
    const names = new Set(GRANT_ACCESS_TYPES.map((t) => t.name));
    GRANT_ACCESS_TYPE_IMPLICATIONS.flat().forEach((name) => {
      expect([name, names.has(name)]).toEqual([name, true]);
    });
  });

  test('every preset names access types that exist', () => {
    const ids = new Set(GRANT_ACCESS_TYPES.map((t) => t.id));
    GRANT_PRESETS.forEach((preset) => {
      preset.access_type_ids.forEach((id) => {
        expect([preset.name, id, ids.has(id)]).toEqual([preset.name, id, true]);
      });
    });
  });

  // @see docs/design/groups/access-presets.md — 2.11 Presets are scoped to collections
  test('every preset is scoped to collections', () => {
    GRANT_PRESETS.forEach((preset) => {
      expect([preset.name, preset.resource_types]).toEqual([preset.name, ['COLLECTION']]);
    });
  });

  test('access type ids and names are unique', () => {
    expect(new Set(GRANT_ACCESS_TYPES.map((t) => t.id)).size).toBe(GRANT_ACCESS_TYPES.length);
    expect(new Set(GRANT_ACCESS_TYPES.map((t) => t.name)).size).toBe(GRANT_ACCESS_TYPES.length);
  });
});
