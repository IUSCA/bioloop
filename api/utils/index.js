function renameKey(oldKey, newKey) {
  return (obj) => {
  // eslint-disable-next-line no-param-reassign
    obj[newKey] = obj[oldKey];
    // eslint-disable-next-line no-param-reassign
    delete obj[oldKey];
    return obj;
  };
}

module.exports = {
  renameKey,
};
