import os
import urllib.parse

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.

queue_url = os.environ['QUEUE_URL']
queue_username = os.environ['QUEUE_USER']
queue_password = os.environ['QUEUE_PASS']
mongo_url = os.environ['MONGO_URL']
mongo_username = os.environ['MONGO_USER']
mongo_password = os.environ['MONGO_PASS']

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/rabbitmq.html
broker_url = f'amqp://{queue_username}:{urllib.parse.quote(queue_password)}@{queue_url}'

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html#results
# result_backend = 'redis://localhost:6379/0'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#conf-mongodb-result-backend
result_backend = f'mongodb://{mongo_username}:{urllib.parse.quote(mongo_password)}@{mongo_url}'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#database-backend-settings
# https://stackoverflow.com/questions/69952488/celery-task-result-in-postgres-database-is-in-byte-format
# result_backend = 'db+postgresql://username:password@localhost:5432/celery'

# If enabled, backend will try to retry on the event of recoverable exceptions instead of propagating the exception.
# It will use an exponential backoff sleep time between 2 retries.
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-backend-always-retry
result_backend_always_retry = True
result_backend_max_sleep_between_retries_ms = 10000
result_backend_base_sleep_between_retries_ms = 1000
result_backend_max_retries = 10

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-extended
result_extended = True

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-serializer
result_serializer = 'json'

# task entries in database are persisted forever
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-expires
result_expires = 0

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-serializer
task_serializer = 'json'

# If True the task reports its status as ‘started’ when the task is executed by a worker.
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-track-started
task_track_started = True

# The worker processing the task will be killed and replaced with a new one when this is exceeded.
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-time-limit
ONE_DAY = 24 * 60 * 60
task_time_limit = ONE_DAY

# The SoftTimeLimitExceeded exception will be raised when this is exceeded.
# The task can catch this to clean up before the hard time limit.
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-soft-time-limit
TEN_MINUTES = 10 * 60
task_soft_time_limit = ONE_DAY - TEN_MINUTES

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-routes
# task_routes = {
#     'tasksB.task2': 'subtractqueue'
# }


# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-acks-late
task_acks_late = True

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-reject-on-worker-lost
task_reject_on_worker_lost = True

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-prefetch-multiplier
worker_prefetch_multiplier = 1

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-state-db
worker_state_db = "./celery-state.db"
