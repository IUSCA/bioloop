const { Prisma } = require('@prisma/client');

const { models } = Prisma.dmmf.datamodel;

// Construct a mapping of model names to their fields, indicating whether each field is a relation.
// This is used to determine if a field is a column in the database or a relation to another model.
// Map<modelName, Map<fieldName, isRelation>>
// Example:
// {
//   'User': Map {
//     'id' => false,           // scalar field (column)
//     'name' => false,         // scalar field (column)
//     'posts' => true,         // relation field
//   },
//   'Post': Map {
//     'id' => false,           // scalar field (column)
//     'title' => false,        // scalar field (column)
//     'author' => true,        // relation field
//     'authorId' => false,     // scalar field (foreign key)
//   }
// }
const modelFieldMap = new Map(
  models.map((model) => [
    model.name,
    new Map(
      model.fields.map((field) => [field.name, !!field.relationName]),
    ),
  ]),
);

module.exports = {
  modelFieldMap,

  // Deprecated: Use modelFieldMap instead
  modelToAttributeToIsAColumn: modelFieldMap,
};
