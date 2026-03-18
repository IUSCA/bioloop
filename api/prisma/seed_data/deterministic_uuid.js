/* eslint-disable no-console */
/* eslint-disable no-plusplus */
/* eslint-disable no-bitwise */
/* eslint-disable max-len */
// Deterministic UUID generator used for seed data.
// This ensures consistent, reproducible UUIDs across seed runs while still
// producing valid RFC 4122 version 4 UUIDs (with correct version/variant bits).

function createDeterministicUuidGenerator(start = 0n) {
  let counter = BigInt(start);

  return function generate() {
    const bytes = new Uint8Array(16);

    // Write counter into last 8 bytes (big-endian)
    let temp = counter++;
    for (let i = 15; i >= 8; i--) {
      bytes[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }

    // Set version (4)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;

    // Set variant (RFC 4122)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return (
      `${hex.slice(0, 8)}-`
      + `${hex.slice(8, 12)}-`
      + `${hex.slice(12, 16)}-`
      + `${hex.slice(16, 20)}-`
      + `${hex.slice(20)}`
    );
  };
}

module.exports = {
  createDeterministicUuidGenerator,
};
