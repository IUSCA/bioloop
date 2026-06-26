const prisma = require('../db');
const { GRANT_ACCESS_TYPES } = require('../constants');

/**
 * Asserts that every grant access type defined in constants exists as a row
 * in the grant_access_type table. Throws if any are missing.
 *
 * Called once at startup, before the server begins accepting requests.
 */
async function validateGrantAccessTypes() {
  const dbTypes = await prisma.grant_access_type.findMany({ select: { name: true } });
  const dbNames = new Set(dbTypes.map((t) => t.name));

  const missing = GRANT_ACCESS_TYPES
    .filter(({ name }) => !dbNames.has(name))
    .map(({ name }) => name);

  if (missing.length > 0) {
    throw new Error(`Grant access types missing from database: ${missing.join(', ')}`);
  }
}

module.exports = { validateGrantAccessTypes };
