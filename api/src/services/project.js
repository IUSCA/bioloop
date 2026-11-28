const crypto = require('node:crypto');
const _ = require('lodash/fp');
const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

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
        id: project_id ?? Prisma.skip,
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
  project_id, user_id,
}) {
  const projectUserAssociations = await prisma.project_user.findMany({
    where: {
      project_id,
      user_id,
    },
  });
  return projectUserAssociations.length > 0;
}

/**
 * Gets the owner of a project.
 *
 * @param {string} project_id - The ID of the project.
 * @returns {Object} The owner of the project.
 */
async function get_project_owner({ project_id }) {
  const project = await prisma.project.findUniqueOrThrow({
    where: {
      id: project_id,
    },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          cas_id: true,
          notes: true,
          created_at: true,
          updated_at: true,
          is_deleted: true,
          metadata: true,
        },
      },
    },
  });
  return project.owner;
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

async function build_creation_query({
  user_ids = [],
  dataset_ids = [],
  assignor_id,
  ...payload

} = {}) {
  const data = _.flow([
    _.pick(['name', 'description', 'browser_enabled', 'funding', 'metadata', 'owner_id']),
    _.omitBy(_.isNil),
  ])(payload);

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

const build_order_by_object = (field, sortOrder, nullsLast = true) => {
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

const create_project = async ({
  tx,
  include,
  data,
}) => {
  const transactionManager = tx || prisma;

  const projectCreationQuery = await build_creation_query(data);
  return transactionManager.project.create({
    data: projectCreationQuery,
    include: include || undefined,
  });
};

module.exports = {
  normalize_name,
  generate_slug,
  has_project_assoc,
  get_project_owner,
  generate_project_name,
  build_creation_query,
  build_include_object,
  build_order_by_object,
  create_project,
};
