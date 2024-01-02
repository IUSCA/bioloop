from celery import Celery
from sca_rhythm import WorkflowTask

import workers.config.celeryconfig as celeryconfig
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True, name='archive_dataset',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def archive_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.archive import archive_dataset as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='inspect_dataset',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def inspect_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.inspect import inspect_dataset as task_body

    # retry for all exceptions other than exc.InspectionFailed
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.InspectionFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='delete_dataset',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def delete_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.delete import delete_dataset as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='await_stability',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def await_stability(celery_task, dataset_id, **kwargs):
    from workers.tasks.await_stability import await_stability as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='delete_source',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def delete_source(celery_task, dataset_id, **kwargs):
    from workers.tasks.delete_source import delete_source as task_body
    return task_body(celery_task, dataset_id, **kwargs)
