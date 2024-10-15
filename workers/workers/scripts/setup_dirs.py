from pathlib import Path

import fire
from glom import glom
from workers.config import config


def main(create=False):
    keys = [
        'paths.scratch',
        'paths.RAW_DATA.stage',
        'paths.DATA_PRODUCT.stage',
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
