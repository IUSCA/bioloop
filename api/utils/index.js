function renameKey(oldKey, newKey) {
  return (obj) => {
  // eslint-disable-next-line no-param-reassign
    obj[newKey] = obj[oldKey];
    // eslint-disable-next-line no-param-reassign
    delete obj[oldKey];
    return obj;
  };
}

function setDifference(setA, setB) {
  const _setB = new Set(setB);
  const _difference = new Set(setA);
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setB) { _difference.delete(elem); }

  return _difference;
}

function setUnion(setA, setB) {
  const _setB = new Set(setB);
  const _union = new Set(setA);
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setB) { _union.add(elem); }

  return _union;
}

function setIntersection(setA, setB) {
  const _setA = new Set(setA);
  const _setB = new Set(setB);
  const _intersection = new Set();
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setA) { if (_setB.has(elem)) _intersection.add(elem); }

  return _intersection;
}

module.exports = {
  renameKey,
  setDifference,
  setUnion,
  setIntersection,
};
