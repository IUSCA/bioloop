export const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";

export const DATASET_NAME_HAS_SPACES_ERROR =
  "Dataset name cannot contain spaces";

export const DATASET_NAME_MIN_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";

export const UNKNOWN_VALIDATION_ERROR = "An unknown error occurred";

export function validateDatasetNameFormat(name) {
  if (!name) {
    return {
      isNameValid: false,
      error: DATASET_NAME_REQUIRED_ERROR,
    };
  }

  if (name.length < 3) {
    return {
      isNameValid: false,
      error: DATASET_NAME_MIN_LENGTH_ERROR,
    };
  }

  if (name.includes(" ")) {
    return {
      isNameValid: false,
      error: DATASET_NAME_HAS_SPACES_ERROR,
    };
  }

  return {
    isNameValid: true,
    error: null,
  };
}

export function getDatasetExistsError(datasetType, datasetTypes) {
  const datasetTypeLabel = datasetTypes.find(
    (type) => type.value === datasetType,
  )?.label;

  return datasetTypeLabel
  ? `A ${datasetTypeLabel} with this name already exists.`
  : "A dataset with this name already exists.";
}

/**
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.datasetType
 * @param {Function} options.checkIfExists - ({ name, type }) => Promise<boolean>
 * @returns {Promise<boolean>} true when the dataset already exists
 */
export async function checkDatasetNameExists({
  name,
  datasetType,
  checkIfExists,
}) {
  // Vuestic may still trigger async validation when `name` is falsy even if
  // sync validation failed. Treat that as "exists" so callers reject the name.
  if (!name) {
    return true;
  }

  return checkIfExists({ name, type: datasetType });
}

/**
 * Validates dataset name format and checks for duplicates.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.datasetType
 * @param {Array<{ label: string, value: string }>} options.datasetTypes
 * @param {Function} options.checkIfExists - ({ name, type }) => Promise<boolean>
 * @returns {Promise<{ isNameValid: boolean, error: string | null }>}
 */
export async function validateDatasetName({
  name,
  datasetType,
  datasetTypes,
  checkIfExists,
}) {
  const formatResult = validateDatasetNameFormat(name);

  if (!formatResult.isNameValid) {
    return formatResult;
  }

  try {
    const exists = await checkDatasetNameExists({
      name,
      datasetType,
      checkIfExists,
    });

    return {
      isNameValid: !exists,
      error: exists ? getDatasetExistsError(datasetType, datasetTypes) : null,
    };
  } catch {
    return {
      isNameValid: false,
      error: UNKNOWN_VALIDATION_ERROR,
    };
  }
}

export function hasMetadataAssignmentError({
  willAssignSourceRawData,
  selectedRawData,
  willAssignProject,
  projectSelected,
  willAssignSourceInstrument,
  selectedSourceInstrument,
}) {
  return (
    (willAssignSourceRawData && !selectedRawData) ||
    (willAssignProject && !projectSelected) ||
    (willAssignSourceInstrument && !selectedSourceInstrument)
  );
}
