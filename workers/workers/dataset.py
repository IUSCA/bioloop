import hashlib
from pathlib import Path

from glom import glom

import workers.workflow_utils as wf_utils
from workers import api
from workers.config import config

# Single place to change if the bundle format ever moves away from tar.
_BUNDLE_EXTENSION = '.tar'


def deterministic_uuid(input_string: str) -> str:
    # Convert the input string to bytes (encoding is important for consistent results)
    input_bytes = input_string.encode('utf-8')

    # Use SHA-256 hashing algorithm
    sha256_hash = hashlib.sha256(input_bytes)

    # Get the hexadecimal representation of the hash
    hex_hash = sha256_hash.hexdigest()

    # Take the first 32 characters of the hash to get a 32-character UUID-like string
    uuid_like_string = hex_hash[:32]

    return uuid_like_string


def stage_alias(dataset: dict) -> str:
    salt = config['stage']['alias_salt']
    return deterministic_uuid(f'{dataset["id"]}{dataset["name"]}{salt}')


def compute_staging_path(dataset: dict) -> tuple[Path, str]:
    dataset_type = dataset['type']
    staging_dir = Path(config['paths'][dataset_type]['stage']).resolve()
    alias = stage_alias_of(dataset)
    return staging_dir / alias / dataset['name'], alias


def get_archive_key(dataset: dict) -> str:
    """Directory a group's archives live under.

    Frozen at group creation, so renaming a group does not fragment its archives.

    @see docs/design/groups/dataset-storage.md — Archival
    """
    archive_key = glom(dataset, 'owner_group.archive_key', default=None)
    if not archive_key:
        raise ValueError(
            f'dataset {dataset.get("id")} has no owner_group.archive_key; '
            'the API must include owner_group in the dataset payload'
        )
    return archive_key


def get_archive_path(dataset: dict) -> str:
    """Full path of the bundle on tape.

    Formula (mirrors workers/tasks/archive.py):
        get_archive_dir(type) / {archive_key} / {name}{_BUNDLE_EXTENSION}

    Readable on purpose: an administrator recovering without the database reads the owning
    group and the dataset name straight off the path.

    @see docs/design/groups/dataset-storage.md — Two naming rules, and where each applies
    """
    archive_dir = wf_utils.get_archive_dir(dataset['type'], create=False)
    return f'{archive_dir}/{get_archive_key(dataset)}/{get_archive_bundle_name(dataset)}'


def get_archive_bundle_name(dataset: dict) -> str:
    """Filename of the bundle on tape: {name}{_BUNDLE_EXTENSION}.

    Unique only within the group directory above it, because two groups may hold a dataset
    of the same name.
    """
    return f"{dataset['name']}{_BUNDLE_EXTENSION}"


def get_bundle_generate_path(dataset: dict) -> str:
    """Path of the tar while it is being built, before it reaches tape.

    Keyed by dataset id. A local temp file nobody reads, deleted once the upload succeeds,
    and named so two groups tarring the same dataset name cannot collide.
    """
    generate_dir = config['paths'][dataset['type']]['bundle']['generate']
    return f'{generate_dir}/{dataset["id"]}{_BUNDLE_EXTENSION}'


def get_bundle_staged_path(dataset: dict) -> str:
    """Path of the bundle fetched back from tape during stage_dataset.

    Keyed by stage_alias for the same reason: local, transient, and shared across groups.
    """
    stage_dir = config['paths'][dataset['type']]['bundle']['stage']
    return f'{stage_dir}/{stage_alias_of(dataset)}{_BUNDLE_EXTENSION}'


def get_bundle_name(dataset: dict) -> str:
    """Filename a user sees when downloading the bundle: {name}{_BUNDLE_EXTENSION}.

    The browser names a saved file from the last path segment, so this stays readable while
    the directory above it supplies uniqueness.
    """
    return f"{dataset['name']}{_BUNDLE_EXTENSION}"


def stage_alias_of(dataset: dict) -> str:
    """The dataset's stored stage alias, computing it only if staging has not run yet."""
    return glom(dataset, 'metadata.stage_alias', default=stage_alias(dataset))


def get_dataset_download_path(dataset: dict) -> Path:
    """Symlink created by setup_dataset_download for the staged dataset directory."""
    alias = glom(dataset, 'metadata.stage_alias')
    return Path(config['paths']['download_dir']).resolve() / alias


def get_bundle_download_path(dataset: dict) -> Path:
    """Symlink created by setup_dataset_download for the staged bundle.

    ``<download>/bundles/<stage_alias>/<name>.tar``. Every path under the download root
    reaches a browser, so the directory is opaque and only the filename is readable.

    @see docs/design/groups/dataset-storage.md — Download
    """
    alias = glom(dataset, 'metadata.stage_alias')
    download_dir = Path(config['paths']['download_dir']).resolve()
    return download_dir / 'bundles' / alias / get_bundle_name(dataset)
