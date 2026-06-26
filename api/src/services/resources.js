// owned = resources owned by groups I am admin of,
// grants = resources I have any grants on,
// oversight = resources owned by groups I have oversight on,
// all = all of the above
const RESOURCE_SCOPES = Object.freeze({
  ALL: 'all',
  OWNED: 'ownership',
  GRANTS: 'grants',
  OVERSIGHT: 'oversight',
});

module.exports = {
  RESOURCE_SCOPES,
};
