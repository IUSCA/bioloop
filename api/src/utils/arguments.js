const assert = require('assert');

const datasetService = require('../services/dataset');

/**
* Validates a single value against argument constraints.
* @param {any} val - The value to validate.
* @param {Object} argument - The argument definition object.
* @returns {boolean|string} - Returns true if valid, otherwise an error message.
*/
function validateSingleValue(val, argument) {
  const {
    name, value_type, allowed_values,
    min_value, max_value, min_length, max_length,
  } = argument;

  switch (value_type) {
    case 'STRING':
      if (typeof val !== 'string') {
        return `Error: ${name} should be a string.`;
      }
      if (min_length != null && val.length < min_length) {
        return `Error: ${name} should have at least ${min_length} characters.`;
      }
      if (max_length != null && val.length > max_length) {
        return `Error: ${name} should have at most ${max_length} characters.`;
      }
      break;

    case 'NUMBER':
      if (typeof val !== 'number') {
        return `Error: ${name} should be a number.`;
      }
      if (min_value != null && val < min_value) {
        return `Error: ${name} should be at least ${min_value}.`;
      }
      if (max_value != null && val > max_value) {
        return `Error: ${name} should be at most ${max_value}.`;
      }
      break;

    case 'BOOLEAN':
      if (typeof val !== 'boolean' || val === 'true' || val === 'false') {
        return `Error: ${name} should be a boolean.`;
      }
      break;

    default:
      return `Error: ${name} has an invalid value type.`;
  }

  // Check if value is in the allowed values list
  if (allowed_values && allowed_values.length > 0) {
    // For allowed_values comparison, convert the value to string since allowed_values are stored as strings
    const valForComparison = value_type === 'NUMBER' ? val.toString() : val;
    if (!allowed_values.includes(valForComparison)) {
      return `Error: ${name} should be one of the following values: ${allowed_values.join(', ')}.`;
    }
  }

  return true;
}

/**
 * Validates an argument value against the argument's constraints.
 * @param {any} val - The value to validate.
 * @param {Object} argument - The argument definition object.
 * @param {string} argument.name - The name of the argument.
 * @param {string} argument.value_type - The type of value (STRING, NUMBER, BOOLEAN).
 * @param {string[]} [argument.allowed_values] - Optional list of allowed values.
 * @param {boolean} [argument.is_required] - Whether the argument is required.
 * @param {string} [argument.default_value] - Default value for the argument.
 * @param {boolean} [argument.is_flag] - Whether the argument is a flag (boolean).
 * @param {string} [argument.description] - Optional description of the argument.
 * @param {number} [argument.min_value] - Optional minimum value for numeric types.
 * @param {number} [argument.max_value] - Optional maximum value for numeric types.
 * @param {number} [argument.min_length] - Optional minimum length for string types.
 * @param {number} [argument.max_length] - Optional maximum length for string types.
 * @param {position} [argument.position] - Optional position of the argument in the command.
 * @returns {boolean|string} - Returns true if valid, otherwise an error message.
 */
function validateArgument(argument, val) {
  const {
    name, is_required, is_flag, position,
  } = argument;

  // Check if the value is required and not provided
  if (is_required && (val === undefined || val === null || val === '')) {
    return `Error: ${name} is required.`;
  }

  // Check if the argument is positional and value is not provided
  if (position && (val === undefined || val === null || val === '')) {
    return `Error: positional argument ${position} is required.`;
  }

  // If value is not required and not provided, return true (valid)
  if (!is_required && (val === undefined || val === null || val === '')) {
    return true;
  }

  // value is provided
  // Handle flag (boolean) arguments
  if (is_flag) {
    if (typeof val !== 'boolean' || val === 'true' || val === 'false') {
      return `Error: ${name} should be a boolean flag.`;
    }
    return true;
  }

  // Validate single value
  return validateSingleValue(val, argument);
}

/**
 * Resolves the dynamic argument value based on the provided argument and dataset ID.
 *
 * @param {Object} arg - The argument object containing dynamic variable name and other properties.
 * @param {string} datasetId - The ID of the dataset to retrieve.
 * @returns {Promise<String|null>} A promise that resolves to an object containing the argument ID and its resolved value(s).
 * If unable to resolve, the value will be null.
 * @throws Will throw an error if the dynamic variable name is not supported.
 */
async function resolveDynamicArgumentValue(arg, datasetId) {
  const dataset = await datasetService.get_dataset({
    id: datasetId,
  });

  // TODO: this is where dynamic variables are resolved.

  assert.fail(`Dynamic argument value ${arg.default_value} not supported.`);
}

module.exports = {
  validateArgument,
  validateSingleValue,
  resolveDynamicArgumentValue,
};
