require('dotenv-safe').config({ example: '.env.default' });
// const process = require('process');
// const config = require('config');

// function makeDatabaseUrl() {
//   const user = config.get('postgres.user');
//   const password = encodeURIComponent(config.get('postgres.password'));
//   const hostname = config.get('postgres.hostname');
//   const dbPort = config.get('postgres.port');
//   const db = config.get('postgres.db');
//   const schema = config.get('postgres.schema');

//   return `postgresql://${user}:${password}@${hostname}:${dbPort}/${db}?schema=${schema}`;
// }

// // set DATABASE_URL environment variable for prisma
// const dbUrl = makeDatabaseUrl();
// // console.log(dbUrl);
// process.env.DATABASE_URL = dbUrl;

// Override BigInt serialization for JSON.stringify
// Postgres columns can be of BigInt type, which JSON.stringify does not handle by default.
// This ensures BigInt values are converted to strings during serialization.
// eslint-disable-next-line no-extend-native, func-names
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const { PrismaClient } = require('@prisma/client');
const Expiry = require('./utils/expiry');

const prisma = new PrismaClient({
  // log: ['query', 'info', 'warn', 'error'],
}).$extends({
  result: {
    access_request_item: {
      requested_expiry: {
        needs: { requested_until: true },
        compute(item) {
          return Expiry.fromValue(item.requested_until);
        },
      },
      approved_expiry: {
        needs: { approved_until: true },
        compute(item) {
          return Expiry.fromValue(item.approved_until);
        },
      },
    },
    grant: {
      expiry: {
        needs: { valid_until: true },
        compute(grant) {
          return Expiry.fromValue(grant.valid_until);
        },
      },
    },
  },
});
module.exports = prisma;
