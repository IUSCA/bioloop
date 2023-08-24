const { PrismaClient } = require('@prisma/client');
const { normalize_name } = require('../src/services/project');
const data = require('./data');
const { random_files } = require('./random_paths');
const datasetService = require('../src/services/dataset');

const prisma = new PrismaClient();

async function update_seq(table) {
  // Get the current maximum value of the id column
  const result = await prisma[table].aggregate({
    _max: {
      id: true,
    },
  });
  const currentMaxId = result?._max?.id || 0;

  // Reset the sequence to the current maximum value
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${table}_id_seq RESTART WITH ${currentMaxId + 1}`);
}

async function put_dataset_files({ dataset_id, num_files = 1000, max_depth = 5 }) {
  const files = random_files(num_files, max_depth, dataset_id);
  await prisma.dataset_file.deleteMany({
    where: { dataset_id },
  });
  await datasetService.add_files({ dataset_id, data: files });
}

async function main() {
  await Promise.allSettled(data.roles.map((role) => prisma.role.upsert({
    where: { id: role.id },
    create: role,
    update: role,
  })));

  // Create default admins
  const admin_promises = data.admins.map((admin) => prisma.user.upsert({
    where: { email: `${admin.username}@iu.edu` },
    update: {},
    create: {
      username: admin.username,
      email: `${admin.username}@iu.edu`,
      cas_id: admin.username,
      name: admin.name,
      user_role: {
        create: [{ role_id: 1 }],
      },
    },
  }));

  await Promise.all(admin_promises);

  // create test user
  const user_promises = data.users.map((user) => prisma.user.upsert({
    where: { email: `${user.username}@iu.edu` },
    update: {},
    create: {
      username: user.username,
      email: `${user.username}@iu.edu`,
      cas_id: user.username,
      name: user.name,
      user_role: {
        create: [{ role_id: 3 }],
      },
    },
  }));

  await Promise.all(user_promises);

  // create operators
  const operator_promises = data.operators.map((user) => prisma.user.upsert({
    where: { email: `${user.username}@iu.edu` },
    update: {},
    create: {
      username: user.username,
      email: `${user.username}@iu.edu`,
      cas_id: user.username,
      name: user.name,
      user_role: {
        create: [{ role_id: 2 }],
      },
    },
  }));

  await Promise.all(operator_promises);

  const datasetPromises = data.datasets.map((dataset) => {
    const { workflows, ...dataset_obj } = dataset;
    if (workflows) {
      dataset_obj.workflows = {
        create: workflows.map((workflow_id) => ({ id: workflow_id })),
      };
    }
    return prisma.dataset.upsert({
      where: {
        id: dataset_obj.id,
      },
      update: {},
      create: dataset_obj,
    });
  });
  await Promise.all(datasetPromises);

  // upsert raw data - data product associations
  await Promise.all(
    data.dataset_heirarchical_association.map((sd) => prisma.dataset_hierarchy.upsert({
      where: {
        source_id_derived_id: sd,
      },
      update: {},
      create: sd,
    })),
  );

  // update dataset audit data
  await Promise.all(
    data.dataset_audit_data.map((d) => prisma.dataset_audit.upsert({
      where: {
        id: d.id,
      },
      update: {},
      create: d,
    })),
  );

  // create contact
  await Promise.all(
    data.contacts.map((c) => prisma.contact.upsert({
      where: {
        id: c.id,
      },
      update: {},
      create: c,
    })),
  );

  // create project data
  await Promise.all(
    data.projects.map((p) => prisma.project.upsert({
      where: {
        id: p.id,
      },
      update: {},
      create: {
        slug: normalize_name(p.name),
        ...p,
      },
    })),
  );

  // create project user associations
  await Promise.all(
    data.project_user_assoc.map((pu) => prisma.project_user.upsert({
      where: {
        project_id_user_id: pu,
      },
      update: {},
      create: pu,
    })),
  );

  // create project dataset associations
  await Promise.all(
    data.project_dataset_assoc.map((pd) => prisma.project_dataset.upsert({
      where: {
        project_id_dataset_id: pd,
      },
      update: {},
      create: pd,
    })),
  );

  // create project contact associations
  await Promise.all(
    data.project_contact_assoc.map((pc) => prisma.project_contact.upsert({
      where: {
        project_id_contact_id: pc,
      },
      update: {},
      create: pc,
    })),
  );

  // upsert dataset_files
  put_dataset_files({ dataset_id: 1, num_files: 100, max_depth: 1 });
  put_dataset_files({ dataset_id: 2, num_files: 100, max_depth: 3 });
  put_dataset_files({ dataset_id: 3, num_files: 1000, max_depth: 2 });
  put_dataset_files({ dataset_id: 7, num_files: 100, max_depth: 1 });
  put_dataset_files({ dataset_id: 8, num_files: 100 });

  // update the auto increment id's sequence numbers
  const tables = ['dataset', 'user', 'role', 'dataset_audit', 'contact'];
  await Promise.all(tables.map(update_seq));

  // add metrics
  await prisma.metric.createMany({
    data: data.metrics,
  });
}

main()
  .then(() => {
    prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
