const {
  setTimeout,
} = require('node:timers/promises');
const nonceService = require('../../src/services/nonce');

describe('Nonce Service', () => {
  it('should create a nonce and use it successfully', async () => {
    const nonce = await nonceService.createNonce({ purpose: 'test', expiresIn: 60 });
    expect(nonce).toBeDefined();

    const used = await nonceService.useNonce(nonce);
    expect(used).toBe(true);

    const usedAgain = await nonceService.useNonce(nonce);
    expect(usedAgain).toBe(false);
  });

  it('should create a nonce without expiration and use it successfully', async () => {
    const nonce2 = await nonceService.createNonce();
    expect(nonce2).toBeDefined();

    const used2 = await nonceService.useNonce(nonce2);
    expect(used2).toBe(true);
  });

  it('should delete expired nonces correctly', async () => {
    // delete all expired nonces
    await nonceService.deleteExpiredNonces(0);

    const nonce1 = await nonceService.createNonce({ purpose: 'test1', expiresIn: 1 });
    const nonce2 = await nonceService.createNonce({ purpose: 'test2', expiresIn: 2 });
    const nonce3 = await nonceService.createNonce({ purpose: 'test3' }); // No expiry

    expect(nonce1).toBeDefined();
    expect(nonce2).toBeDefined();
    expect(nonce3).toBeDefined();

    // Wait for 1.1 seconds
    await setTimeout(1100);

    const deletedCount = await nonceService.deleteExpiredNonces(1); // Deletes expired nonces
    expect(deletedCount).toBe(2);

    const usedNonce1 = await nonceService.useNonce(nonce1);
    const usedNonce2 = await nonceService.useNonce(nonce2);
    const usedNonce3 = await nonceService.useNonce(nonce3);

    expect(usedNonce1).toBe(false); // Expired and deleted
    expect(usedNonce2).toBe(true); // Not Expired
    expect(usedNonce3).toBe(false); // Not expired
  });
});
