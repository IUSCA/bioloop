# noinspection PyUnresolvedReferences
import logging

from celery import Celery
# noinspection PyUnresolvedReferences
from celery.signals import task_prerun

import workers.config.celeryconfig as celeryconfig
# noinspection PyUnresolvedReferences
import workers.tasks.declarations

app = Celery("tasks")
app.config_from_object(celeryconfig)

# @task_prerun.connect
# def task_prerun_handler(sender=None, task=None, **kwargs):
#     logger = logging.getLogger(task.name)
#     logger.addHandler(logging.FileHandler(f'{task.name}.log'))
#     logger.setLevel(logging.DEBUG)
