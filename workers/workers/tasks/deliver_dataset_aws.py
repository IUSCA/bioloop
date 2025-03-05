from celery import Celery
from celery.utils.log import get_task_logger
import boto3
import os

from workers.dataset import compute_staging_path
import workers.api as api
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def setup_credentials():
    session = boto3.Session()
    # Read credentials from ~/.aws/credentials
    credentials = session.get_credentials()

    # Set environment variables
    #   The AWS CLI commands (`aws s3 sync` and `aws s3 ls`) automatically look for these
    #   environment variables when they're executed.
    os.environ['AWS_ACCESS_KEY_ID'] = credentials.access_key
    os.environ['AWS_SECRET_ACCESS_KEY'] = credentials.secret_key

    print("AWS credentials set up")


def deliver(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    setup_credentials()

    s3_client = boto3.client('s3')
    bucket_name = 'provided_by_UI_client'

    (dataset_staged_path, _) = compute_staging_path(dataset=dataset)
    s3_destination_path = f"/user_specified_destination_path/{dataset_id}"

    # todo - account for corrupt copies at destination
    # todo - send checksum

    s3_client.upload_file(dataset_staged_path, bucket_name, s3_destination_path)

    return dataset_id,
