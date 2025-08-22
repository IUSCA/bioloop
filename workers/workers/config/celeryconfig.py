import urllib.parse

from workers.config import config

queue_url = config['celery']['queue']['url']
queue_username = config['celery']['queue']['username']
queue_password = config['celery']['queue']['password']
mongo_uri = config['celery']['mongo']['uri']

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/rabbitmq.html
broker_url = f'amqp://{queue_username}:{urllib.parse.quote(queue_password)}@{queue_url}'

# retry connection to broker on startup if failed
broker_connection_retry_on_startup = True

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html#results
# result_backend = 'redis://localhost:6379/0'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#conf-mongodb-result-backend
result_backend = mongo_uri

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

# the task reports its status as ‘started’ when the task is executed by a worker.
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-track-started
task_track_started = True

# rabbitmq settings
# consumer_timeout=86400000
# https://www.rabbitmq.com/consumers.html#acknowledgement-timeout
# Why: I’m running celery tasks which acks messages in queue after the task is complete. 
# The tasks can take as long as 1 day to complete. 
# But rabbitmq closes the channel if it does not receive acknowledgements within 30 min.
# We couldn't configure this setting per vhost, so we had to set it globally.

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
#     'tasksB.task2': 'subtractqueue' # cspell: disable-line
# }

# default value is 'celery'
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-default-queue
task_default_queue = f'{config["app_id"]}.q'

# https://docs.celeryq.dev/en/stable/userguide/routing.html#rabbitmq-message-priorities
task_queue_max_priority = 10
task_default_priority = 1

# The queue name for each worker is automatically generated
# based on the worker hostname and a .dq suffix, using the C.dq exchange.
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-direct
# worker_direct=True

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-acks-late
task_acks_late = True

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#task-reject-on-worker-lost
task_reject_on_worker_lost = True

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-prefetch-multiplier
worker_prefetch_multiplier = 1

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-state-db
worker_state_db = "./celery_state"

# Maximum number of tasks a pool worker process can execute before it’s replaced with a new one.
# Each worker process will die after processing one task
# Used for hot module replacement (updating code while the celery main worker is running)
# the next task run will use the updated code
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-max-tasks-per-child
worker_max_tasks_per_child = 1

# cancel tasks (those that acks late) when rabbitmq closes connection
# https://docs.celeryq.dev/en/stable/userguide/configuration.html#worker-cancel-long-running-tasks-on-connection-loss
worker_cancel_long_running_tasks_on_connection_loss = True
