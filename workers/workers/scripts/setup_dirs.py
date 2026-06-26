from pathlib import Path

import fire
from glom import glom
from workers.config import config

"""Check/create configured worker directories.

Run examples:
    # Show whether each configured path exists (read-only check)
    python -m workers.scripts.setup_dirs

    # Same check via explicit flag (defaults to False)
    python -m workers.scripts.setup_dirs --create=False

    # Create missing directories (including parents), then report status
    python -m workers.scripts.setup_dirs --create=True

Flag(s):
    --create
        bool, default False
        False: only print Exists/Missing for each configured path.
        True: create missing directories before printing status.
"""


def main(create=False):
    """Validate directories configured in `workers.config`.

    Args:
        create (bool): When True, create missing directories with
            `parents=True` and `exist_ok=True`. When False, only report status.
    """
    keys = [
        'paths.scratch',
        'paths.RAW_DATA.stage',
        'paths.DATA_PRODUCT.stage',
        'paths.RAW_DATA.upload',
        'paths.DATA_PRODUCT.upload',
        'paths.download_dir',
        'registration.RAW_DATA.source_dir',
        'registration.DATA_PRODUCT.source_dir'
    ]

    keys_dirs = {k: glom(config, k, default=None) for k in keys}

    for k, d in keys_dirs.items():
        if d is None:
            print(f'path is missing for {k}')
        else:
            dpath = Path(d).resolve()
            if create:
                dpath.mkdir(exist_ok=True, parents=True)
            print(f'{"Exists " if dpath.exists() else "Missing"} -> config:{k} \t {dpath}')



if __name__ == '__main__':
    fire.Fire(main)
