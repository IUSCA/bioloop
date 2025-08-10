from celery import Celery
from sca_rhythm import WorkflowTask

import workers.config.celeryconfig as celeryconfig
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True, name='convert_dataset',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def convert_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.convert import run_conversion as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.ConversionException:
        raise
    except Exception as e:
        raise exc.RetryableException(e)
