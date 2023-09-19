const _ = require('lodash/fp');

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
 *   (e) => e,
 *   "groupedBy",
 *   (e) => e,
 *   "aggregatedValue",
 *   (groupedValues) => (
 *     groupedValues
 *       .reduce((accumulator, currentVal) => accumulator + currentVal)
 *   ),
 * );
 * // => [{ "groupedBy": "1", "aggregatedValue": 2 }, { "groupedBy": "2", "aggregatedValue": 6 }]
 *
 * @param {[*]} arr                    The array whose elements are to be grouped and aggregated
 * @param {Function} groupByFn         Callback used to group the elements of arr
 * @param {string} groupedByKey        The key used for representing the values by which to group
 *                                     the elements in arr
 * @param {Function} keyGenerationFn   Callback used to format the values (in the returned array)
 *                                     by which to group the elements in arr
 * @param {string} aggregatedResultKey The key used for representing the aggregation result in the
 *                                     returned array
 * @param {Function} aggregationFn     Callback used for aggregating the results in each grouping
 * @returns                            An array, every element of which contains the aggregated
 *                                     values produced from each grouping as well as the value used
 *                                     for producing said groupings.
 */
function groupByAndAggregate(
  arr,
  groupByFn,
  groupedByKey,
  keyGenerationFn,
  aggregatedResultKey,
  aggregationFn,
) {
  const grouped = _.groupBy(groupByFn)(arr);
  const ret = [];
  Object.entries(grouped).forEach(([groupedKey, groupedValues]) => {
    ret.push({
      [groupedByKey]: keyGenerationFn(groupedKey),
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
 * @param {[]} arr
 * @param {[]} numericStringFields
 * @returns Array containing values converted to numbers
 */
function numericStringsToNumbers(arr, numericStringFields = []) {
  const allObjects = _.every((e) => typeof e === 'object')(arr);
  if (allObjects && numericStringFields.length === 0) {
    return arr;
  }

  const ret = _.map((e) => {
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

  return ret;
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
};
