import hashlib
import shutil
import stat
from pathlib import Path

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def deterministic_uuid(input_string):
    # Convert the input string to bytes (encoding is important for consistent results)
    input_bytes = input_string.encode('utf-8')

    # Use SHA-256 hashing algorithm
    sha256_hash = hashlib.sha256(input_bytes)

    # Get the hexadecimal representation of the hash
    hex_hash = sha256_hash.hexdigest()

    # Take the first 32 characters of the hash to get a 32-character UUID-like string
    uuid_like_string = hex_hash[:32]

    return uuid_like_string


def rm(p: Path):
    if p.is_symlink():
        p.unlink()
    else:
        if p.exists():
            if p.is_dir():
                shutil.rmtree(p)
            else:
                p.unlink()


def setup_download(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    dataset_type = dataset['type']
    staged_path = Path(config['paths'][dataset_type]['stage']).resolve() / dataset['name']

    # create alias path from deterministic uuid
    alias_name = deterministic_uuid(f'{dataset["id"]}{dataset["name"]}')
    alias_path = Path(config['paths']['download_dir']).resolve() / alias_name

    # remove if exists and create a symlink in download dir pointing to staged path
    rm(alias_path)
    alias_path.symlink_to(staged_path, target_is_directory=True)

    # set appropriate permissions to both the symlink and the staged_path recursively
    # enable others to have the read permission on the symlink.
    alias_path.chmod(alias_path.lstat().st_mode | stat.S_IROTH)

    # enable others to cd into directory
    staged_path.chmod(staged_path.stat().st_mode | stat.S_IXOTH)

    # update the dataset with this name
    update_data = {
        'metadata': {
            'download_alias': alias_name
        }
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
