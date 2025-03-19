import json

import pika

from workers import utils
from workers.config import config
from workers.config.celeryconfig import broker_url


class EventBus:
    def __init__(self, rabbitmq_url: str, queue: str):
        self.rabbitmq_url = rabbitmq_url
        self.queue = queue
        self.connection = pika.BlockingConnection(pika.URLParameters(rabbitmq_url))
        self.channel = self.connection.channel()
        self.channel.queue_declare(queue=self.queue, durable=True)  # Ensure queue exists

    def emit(self, event_name: str, resource_id: str = None, resource_type: str = None, data: dict = None):
        _data = data or {}
        if resource_id:
            _data['resource_id'] = resource_id
        if resource_type:
            _data['resource_type'] = resource_type
        message = {
            "name": event_name,
            "data": _data,
            "timestamp": utils.current_time_iso8601()
        }
        self.channel.basic_publish(
            exchange='',
            routing_key=self.queue,
            body=json.dumps(message).encode('utf-8'),
            properties=pika.BasicProperties(
                delivery_mode=2  # Make message persistent
            )
        )

    def close(self):
        self.connection.close()


# Instantiate a globally accessible event bus instance
eventBus = EventBus(rabbitmq_url=broker_url, queue=config['notifications']['event_queue'])
