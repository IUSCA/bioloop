import json
import logging
from dataclasses import dataclass
from enum import Enum
from itertools import islice
from typing import Iterator

import pika

from workers.config.celeryconfig import broker_url

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ActionType(Enum):
    REGISTER = 'register'
    UNREGISTER = 'unregister'
    MODIFY = 'modify'


@dataclass
class AppMessage:
    action: ActionType
    payload: dict
    timestamp: str

    def __post_init__(self):
        if isinstance(self.action, str):
            self.action = ActionType(self.action)


class RabbitMqConsumer:
    def __init__(self, queue_name):
        self.queue_name = queue_name
        self.parameters = pika.URLParameters(broker_url)

    def __enter__(self):
        """Setup RabbitMQ connection and channel when entering the context."""
        self.connection = pika.BlockingConnection(self.parameters)
        self.channel = self.connection.channel()
        self.channel.queue_declare(queue=self.queue_name)
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        """Ensure the connection is closed properly when exiting the context."""
        if self.connection:
            self.connection.close()
            logger.info("RabbitMQ connection closed.")

    def consume_messages(self, max_count=None) -> Iterator[str]:
        """Fetch up to max_count messages from the queue."""
        msg_iter = (
            body.decode()
            for _, _, body in self.channel.basic_get(queue=self.queue_name, auto_ack=True)
        )
        return islice(msg_iter, max_count)

    def consume_app_messages(self, max_count=None) -> Iterator[AppMessage]:
        """
        Fetch up to max_count messages from the queue and yield AppMessage objects.
        """
        for msg in self.consume_messages(max_count=max_count):
            try:
                msg_dict = json.loads(msg)
                app_msg = AppMessage(**msg_dict)
                yield app_msg
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON message: {msg}")
                continue
