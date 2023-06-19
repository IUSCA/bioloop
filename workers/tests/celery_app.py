from celery import Celery

# noinspection PyUnresolvedReferences
import tests.tasks.declarations

from workers.config import celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
