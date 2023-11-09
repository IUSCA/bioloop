import itertools
import shutil
import stat
from pathlib import Path

from celery import Celery
from glom import glom

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.exceptions import ValidationFailed

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


def grant_access_to_parent_chain(leaf: Path, root: Path):
    p = leaf.parent
    while p != root:
        p.chmod(p.stat().st_mode | stat.S_IXOTH)
        p = p.parent


def setup_download(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    staged_path, alias = dataset['staged_path'], glom(dataset, 'metadata.stage_alias')
    # staged_path.parent = the alias sub-directory
    bundle_path = Path(f'{str(staged_path.parent)}/{dataset["name"]}.tar')

    if not staged_path.exists():
        # TODO: more robust validation?
        raise ValidationFailed(f'Staged path does not exist {staged_path}')

    download_path = Path(config['paths']['download_dir']).resolve() / alias
    tar_download_path = download_path / f"{dataset['name']}.tar"

    # remove if exists and create a symlink in download dir pointing to the staged path
    rm(download_path)
    download_path.symlink_to(staged_path, target_is_directory=True)
    # do the same for tar file
    rm(tar_download_path)
    tar_download_path.symlink_to(bundle_path)

    # enable others to read and cd into stage directory
    grant_read_permissions_to_others(staged_path)
    grant_read_permissions_to_others(tar_download_path)

    # enable others to navigate to leaf by granting execute permission on parent directories
    grant_access_to_parent_chain(staged_path, root=Path(config['paths']['root']))
    return dataset_id,
