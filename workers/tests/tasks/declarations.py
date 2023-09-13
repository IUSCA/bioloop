import logging

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask

import workers.config.celeryconfig as celeryconfig
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)

default_task_kwargs = {
    'default_retry_delay': 5
}


@app.task(base=WorkflowTask, bind=True, name='task1',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def task1(celery_task, dataset_id, **kwargs):
    from tests.tasks.tasksA import task1 as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='task2',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          **default_task_kwargs)
def task2(celery_task, dataset_id, **kwargs):
    from tests.tasks.tasksA import task2 as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.ValidationFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='task3',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def task3(celery_task, dataset_id, **kwargs):
    from tests.tasks.tasksA import task3 as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='task4',
          autoretry_for=(Exception,),
          max_retries=1,
          default_retry_delay=5)
def task4(celery_task, dataset_id, **kwargs):
    from tests.tasks.tasksB import task4 as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='task5',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def task5(celery_task, dataset_id, **kwargs):
    from tests.tasks.tasksB import task5 as task_body
    return task_body(celery_task, dataset_id, **kwargs)
