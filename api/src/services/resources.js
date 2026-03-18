// owned = resources owned by groups I belong to,
// grants = resources I have any grants on,
// oversight = resources owned by groups I don't belong to,
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
