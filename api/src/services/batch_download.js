const prisma = new PrismaClient();
const wfService = require('./workflow');


const intiate_download = async (batch_id) => {

  const wf_body = {
    batch_download: {
      steps: [
        {
          name: "batch_download",
          task: "batch_download"
        }
      ]
    }
  }

  console.log('Creating workflow', wf_body, 'for dataset', batch_id);

  // create the workflow
  const wf = (await wfService.create({
    ...wf_body,
    args: [batch_id],
  })).data;



  return wf;
}

module.exports = {
  intiate_download
}