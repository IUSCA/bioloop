/* eslint-disable no-case-declarations */

/**
 * Batch-fetch user display names
 * @param {PrismaClient} tx - Transaction client
 * @param {string[]} subject_ids - Array of subject IDs to fetch names for
 * @returns {Promise<Map<string, string>>} Map of subject_id => name
 */
async function resolveUserNames(tx, subject_ids) {
  if (!subject_ids || subject_ids.length === 0) {
    return new Map();
  }

  // Remove duplicates and nulls
  const uniqueIds = [...new Set(subject_ids.filter(Boolean))];

  try {
    const users = await tx.user.findMany({
      where: {
        subject_id: {
          in: uniqueIds,
        },
      },
      select: {
        subject_id: true,
        name: true,
      },
    });

    const nameMap = new Map();
    users.forEach((user) => {
      nameMap.set(user.subject_id, user.name);
    });

    return nameMap;
  } catch (error) {
    console.error('Error resolving user names:', error);
    return new Map();
  }
}

/**
 * Single-entity name lookup
 * @param {PrismaClient} tx - Transaction client
 * @param {string} type - Entity type: 'user' | 'group' | 'collection' | 'dataset' | 'grant'
 * @param {string} id - Entity ID
 * @returns {Promise<string|null>} Entity name or null if not found
 */
async function resolveEntityName(tx, type, id) {
  if (!type || !id) {
    return null;
  }

  try {
    switch (type.toLowerCase()) {
      case 'user':
        const user = await tx.user.findUnique({
          where: { subject_id: id },
          select: { name: true },
        });
        return user?.name ?? null;

      case 'group':
        const group = await tx.group.findUnique({
          where: { id },
          select: { name: true },
        });
        return group?.name ?? null;

      case 'collection':
        const collection = await tx.collection.findUnique({
          where: { id },
          select: { name: true },
        });
        return collection?.name ?? null;

      case 'dataset':
        const dataset = await tx.dataset.findUnique({
          where: { resource_id: id },
          select: { name: true },
        });
        return dataset?.name ?? null;

      case 'grant':
        // For grants, we need to resolve to a human-readable format
        // "AccessType on ResourceType for SubjectType"
        const grant = await tx.grant.findUnique({
          where: { id },
          select: {
            access_type_id: true,
            resource_id: true,
            subject_id: true,
            resource: {
              select: {
                resource_type: true,
              },
            },
            subject: {
              select: {
                type: true,
              },
            },
            access_type: {
              select: {
                name: true,
              },
            },
          },
        });

        if (!grant) return null;

        const accessTypeName = grant?.grant_access_type?.name ?? 'Unknown';
        const resourceType = grant?.resource?.resource_type ?? 'Unknown';
        const subjectType = grant?.subject?.type === 'USER' ? 'User' : 'Group';

        return `${accessTypeName} on ${resourceType} for ${subjectType}`;

      case 'grant_access_type':
        const accessType = await tx.grant_access_type.findUnique({
          where: { id },
          select: { name: true },
        });
        return accessType?.name ?? null;

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error resolving ${type} name:`, error);
    return null;
  }
}

/**
 * Batch-fetch subject entity information (user or group)
 * Used for events that involve a "subject" (the entity being acted upon)
 * @param {PrismaClient} tx - Transaction client
 * @param {string[]} subject_ids - Array of subject IDs
 * @returns {Promise<Map<string, {name: string, type: string}>>}
 */
async function resolveSubjects(tx, subject_ids) {
  if (!subject_ids || subject_ids.length === 0) {
    return new Map();
  }

  const uniqueIds = [...new Set(subject_ids.filter(Boolean))];

  try {
    const subjects = await tx.subject.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        type: true,
        user: {
          select: {
            name: true,
          },
        },
        group: {
          select: {
            name: true,
          },
        },
      },
    });

    const subjectMap = new Map();
    subjects.forEach((subject) => {
      const name = subject.type === 'USER' ? subject.user?.name : subject.group?.name;
      subjectMap.set(subject.id, {
        name: name ?? 'Unknown',
        type: subject.type,
      });
    });

    return subjectMap;
  } catch (error) {
    console.error('Error resolving subjects:', error);
    return new Map();
  }
}

async function resolveResources(tx, resource_ids) {
  if (!resource_ids || resource_ids.length === 0) {
    return new Map();
  }

  const uniqueIds = [...new Set(resource_ids.filter(Boolean))];

  try {
    const resources = await tx.resource.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        type: true,
        dataset: {
          select: {
            name: true,
          },
        },
        collection: {
          select: {
            name: true,
          },
        },
      },
    });

    const resourceMap = new Map();
    resources.forEach((resource) => {
      const name = resource.type === 'DATASET' ? resource.dataset?.name : resource.collection?.name;
      resourceMap.set(resource.id, {
        name: name ?? 'Unknown',
        type: resource.type,
      });
    });

    return resourceMap;
  } catch (error) {
    console.error('Error resolving resources:', error);
    return new Map();
  }
}

async function resolveGrant(tx, grant_id) {
  const fullGrant = await tx.grant.findUnique({
    where: { id: grant_id },
    select: {
      id: true,
      subject_id: true,
      resource_id: true,
      access_type_id: true,
      resource: {
        select: {
          type: true,
          dataset: {
            select: {
              name: true,
            },
          },
          collection: {
            select: {
              name: true,
            },
          },
        },
      },
      subject: {
        select: {
          type: true,
          user: {
            select: {
              name: true,
            },
          },
          group: {
            select: {
              name: true,
            },
          },
        },
      },
      access_type: {
        select: {
          name: true,
        },
      },
    },
  });
  fullGrant.subject = {
    name: fullGrant.subject.type === 'USER' ? fullGrant.subject.user.name : fullGrant.subject.group.name,
    type: fullGrant.subject.type,
  };
  fullGrant.resource = {
    name: fullGrant.resource.type === 'DATASET'
      ? fullGrant.resource.dataset?.name
      : fullGrant.resource.collection?.name,
    type: fullGrant.resource.type,
  };
  return fullGrant;
}

module.exports = {
  resolveUserNames,
  resolveEntityName,
  resolveSubjects,
  resolveResources,
  resolveGrant,
};
