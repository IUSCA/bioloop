const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');
const _ = require('lodash/fp');
const userService = require('./user');

const prisma = new PrismaClient();

const PROJECT_ASSOCIATION_ERRORS = {
  noProjectUserAssociation: 'User is not associated with the specified project',
  noAssociatingUserId: 'Id of the User associating the Project is required',
};

const PROJECT_CREATION_ERRORS = {
  projectIdProvidedWhenCreatingNewProject: 'Cannot create a new Project when Project ID is provided',
};

function normalize_name(name) {
  // convert to lowercase
  // replace all character other than a-z, 0-9, and - with -
  // replace consecutive hyphens with one -

  return (name || '')
    .toLowerCase()
    .replaceAll(/[\W_]/g, '-')
    .replaceAll(/-+/g, '-');
}

const NATO_ALPHABET = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
  'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey',
  'xray', 'yankee', 'zulu',
];

function identifier_suffix_gen(identifiers) {
  function* gen() {
    let i = 0;
    const N = identifiers.length;

    while (true) {
      if (i < N) {
        yield identifiers[i];
      } else {
        yield `${identifiers[i % N]}-${Math.floor(i / N)}`;
      }
      i += 1;
    }
  }

  return gen;
}

const nato_suffix_gen = identifier_suffix_gen(NATO_ALPHABET);

async function is_slug_unique(slug, project_id) {
  // query if any other project has the exact slug
  const project = await prisma.project.findFirst({
    where: {
      slug,
      NOT: {
        id: project_id,
      },
    },
  });
  return !project;
}

async function generate_slug({ name, project_id }) {
  // normalizes the name and adds incremental suffixes until the combination is unique

  const normalized_name = normalize_name(name);

  if (await is_slug_unique(normalized_name, project_id)) {
    return normalized_name;
  }

  const suffix_gen = nato_suffix_gen();
  let slug = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const suffix = suffix_gen.next().value;
    slug = `${normalized_name}-${suffix}`;

    // eslint-disable-next-line no-await-in-loop
    if (await is_slug_unique(slug)) {
      return slug;
    }
  }
}

async function has_project_assoc({
  projectId, userId,
}) {
  const projectUserAssociations = await prisma.project_user.findMany({
    where: {
      project_id: projectId,
      user_id: userId,
    },
  });
  return projectUserAssociations.length > 0;
}

/**
 * Builds a Prisma include object for fetching entities associated with projects.
 *
 * @param {Object} options - The options for building the include object.
 * @param {boolean} [options.include_users=true] - Whether to include Users associated with the project.
 * @param {boolean} [options.include_datasets=true] - Whether to include Datasets associated with the project.
 * @param {boolean} [options.include_contacts=true] - Whether to include Contact included with the project.
 * @returns {Object} An object specifying which associations to include in the Prisma query.
 *
 * @description
 * This function generates an include object for Prisma queries, allowing selective inclusion
 * of data associated with Projects being retrieved.
 *
 */
const build_include_object = ({
  include_users = true,
  include_datasets = true,
  include_contacts = true,
} = {}) => _.omitBy(_.isUndefined)({
  users: include_users ? {
    select: {
      user: true,
      assigned_at: true,
      assignor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  } : undefined,
  datasets: include_datasets ? {
    select: {
      dataset: {
        include: {
          workflows: {
            select: {
              id: true,
            },
          },
        },
      },
      assigned_at: true,
      assignor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  } : undefined,
  contacts: include_contacts ? {
    select: {
      contact: true,
      assigned_at: true,
      assignor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  } : undefined,
});

/**
 * Generates a name for an automatically created project.
 *
 * @param {Object} options - The options for generating the project name.
 * @param {string} [options.prefix] - An optional prefix to prepend to the project name.
 * @param {string} [options.suffix] - An optional suffix to append to the project name.
 * @returns {string} The generated project name.
 *
 * @description
 * This function generates a project name using the following format:
 * - If both prefix and suffix are provided: "{prefix}-{randomString}-{suffix}"
 * - If only suffix is provided: "{prefix}-{randomString}"
 * - If only prefix is provided: "{randomString}-{suffix}"
 * - If neither is provided: "{randomString}"
 *
 * The randomString is a 16-character hexadecimal string generated using cryptographically strong random bytes.
 */
function generate_project_name({ prefix, suffix } = {}) {
  const randomStr = crypto.randomBytes(8).toString('hex'); // Generate 16 random characters

  let projectName = '';
  projectName = (prefix && typeof prefix === 'string' && prefix.trim() !== '') ? `${prefix}-${randomStr}` : randomStr;
  if (suffix && typeof suffix === 'string' && suffix.trim() !== '') {
    projectName = `${projectName}-${suffix}`;
  }

  return projectName;
}

/**
 * Builds a query object for creating a new project.
 *
 * @async
 * @param {Object} options - The options for building the creation query.
 * @param {string[]} [options.user_ids=[]] - Array of user IDs to associate with the project.
 * @param {string[]} [options.dataset_ids=[]] - Array of dataset IDs to associate with the project.
 * @param {string} [options.assignor_id] - ID of the user assigning users/datasets to the project.
 * @param {string} [options.name] - The name of the project.
 * @param {string} [options.description] - The description of the project.
 * @param {boolean} [options.browser_enabled] - Whether the project is enabled for Genome Browser.
 * @param {Object} [options.funding] - Funding information for the project.
 * @param {Object} [options.metadata] - Additional metadata for the project.
 * @returns {Promise<Object>} An object containing the data for creating a project.
 */
async function buildCreationQuery({
  user_ids = [], dataset_ids = [], assignor_id, ...projectData
} = {}) {
  const data = _.flow([
    _.pick(['name', 'description', 'browser_enabled', 'funding', 'metadata']),
    _.omitBy(_.isNil),
  ])(projectData);

  if (!data.name || data.name.trim() === '') {
    data.name = generate_project_name();
  }

  data.slug = await generate_slug({ name: data.name });

  if ((user_ids || []).length > 0) {
    data.users = {
      create: user_ids.map((id) => ({
        user_id: id,
        ...(assignor_id && { assignor_id }),
      })),
    };
  }

  if ((dataset_ids || []).length > 0) {
    data.datasets = {
      create: dataset_ids.map((id) => ({
        dataset_id: id,
        ...(assignor_id && { assignor_id }),
      })),
    };
  }

  return data;
}

const buildOrderByObject = (field, sortOrder, nullsLast = true) => {
  const nullable_order_by_fields = ['du_size', 'size'];

  if (!field || !sortOrder) {
    return {};
  }
  if (nullable_order_by_fields.includes(field)) {
    return {
      [field]: { sort: sortOrder, nulls: nullsLast ? 'last' : 'first' },
    };
  }
  return {
    [field]: sortOrder,
  };
};

/**
 * Builds a query object for associating datasets with a project.
 *
 * @async
 * @param {Object} options - The options for building the dataset association query.
 * @param {string} options.project_id - The ID of the project to associate datasets with.
 * @param {string[]} [options.dataset_ids=[]] - Array of dataset IDs to associate with the project.
 * @param {string} [options.assignor_id] - ID of the user assigning the datasets.
 * @returns {Promise<Object[]|null>} An array of objects for creating project-dataset associations, or null if no datasets to associate.
 */
const buildDatasetAssociationQuery = async ({
  project_id,
  dataset_ids = [],
  assignor_id,
} = {}) => {
  if (dataset_ids.length === 0) {
    return null; // There are no datasets to associate
  }

  return dataset_ids.map((dataset_id) => ({
    project_id,
    dataset_id,
    ...(assignor_id && { assignor_id }),
  }));
};

/**
 * Creates a new project in the database.
 *
 * @async
 * @param {Object} options - The options for creating the project.
 * @param {import('@prisma/client').PrismaClient} [options.tx] - The Prisma transaction object.
 * @param {Object} [options.include] - Specifies which related records to include in the query result.
 * @param {string} [options.name] - The name of the project.
 * @param {string} [options.description] - The description of the project.
 * @param {boolean} [options.browser_enabled] - Whether the Project has Genome Browser enabled.
 * @param {Object} [options.funding] - Funding information for the project.
 * @param {Object} [options.metadata] - Additional metadata for the project.
 * @param {string[]} [options.user_ids] - Array of user IDs to associate with the project.
 * @param {string[]} [options.dataset_ids] - Array of dataset IDs to associate with the project.
 * @param {string} [options.assignor_id] - ID of the user assigning users/datasets to the project.
 * @returns {Promise<Object>} The created project object.
 * @throws {Error} If there's an issue creating the project.
 */
const create_project = async ({
  tx,
  include,
  ...data
}) => {
  const transactionManager = tx || prisma;

  const projectCreationQuery = await buildCreationQuery({
    ...data,
  });
  return transactionManager.project.create({
    data: projectCreationQuery,
    include: include || undefined,
  });
};

/**
 * Assigns datasets to an existing project.
 *
 * @async
 * @param {Object} options - The options for assigning datasets.
 * @param {import('@prisma/client').PrismaClient} [options.tx] - The Prisma transaction object.
 * @param {Object} [options.include] - Specifies which related records to include in the query result.
 * @param {string} options.project_id - The ID of the project to assign datasets to.
 * @param {string[]} options.dataset_ids - Array of dataset IDs to assign to the project.
 * @param {string} options.assignor_id - ID of the user assigning the datasets.
 * @returns {Promise<Object>} The result of the dataset assignment operation.
 * @throws {Error} If the assignor doesn't have permission or if there's an issue assigning datasets.
 */
const assign_datasets = async ({
  tx,
  include,
  ...data
}) => {
  const transactionManager = tx || prisma;

  if (!data.assignor_id) { // ID of user who is associating datasets with the project
    throw new Error(PROJECT_ASSOCIATION_ERRORS.noAssociatingUserId);
  }

  const assignorRoles = await userService.getUserRoles({ user_id: data.assignor_id });

  // ensure that the user associating Datasets to the Project has access to the Project
  let isAuthorized = assignorRoles.some((role) => ['admin', 'operator'].includes(role));
  const userAssociation = await transactionManager.project_user.findUnique({
    where: {
      project_id_user_id: {
        project_id: data.project_id,
        user_id: data.assignor_id,
      },
    },
  });
  isAuthorized = isAuthorized || !!userAssociation;

  if (!isAuthorized) {
    throw new Error(PROJECT_ASSOCIATION_ERRORS.noProjectUserAssociation);
  }

  const projectAssociationQuery = await buildDatasetAssociationQuery({
    ...data,
  });
  return transactionManager.project_dataset.createMany({
    data: projectAssociationQuery,
    include: include || undefined,
  });
};

module.exports = {
  normalize_name,
  generate_slug,
  has_project_assoc,
  generate_project_name,
  buildCreationQuery,
  build_include_object,
  buildOrderByObject,
  buildDatasetAssociationQuery,
  create_project,
  assign_datasets,
  PROJECT_ASSOCIATION_ERRORS,
  PROJECT_CREATION_ERRORS,
};
