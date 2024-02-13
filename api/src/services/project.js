const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalize_name(name) {
  // conver to lowercase
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

module.exports = {
  normalize_name,
  generate_slug,
  has_project_assoc,
};
