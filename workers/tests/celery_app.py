from celery import Celery

# noinspection PyUnresolvedReferences
import tests.tasks.declarations
# # noinspection PyUnresolvedReferences
# import tests.tasks.tasksA
# # noinspection PyUnresolvedReferences
# import tests.tasks.tasksB
from workers.config import celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
