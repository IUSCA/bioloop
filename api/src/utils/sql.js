const { Prisma } = require('@prisma/client');

function safeSqlJoin(clauses, separator = ' AND ') {
  const nonEmptyClauses = clauses.filter((clause) => clause !== Prisma.empty);
  if (nonEmptyClauses.length === 0) {
    return Prisma.empty;
  }
  return Prisma.join(nonEmptyClauses, separator);
}

function buildWhereClause(clauses, operator = 'AND') {
  const joinedClauses = safeSqlJoin(clauses, ` ${operator} `);
  return joinedClauses === Prisma.empty ? Prisma.empty : Prisma.sql`WHERE ${joinedClauses}`;
}

function enumToSql(enumValue) {
  return Prisma.raw(`'${enumValue}'`);
}

function createLikePattern(value) {
  const escapedValue = value.replace(/%/g, '\\%').replace(/_/g, '\\_');
  return Prisma.sql`${`%${escapedValue}%`}`;
}

module.exports = {
  safeSqlJoin,
  enumToSql,
  buildWhereClause,
  createLikePattern,
};
