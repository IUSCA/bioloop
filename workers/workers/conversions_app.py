from celery import Celery
from sca_rhythm import WorkflowTask

import workers.config.celeryconfig as celeryconfig
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True, name='convert_dataset',
          # autoretry_for=(exc.RetryableException,),
          # max_retries=3,
          # default_retry_delay=5
          )
def convert_dataset(celery_task, conversion_id, **kwargs):
    from workers.tasks.convert import run_conversion as task_body
    try:
        return task_body(celery_task, conversion_id, **kwargs)
    except exc.ConversionException:
        raise
    except Exception as e:
        raise exc.RetryableException(e)


@app.task(base=WorkflowTask, bind=True, name='convert_genomic',
          # autoretry_for=(Exception,),
          # max_retries=3,
          # default_retry_delay=5
          )
def convert_genomic(celery_task, conversion_id, **kwargs):
    from workers.tasks.convert_genomic import run_conversion as task_body
    return task_body(celery_task, conversion_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='generate_qc',
          # autoretry_for=(Exception,),
          # max_retries=3,
          # default_retry_delay=5
          )
def generate_qc(celery_task, dataset_id_conversion_id, **kwargs):
    from workers.tasks.conversion_qc import generate_qc as task_body
    return task_body(celery_task, dataset_id_conversion_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='copy_conversion_reports',
          # autoretry_for=(Exception,),
          # max_retries=3,
          # default_retry_delay=5
          )
def copy_conversion_reports(celery_task, dataset_id_conversion_id, **kwargs):
    from workers.tasks.copy_conversion_reports import copy as task_body
    return task_body(celery_task, dataset_id_conversion_id, **kwargs)


@app.task(base=WorkflowTask, bind=True, name='derive_data_products',
          # autoretry_for=(Exception,),
          # max_retries=3,
          # default_retry_delay=5
          )
def derive_data_products(celery_task, dataset_id_conversion_id, **kwargs):
    from workers.tasks.derive_data_products import derive as task_body
    return task_body(celery_task, dataset_id_conversion_id, **kwargs)
