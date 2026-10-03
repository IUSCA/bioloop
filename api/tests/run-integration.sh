#!/bin/sh
set -eu

if [ "${NODE_ENV:-}" != test ] || [ -z "${API_TEST_DATABASE_URL:-}" ] \
  || [ "${DATABASE_URL:-}" != "$API_TEST_DATABASE_URL" ]; then
  echo 'Refusing to run API tests without the isolated test database.' >&2
  exit 1
fi

npx prisma migrate deploy
node tests/seed-integration.js
exec npm run check -- --runInBand "$@"
