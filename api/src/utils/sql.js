const { Prisma } = require('@prisma/client');

function safeSqlJoin(clauses, separator = ' AND ') {
  const nonEmptyClauses = clauses.filter((clause) => clause !== Prisma.empty);
  if (nonEmptyClauses.length === 0) {
    return Prisma.empty;
  }
  return Prisma.join(nonEmptyClauses, separator);
}

function enumToSql(enumValue) {
  return Prisma.raw(`'${enumValue}'`);
}

module.exports = {
  safeSqlJoin,
  enumToSql,
};
