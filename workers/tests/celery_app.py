from celery import Celery

# noinspection PyUnresolvedReferences
import tests.tasks.tasksA
# noinspection PyUnresolvedReferences
import tests.tasks.tasksB
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
