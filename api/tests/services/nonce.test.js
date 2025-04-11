/* eslint-disable no-console */
const nonceService = require('../../src/services/nonce');

async function main() {
  const nonce = await nonceService.createNonce({ purpose: 'test', expiresIn: 60 });
  console.log('Created nonce:', nonce);
  const used = await nonceService.useNonce(nonce);
  console.log('Nonce used:', used);
  const usedAgain = await nonceService.useNonce(nonce);
  console.log('Nonce used:', usedAgain);

  const nonce2 = await nonceService.createNonce();
  console.log('Created nonce:', nonce2);
  const used2 = await nonceService.useNonce(nonce2);
  console.log('Nonce used:', used2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
