const INCLUDE = {
  argument_values: {
    include: {
      argument: true,
    },
  },
  definition: {
    select: {
      output_directory: true,
      program: true,
    },
  },
  initiator: {
    select: {
      name: true,
      username: true,
    },
  },
};

function getAssociations({ include_dataset = false, include_derived_datasets = false }) {
  const associations = {
    ...INCLUDE,
  };
  if (include_dataset) {
    associations.dataset = {
      select: {
        id: true,
        name: true,
        type: true,
        du_size: true,
        num_files: true,
        num_directories: true,
      },
    };
  }
  if (include_derived_datasets) {
    associations.derived_datasets = {
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
            type: true,
            du_size: true,
            num_files: true,
            num_directories: true,
          },
        },
      },
    };
  }
  return associations;
}

function getArgsList(conversion) {
  const positionalArgList = conversion.argument_values
    .filter((argVal) => argVal.argument.position)
    .sort((a1, a2) => a1.argument.position - a2.argument.position)
    .map((argVal) => argVal.value);
  const argsList = conversion.argument_values
    .filter((argVal) => !argVal.argument.position)
    .flatMap((argVal) => {
      const arg = argVal.argument;
      if (arg.is_flag && (argVal.value === 'true' || argVal.value === true)) {
        return [arg.name];
      }
      return [arg.name, argVal.value];
    });

  return positionalArgList.concat(argsList);
}

/**
 * Converts argument values to the appropriate type for database storage.
 *
 * This function ensures that NUMBER type arguments are stored as strings in the database
 * to maintain consistency with the existing schema where argument values are stored as strings.
 *
 * @param {any} value - The argument value to convert
 * @param {Object} argumentDefinition - The argument definition object
 * @param {string} argumentDefinition.value_type - The type of the argument (STRING, NUMBER, BOOLEAN)
 * @param {string} [argumentDefinition.name] - The name of the argument (for debugging)
 *
 * @returns {string|any} The converted value ready for database storage
 *
 * @example
 * // NUMBER type argument - converts to string
 * convertValueForStorage(42, { value_type: 'NUMBER', name: '--threads' })
 * // Returns: "42"
 *
 * // STRING type argument - no conversion needed
 * convertValueForStorage("hello", { value_type: 'STRING', name: '--input' })
 * // Returns: "hello"
 *
 * // BOOLEAN type argument - converts to boolean
 * convertValueForStorage(true, { value_type: 'BOOLEAN', name: '--verbose' })
 * // Returns: "true"
 */
function convertValueForStorage(value, argumentDefinition) {
  if (argumentDefinition.value_type === 'NUMBER' && typeof value === 'number') {
    return value.toString();
  }
  if (argumentDefinition.value_type === 'BOOLEAN' && typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return value;
}

module.exports = {
  INCLUDE,
  getArgsList,
  convertValueForStorage,
  getAssociations,
};
