const config = require('config');
const wfService = require('./workflow');


const intiate_download = async (batch_id) => {



  const wf_body = {
      steps: [
        {
          name: "batch_download",
          task: "batch_download",
          queue: `${config.app_id}.q`
        }
      ],
      name: "batch_download",
      app_id: config.app_id,
    }
  

  console.log('Creating workflow', wf_body, 'for batch_id:', batch_id);

  // create the workflow
  const wf = (await wfService.create({
    ...wf_body,
    args: [batch_id],
  })).data;

  console.log('Workflow:', wf);

  return wf;
}

module.exports = {
  intiate_download
}