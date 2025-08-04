const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

// Mock data for testing tracks feature
const mockData = {
  // Genome types and values from constants
  genomeTypes: {
    human: ['hg19', 'hg38', 't2t-chm13-v1.1'],
    mouse: ['mm39', 'mm10', 'mm9'],
    rat: ['rn6', 'rn4'],
    chimp: ['panTro6', 'panTro5', 'panTro4'],
    gorilla: ['gorGor4', 'gorGor3'],
    cow: ['bosTau8'],
    dog: ['canFam3', 'canFam2'],
    chicken: ['galGal6', 'galGal5'],
    zebrafish: ['danRer11', 'danRer10', 'danRer7'],
    fruitfly: ['dm6'],
    yeast: ['sacCer3'],
  },

  // Common bioinformatics file types
  fileTypes: ['bam', 'vcf', 'bigwig', 'bed', 'gtf', 'fastq', 'fasta', 'bw', 'bb'],

  // Track names for different types of data
  trackNames: {
    bam: ['RNA-Seq Alignment', 'ChIP-Seq Alignment', 'ATAC-Seq Alignment', 'WGS Alignment'],
    vcf: ['SNV Variants', 'Indel Variants', 'Structural Variants', 'Population Variants'],
    bigwig: ['Coverage Profile', 'Expression Profile', 'Peak Profile', 'Signal Profile'],
    bed: ['Peaks', 'Regions', 'Annotations', 'Features'],
    gtf: ['Gene Annotations', 'Transcript Annotations', 'Exon Annotations'],
    fastq: ['Raw Reads', 'Filtered Reads', 'Processed Reads'],
    fasta: ['Reference Genome', 'Transcriptome', 'Proteome'],
  },

  // Project data
  projects: [
    {
      name: 'Cancer Genomics Research',
      description: 'Comprehensive study of cancer genomics across multiple tissue types',
      slug: 'cancer-genomics-research',
    },
    {
      name: 'Neurodegenerative Diseases',
      description: 'Research on Alzheimer\'s, Parkinson\'s, and other neurodegenerative conditions',
      slug: 'neurodegenerative-diseases',
    },
    {
      name: 'Cardiovascular Health',
      description: 'Study of cardiovascular diseases and heart health markers',
      slug: 'cardiovascular-health',
    },
    {
      name: 'Immunology and Autoimmunity',
      description: 'Research on immune system disorders and autoimmune conditions',
      slug: 'immunology-autoimmunity',
    },
    {
      name: 'Developmental Biology',
      description: 'Study of embryonic development and tissue differentiation',
      slug: 'developmental-biology',
    },
  ],

  // Dataset data (Data Products)
  datasets: [
    {
      name: 'Human Brain RNA-Seq Atlas',
      type: 'DATA_PRODUCT',
      description: 'Comprehensive RNA-Seq data from human brain regions',
      num_files: 50,
      du_size: 50000000000n, // 50GB
    },
    {
      name: 'Mouse Embryo ChIP-Seq',
      type: 'DATA_PRODUCT',
      description: 'ChIP-Seq data from mouse embryonic development stages',
      num_files: 30,
      du_size: 30000000000n, // 30GB
    },
    {
      name: 'Cancer Cell Line Variants',
      type: 'DATA_PRODUCT',
      description: 'Variant calling results from cancer cell lines',
      num_files: 25,
      du_size: 2000000000n, // 2GB
    },
    {
      name: 'Human Blood ATAC-Seq',
      type: 'DATA_PRODUCT',
      description: 'ATAC-Seq data from human blood samples',
      num_files: 40,
      du_size: 40000000000n, // 40GB
    },
    {
      name: 'Zebrafish Development RNA-Seq',
      type: 'DATA_PRODUCT',
      description: 'RNA-Seq data from zebrafish developmental stages',
      num_files: 35,
      du_size: 35000000000n, // 35GB
    },
    {
      name: 'Yeast Genome Assembly',
      type: 'DATA_PRODUCT',
      description: 'High-quality yeast genome assemblies',
      num_files: 20,
      du_size: 1000000000n, // 1GB
    },
  ],
};

async function findOrCreateUser(username, tx = prisma) {
  let user = await tx.user.findUnique({
    where: { username },
  });

  if (!user) {
    user = await tx.user.create({
      data: {
        username,
        name: username,
        email: `${username}@example.com`,
      },
    });
  }

  return user;
}

async function createProjects(tx = prisma) {
  console.log('Creating projects...');
  const projects = [];

  await Promise.all(mockData.projects.map(async (projectData) => {
    const project = await tx.project.upsert({
      where: { slug: projectData.slug },
      update: {},
      create: {
        id: uuidv4(),
        slug: projectData.slug,
        name: projectData.name,
        description: projectData.description,
        browser_enabled: true,
      },
    });
    projects.push(project);
    console.log(`Created project: ${project.name}`);
  }));

  return projects;
}

async function createDatasets(tx = prisma) {
  console.log('Creating datasets...');
  const datasets = [];

  await Promise.all(mockData.datasets.map(async (datasetData) => {
    const dataset = await tx.dataset.upsert({
      where: {
        name_type_is_deleted: {
          name: datasetData.name,
          type: datasetData.type,
          is_deleted: false,
        },
      },
      update: {},
      create: {
        name: datasetData.name,
        type: datasetData.type,
        description: datasetData.description,
        num_files: datasetData.num_files,
        du_size: datasetData.du_size,
        size: datasetData.du_size,
        is_staged: true,
        metadata: {
          source: 'mock_data',
          created_by: 'insert_mock_tracks_script',
        },
      },
    });
    datasets.push(dataset);
    console.log(`Created dataset: ${dataset.name}`);
  }));

  return datasets;
}

async function createDatasetFiles(datasets, tx = prisma) {
  console.log('Creating dataset files...');
  const datasetFiles = [];

  await Promise.all(datasets.map(async (dataset) => {
    // Create multiple files for each dataset
    const numFiles = Math.floor(Math.random() * 10) + 5; // 5-15 files per dataset

    const files = Array.from({ length: numFiles }, (_, i) => {
      const fileType = mockData.fileTypes[Math.floor(Math.random() * mockData.fileTypes.length)];
      const fileName = `${dataset.name.replace(/\s+/g, '_').toLowerCase()}_file_${i + 1}.${fileType}`;
      const filePath = `/data/datasets/${dataset.id}/${fileName}`;

      return {
        name: fileName,
        path: filePath,
        size: BigInt(Math.floor(Math.random() * 1000000000) + 1000000), // 1MB to 1GB
        filetype: fileType,
        dataset_id: dataset.id,
        status: 'available',
        metadata: {
          file_type: fileType,
          created_by: 'insert_mock_tracks_script',
        },
      };
    });

    const createdFiles = await Promise.all(
      files.map((fileData) => tx.dataset_file.upsert({
        where: {
          path_dataset_id: {
            path: fileData.path,
            dataset_id: fileData.dataset_id,
          },
        },
        update: fileData,
        create: fileData,
      })),
    );

    datasetFiles.push(...createdFiles);
    console.log(`Created ${numFiles} files for dataset: ${dataset.name}`);
  }));

  return datasetFiles;
}

async function createTracks(datasetFiles, tx = prisma) {
  console.log('Creating tracks...');
  const tracks = [];

  // Only create tracks for certain file types
  const trackableFileTypes = ['bam', 'vcf', 'bigwig', 'bed', 'gtf'];
  const trackableFiles = datasetFiles.filter((file) => trackableFileTypes.includes(file.filetype));

  await Promise.all(trackableFiles.map(async (datasetFile) => {
    // Select random genome type and value
    const genomeTypes = Object.keys(mockData.genomeTypes);
    const genomeType = genomeTypes[Math.floor(Math.random() * genomeTypes.length)];
    const genomeValues = mockData.genomeTypes[genomeType];
    const genomeValue = genomeValues[Math.floor(Math.random() * genomeValues.length)];

    // Generate track name based on file type
    const trackNames = mockData.trackNames[datasetFile.filetype] || ['Generic Track'];
    const trackName = `${trackNames[Math.floor(Math.random() * trackNames.length)]} - ${datasetFile.name}`;

    const track = await tx.track.create({
      data: {
        name: trackName,
        file_type: datasetFile.filetype,
        genomeType,
        genomeValue,
        dataset_file_id: datasetFile.id,
      },
    });

    tracks.push(track);
    console.log(`Created track: ${track.name} (${genomeType} ${genomeValue})`);
  }));

  return tracks;
}

async function assignDatasetsToProjects(datasets, projects, tx = prisma) {
  console.log('Assigning datasets to projects...');
  await Promise.all(datasets.map(async (dataset) => {
    const numProjects = Math.floor(Math.random() * 3) + 1;
    const selectedProjects = projects.sort(() => 0.5 - Math.random()).slice(0, numProjects);

    await Promise.all(selectedProjects.map(async (project) => {
      await tx.project_dataset.upsert({
        where: {
          project_id_dataset_id: {
            project_id: project.id,
            dataset_id: dataset.id,
          },
        },
        update: {},
        create: {
          project_id: project.id,
          dataset_id: dataset.id,
          assignor_id: null, // Will be set when we assign users
        },
      });
    }));
  }));
}

async function assignUserToProjects(user, projects, tx = prisma) {
  console.log(`Assigning user ${user.username} to projects...`);
  await Promise.all(projects.map(async (project) => {
    await tx.project_user.upsert({
      where: {
        project_id_user_id: {
          project_id: project.id,
          user_id: user.id,
        },
      },
      update: {},
      create: {
        user_id: user.id,
        project_id: project.id,
        assignor_id: null,
      },
    });
  }));
  console.log(`Assigned user ${user.username} to ${projects.length} projects`);
}

async function main() {
  try {
    console.log('Starting mock tracks data insertion...');

    await prisma.$transaction(async (tx) => {
      // Find or create e2eUser
      const e2eUser = await findOrCreateUser('e2eUser', tx);
      console.log(`Using user: ${e2eUser.username} (ID: ${e2eUser.id})`);

      // Create projects
      const projects = await createProjects(tx);

      // Create datasets (Data Products)
      const datasets = await createDatasets(tx);

      // Create dataset files
      const datasetFiles = await createDatasetFiles(datasets, tx);

      // Create tracks
      const tracks = await createTracks(datasetFiles, tx);

      // Assign datasets to projects
      await assignDatasetsToProjects(datasets, projects, tx);

      // Assign e2eUser to all projects
      await assignUserToProjects(e2eUser, projects, tx);

      console.log('\n=== Mock Tracks Data Insertion Complete ===');
      console.log(`Created ${projects.length} projects`);
      console.log(`Created ${datasets.length} datasets`);
      console.log(`Created ${datasetFiles.length} dataset files`);
      console.log(`Created ${tracks.length} tracks`);
      console.log(`Assigned e2eUser to ${projects.length} projects`);
      console.log('\nYou can now test the tracks feature with this data!');
    });
  } catch (error) {
    console.error('Error inserting mock tracks data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { main };
