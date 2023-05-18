from celery import Celery
from sca_rhythm import WorkflowTask

import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('archive_dataset'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def archive_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.archive import archive_dataset as task_body
    task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('delete_dataset'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def delete_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.delete import delete_dataset as task_body
    task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('download_illumina_dataset'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def download_illumina_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.download import download_illumina_dataset as task_body
    task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('inspect_dataset'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def inspect_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.inspect import inspect_dataset as task_body
    task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('generate_reports'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def generate_reports(celery_task, dataset_id, **kwargs):
    from workers.tasks.report import generate_reports as task_body
    task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('stage_dataset'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def stage_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.stage import stage_dataset as task_body
    task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('validate_dataset'),
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def validate_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.validate import validate_dataset as task_body
    task_body(celery_task, dataset_id, **kwargs)
