import os
from pathlib import Path

from glom import glom

APP_ENV = os.environ.get('APP_ENV', None)

path_keys = [
    'paths.scratch',
    'paths.RAW_DATA.stage',
    'paths.RAW_DATA.bundle.generate',
    'paths.RAW_DATA.bundle.stage',
    'paths.RAW_DATA.qc',
    'paths.DATA_PRODUCT.stage',
    'paths.DATA_PRODUCT.bundle.generate',
    'paths.DATA_PRODUCT.bundle.stage',
    'registration.RAW_DATA.source_dir',
    'registration.DATA_PRODUCT.source_dir',
]

archive_path_keys = [
    'paths.RAW_DATA.archive',
    'paths.DATA_PRODUCT.archive',
]


def create_dirs(config):
    if APP_ENV is not None and APP_ENV.lower() == 'production':
        keys = path_keys
    else:
        keys = path_keys + archive_path_keys

    for pk in keys:
        try:
            value = glom(config, pk)
            path = Path(value)
            if not path.exists():
                path.mkdir(parents=True, exist_ok=True)
                print(f"Created directory: {path}")
            else:
                print(f"Directory already exists: {path}")
        except KeyError:
            print(f"KeyError: Path key '{pk}' not found in config.")
        except TypeError:
            print(f"TypeError: Value for path key '{pk}' is not a valid path string: {value}")
        except Exception as e:
            print(f"Unexpected error for path key '{pk}': {e}")
    print("All directories checked/created.")


if __name__ == "__main__":
    from workers.config import config

    create_dirs(config)
