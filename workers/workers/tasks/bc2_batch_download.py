import workers.cmd as cmd
from workers.config import config


def batch_download(celery_task, batch_id, **kwargs):
  stdout, stderr = cmd.execute([f'{config['batch_script']}', '{batch_id}'])
  if stderr:
    raise Exception(stderr)
  
  print(stdout)

  return batch_id,