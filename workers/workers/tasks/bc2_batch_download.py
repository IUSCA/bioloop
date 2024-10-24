import workers.cmd as cmd
from workers.config import config


def batch_download(celery_task, batch_id, **kwargs):

  batch_script = config['batch_script']

  stdout, stderr = cmd.execute([f'{batch_script}', f'{batch_id}'])

  print(f'STDOUT: {stdout} STDERR: {stderr}')

  if stderr:
    raise Exception(stderr)
  
  return batch_id,