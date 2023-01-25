import os
import urllib.parse

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.

password = os.environ['MONGO_PASS']

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/rabbitmq.html
broker_url = f'amqp://dgl:{urllib.parse.quote(password)}@commons3.sca.iu.edu:5672/dgl-test'
# task_routes = {
#     'tasksB.task2': 'subtractqueue'
# }

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#result-extended
result_extended = True

task_serializer = 'json'
result_serializer = 'json'

# https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html#results
# result_backend = 'redis://localhost:6379/0'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#conf-mongodb-result-backend
result_backend = f'mongodb://dgl:{urllib.parse.quote(password)}@commons3.sca.iu.edu:27017/dgl-test?authSource=dgl-test'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#database-backend-settings
# https://stackoverflow.com/questions/69952488/celery-task-result-in-postgres-database-is-in-byte-format
# result_backend = 'db+postgresql://username:password@localhost:5432/celery'
