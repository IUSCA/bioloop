import time
from pathlib import Path
from typing import Callable

import workers.api as api
from workers.config.config import config


class Observer:
    def __init__(self, name: str, dir_path: str, callback: Callable[[str, list[Path]], None], interval: int = 1):
        self.name = name
        self.dir_path = Path(dir_path)
        self.callback = callback
        self.interval = interval

        # Keep track of the directories in the watched directory
        self.directories = set()

    def watch(self) -> None:
        # Get the current subdirectories of the watched directory
        current_directories = set(p.name for p in self.dir_path.iterdir() if p.is_dir())

        # Find the directories that have been added or renamed
        added_directories = current_directories - self.directories
        deleted_directories = self.directories - current_directories

        if len(added_directories) > 0:
            self.callback('add', [self.dir_path / name for name in added_directories])
        if len(deleted_directories) > 0:
            self.callback('delete', [self.dir_path / name for name in deleted_directories])

        self.directories = current_directories


class Poller:
    def __init__(self):
        self.observers = dict()
        # print('observers', self.observers)

    def register(self, observer: Observer):
        observer.interval = int(observer.interval)
        assert observer.interval >= 1
        self.observers[observer.name] = observer

    def unregister(self, name):
        self.observers.pop(name)

    def poll(self):
        last_call_times = {name: 0 for name in self.observers.keys()}
        while True:
            for observer in self.observers.values():
                current_time = time.time()
                elapsed_since_last_call = current_time - last_call_times[observer.name]
                if elapsed_since_last_call >= observer.interval:
                    # print('calling observer watch', observer.name, int(time.time()))
                    try:
                        observer.watch()
                    except Exception as e:
                        print('exception in calling observer', e)
                    last_call_times[observer.name] = current_time
            time.sleep(1)


def register_raw_data(event: str, new_dirs: list[Path]) -> None:
    if event != 'add':
        return
    reg_config = config['registration']['raw_data']
    registered_names = [dataset['name'] for dataset in api.get_all_datasets(dataset_type='RAW_DATA')]
    candidates = [
        p for p in new_dirs
        if all([
            p.name not in set(registered_names),
            p.name not in set(reg_config['rejects'])
        ])
    ]
    for candidate in candidates:
        print('registering raw data', candidate.name)
        dataset = {
            'name': candidate.name,
            'type': 'RAW_DATA',
            'origin_path': str(candidate.resolve()),
        }
        api.create_dataset(dataset)


def register_data_products(event: str, new_dirs: list[Path]) -> None:
    if event != 'add':
        return
    reg_config = config['registration']['data_products']
    registered_names = [dataset['name'] for dataset in api.get_all_datasets(dataset_type='DATA_PRODUCT')]
    candidates = [
        p for p in new_dirs
        if all([
            p.name not in set(registered_names),
            p.name not in set(reg_config['rejects'])
        ])
    ]
    for candidate in candidates:
        print('registering data product', candidate.name)
        dataset = {
            'name': candidate.name,
            'type': 'DATA_PRODUCT',
            'origin_path': str(candidate.resolve()),
        }
        created_dataset = api.create_dataset(dataset)

        # Find raw_data with the same and add an association
        source_datasets = api.get_all_datasets(dataset_type='RAW_DATA', name=candidate.name)
        if len(source_datasets) > 0:
            api.add_associations([{
                'source_id': source_datasets[0]['id'],
                'derived_id': created_dataset['id']
            }])


if __name__ == "__main__":
    path1 = config['registration']['raw_data']['source_dir']
    path2 = config['registration']['data_products']['source_dir']
    obs1 = Observer('raw_data_obs', path1, register_raw_data, interval=5)
    obs2 = Observer('data_products_obs', path2, register_data_products, interval=5)

    poller = Poller()
    poller.register(obs1)
    poller.register(obs2)
    poller.poll()
