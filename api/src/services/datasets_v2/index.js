/**
 * Gets the bundle name for a staged dataset.
 *
 * @function getBundleName
 * @param {Object} dataset - The dataset which has been or will be staged.
 * @returns {string} The name of the bundle which contains the staged dataset.
 */
const getBundleName = (dataset) => `${dataset.name}.${dataset.type}.tar`;

module.exports = {
  getBundleName,
};
