const TARGET_TYPE = Object.freeze({
  GROUP: 'GROUP',
  COLLECTION: 'COLLECTION',
  GRANT: 'GRANT',
  ACCESS_REQUEST: 'ACCESS_REQUEST',
});

const SUBJECT_TYPE = Object.freeze({
  USER: 'USER',
  DATASET: 'DATASET',
});

module.exports = {
  TARGET_TYPE,
  SUBJECT_TYPE,
};
