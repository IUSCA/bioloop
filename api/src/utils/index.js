const fs = require('fs');
const path = require('path');
const _ = require('lodash/fp');
const { Prisma } = require('@prisma/client');

function renameKey(oldKey, newKey) {
  return (obj) => {
  // eslint-disable-next-line no-param-reassign
    obj[newKey] = obj[oldKey];
    // eslint-disable-next-line no-param-reassign
    delete obj[oldKey];
    return obj;
  };
}

function setDifference(setA, setB) {
  const _setB = new Set(setB);
  const _difference = new Set(setA);
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setB) { _difference.delete(elem); }

  return _difference;
}

function setUnion(setA, setB) {
  const _setB = new Set(setB);
  const _union = new Set(setA);
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setB) { _union.add(elem); }

  return _union;
}

function setIntersection(setA, setB) {
  const _setA = new Set(setA);
  const _setB = new Set(setB);
  const _intersection = new Set();
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setA) { if (_setB.has(elem)) _intersection.add(elem); }

  return _intersection;
}

function log_axios_error(error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    console.error(
      'Axios Error: The request was made and the server responded with a status code',
      `Error ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`,
    );
  } else if (error.request) {
    // The request was made but no response was received
    console.error('Axios Error: The request was made but no response was received');
  } else {
    // Something else happened in making the request that triggered an error
    console.error(
      'Axios Error:  Something else happened in making the request that triggered an error',
      error.message,
    );
  }
}

function sanitize_timestamp(t) {
  if (typeof (t) === 'string') {
    const d = new Date(t);
    // eslint-disable-next-line no-restricted-globals
    if (!isNaN(d)) return d;
  }
}

/**
 * Given an array, groups the elements of the array based on the grouping function provided,
 * aggregates values from the grouped elements by calling the aggregation function provided
 * on the collection of grouped elements, and returns an array, every element of which contains
 * the aggregated values produced from each grouping as well as the value used for producing
 * said groupings. The order of grouped values is determined by the order they occur in the array
 * provided.
 *
 * Example usage:
 * groupByAndAggregate(
 *   [1, 1, 2, 2, 2],
 *   "groupedBy",
 *   "aggregatedValue",
 *   (groupedValues) => (
 *     groupedValues
 *       .reduce((accumulator, currentVal) => accumulator + currentVal)
 *   ),
 * );
 * // => [{ "groupedBy": "1", "aggregatedValue": 2 }, { "groupedBy": "2", "aggregatedValue": 6 }]
 *
 * @param {[*]} arr                                    The array whose elements are to be grouped
 *                                                     and aggregated
 * @param {string} groupedByKey                        The key used for representing the values
 *                                                     (in the returned array) by which elements
 *                                                     in arr will be grouped
 * @param {string} aggregatedResultKey                 The key used for representing the aggregation
 *                                                     results (in the returned array) per grouping
 * @param {Function} aggregationFn                     Callback used for aggregating the results in
 *                                                     each grouping
 * @param {Function} [groupByFn = (e) => e]            Optional callback used to group the elements
 *                                                     of arr
 * @param {Function} [groupedByValFormatFn = (e) => e] Optional callback used to format the values
 *                                                     (in the returned array) by which groupings
 *                                                     are produced
 * @returns                                            An array, every element of which contains the
 *                                                     aggregated values produced from each grouping
 *                                                     as well as the values used for producing said
 *                                                     groupings.
 */
function groupByAndAggregate(
  arr,
  groupedByKey,
  aggregatedResultKey,
  aggregationFn,
  groupByFn = (e) => e,
  groupedByValFormatFn = (e) => e,
) {
  const grouped = _.groupBy(groupByFn)(arr);
  const ret = [];
  Object.entries(grouped).forEach(([groupedKey, groupedValues]) => {
    ret.push({
      [groupedByKey]: groupedByValFormatFn(groupedKey),
      [aggregatedResultKey]: aggregationFn(groupedValues),
    });
  });
  return ret;
}

/**
 * Given an array, attempts to convert the numeric strings in the array to Numbers. If the source
 * array consists of numeric strings, they will be converted to Numbers. If the source array
 * consists of objects containing numeric string values, the values corresponding to each key in
 * the numericStringFields will be converted to Numbers. The source array remains unchanged.
 *
 * Note - If arr is an array of objects, this method will only consider the values of objects at
 * the first level to be converted to numbers. For example, in array
 * [{ x1: "1", x2: "2", x3: { "y": "3" } }], only x1's and x2's values will be considered for
 * conversion, and x3's value, which contains a numeric string embedded in an object, will
 * be ignored.
 *
 * Example usage:
 * numericStringsToNumbers(['1', '2', 3])
 * // => [1, 2, 3]
 * numericStringsToNumbers(
 *   [
 *     {
 *       x: "1",
 *       y: "2",
 *       z: "6",
 *     },
 *     {
 *       x: "3",
 *       y: "5",
 *       w: true,
 *     },
 *   ],
 *   ["y"],
 * );
 * // =>
 * [
 *   {
 *     x: "1",
 *     y: 2,
 *     z: "6",
 *   },
 *   {
 *     x: "3",
 *     y: 5,
 *     w: true,
 *   },
 * ]
 * @param {[*]} arr                             Array containing 0 or more numeric strings to
 *                                              be converted to numbers. If the elements of arr are
 *                                              of any other type besides numbers or objects, they
 *                                              will be returned as is.
 * @param {[string]} [numericStringFields = []] If arr is an array of objects, each object will be
 *                                              searched for keys listed in the numericStringFields
 *                                              arg, and if the key's value is a numeric string,
 *                                              it will be converted to a number.
 * @returns Array containing values to be converted to numbers
 */
function numericStringsToNumbers(arr, numericStringFields = []) {
  const allObjects = _.every((e) => typeof e === 'object')(arr);
  if (allObjects && numericStringFields.length === 0) {
    return arr;
  }

  return _.map((e) => {
    if (typeof e === 'string') {
      return !Number.isNaN(e) && Number(e);
    } if (typeof e === 'object') {
      const convertedFields = {};
      numericStringFields.forEach((field) => {
        if (Object.keys(e).includes(field)) {
          convertedFields[field] = !Number.isNaN(e[field]) && Number(e[field]);
        }
      });
      return { ...e, ...convertedFields };
    }
    return e;
  })(arr);
}

function decodeJWT(token) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64').toString());
}

function readUsersFromJSON(fname) {
  try {
    const fpath = path.join(global.__basedir, fname);

    // check if file exists
    const exists = fs.existsSync(fpath, fs.constants.F_OK);

    // read from file
    if (exists) {
      const users_read = JSON.parse(fs.readFileSync(fpath, 'utf8'));

      // validate users_read is an array
      if (Array.isArray(users_read)) {
        return users_read;
      }
      // eslint-disable-next-line no-console
      console.log(`${fpath} is not an array. Skipping.`);
    }
    return [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`Unable to read users from file ${fname}. Skipping.`, e);
    return [];
  }
}

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

function base64urlEncode(buf) {
  return buf
    .toString('base64') // Regular base64 encoder
    .replace(/=/g, '') // Remove any trailing '='s
    .replace(/\+/g, '-') // Replace '+' with '-'
    .replace(/\//g, '_'); // Replace '/' with '_'
}

function isObjectWithKeys(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function findDuplicates(array) {
  const duplicates = new Set();
  const unique = new Set();

  array.forEach((item) => {
    if (unique.has(item)) {
      duplicates.add(item);
    } else {
      unique.add(item);
    }
  });

  return { unique, duplicates };
}

module.exports = {
  renameKey,
  setDifference,
  setUnion,
  setIntersection,
  log_axios_error,
  sanitize_timestamp,
  groupByAndAggregate,
  numericStringsToNumbers,
  decodeJWT,
  readUsersFromJSON,
  transactionWithRetry,
  TransactionRetryError,
  base64urlEncode,
  isObjectWithKeys,
  findDuplicates,
};
