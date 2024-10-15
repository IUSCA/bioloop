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

from workers.celery_app import app

queue_name = app.conf.get('task_default_queue')


def clear_queue(channel, queue_name):
    msg = True
    while msg:
        msg = channel.basic_get(queue=queue_name, auto_ack=True)
        print(msg.headers, msg.body)

with app.connection_for_read() as connection:
    # Create a channel
    channel = connection.channel()

    try:
        # Clear the queue of pending messages
        # clear_queue(channel, queue_name)

        # Delete the queue
        channel.queue_delete(queue=queue_name)
        print(f"Queue '{queue_name}' deleted successfully.")
    except Exception as e:
        print(f"Error deleting queue '{queue_name}': {e}")
