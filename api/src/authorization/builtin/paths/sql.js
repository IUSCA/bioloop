/**
 * SQL fragments the per-resource path builders share.
 */

const { Prisma } = require('@prisma/client');

const idFilter = (column, resourceIds) => (resourceIds
  ? Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(resourceIds)})`
  : Prisma.empty);

const typeFilter = (accessTypes) => (accessTypes
  ? Prisma.sql`AND gat.name IN (${Prisma.join(accessTypes)})`
  : Prisma.empty);

/**
 * A grant reaches a resource only through a type of that resource's kind. A collection type
 * never counts for a dataset it contains, and a dataset type granted on a collection confers
 * nothing on the collection itself. The kind is the prefix of the type's name, as in
 * `isAccessTypeApplicableToResourceType`.
 */
const kindFilter = (prefix) => Prisma.sql`AND gat.name LIKE ${`${prefix}:%`}`;

module.exports = { idFilter, typeFilter, kindFilter };
