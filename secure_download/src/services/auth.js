const jwksClient = require('jwks-rsa');
const jsonwt = require('jsonwebtoken');
const config = require('config');

const client = jwksClient({
  jwksUri: config.get('auth.jwks_uri'),
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 24 * 60 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  timeout: 15 * 1000,
});

function getKey(header, callback) {
  client.getSigningKey().then((key) => {
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  }).catch((err) => {
    callback(err);
  });
}

function checkJWT(token) {
  return new Promise((resolve, reject) => {
    jsonwt.verify(token, getKey, (err, decoded) => {
      if (err) {
        return reject(err);
      }
      return resolve(decoded);
    });
  });
}

module.exports = {
  checkJWT,
};
