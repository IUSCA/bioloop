"""
Deletes the Celery app's queue from RabbitMQ.

This function is useful when queue properties are changed, such as adding a task_queue_max_priority,
causing Celery to be unable to connect to RabbitMQ and throwing the following error:

amqp.exceptions.PreconditionFailed: Queue.declare: (406) PRECONDITION_FAILED -
inequivalent arg 'x-max-priority' for queue <queue> in vhost 'myvhost': received the value '10' of type 'signedint'
but current is none

One of the fixes is to ensure that there are no messages in the queue and delete it. Celery will create a new queue
with correct properties when it starts again.
"""

from workers.archive_celery_app import app

queues = ['cpa.sca.iu.edu.q', 'archive.cpa.sca.iu.edu.q', 'fetch.cpa.sca.iu.edu.q']

with app.connection_for_read() as connection:
    # Create a channel
    channel = connection.channel()

    for q in queues:
      try:
          # Delete the queue
          channel.queue_delete(queue=q)
          print(f"Queue '{q}' deleted successfully.")
      except Exception as e:
          print(f"Error deleting queue '{q}': {e}")
