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

function log_axios_error(error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    console.error(
      'Axios Error: The request was made and the server responded with a status code',
      `Error ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`,
    );
  } else if (error.request) {
    // The request was made but no response was received
    console.error('Axios Error: The request was made but no response was received');
  } else {
    // Something else happened in making the request that triggered an error
    console.error(
      'Axios Error:  Something else happened in making the request that triggered an error',
      error.message,
    );
  }
}

function sanitize_timestamp(t) {
  if (typeof (t) === 'string') {
    const d = new Date(t);
    // eslint-disable-next-line no-restricted-globals
    if (!isNaN(d)) return d;
  }
}

module.exports = {
  renameKey,
  setDifference,
  setUnion,
  setIntersection,
  log_axios_error,
  sanitize_timestamp,
};
