import celery
from celery import Celery, Task

import celeryconfig

import workers.archive
import workers.inspect
import workers.stage
import workers.validate

app = Celery("tasks")
app.config_from_object(celeryconfig)