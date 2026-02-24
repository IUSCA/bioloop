/* eslint-disable no-console */
/* eslint-disable no-plusplus */
/* eslint-disable no-bitwise */
/* eslint-disable max-len */
// cSpell: ignore neuroseq neurodegenerative

// Center for Genomics and Bioinformatics
// Cores:
//  - Bioinformatics Core
//  - Genomics Core
//  - Imaging Core
// Labs:
// Dr. Alice Wong Lab (Neurology)
// Dr. Brian Kim Lab (Oncology)
// Dr. Carla Patel Lab (Immunology)
// Projects:
//     Project: “NeuroSeq Atlas” (from Wong Lab, uses Genomics Core)
//     Project: “Cancer Pathways AI” (Kim Lab, uses Imaging Core)
//     Project: “Unified Immune Signature” (joint project across Patel Lab and Cores)

const groups = [
  {
    id: 'ad8d83b2-c82e-4b72-b03e-1393d272a904',
    name: 'Center for Genomics and Bioinformatics',
    slug: 'center-for-genomics-and-bioinformatics',
    description: 'A center dedicated to advancing genomics research through cutting-edge technologies and collaborative efforts.',
    metadata: {
      type: 'center',
    },
  },
  {
    id: '79606964-2385-4c72-8f5f-6d3412049a1c',
    name: 'Bioinformatics Core',
    slug: 'bioinformatics-core',
    description: 'Provides computational support and expertise for analyzing complex biological data.',
    metadata: {
      type: 'core',
    },
  },
  {
    id: '83101409-fa05-44be-abca-c91fff4f9754',
    name: 'Genomics Core',
    slug: 'genomics-core',
    description: 'Offers state-of-the-art sequencing technologies and services for genomics research.',
    metadata: {
      type: 'core',
    },
  },
  {
    id: 'a3740d75-fbb4-4277-af17-4a2ace2cb11a',
    name: 'Imaging Core',
    slug: 'imaging-core',
    description: 'Specializes in advanced imaging techniques for biological research.',
    metadata: {
      type: 'core',
    },
  },
  {
    id: '0bc7fa6c-6f01-4385-aaee-96d5847d8b1b',
    name: 'Dr. Alice Wong Lab',
    slug: 'dr-alice-wong-lab',
    description: 'Focuses on neurological research, particularly in neurodegenerative diseases.',
    metadata: {
      type: 'lab',
    },
  },
  {
    id: '17e330ad-7f71-4e35-b638-ba6411dcca4e',
    name: 'Dr. Brian Kim Lab',
    slug: 'dr-brian-kim-lab',
    description: 'Conducts research on cancer biology and therapeutic strategies.',
    metadata: {
      type: 'lab',
    },
  },
  {
    id: 'bdd579fb-80b0-4b0a-afa3-97b01f430946',
    name: 'Dr. Carla Patel Lab',
    slug: 'dr-carla-patel-lab',
    description: 'Investigates immune system function and its role in health and disease.',
    metadata: {
      type: 'lab',
    },
  },
  {
    id: '9cc75e11-51c7-4666-8701-3e2a278241a7',
    name: 'NeuroSeq Atlas',
    slug: 'neuroseq-atlas',
    description: 'A project from the Wong Lab that utilizes the Genomics Core to create a comprehensive atlas of neuronal gene expression.',
    metadata: {
      type: 'project',
    },
  },
  {
    id: 'f3b4cf15-e027-4773-8664-9ed7213fc4ce',
    name: 'Cancer Pathways AI',
    slug: 'cancer-pathways-ai',
    description: 'A project from the Kim Lab that leverages the Imaging Core to develop AI models for understanding cancer pathways.',
    metadata: {
      type: 'project',
    },
  },
  {
    id: '6a341f80-bb36-4499-a47c-9276788183ef',
    name: 'Unified Immune Signature',
    slug: 'unified-immune-signature',
    description: 'A collaborative project across the Patel Lab and Cores aimed at identifying unified immune signatures for various diseases.',
    metadata: {
      type: 'project',
    },
  },
];

// create group closure data for seeding
const group_closure = [];
groups.forEach((g) => {
  // add self reference
  group_closure.push({
    ancestor_id: g.id,
    descendant_id: g.id,
    depth: 0,
  });
});

// center is ancestor of cores and labs
const center_id = groups[0].id;

// for labs, add center as ancestor
groups.filter((g) => g.metadata.type === 'lab').forEach((lab) => {
  group_closure.push({
    ancestor_id: center_id,
    descendant_id: lab.id,
    depth: 1,
  });
});

// for cores, add center as ancestor
groups.filter((g) => g.metadata.type === 'core').forEach((core) => {
  group_closure.push({
    ancestor_id: center_id,
    descendant_id: core.id,
    depth: 1,
  });
});

// add center, and wong lab as ancestors of the neuroseq project
const neuroseq_id = groups.find((g) => g.slug === 'neuroseq-atlas').id;
const wong_lab_id = groups.find((g) => g.slug === 'dr-alice-wong-lab').id;
group_closure.push({
  ancestor_id: center_id,
  descendant_id: neuroseq_id,
  depth: 2,
});
group_closure.push({
  ancestor_id: wong_lab_id,
  descendant_id: neuroseq_id,
  depth: 1,
});

// add center, and kim lab as ancestors of the cancer pathways project
const cancer_pathways_id = groups.find((g) => g.slug === 'cancer-pathways-ai').id;
const kim_lab_id = groups.find((g) => g.slug === 'dr-brian-kim-lab').id;
group_closure.push({
  ancestor_id: center_id,
  descendant_id: cancer_pathways_id,
  depth: 2,
});
group_closure.push({
  ancestor_id: kim_lab_id,
  descendant_id: cancer_pathways_id,
  depth: 1,
});

// add center, and patel lab as ancestors of the unified immune signature project
const immune_signature_id = groups.find((g) => g.slug === 'unified-immune-signature').id;
const patel_lab_id = groups.find((g) => g.slug === 'dr-carla-patel-lab').id;
group_closure.push({
  ancestor_id: center_id,
  descendant_id: immune_signature_id,
  depth: 2,
});
group_closure.push({
  ancestor_id: patel_lab_id,
  descendant_id: immune_signature_id,
  depth: 1,
});

function generateGroupUserMemberships(userIds) {
  const memberships = [];

  // Simple hash function for deterministic randomness
  const simpleHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash &= hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  groups.forEach((group) => {
    // Deterministically select which users belong to this group
    // Each group gets 10% of users with natural overlap
    const groupMembers = userIds.filter((userId) => {
      const hashValue = simpleHash(`${group.id}-${userId}`);
      // Use hash to determine if user is in this group (10% membership rate on average)
      return (hashValue % 100) < 10;
    });

    if (groupMembers.length === 0) return;

    // Deterministically select 1-2 admins per group
    // At least 1 admin, up to 2 or 10% of group size (whichever is larger)
    const numAdmins = Math.min(
      Math.max(1, Math.ceil(groupMembers.length * 0.1)),
      groupMembers.length,
    );

    const admins = groupMembers
      .slice()
      .sort((a, b) => simpleHash(`${group.id}-admin-${a}`) - simpleHash(`${group.id}-admin-${b}`))
      .slice(0, numAdmins);

    // Add admins
    admins.forEach((userId) => {
      memberships.push({
        group_id: group.id,
        user_id: userId,
        role: 'ADMIN',
        assigned_by: 1, // system assigned
      });
    });

    // Add regular members
    const regularMembers = groupMembers.filter((userId) => !admins.includes(userId));
    regularMembers.forEach((userId) => {
      // Assign this member to be assigned by one of the admins (deterministically)
      const assignorIndex = simpleHash(`${group.id}-assignor-${userId}`) % admins.length;
      memberships.push({
        group_id: group.id,
        user_id: userId,
        role: 'MEMBER',
        assigned_by: admins[assignorIndex],
      });
    });
  });

  return memberships;
}

module.exports = {
  groups,
  group_closure,
  generateGroupUserMemberships,
};

if (require.main === module) {
  const userIds = Array.from({ length: 10 }, (_, i) => i + 1); // Example user IDs from 1 to 10
  const memberships = generateGroupUserMemberships(userIds);
  console.log(memberships);
}
