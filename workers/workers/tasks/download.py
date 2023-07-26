import itertools
import shutil
import stat
from pathlib import Path

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.dataset import compute_staging_path

app = Celery("tasks")
app.config_from_object(celeryconfig)


def rm(p: Path):
    if p.is_symlink():
        p.unlink()
    else:
        if p.exists():
            if p.is_dir():
                shutil.rmtree(p)
            else:
                p.unlink()


def grant_read_permissions_to_others(root: Path):
    for p in itertools.chain([root], root.rglob('*')):
        if p.is_dir():
            p.chmod(p.stat().st_mode | stat.S_IROTH | stat.S_IXOTH)
        else:
            p.chmod(p.stat().st_mode | stat.S_IROTH)


def setup_download(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    staged_path, alias = compute_staging_path(dataset)

    if not staged_path.exists():
        # TODO: more robust validation?
        # TODO: non-retryable error
        pass

    download_path = Path(config['paths']['download_dir']).resolve() / alias

    # remove if exists and create a symlink in download dir pointing to the staged path
    rm(download_path)
    download_path.symlink_to(staged_path, target_is_directory=True)

    # enable others to read and cd into directory
    grant_read_permissions_to_others(staged_path)
