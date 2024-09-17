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


@app.task(base=WorkflowTask, bind=True, name='delete_dataset',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def delete_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.delete import delete_dataset as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='download_illumina_dataset',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def download_illumina_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.illumina_download import download_illumina_dataset as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='inspect_dataset',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def inspect_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.inspect import inspect_dataset as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.InspectionFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='generate_qc',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def generate_qc(celery_task, dataset_id, **kwargs):
    from workers.tasks.qc import generate_qc as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='stage_dataset',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def stage_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.stage import stage_dataset as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='validate_dataset',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def validate_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.validate import validate_dataset as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.ValidationFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)
@app.task(base=WorkflowTask, bind=True, name='setup_dataset_download',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def setup_dataset_download(celery_task, dataset_id, **kwargs):
    from workers.tasks.download import setup_download as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.ValidationFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


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


@app.task(base=WorkflowTask, bind=True, name='mark_archived_and_delete',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=5)
def delete_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.mark_archived_and_delete import mark_archived_and_delete as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='fix_staged_dataset_absolute_path',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def fix_staged_dataset_absolute_path(celery_task, dataset_id, **kwargs):
    from workers.tasks.fix_staged_dataset_absolute_path import fix_staged_dataset_absolute_path as task_body
    return task_body(celery_task, dataset_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='replace_sda_archive',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def replace_sda_archive(celery_task, ret_val, **kwargs):
    from workers.tasks.replace_sda_archive import replace_sda_archive as task_body
    return task_body(celery_task, ret_val, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='update_dataset_metadata',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def update_dataset_metadata(celery_task, ret_val, **kwargs):
    from workers.tasks.update_dataset_metadata import update_metadata as task_body
    return task_body(celery_task, ret_val, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='validate_dataset_file_checksums',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def validate_dataset_file_checksums(celery_task, ret_val, **kwargs):
    from workers.tasks.validate_dataset_checksums import validate_dataset_file_checksums as task_body
    return task_body(celery_task, ret_val, **kwargs)
