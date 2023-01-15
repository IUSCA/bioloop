from celery import Celery

import celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)