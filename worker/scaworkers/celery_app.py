from celery import Celery

import scaworkers.celeryconfig as celeryconfig

# noinspection PyUnresolvedReferences
import scaworkers.workers.archive
# noinspection PyUnresolvedReferences
import scaworkers.workers.inspect
# noinspection PyUnresolvedReferences
import scaworkers.workers.stage
# noinspection PyUnresolvedReferences
import scaworkers.workers.validate
# noinspection PyUnresolvedReferences
import scaworkers.tasksA

app = Celery("tasks")
app.config_from_object(celeryconfig)
