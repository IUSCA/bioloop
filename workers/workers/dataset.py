import hashlib
from pathlib import Path

from glom import glom

from workers import api
from workers.config import config


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
    alias = glom(dataset, 'metadata.stage_alias', default=stage_alias(dataset))
    return staging_dir / alias / dataset['name'], alias


def bundle_alias(bundle: dict) -> str:
    salt = config['stage']['alias_salt']
    return deterministic_uuid(f'{bundle["id"]}{bundle["name"]}{salt}')


def compute_bundle_path(dataset: dict) -> str:
    alias = glom(dataset, 'metadata.bundle_alias', default=bundle_alias(dataset['bundle']))
    return alias


def get_bundle_staged_path(dataset: dict) -> str:
    return f'{config["paths"][dataset["type"]]["bundle"]["stage"]}/{dataset["bundle"]["name"]}'


def is_dataset_locked_for_writes(dataset: dict) -> tuple:
    # assumes states are sorted by descending timestamp
    latest_state = dataset['states'][0] if \
        (dataset['states'] is not None and len(dataset['states']) > 0) else \
        None

    if dataset['is_deleted']:
        locked = True
    else:
        if not dataset['is_duplicate']:
            locked = (latest_state['state'] == 'OVERWRITE_IN_PROGRESS' or
                      latest_state['state'] == 'ORIGINAL_DATASET_RESOURCES_PURGED')
        else:
            locked = (latest_state['state'] == 'DUPLICATE_ACCEPTANCE_IN_PROGRESS' or
                      latest_state['state'] == 'DUPLICATE_REJECTION_IN_PROGRESS' or
                      latest_state['state'] == 'DUPLICATE_DATASET_RESOURCES_PURGED')

    return locked, latest_state if latest_state is not None else None
