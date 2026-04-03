/**
 * Builds a bearer Authorization header value.
 * @param {string} token
 * @returns {string}
 */
const authHeader = (token) => (
  `Bearer ${token}`
);

module.exports = {
  authHeader,
};
