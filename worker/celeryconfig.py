# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/rabbitmq.html
broker_url = 'amqp://myuser:mypassword@localhost:5672/myvhost'
task_routes = {
    'tasksB.task2': 'subtractqueue'
}

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-extended
result_extended = True

task_serializer = 'json'
result_serializer = 'json'

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html#results
# result_backend = 'redis://localhost:6379/0'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#conf-mongodb-result-backend
result_backend = 'mongodb://root:example@localhost:27017/'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#database-backend-settings
# https://stackoverflow.com/questions/69952488/celery-task-result-in-postgres-database-is-in-byte-format
# result_backend = 'db+postgresql://username:password@localhost:5432/celery'