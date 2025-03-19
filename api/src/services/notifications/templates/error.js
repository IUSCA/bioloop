// custom error class for non-retryable errors
class NonRetryableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

module.exports = NonRetryableError;
