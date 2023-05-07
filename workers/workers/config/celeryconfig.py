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
# broker_url = f'amqp://dgl:{urllib.parse.quote(queue_password)}@commons3.sca.iu.edu:5672/dgl-tests'
broker_url = f'amqp://{queue_username}:{urllib.parse.quote(queue_password)}@{queue_url}'
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
# result_backend = f'mongodb://dgl:{urllib.parse.quote(mongo_password)}@commons3.sca.iu.edu:27017/dgl-tests?authSource=dgl-tests'
result_backend = f'mongodb://{mongo_username}:{urllib.parse.quote(mongo_password)}@{mongo_url}'

# https://docs.celeryq.dev/en/stable/userguide/configuration.html#database-backend-settings
# https://stackoverflow.com/questions/69952488/celery-task-result-in-postgres-database-is-in-byte-format
# result_backend = 'db+postgresql://username:password@localhost:5432/celery'
