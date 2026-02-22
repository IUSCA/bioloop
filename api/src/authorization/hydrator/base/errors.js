// custom error class for hydration errors
class HydrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HydrationError';
  }
}

module.exports = { HydrationError };
