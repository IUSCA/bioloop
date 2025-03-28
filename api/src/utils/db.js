const { Prisma } = require('@prisma/client');

class TransactionRetryError extends Error {
  constructor(maxRetries, message = 'Transaction failed after maximum retries') {
    const _mesage = maxRetries ? `${message}. Maximum retries: ${maxRetries}` : message;
    super(_mesage);
    this.name = 'TransactionRetryError';
  }
}

/**
 * Executes a transaction with retry logic in case of write conflicts or deadlocks.
 *
 * @param {object} prisma - The Prisma client instance.
 * @param {function|array} statementsOrFn - A function representing an interactive transaction or an array of statements for a batch transaction.
 * @param {object} [options] - Optional settings for the transaction.
 * @param {number} [options.maxRetries=5] - The maximum number of retry attempts.
 * @param {string} [options.isolationLevel=Prisma.TransactionIsolationLevel.RepeatableRead] - The isolation level for the transaction.
 * @param {} [options.kwargs] - Additional options to pass to the transaction.
 *
 * @throws {TypeError} If the input is not a function or an array of statements.
 * @throws {Error} If the Prisma client is not defined.
 * @throws {Error} If maxRetries is less than 1.
 * @throws {TransactionRetryError} If all retry attempts are exhausted.
 * @returns {Promise<*>} The result of the transaction.
 */
async function transactionWithRetry(
  prisma,
  statementsOrFn,
  {
    maxRetries = 5,
    isolationLevel = Prisma.TransactionIsolationLevel.RepeatableRead,
    ...kwargs
  } = {},
) {
  let retries = 0;
  const isFunction = typeof statementsOrFn === 'function';
  const isArray = Array.isArray(statementsOrFn);

  if (!isFunction && !isArray) {
    throw new TypeError('Invalid transaction input. Must be a function or an array of statements.');
  }
  if (!prisma) {
    throw new Error('Prisma client is not defined');
  }
  if (maxRetries < 1) {
    throw new Error('maxRetries must be greater than 0');
  }
  while (retries < maxRetries) {
    try {
      if (isFunction) {
        // Interactive transaction
        // eslint-disable-next-line no-await-in-loop
        return await prisma.$transaction(statementsOrFn, { isolationLevel, ...kwargs });
      }
      // Batch transaction
      // eslint-disable-next-line no-await-in-loop
      return await prisma.$transaction(statementsOrFn, { isolationLevel, ...kwargs });
    } catch (error) {
      if (error?.code === 'P2034') {
        // P2034: "Transaction failed due to a write conflict or a deadlock. Please retry your transaction"
        console.warn(`Transaction failed with error code P2034. Retrying (${retries + 1}/${maxRetries})...`);
        retries += 1;
      } else {
        throw error;
      }
    }
  }
  // if we reach here, it means we have exhausted all retries
  throw new TransactionRetryError(maxRetries);
}

module.exports = {
  TransactionRetryError,
  transactionWithRetry,
};
