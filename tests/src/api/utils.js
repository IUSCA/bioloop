const authHeader = (token) => (
  `Bearer ${token}`
);

module.exports = {
  authHeader,
};
