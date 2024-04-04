import itertools
import shutil
import stat
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from glom import glom

import workers.utils as utils
import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.exceptions import ValidationFailed
from workers.dataset import get_bundle_staged_path

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


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


def grant_access_to_parent_chain(leaf: Path, root: Path):
    p = leaf.parent
    while p != root:
        p.chmod(p.stat().st_mode | stat.S_IXOTH)
        p = p.parent


def setup_download(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)

    locked, latest_state = utils.is_dataset_locked_for_writes(dataset)
    if locked:
        raise ValidationFailed(f"Dataset {dataset['id']} is locked for writes. Dataset's current "
                        f"state is {latest_state}.")

    staged_path, alias = Path(dataset['staged_path']), glom(dataset, 'metadata.stage_alias')

    bundle_path = Path(get_bundle_staged_path(dataset=dataset))

    bundle_alias = dataset['metadata']['bundle_alias']

    if not staged_path.exists():
        # TODO: more robust validation?
        raise ValidationFailed(f'Staged path does not exist {staged_path}')

    download_dir = Path(config['paths']['download_dir']).resolve()
    download_path = download_dir / alias
    bundle_download_path = download_dir / bundle_alias

    # remove if exists and create a symlink in download dir pointing to the staged path
    rm(download_path)
    download_path.symlink_to(staged_path, target_is_directory=True)
    # do the same for bundle file
    rm(bundle_download_path)
    bundle_download_path.symlink_to(bundle_path)

    # enable others to read and cd into stage directory
    grant_read_permissions_to_others(staged_path)
    grant_read_permissions_to_others(bundle_download_path)

    # enable others to navigate to leaf by granting execute permission on parent directories
    grant_access_to_parent_chain(staged_path, root=Path(config['paths']['root']))
    return dataset_id,
