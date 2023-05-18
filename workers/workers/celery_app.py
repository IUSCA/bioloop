# noinspection PyUnresolvedReferences
from celery import Celery

import workers.config.celeryconfig as celeryconfig
# noinspection PyUnresolvedReferences
# import workers.tasks.archive
# # noinspection PyUnresolvedReferences
# import workers.tasks.delete
# # noinspection PyUnresolvedReferences
# import workers.tasks.download
# # noinspection PyUnresolvedReferences
# import workers.tasks.inspect
# # noinspection PyUnresolvedReferences
# import workers.tasks.report
# # noinspection PyUnresolvedReferences
# import workers.tasks.stage
# # noinspection PyUnresolvedReferences
# import workers.tasks.validate
import workers.tasks.declarations

app = Celery("tasks")
app.config_from_object(celeryconfig)
