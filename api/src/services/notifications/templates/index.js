const UserRegisteredTemplate = require('./userRegistered');
const DatasetStagedTemplate = require('./datasetStaged');

const templateRegistry = {
  USER_REGISTERED: UserRegisteredTemplate,
  DATASET_STAGED: DatasetStagedTemplate,
};

/**
 * Retrieves the correct template class for an event.
 */
function getTemplateClass(eventName) {
  return templateRegistry[eventName.toUpperCase()] || null;
}

module.exports = { getTemplateClass };
