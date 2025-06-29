const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');
const _ = require('lodash/fp');
const { PROJECT_ASSOCIATION_ERRORS } = require('../constants');
const userService = require('./user');

const prisma = new PrismaClient();

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
 * - If both prefix and suffix are provided: "{suffix}-{randomString}-{prefix}"
 * - If only suffix is provided: "{suffix}-{randomString}"
 * - If only prefix is provided: "{randomString}-{prefix}"
 * - If neither is provided: "{randomString}"
 *
 * The randomString is a 16-character hexadecimal string generated using cryptographically strong random bytes.
 *
 * @example
 * // With both prefix and suffix
 * generate_project_name({ prefix: 'dev', suffix: 'test' }) // Returns something like: "dev-3a7bd1c9f0b24e8e-test"
 *
 * // With only suffix
 * generate_project_name({ suffix: 'test' }) // Returns something like: "3a7bd1c9f0b24e8e-test"
 *
 * // With only prefix
 * generate_project_name({ prefix: 'dev' }) // Returns something like: "dev-3a7bd1c9f0b24e8e"
 *
 * // Without prefix or suffix (generates only a random identifier)
 * generate_project_name() // Returns something like: "3a7bd1c9f0b24e8e"
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

// todo - test existing endpoints
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

const create_project = async ({
  tx,
  ...data
}) => {
  const transactionManager = tx || prisma;

  console.log('create_project', data);

  const projectCreationQuery = await buildCreationQuery({
    ...data,
  });
  await transactionManager.project.create({ data: projectCreationQuery });
};

const assign_datasets = async ({
  tx,
  ...data
}) => {
  const transactionManager = tx || prisma;

  console.log('assign_datasets', data);

  if (!data.assignor_id) { // ID of user who is associating datasets with the project
    throw new Error(PROJECT_ASSOCIATION_ERRORS.noAssociatingUserId);
  }

  const assignorRoles = await userService.getUserRoles({ user_id: data.assignor_id });
  let isAuthorized = assignorRoles.some((role) => ['admin', 'operator'].includes(role));

  // ensure that the user associating business entities with the project has access to the project
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
  await transactionManager.project_dataset.createMany({ data: projectAssociationQuery });
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
  // buildAssociationQueryForNewProject,

};
