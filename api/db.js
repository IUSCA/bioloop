require('dotenv').config();
const config = require('config');
const process = require('process');

function makeDatabaseUrl() {
  const user = config.get('postgres.user');
  const password = encodeURIComponent(config.get('postgres.password'));
  const hostname = config.get('postgres.hostname');
  const dbPort = config.get('postgres.port');
  const db = config.get('postgres.db');
  const schema = config.get('postgres.schema');

  return `postgresql://${user}:${password}@${hostname}:${dbPort}/${db}?schema=${schema}`;
}

// set DATABASE_URL environment variable for prisma
const dbUrl = makeDatabaseUrl();
// console.log(dbUrl);
process.env.DATABASE_URL = dbUrl;
