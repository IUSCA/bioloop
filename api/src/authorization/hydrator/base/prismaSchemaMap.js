const { Prisma } = require('@prisma/client');

const { models } = Prisma.dmmf.datamodel;

// Construct a mapping of model names to their fields, indicating whether each field is a relation (i.e.,
// has a relationName) or not.
// This is used to determine if a field is a column in the database or a relation to another model.
// {
//   'model_name': {
//     'field_1': false, // indicates that this field is a column in the database
//     'field_2': true, // indicates that this field is a relation to another model
//     ...
//   },
//   ...
//   }
// }
const modelToAttributeToIsAColumn = new Map(
  models.map((model) => [
    model.name,
    new Map(
      model.fields.map((field) => [field.name, !!field.relationName]),
    ),
  ]),
);

module.exports = {
  modelToAttributeToIsAColumn,
};
