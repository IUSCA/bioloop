from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


def f1(*args, **kwargs):
    logger.info(f'called from f1 {args}, {kwargs}')
