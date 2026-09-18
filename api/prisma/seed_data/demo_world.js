/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
// cSpell: ignore Okafor Ferreira Nwosu Vasquez Adeyemi Baptiste NovaSeq Mutect FLAIR multiqc fastqc salmon InterOp

/**
 * The demo world: one research center with realistic people, data, and profiles, seeded on
 * its own by `npm run seed:demo` for showing the groups and access-control flows to an
 * audience.
 *
 * It is not the flows fixture. The flows world exists to be asserted against, so its prose
 * names the flow each row serves. This world exists to be looked at, so every name, tagline,
 * and file path reads as a real lab would write it. The two never share a database: the demo
 * seed writes the baseline and this world, and nothing else, so no sample-world grant to
 * `Authenticated Users` can surface an unrelated collection during a demo.
 *
 * @see docs/guides/dev-servers.md — The demo world
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('config');

const FileGraph = require('../../src/services/fileGraph');
const { GRANT_ACCESS_TYPES } = require('../../src/constants');

/** Hand-written v4 UUIDs, prefixed so a row is recognisable as demo data at a glance. */
const GROUP_IDS = Object.freeze({
  center: 'de300000-0000-4000-8000-000000000001',
  wongLab: 'de300000-0000-4000-8000-000000000002',
  tumorSequencing: 'de300000-0000-4000-8000-000000000003',
  vasquezLab: 'de300000-0000-4000-8000-000000000004',
  sequencingCore: 'de300000-0000-4000-8000-000000000005',
});

const COLLECTION_IDS = Object.freeze({
  brcaRelease: 'de300000-0000-4000-8000-000000000101',
  agingWave3: 'de300000-0000-4000-8000-000000000102',
});

/**
 * The hierarchy, parents before children.
 *
 *   Center for Precision Health Research
 *   ├── Wong Cancer Genomics Lab
 *   │   └── Tumor Sequencing Unit
 *   ├── Vasquez Neuroimaging Lab
 *   └── Sequencing Core Facility
 */
const GROUPS = Object.freeze([
  {
    id: GROUP_IDS.center,
    parent_id: null,
    name: 'Center for Precision Health Research',
    slug: 'center-for-precision-health-research',
    metadata: {
      type: 'center',
      links: [
        { type: 'website', url: 'https://precisionhealth.example.edu', label: 'Center website' },
        { type: 'contact_email', url: 'precisionhealth@example.edu', label: 'Center office' },
      ],
    },
    tagline: 'Genomics, imaging, and clinical data science under one roof.',
    about_md: [
      'The Center for Precision Health Research brings together four research groups that study',
      'how genetic variation, brain structure, and treatment history shape patient outcomes.',
      '',
      '## What the center shares',
      '',
      '- A sequencing core that serves every lab in the center.',
      '- Common consent language, so data collected in one lab can be reused by another when',
      '  participants agreed to it.',
      '- A data steward in each lab who decides who outside the lab may use its data.',
    ].join('\n'),
  },
  {
    id: GROUP_IDS.wongLab,
    parent_id: GROUP_IDS.center,
    name: 'Wong Cancer Genomics Lab',
    slug: 'wong-cancer-genomics-lab',
    allow_user_contributions: true,
    metadata: {
      type: 'lab',
      links: [
        { type: 'website', url: 'https://wonglab.example.edu', label: 'Lab website' },
      ],
    },
    tagline: 'Somatic variation and treatment response in hereditary breast cancer.',
    about_md: [
      'We follow 240 participants with hereditary breast cancer from diagnosis through',
      'treatment, and sequence tumor and matched normal tissue at each stage.',
      '',
      'Our current work asks why tumors with the same germline variant respond differently',
      'to PARP inhibitors.',
    ].join('\n'),
  },
  {
    id: GROUP_IDS.tumorSequencing,
    parent_id: GROUP_IDS.wongLab,
    name: 'Tumor Sequencing Unit',
    slug: 'tumor-sequencing-unit',
    metadata: { type: 'lab' },
    tagline: 'Library preparation and sequencing for the tumor–normal program.',
    about_md: 'The unit prepares libraries from biopsy tissue and runs them on the lab\'s NovaSeq.',
  },
  {
    id: GROUP_IDS.vasquezLab,
    parent_id: GROUP_IDS.center,
    name: 'Vasquez Neuroimaging Lab',
    slug: 'vasquez-neuroimaging-lab',
    metadata: {
      type: 'lab',
      links: [
        { type: 'website', url: 'https://vasquezlab.example.edu', label: 'Lab website' },
      ],
    },
    tagline: 'Structural and functional MRI of the aging brain.',
    about_md: [
      'The Aging Brain Study has scanned the same 180 adults every two years since 2019.',
      'We look for early imaging markers of cognitive decline, and increasingly for genetic',
      'variants that predict them.',
    ].join('\n'),
  },
  {
    id: GROUP_IDS.sequencingCore,
    parent_id: GROUP_IDS.center,
    name: 'Sequencing Core Facility',
    slug: 'sequencing-core-facility',
    metadata: { type: 'core' },
    tagline: 'Short- and long-read sequencing for every lab in the center.',
    about_md: 'Submit samples through the core request form. Typical turnaround is three weeks.',
  },
]);

const GROUP_ID_SET = Object.freeze(new Set(GROUPS.map((g) => g.id)));

/**
 * The people. Each one stands in for a role an audience recognises; the comment says which
 * part of the demo they carry. Every account holds the platform `user` role and nothing more,
 * so each page shows what the access model decides rather than a platform admin's view.
 * The usernames are the flows world's cast in the same roles, so both worlds share one
 * vocabulary. Because the usernames are shared, never seed both worlds into one database.
 */
const CAST = Object.freeze([
  {
    // The center head: governs the center, oversees every lab below it.
    username: 'dana',
    name: 'Dana Okafor',
    memberships: [{ group_id: GROUP_IDS.center, role: 'ADMIN' }],
  },
  {
    // The lab PI and data steward: issues grants and reviews requests on the lab's data.
    username: 'alice',
    name: 'Alice Wong',
    memberships: [
      { group_id: GROUP_IDS.wongLab, role: 'ADMIN' },
      { group_id: GROUP_IDS.tumorSequencing, role: 'ADMIN' },
    ],
  },
  {
    // A lab member: reads the lab's data without asking.
    username: 'bob',
    name: 'Bob Ferreira',
    memberships: [{ group_id: GROUP_IDS.wongLab, role: 'MEMBER' }],
  },
  {
    // A sub-unit member: reaches the lab and the center through the hierarchy.
    username: 'carol',
    name: 'Carol Nwosu',
    memberships: [{ group_id: GROUP_IDS.tumorSequencing, role: 'MEMBER' }],
  },
  {
    // Another lab's PI: admin authority that does not travel sideways.
    username: 'erin',
    name: 'Erin Vasquez',
    memberships: [{ group_id: GROUP_IDS.vasquezLab, role: 'ADMIN' }],
  },
  {
    // The outsider: a researcher in another lab who asks for the cohort data.
    username: 'frank',
    name: 'Frank Adeyemi',
    memberships: [{ group_id: GROUP_IDS.vasquezLab, role: 'MEMBER' }],
  },
  {
    // A new hire with no groups yet: the empty portal.
    username: 'quinn',
    name: 'Quinn Baptiste',
    memberships: [],
  },
]);

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * A file size near `approxBytes`, varied by up to a fifth either way. Derived from the path,
 * so a re-seed writes the same sizes.
 */
function sizeNear(filePath, approxBytes) {
  const fraction = parseInt(crypto.createHash('md5').update(filePath).digest('hex').slice(0, 8), 16)
    / 0xffffffff;
  return Math.round(approxBytes * (0.8 + 0.4 * fraction));
}

const COHORT = range(1, 24).map((i) => `P${pad(i)}`);

/** Each builder returns `[path, approximate bytes]` pairs for one dataset's file tree. */
const FILE_TREES = Object.freeze({
  wgs: () => [
    ['README.md', 6e3],
    ['SampleSheet.csv', 4e3],
    ['md5sums.txt', 2e4],
    ['qc/multiqc_report.html', 4.5e6],
    ...COHORT.flatMap((p) => ['tumor', 'normal'].flatMap((tissue) => {
      const depth = tissue === 'tumor' ? 2 : 1;
      return [
        [`fastq/${p}_${tissue}_R1.fastq.gz`, 1.1e10 * depth],
        [`fastq/${p}_${tissue}_R2.fastq.gz`, 1.1e10 * depth],
        [`bam/${p}_${tissue}.bam`, 4.8e10 * depth],
        [`bam/${p}_${tissue}.bam.bai`, 9e6],
        [`qc/fastqc/${p}_${tissue}_R1_fastqc.html`, 7e5],
      ];
    })),
  ],
  rnaseq: () => [
    ['README.md', 5e3],
    ['counts/gene_counts_raw.tsv', 4e7],
    ['counts/gene_counts_tpm.tsv', 6e7],
    ['qc/multiqc_report.html', 3e6],
    ...COHORT.flatMap((p) => [
      [`fastq/${p}_R1.fastq.gz`, 3e9],
      [`fastq/${p}_R2.fastq.gz`, 3e9],
      [`salmon/${p}/quant.sf`, 3e7],
      [`salmon/${p}/logs/salmon_quant.log`, 2e4],
    ]),
  ],
  somatic: () => [
    ['README.md', 7e3],
    ['maf/cohort_somatic.maf.gz', 2.5e8],
    ['summary/tumor_mutational_burden.tsv', 3e3],
    ['summary/signatures_sbs96.tsv', 4e4],
    ...COHORT.flatMap((p) => [
      [`vcf/${p}.mutect2.filtered.vcf.gz`, 4e7],
      [`vcf/${p}.mutect2.filtered.vcf.gz.tbi`, 1e6],
    ]),
  ],
  novaseqRun: () => [
    ['RunInfo.xml', 5e3],
    ['RunParameters.xml', 1.2e4],
    ['SampleSheet.csv', 5e3],
    ['Reports/html/index.html', 2e6],
    ...['ErrorMetricsOut', 'QMetricsOut', 'TileMetricsOut', 'ExtractionMetricsOut']
      .map((m) => [`InterOp/${m}.bin`, 5e7]),
    ...range(1, 16).flatMap((n) => [1, 2].flatMap((lane) => [1, 2].map((read) => [
      `Fastq/NG-24-${pad(n, 3)}_S${n}_L00${lane}_R${read}_001.fastq.gz`, 6e9,
    ]))),
  ],
  mri: () => [
    ['README', 5e3],
    ['dataset_description.json', 1e3],
    ['participants.tsv', 1.5e4],
    ...range(1, 180).flatMap((n) => {
      const sub = `sub-${pad(n, 3)}`;
      return [
        [`${sub}/anat/${sub}_T1w.nii.gz`, 1.6e7],
        [`${sub}/anat/${sub}_T1w.json`, 2e3],
        [`${sub}/anat/${sub}_FLAIR.nii.gz`, 9e6],
        [`${sub}/func/${sub}_task-rest_bold.nii.gz`, 3.2e8],
        [`${sub}/func/${sub}_task-rest_bold.json`, 3e3],
      ];
    }),
  ],
});

const DATASETS = Object.freeze([
  {
    name: 'BRCA-WGS-Batch01',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.wongLab,
    description: 'Whole-genome sequencing of 24 tumor–normal pairs from the hereditary breast '
      + 'cancer cohort. Tumor at 60x, matched normal at 30x.',
    tree: 'wgs',
  },
  {
    name: 'BRCA-RNAseq-Batch01',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.wongLab,
    description: 'Bulk RNA-seq of the same 24 tumors, poly(A)-selected, 2x150 bp, with Salmon '
      + 'quantification.',
    tree: 'rnaseq',
  },
  {
    name: 'BRCA-Somatic-Calls-v2',
    type: 'DATA_PRODUCT',
    owner_group_id: GROUP_IDS.wongLab,
    description: 'Filtered somatic SNV and indel calls (Mutect2) for the 24 tumor–normal pairs, '
      + 'with a cohort MAF and mutational signatures.',
    tree: 'somatic',
    derived_from: 'BRCA-WGS-Batch01',
  },
  {
    name: 'NovaSeq-Run-2024-11-18',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.tumorSequencing,
    description: 'Demultiplexed output of the November 18 NovaSeq X run: 16 libraries across two '
      + 'lanes.',
    tree: 'novaseqRun',
  },
  {
    name: 'Aging-Brain-MRI-Wave3',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.vasquezLab,
    description: 'Third-wave T1-weighted, FLAIR, and resting-state fMRI for 180 participants aged '
      + '60 to 85, organised as BIDS.',
    tree: 'mri',
  },
]);

const COLLECTIONS = Object.freeze([
  {
    id: COLLECTION_IDS.brcaRelease,
    name: 'BRCA Cohort Release 1',
    slug: 'brca-cohort-release-1',
    owner_group_id: GROUP_IDS.wongLab,
    tagline: 'Genomes, transcriptomes, and somatic calls for the first 24 participants.',
    about_md: [
      'The first data release from the hereditary breast cancer cohort.',
      '',
      '## Contents',
      '',
      '- Tumor and matched normal whole genomes.',
      '- Tumor RNA-seq with gene-level counts.',
      '- Filtered somatic variant calls.',
      '',
      '## Using this release',
      '',
      'Participants consented to research use within the center. Request access with a short',
      'description of your project, and the lab\'s data steward will review it.',
    ].join('\n'),
    metadata: {
      publications: [
        {
          doi: '10.5555/brca-cohort.2025.001',
          title: 'Somatic evolution under PARP inhibition in hereditary breast cancer',
          container: 'Journal of Precision Oncology',
          year: 2025,
        },
      ],
    },
    dataset_names: ['BRCA-WGS-Batch01', 'BRCA-RNAseq-Batch01', 'BRCA-Somatic-Calls-v2'],
  },
  {
    id: COLLECTION_IDS.agingWave3,
    name: 'Aging Brain Study — Wave 3',
    slug: 'aging-brain-study-wave-3',
    owner_group_id: GROUP_IDS.vasquezLab,
    tagline: 'Third-wave imaging for the longitudinal Aging Brain Study.',
    about_md: 'Scans collected between 2023 and 2024. Earlier waves are released separately.',
    metadata: {},
    dataset_names: ['Aging-Brain-MRI-Wave3'],
  },
]);

/**
 * Instrument drop directories, one per group that produces raw data. Each lives under
 * `import.sources_dir`, which `IMPORT_SOURCES_DIR` points at `data/import` on a native setup.
 * A member of the owning group, or of a group overseeing it, sees the source when importing.
 *
 * @see docs/design/groups/dataset-creation.md — Import sources are visible to everyone
 */
const IMPORT_SOURCES = Object.freeze([
  {
    dir: 'tumor_sequencing_novaseq_x',
    label: 'Tumor Sequencing NovaSeq X',
    description: 'Demultiplexed run folders from the Tumor Sequencing Unit\'s NovaSeq X.',
    sort_order: 1,
    owner_group_id: GROUP_IDS.tumorSequencing,
  },
  {
    dir: 'vasquez_lab_3t_mri',
    label: 'Vasquez Lab 3T MRI',
    description: 'BIDS exports from the Vasquez lab\'s 3T scanner.',
    sort_order: 2,
    owner_group_id: GROUP_IDS.vasquezLab,
  },
  {
    dir: 'sequencing_core_deliveries',
    label: 'Sequencing Core Deliveries',
    description: 'Completed sequencing runs the core hands back to the requesting lab.',
    sort_order: 3,
    owner_group_id: GROUP_IDS.sequencingCore,
  },
]);

function buildClosure() {
  const parentOf = new Map(GROUPS.map((g) => [g.id, g.parent_id]));
  const rows = [];
  for (const g of GROUPS) {
    rows.push({ ancestor_id: g.id, descendant_id: g.id, depth: 0 });
    let ancestor = parentOf.get(g.id);
    let depth = 1;
    while (ancestor) {
      rows.push({ ancestor_id: ancestor, descendant_id: g.id, depth });
      ancestor = parentOf.get(ancestor);
      depth += 1;
    }
  }
  return rows;
}

/**
 * Writes one dataset's files, its directory rows, and the parent-child edges the file browser
 * walks. Returns the counts and sizes the dataset row carries.
 */
async function writeFileTree(prisma, datasetId, entries) {
  const files = entries.map(([filePath, approxBytes]) => ({
    dataset_id: datasetId,
    name: path.basename(filePath),
    path: filePath,
    md5: crypto.createHash('md5').update(`${datasetId}:${filePath}`).digest('hex'),
    size: sizeNear(filePath, approxBytes),
    filetype: 'file',
  }));

  const graph = new FileGraph(files.map((f) => f.path));
  const directories = graph.non_leaf_nodes().map((p) => ({
    dataset_id: datasetId,
    name: path.basename(p),
    path: p,
    filetype: 'directory',
  }));

  await prisma.dataset_file.createMany({ data: files.concat(directories), skipDuplicates: true });

  const rows = await prisma.dataset_file.findMany({
    where: { dataset_id: datasetId },
    select: { id: true, path: true },
  });
  const idByPath = new Map(rows.map((r) => [r.path, r.id]));
  await prisma.dataset_file_hierarchy.createMany({
    data: graph.edges().map(([parent, child]) => ({
      parent_id: idByPath.get(parent),
      child_id: idByPath.get(child),
    })),
    skipDuplicates: true,
  });

  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  return {
    num_files: files.length,
    num_directories: directories.length,
    size: bytes,
    // Block overhead: a disk-usage total always runs a little over the byte total.
    du_size: bytes + files.length * 4096,
  };
}

/**
 * Creates one dataset with its resource row and its file tree, and returns its ids.
 */
async function createDataset(prisma, spec, RESOURCE_TYPE) {
  const created = await prisma.dataset.create({
    data: {
      name: spec.name,
      type: spec.type,
      description: spec.description,
      origin_path: `/data/precision-health/${spec.name}`,
      owner_group: { connect: { id: spec.owner_group_id } },
      resource: { create: { type: RESOURCE_TYPE.DATASET } },
    },
    select: { id: true, resource_id: true },
  });
  const stats = await writeFileTree(prisma, created.id, FILE_TREES[spec.tree]());
  await prisma.dataset.update({ where: { id: created.id }, data: stats });
  return created;
}

/**
 * Writes the demo world. Every write is keyed on an id or a unique name this file owns, so a
 * second run adds nothing.
 *
 * @param prisma — a PrismaClient
 * @param deps.SUBJECT_TYPE, deps.RESOURCE_TYPE — the Prisma enums
 * @returns counts of what was written, for the caller's logging
 */
async function seedDemoWorld(prisma, { SUBJECT_TYPE, RESOURCE_TYPE }) {
  const svcTasks = await prisma.user.findUniqueOrThrow({
    where: { username: 'svc_tasks' },
    select: { subject_id: true },
  });
  const userRole = await prisma.role.findFirstOrThrow({ where: { name: 'user' } });

  for (const g of GROUPS) {
    await prisma.subject.upsert({
      where: { id: g.id },
      update: {},
      create: { id: g.id, type: SUBJECT_TYPE.GROUP },
    });
  }
  for (const g of GROUPS) {
    // eslint-disable-next-line no-unused-vars
    const { parent_id: _parentId, ...row } = g;
    await prisma.group.upsert({
      where: { id: g.id },
      update: {},
      create: { ...row, archive_key: g.slug },
    });
  }
  for (const row of buildClosure()) {
    await prisma.group_closure.upsert({
      where: {
        ancestor_id_descendant_id: { ancestor_id: row.ancestor_id, descendant_id: row.descendant_id },
      },
      update: {},
      create: row,
    });
  }

  const subjectIdByUsername = new Map();
  for (const person of CAST) {
    const user = await prisma.user.upsert({
      where: { email: `${person.username}@example.edu` },
      update: {},
      create: {
        username: person.username,
        email: `${person.username}@example.edu`,
        cas_id: person.username,
        name: person.name,
        user_role: { create: [{ role_id: userRole.id }] },
        subject: { create: { type: SUBJECT_TYPE.USER } },
      },
      select: { subject_id: true },
    });
    subjectIdByUsername.set(person.username, user.subject_id);
  }
  await prisma.group_user.createMany({
    data: CAST.flatMap((person) => person.memberships.map((m) => ({
      group_id: m.group_id,
      user_id: subjectIdByUsername.get(person.username),
      role: m.role,
      assigned_by: svcTasks.subject_id,
    }))),
    skipDuplicates: true,
  });

  const datasetByName = new Map();
  for (const spec of DATASETS) {
    const existing = await prisma.dataset.findFirst({
      where: {
        name: spec.name, type: spec.type, is_deleted: false, owner_group_id: spec.owner_group_id,
      },
      select: { id: true, resource_id: true },
    });
    datasetByName.set(spec.name, existing ?? await createDataset(prisma, spec, RESOURCE_TYPE));
  }

  for (const spec of DATASETS.filter((d) => d.derived_from)) {
    const sd = {
      source_id: datasetByName.get(spec.derived_from).id,
      derived_id: datasetByName.get(spec.name).id,
    };
    await prisma.dataset_hierarchy.upsert({
      where: { source_id_derived_id: sd },
      update: {},
      create: sd,
    });
  }

  for (const c of COLLECTIONS) {
    const { dataset_names: datasetNames, ...row } = c;
    await prisma.$transaction(async (tx) => {
      await tx.resource.upsert({
        where: { id: c.id },
        update: {},
        create: { id: c.id, type: RESOURCE_TYPE.COLLECTION },
      });
      await tx.collection.upsert({ where: { id: c.id }, update: {}, create: row });
      await tx.collection_dataset.createMany({
        // `collection_dataset.dataset_id` references `dataset.resource_id`.
        data: datasetNames.map((name) => ({
          collection_id: c.id,
          dataset_id: datasetByName.get(name).resource_id,
        })),
        skipDuplicates: true,
      });
    });
  }

  // The directory is created as well as the row, because the scheduled path check suspends a
  // source whose directory it cannot read.
  const importSourcesDir = config.get('import.sources_dir');
  for (const { dir, ...source } of IMPORT_SOURCES) {
    const sourcePath = path.join(importSourcesDir, dir);
    fs.mkdirSync(sourcePath, { recursive: true });
    await prisma.import_source.upsert({
      where: { path: sourcePath },
      update: {},
      create: { ...source, path: sourcePath },
    });
  }

  // The owning group reads what it governs, exactly as `seed.js` writes it for its worlds.
  // @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
  const accessTypeIdByName = new Map(GRANT_ACCESS_TYPES.map((t) => [t.name, t.id]));
  const bootstrap = (subjectId, resourceId, accessTypeName) => ({
    subject_id: subjectId,
    resource_id: resourceId,
    access_type_id: accessTypeIdByName.get(accessTypeName),
    creation_type: 'SYSTEM_BOOTSTRAP',
    granted_by: svcTasks.subject_id,
    issuing_authority_id: subjectId,
    justification: 'Seeded at creation: the owning group reads what it governs',
  });
  await prisma.grant.createMany({
    data: [
      ...DATASETS.map((d) => bootstrap(
        d.owner_group_id,
        datasetByName.get(d.name).resource_id,
        'DATASET:LIST_FILES',
      )),
      ...COLLECTIONS.map((c) => bootstrap(c.owner_group_id, c.id, 'COLLECTION:LIST_CONTENTS')),
    ],
    skipDuplicates: true,
  });

  return {
    groups: GROUPS.length,
    people: CAST.length,
    datasets: DATASETS.length,
    collections: COLLECTIONS.length,
    importSources: IMPORT_SOURCES.length,
  };
}

module.exports = {
  GROUP_IDS,
  GROUP_ID_SET,
  COLLECTION_IDS,
  GROUPS,
  CAST,
  DATASETS,
  COLLECTIONS,
  IMPORT_SOURCES,
  seedDemoWorld,
};
