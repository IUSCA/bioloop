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


@app.task(bind=True, name='compare_duplicate_datasets',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=30)
def compare_duplicate_datasets(self, duplicate_dataset_id, original_dataset_id, **kwargs):
    """
    Standalone (non-workflow) Celery task that computes file-level comparison
    between a detected duplicate and its original.  Fired from inspect_dataset
    with a pre-assigned task ID stored in dataset_duplication.comparison_process_id.
    """
    from workers.tasks.compare_duplicate_datasets import compare_datasets as task_body
    try:
        return task_body(self, duplicate_dataset_id, original_dataset_id, **kwargs)
    except (exc.InspectionFailed, exc.ProcessingFailed):
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='purge_duplicate_dataset_resources',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def purge_duplicate_dataset_resources(celery_task, duplicate_dataset_id, **kwargs):
    from workers.tasks.purge_duplicate_dataset_resources import purge as task_body
    try:
        return task_body(celery_task, duplicate_dataset_id, **kwargs)
    except exc.InspectionFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='inspect_dataset',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def inspect_dataset(celery_task, dataset_id, **kwargs):
    from workers.tasks.inspect import inspect_dataset as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.DuplicateDetected:
        # DuplicateDetected is an expected terminal condition — do not retry.
        # The integrated workflow will terminate at this step.
        raise
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


# NOT a WorkflowTask — upload verification runs outside the workflow engine
# so that it can be dispatched directly via .delay() without a workflow wrapper.
@app.task(bind=True, name='verify_upload_integrity',
          autoretry_for=(Exception,),
          max_retries=3,
          default_retry_delay=60,
          time_limit=86400,
          soft_time_limit=43200)
def verify_upload_integrity(celery_task, dataset_id, **kwargs):
    from workers.tasks.verify_upload import verify_upload_integrity as task_body
    return task_body(celery_task, dataset_id)
