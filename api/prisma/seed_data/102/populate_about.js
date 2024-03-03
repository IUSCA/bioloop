const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const base_about_html = '<p>BIOLOOP is a service of the Indiana University'
      + ' <a href="https://sca.iu.edu">Scalable Compute Archive (IU SCA)</a> group.'
      + '<br><br>'
      + 'Bioloop is a web-based portal to simplify the management of '
      + 'large-scale datasets shared among research teams in scientific '
      + 'domains. This platform optimizes data handling by effectively '
      + 'utilizing both cold and hot storage solutions, like tape and disk '
      + 'storage, to reduce overall storage costs.'
      + '<br><br>'
      + 'This instance of <a href="https://github.com/IUSCA/bioloop">Bioloop</a> is being run by: '
      + '<br><br>'
      + 'For questions or support, please contact the primary operator: </p>';

  const admin = await prisma.user.findUnique({
    where: {
      username: 'svc_tasks',
    },
  });

  await prisma.about.create({
    data: {
      html: base_about_html,
      last_updated_by_id: admin.id,
    },
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
