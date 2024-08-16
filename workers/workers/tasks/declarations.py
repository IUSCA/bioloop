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


@app.task(base=WorkflowTask, bind=True, name='compare_duplicate_datasets',
          autoretry_for=(exc.RetryableException,),
          max_retries=3,
          default_retry_delay=5)
def compare_duplicate_datasets(celery_task, duplicate_dataset_id, **kwargs):
    from workers.tasks.compare_duplicate_datasets import compare_datasets as task_body
    try:
        return task_body(celery_task, duplicate_dataset_id, **kwargs)
    except exc.InspectionFailed:
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
    except exc.InspectionFailed:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='process_uploaded_chunks'
          # ,
          # autoretry_for=(exc.RetryableException,),
          # max_retries=3,
          # default_retry_delay=5
          )
def process_uploaded_chunks(celery_task, dataset_id, **kwargs):
    from workers.tasks.process_uploaded_chunks import chunks_to_files as task_body
    try:
        return task_body(celery_task, dataset_id, **kwargs)
    except exc.RetryableException:
        raise
    except Exception:
        raise


# @app.task(base=WorkflowTask, bind=True, name='move_upload_to_worker_space',
#           # autoretry_for=(exc.RetryableException,),
#           # max_retries=3,
#           # default_retry_delay=5
#           )
# def move_upload_to_worker_space(celery_task, dataset_id, **kwargs):
#     from workers.tasks.move_upload_to_worker_space import move as task_body
#     try:
#         return task_body(celery_task, dataset_id, **kwargs)
#     # except exc.RetryableException:
#     #     raise
#     except Exception:
#         raise


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
