const { Prisma } = require('@prisma/client');

function safeSqlJoin(clauses, separator = ' AND ') {
  const nonEmptyClauses = clauses.filter((clause) => clause !== Prisma.empty);
  if (nonEmptyClauses.length === 0) {
    return Prisma.empty;
  }
  const joinedClauses = Prisma.join(nonEmptyClauses, separator);
  return Prisma.sql`${joinedClauses}`;
}

module.exports = {
  safeSqlJoin,
};
