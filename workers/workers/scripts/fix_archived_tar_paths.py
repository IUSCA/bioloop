import logging
import fire
import workers.api as api
from workers.config import config
from sca_rhythm import Workflow

from workers.celery_app import app as celery_app
import workers.workflow_utils as wf_utils

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ArchivedTarPathFixManager:

    def __init__(self, app_id, dry_run=False):
        self.app_id = app_id
        self.dry_run = dry_run
        self.workflow_name = 'fix_tar_paths'

        logger.info(f'app_id: {app_id}')

    def stage(self):
        """
        Stage archived datasets from the SDA
        """
        archived_datasets = api.get_all_datasets(archived=True)
        raise Exception('test exception')

        logger.info(f'Found {len(archived_datasets)} archived datasets')

        for dataset in archived_datasets:
            dataset_id = dataset["id"]
            logger.info(f'Begin "{self.workflow_name}" on dataset {dataset_id}')

            if not self.dry_run:
                wf_body = wf_utils.get_wf_body(wf_name=self.workflow_name)
                wf = Workflow(celery_app=celery_app, **wf_body)
                api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
                wf.start(dataset_id)


def stage_archived_datasets(app_id: str = config['app_id'], dry_run=False):
    """
    Purge orphaned workflows and associated tasks from the result backend.

    @param app_id: app_id to purge workflows for
    @param dry_run: if True, do not delete workflows

    example usage:

    python -m workers.scripts.fix_tar_paths --app_id='bioloop-dev.sca.iu.edu --dry_run
    """
    ArchivedTarPathFixManager(app_id, dry_run).stage()


if __name__ == "__main__":
    fire.Fire(stage_archived_datasets)
