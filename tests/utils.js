// Serializes query parameters into URL
const queryParamsToURL = (obj) => {
  if (!obj || Object.entries(obj).length === 0) {
    return '';
  }
  const entries = Object.entries(obj);
  return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
};

module.exports = {
  queryParamsToURL,
};
