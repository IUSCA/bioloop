from celery import Celery

import celeryconfig

import workers.archive
import workers.inspect
import workers.stage
import workers.validate
import tasksA

app = Celery("tasks")
app.config_from_object(celeryconfig)
