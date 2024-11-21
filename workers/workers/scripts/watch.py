import datetime
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
from workers.utils import dir_last_modified_time

logging.basicConfig(level=logging.INFO)
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


def get_duplicate_notification_payload(original_dataset_id: int) -> dict:
    payload = dict()
    payload['label'] = ''
    payload['action_item'] = {
        'type': config['NOTIFICATION_TYPE']['DUPLICATE_DATASET_REGISTRATION'],
        'metadata': {
            'original_dataset_id': original_dataset_id,
        }
    }
    return payload


class Register:
    def __init__(self, dataset_type, default_wf_name='integrated'):
        logger.info(f"init for type {dataset_type}")

        self.dataset_type = dataset_type
        self.reg_config = config['registration'][self.dataset_type]
        self.rejects: set[str] = set(self.reg_config['rejects'])
        self.completed: set[str] = set(self.get_registered_dataset_names())  # HTTP GET
        # logger.info("got self.completed")
        # for e in self.completed:
        #     logger.info(e)

        # self.duplicates: Datasets currently registered in the system as duplicates
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

    """
    Args:

    duplicated_dataset_candidate_dirs: List of directories which are potentially duplicate datasets
    
    :returns list[Path]: List of directories which are actual duplicate datasets
    """

    def get_duplicate_dataset_dirs(self, duplicate_dataset_candidate_dirs: list[Path]) -> list[Path]:
        logger.info(f'Duplicate dataset candidate directories for type {self.dataset_type}:')
        for e in duplicate_dataset_candidate_dirs:
            logger.info(e)
        duplicate_dataset_candidates: list[Path] = [p for p in duplicate_dataset_candidate_dirs if all([
            slugify_(p.name) in self.completed,
            not self.is_a_reject(slugify_(p.name)),
        ])]
        logger.info(f'Duplicate dataset candidates for type {self.dataset_type}:')
        for e in duplicate_dataset_candidates:
            logger.info(e)

        duplicate_datasets: list[Path] = []
        for p in duplicate_dataset_candidates:
            logger.info(f'analyzing if directory {p.name} has been duplicated since it was registered as a dataset')
            candidate_last_modified_ts = dir_last_modified_time(p)

            # expected to be local time (UTC)

            candidate_last_modified_dt = datetime.datetime.fromtimestamp(candidate_last_modified_ts).astimezone()
            logger.info(f'last modified datetime: {candidate_last_modified_dt}')
            duplicated_from_dataset = self.get_duplicated_from_dataset(dir_name=p.name)
            # dataset's time is in UTC - convert to local time
            duplicated_from_dataset_created_at_dt = (duplicated_from_dataset['created_at']
                                                     .replace(tzinfo=datetime.timezone.utc).astimezone())
            logger.info(f'duplicated from dataset created at: {duplicated_from_dataset_created_at_dt}')

            if candidate_last_modified_dt > duplicated_from_dataset_created_at_dt:
                logger.info(f'Determined directory {p.name} to be a duplicate {self.dataset_type}')
                duplicate_datasets.append(p)
            else:
                logger.info(f'Determined directory {p.name} to not be a duplicate {self.dataset_type}')
        return duplicate_datasets

    def get_dataset(self):
        # Get the dataset from the database
        # ...
        # Return the dataset
        pass

    def register(self, event: str, new_dirs: list[Path]) -> None:
        logger.info(f"register called with event: {event}")

        if event != 'add':
            return

        candidates: list[Path] = [
            p for p in new_dirs
            if all([
                slugify_(p.name) not in self.completed,
                not self.is_a_reject(slugify_(p.name)),
                # cmd.total_size(p) >= config['registration']['minimum_dataset_size']
            ])
        ]
        # If a candidate's name is in self.completed, it could be a duplicate.
        # After verifying that the candidate is indeed a duplicate, we register the candidate
        # as a duplicate dataset in the system.
        logger.info(f"new_dirs:")
        for e in candidates:
            logger.info(e)
        duplicate_candidates: list[Path] = self.get_duplicate_dataset_dirs(duplicate_dataset_candidate_dirs=new_dirs)

        for candidate in candidates:
            logger.info(f'processing candidate: {str(candidate.name)}')
            self.register_candidate(candidate)
            self.completed.add(candidate.name)

        for candidate in duplicate_candidates:
            # some duplicates with this directory's name and dataset_type might
            # already be under processing when this script is run
            if slugify_(candidate.name) not in self.duplicates:
                self.register_duplicate_candidate(candidate)
                self.duplicates.add(candidate.name)
                # pass
            else:
                logger.warning(f"""
                               Attempted to process a second duplicate candidate
                               named {str(candidate.name)} when a duplicate candidate
                               named {str(candidate.name)} (dataset type {self.dataset_type})
                               is already being processed.
                              """)
                # pass

    # Returns the dataset that is potentially being duplicated
    def get_duplicated_from_dataset(self, dir_name: str) -> dict | None:
        matching_datasets = api.get_all_datasets(dataset_type=self.dataset_type,
                                                 name=dir_name,
                                                 match_name_exact=True,
                                                 is_duplicate=False)
        if len(matching_datasets) != 1:
            logger.error(f"""
                         Expected one, but found {len(matching_datasets)} active
                         datasets having name {dir_name}
                         and type {self.dataset_type} that are eligible for
                         duplication. This is unexpected, and a duplicate dataset
                         will not be created.
                         """)
            return None
        return matching_datasets[0]

    def register_candidate(self, candidate: Path):
        logger.info(f'registering {self.dataset_type} dataset - {candidate.name}')
        dataset_payload = {
            'data': {
                'name': slugify_(candidate.name),
                'type': self.dataset_type,
                'origin_path': str(candidate.resolve()),
            }
        }
        created_dataset = api.create_dataset(dataset_payload)
        self.run_workflows(created_dataset, self.default_wf_name)

    def register_duplicate_candidate(self, candidate: Path):
        logger.info(f'registering duplicate {self.dataset_type} dataset - {candidate.name}')

        # Get any active and non-duplicate datasets with the same name and type
        duplicated_from_dataset = self.get_duplicated_from_dataset(dir_name=candidate.name)
        logger.info(f'Duplicated from {self.dataset_type} {duplicated_from_dataset["name"]} (id: {duplicated_from_dataset["id"]})')
        if duplicated_from_dataset is not None:
            created_duplicate_dataset = api.create_duplicate_dataset(dataset_id=duplicated_from_dataset['id'])
            self.run_workflows(
                created_duplicate_dataset,
                'handle_duplicate_dataset'
            )

    def run_workflows(self, dataset, workflow_name=None):
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
    obs1 = Observer(
        name='raw_data_obs',
        dir_path=config['registration']['RAW_DATA']['source_dir'],
        callback=Register('RAW_DATA').register,
        interval=config['registration']['poll_interval_seconds']
    )
    obs2 = Observer(
        name='data_products_obs',
        dir_path=config['registration']['DATA_PRODUCT']['source_dir'],
        callback=Register('DATA_PRODUCT').register,
        # callback=RegisterDataProduct().register,
        interval=config['registration']['poll_interval_seconds']
    )

    poller = Poller()
    poller.register(obs1)
    poller.register(obs2)
    poller.poll()
