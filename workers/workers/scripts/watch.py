import fnmatch
import logging
import time
from pathlib import Path
from typing import Callable

from sca_rhythm import Workflow
from slugify import slugify

import workers.api as api
import workers.workflow_utils as wf_utils
from workers.celery_app import app as celery_app
from workers.config import config

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


class Observer:
    def __init__(self, name: str, dir_path: str, callback: Callable[[str, list[Path]], None], interval: int = 1):
        self.name = name
        self.dir_path = Path(dir_path)
        self.callback = callback
        self.interval = interval

        # Keep track of the directories in the watched directory
        self.directories = set()

    def watch(self) -> None:
        logger.info('WATCH CALLED')
        
        # Get the current subdirectories of the watched directory
        current_directories = set(p.name for p in self.dir_path.iterdir() if p.is_dir())

        # Find the directories that have been added or renamed
        added_directories = current_directories - self.directories
        deleted_directories = self.directories - current_directories

        logger.info('ADDED')
        logger.info(added_directories)
        logger.info('DELETED')
        logger.info(deleted_directories)

        if len(added_directories) > 0:
            self.callback('add', [self.dir_path / name for name in added_directories])
        if len(deleted_directories) > 0:
            self.callback('delete', [self.dir_path / name for name in deleted_directories])

        self.directories = current_directories
        logger.info('self.directories:')
        logger.info(self.directories)


class Poller:
    def __init__(self):
        self.observers = dict()
        # print('observers', self.observers)

    def register(self, observer: Observer):
        observer.interval = int(observer.interval)
        assert observer.interval >= 1
        self.observers[observer.name] = observer
        logger.info(
            f'Observer {observer.name} registered. '
            f'{observer.dir_path} will be polled every {observer.interval} seconds'
        )

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
                        logger.error(f'exception in calling observer {observer.name}', exc_info=e)
                    last_call_times[observer.name] = current_time
            time.sleep(1)


def slugify_(name: str) -> str:
    """
    Replace all characters except alphanumerics and underscore with hyphen
    """
    return slugify(name, lowercase=False, regex_pattern=r'[^a-zA-Z0-9_]')


class Register:
    def __init__(self, dataset_type, default_wf_name='integrated'):
        self.dataset_type = dataset_type
        self.reg_config = config['registration'][self.dataset_type]
        self.rejects: set[str] = set(self.reg_config['rejects'])
        self.completed: set[str] = set(self.get_registered_dataset_names())  # HTTP GET
        self.duplicates: set[str] = set(self.get_registered_dataset_names({
            'is_duplicate': True
        }))  # HTTP GET
        self.default_wf_name = default_wf_name

    def is_a_reject(self, name):
        return any([fnmatch.fnmatchcase(name, pat) for pat in self.rejects])

    def get_registered_dataset_names(self, filters: dict = None) -> list[str]:
        is_duplicate = filters['is_duplicate'] if filters is not None else False
        datasets = api.get_all_datasets(is_duplicate=is_duplicate)
        return [b['name'] for b in datasets]

    def register(self, event: str, updated_dirs: list[Path]) -> None:
        if event != 'add':
            return

        new_candidates: list[Path] = [
            p for p in updated_dirs
            if all([
                slugify_(p.name) not in self.completed,
                not self.is_a_reject(slugify_(p.name)),
                # cmd.total_size(p) >= config['registration']['minimum_dataset_size']
            ])
        ]
        # If a candidate's name is in self.completed, it could potentially be a duplicate.
        # In such cases, we create a dataset of duplicate dataset, which is later accepted or
        # rejected by an end user.
        duplicate_candidates: list[Path] = [p for p in updated_dirs if slugify_(p.name) in self.completed]

        for candidate in new_candidates:
            logger.info(f'processing candidate: {str(candidate.name)}')
            self.register_candidate(candidate)
            self.completed.add(candidate.name)

        for candidate in duplicate_candidates:
            # some duplicates might already be under processing when this script is run
            if slugify_(candidate.name) == 'sub-fsm23qf':
                # if slugify_(candidate.name) not in self.duplicates:
                self.register_duplicate_candidate(candidate)
                self.duplicates.add(candidate.name)
            else:
                logger.warning(f'Attempted to process another duplicate candidate'
                            f' named {str(candidate.name)} when a duplicate candidate'
                            f' named {str(candidate.name)} is already being processed.')
                pass
            # todos:
            #  what happens when a second duplicate comes in, while first duplicate is being processed?

    def register_candidate(self, candidate: Path):
        logger.info(candidate.__class__)
        logger.info(f'registering {self.dataset_type} dataset - {candidate.name}')
        dataset = {
            'name': slugify_(candidate.name),
            'type': self.dataset_type,
            'origin_path': str(candidate.resolve()),
        }
        created_dataset = api.create_dataset(dataset)

        self.run_workflows(created_dataset, self.default_wf_name)


    def register_duplicate_candidate(self, candidate: Path):
        logger.info(candidate.__class__)
        logger.info(f'registering duplicate {self.dataset_type} dataset - {candidate.name}')

        # Get any active datasets with the same name and type
        matching_datasets = api.get_all_datasets(dataset_type=self.dataset_type,
                                                 name=candidate.name,
                                                 is_duplicate=False)
        if len(matching_datasets) != 1:
            logger.error(f'Expected one, but found {len(matching_datasets)} active '
                         f'original datasets having name {candidate.name} '
                         f'and type {self.dataset_type} that are eligible for '
                         f'duplication. The system is in an invalid'
                         f' state, and a duplicate dataset will not be created.')
            return

        original_dataset = matching_datasets[0]
        created_duplicate_dataset = api.create_duplicate_dataset(dataset_id=original_dataset['id'])

        self.run_workflows(
            created_duplicate_dataset,
            'handle_duplicate_dataset'
        )


    def run_workflows(self, dataset, workflow_name=None):
        logger.info(f"started workflow {workflow_name} for {dataset['id']}")
        dataset_id = dataset['id']
        wf_body = wf_utils.get_wf_body(wf_name=workflow_name)
        wf = Workflow(celery_app=celery_app, **wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
        wf.start(dataset_id)


class RegisterDataProduct(Register):
    def __init__(self):
        super().__init__(dataset_type='DATA_PRODUCT')

    def run_workflows(self, dataset):
        pass


if __name__ == "__main__":
    # obs1 = Observer(
    #     name='raw_data_obs',
    #     dir_path=config['registration']['RAW_DATA']['source_dir'],
    #     callback=Register('RAW_DATA').register,
    #     interval=config['registration']['poll_interval_seconds']
    # )
    obs2 = Observer(
        name='data_products_obs',
        dir_path=config['registration']['DATA_PRODUCT']['source_dir'],
        callback=Register('DATA_PRODUCT').register,
        # callback=RegisterDataProduct().register,
        interval=config['registration']['poll_interval_seconds']
    )

    poller = Poller()
    # poller.register(obs1)
    poller.register(obs2)
    poller.poll()
