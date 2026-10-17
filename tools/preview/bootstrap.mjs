// Executed inside the API image after migrations and synthetic seed initialization.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/opt/sca/app/package.json');
require('module-alias/register');
global.__basedir = '/opt/sca/app';
require('dotenv-safe').config({ example: '/opt/sca/app/.env.default' });
const auth = require('/opt/sca/app/src/services/auth.js');
const issueToken = require('/opt/sca/app/src/scripts/issue_token.js');
const prisma = require('/opt/sca/app/src/db.js');

try {
  for (const identifier of ['admin', 'operator', 'user']) {
    await auth.find_or_create_test_user({ identifier });
  }
  const response = await fetch('http://signet:5050/create_client', {
    method: 'POST',
    body: new URLSearchParams({ client_name: 'preview-download', scope: 'download_file', client_uri: 'localhost', token_endpoint_auth_method: 'client_secret_basic', grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Signet client provisioning failed (${response.status})`);
  const client = await response.json();
  if (!client.client_id || !client.client_secret) throw new Error('Signet returned an incomplete client');
  writeFileSync('/preview-output/bootstrap.json', JSON.stringify({
    clientId: client.client_id,
    clientSecret: client.client_secret,
    workerToken: await issueToken('svc_tasks'),
  }), { mode: 0o600 });
} finally {
  await prisma.$disconnect();
}
