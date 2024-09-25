import logging
from pathlib import Path
from datetime import datetime, timedelta

import fire
import workers.api as api
import workers.workflow_utils as wf_utils
from pymongo import MongoClient
from workers.config import config
from workers.config.celeryconfig import result_backend

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ArchivePathVerificationManager:

    def __init__(self, dry_run=False):
        self.dry_run = dry_run
        logger.warning(f'dry_run: {self.dry_run}')

    def purge(self):
        """
        Purge orphaned workflows and associated tasks from the result backend
        """
        datasets = api.get_all_datasets(archived=True)


        for dataset in datasets:
            archive_path = dataset['archive_path']

            archive_path_verification_dir = config['paths'][dataset['type']]['archive_path_verification']
            working_dir = Path(archive_path_verification_dir) / dataset['name']

            wf_utils.download_file_from_sda(sda_file_path=archive_path,
                                            local_file_path=working_dir)
            tar_file_path = working_dir / 'dummy_tarfile.tar.gz'
            extraction_path = working_dir / 'dummy_path'
            wf_utils.extract_tarfile(tar_path=working_dir,)




def purge_stale_workflows(app_id: str = config['app_id'],
                          workflow_types: list[str] = config['workflow']['purge']['types'],
                          age_threshold: int = config['workflow']['purge']['age_threshold_seconds'],
                          max_purge_count: int = config['workflow']['purge']['max_purge_count'],
                          dry_run=False):
    """
    Purge orphaned workflows and associated tasks from the result backend.

    @param app_id: app_id to purge workflows for
    @param workflow_types: list of workflow types to purge
    @param age_threshold: purge workflows older than this threshold (in seconds)
    @param max_purge_count: max number of workflows to purge
    @param dry_run: if True, do not delete workflows

    example usage:

    python -m workers.scripts.purge_stale_workflows --app_id='bioloop-dev.sca.iu.edu' --workflow_types='["stage", "integrated"]' --age_threshold=86400 --max_purge_count=10 --dry_run
    """
    ArchivePathVerificationManager(app_id, workflow_types, age_threshold, max_purge_count, dry_run).purge()


if __name__ == "__main__":
    fire.Fire(purge_stale_workflows)
