import asyncio
import json
import logging
import signal
from email.message import EmailMessage

import aio_pika
import aiosmtplib

from workers.config import config
from workers.config.celeryconfig import broker_url

logger = logging.getLogger(__name__)

# RabbitMQ connection settings
RABBITMQ_URL = broker_url
QUEUE_NAME = config['notifications']['email_queue']

# SMTP server settings (Assuming local MTA)
SMTP_HOST = config['email']['smtp']['host']
SMTP_PORT = config['email']['smtp']['port']


async def send_email(from_addr, to_addr, subject, html_body):
    """Asynchronously sends an email using aiosmtplib."""
    try:
        # Construct the email
        msg = EmailMessage()
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg["Subject"] = subject
        msg.set_content(html_body, subtype="html")

        # Send email asynchronously
        await aiosmtplib.send(msg, hostname=SMTP_HOST, port=SMTP_PORT)
        logger.info(f"Email sent successfully to {to_addr}")

    except Exception as e:
        logger.error(f"Failed to send email: {e}")


async def process_message(message: aio_pika.abc.AbstractIncomingMessage) -> None:
    """Callback function that processes incoming RabbitMQ messages."""
    try:
        # Parse the JSON payload
        # error will be raised if the message is not a valid JSON
        # or if it doesn't contain the required fields
        event = json.loads(message.body)
        from_addr = config['email']["from_addr"]
        to_addr = event['delivery_details']["email"]
        subject = event['message']["subject"]
        html_body = event['message']["html"]

        print(f"📩 Received email request: {subject} -> {to_addr}")

        # Send the email asynchronously
        await send_email(from_addr, to_addr, subject, html_body)

    except json.JSONDecodeError:
        print("Failed to decode JSON message")
    except KeyError as e:
        print(f"Missing required field in message: {e}")


async def main():
    """Main function to consume messages from RabbitMQ and send emails."""
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await connection.channel()

    # Declare the queue
    queue = await channel.declare_queue(QUEUE_NAME, durable=True)

    print(f"Waiting for messages in queue: {QUEUE_NAME}...")

    # Start consuming messages
    # no_ack=True means that messages are automatically acknowledged
    await queue.consume(process_message, no_ack=True)

    # Create a future to keep the main function running
    stop_event = asyncio.Event()

    def shutdown():
        print("Received exit signal, shutting down...")
        stop_event.set()

    # Register signal handlers
    loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown)

    try:
        await stop_event.wait()  # Keep running until stop_event is set
    except asyncio.CancelledError:
        print("Consumer stopped.")
    finally:
        await connection.close()
        print("Connection closed.")


if __name__ == "__main__":
    asyncio.run(main())
