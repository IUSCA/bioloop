import fnmatch
import logging
from pathlib import Path

from sca_rhythm import Workflow

import workers.api as api
import workers.workflow_utils as wf_utils
from workers.api import DatasetAlreadyExistsError
from workers.celery_app import app as celery_app
from workers.config import config
from workers.services.watchlib import Observer, Poller
from workers.utils import batched

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Register:
    def __init__(self, dataset_type, default_wf_name='integrated', **kwargs):
        self.dataset_type = dataset_type
        self.reg_config = config['registration'][self.dataset_type]
        self.reject_patterns: set[str] = set(self.reg_config['rejects'])
        self.default_wf_name = default_wf_name
        self.batch_size: int = 100
        self.metadata = kwargs

    def is_a_reject(self, name) -> bool:
        return any([fnmatch.fnmatchcase(name, pat) for pat in self.reject_patterns])

    def register(self, event: str, new_dirs: list[Path]) -> None:
        logger.info(f'event: {event}, new_dirs: {len(new_dirs)}')
        if event not in ['add', 'full_scan']:
            return

        # apply node level rules to filter out bad directories
        candidates = [p for p in new_dirs if not self.is_a_reject(p.name)]

        # for candidate in candidates:
        #     try:
        #         self.register_candidate(candidate)
        #     except Exception as e:
        #         logger.error(f'Error registering dataset {candidate.name}: {e}')

        # if we are ingesting a full directory of 1000+ subdirectories, we may want to batch the requests
        for batch in batched(candidates, n=self.batch_size):
            self.register_batch(batch)

    def register_candidate(self, candidate: Path) -> None:
        # idempotence: if dataset already exists, do nothing
        # fault tolerance:
        #  possibility 1: error happened before dataset creation - skipping is okay, because we can try again
        #  possibility 2: error happened after dataset creation - somehow need to add workflow to dataset
        #       because when we retry, it will raise DatasetAlreadyExistsError.
        #  Track datasets without workflows on the UI and trigger a workflow manually.
        #  Option 1: infer from the dataset state
        #  - Avoid datasets that are just created
        #  - Avoid datasets that are already processed but their associated workflows are deleted (updated date will be recent)
        #  Option 2:
        #   - keep track of failures
        logger.info(f'registering {self.dataset_type} dataset - {candidate.name}')
        dataset_payload = {
            'name': candidate.name,
            'type': self.dataset_type,
            'origin_path': str(candidate.resolve()),
        }
        if self.metadata:
            dataset_payload['metadata'] = self.metadata
        try:
            created_dataset = api.create_dataset(dataset_payload)
            self.run_workflows(created_dataset)
        except DatasetAlreadyExistsError:
            # nothing to do if dataset already exists
            return

    def register_batch(self, candidates: list[Path]) -> None:
        # fault tolerance: similar to register_candidate, the problem is when failure happens after the dataset creation
        # - we can track datasets without workflows on the UI and trigger a workflow manually
        data = []
        for candidate in candidates:
            dataset_payload = {
                'name': candidate.name,
                'type': self.dataset_type,
                'origin_path': str(candidate.resolve()),
            }
            if self.metadata:
                dataset_payload['metadata'] = self.metadata
            data.append(dataset_payload)

        try:
            # failure point but has built in retry ability
            result = api.bulk_create_datasets(data)
            # result looks like {created: [], conflicted: [], errored: []}
            # only create workflows for created datasets
            for dataset in result['created']:
                try:
                    self.run_workflows(dataset)
                except Exception as e:
                    logger.error(f'Error running workflows for dataset {dataset["name"]}: {e}')
        except Exception as e:
            logger.error(f'Error bulk creating datasets: {e}')

    def run_workflows(self, dataset):
        logger.info(f'Registered {self.dataset_type} {dataset["name"]}')
        dataset_id = dataset['id']
        wf_body = wf_utils.get_wf_body(wf_name=self.default_wf_name)

        # connects to mongodb to create a document in the workflows collection - failure point
        wf = Workflow(celery_app=celery_app, **wf_body)

        # connects to API - failure point - has built in retry ability
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])

        # connects to celery - failure point
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
        interval=config['registration']['poll_interval_seconds'],
        full_scan_every_n_scans=config['registration']['full_scan_every_n_scans']
    )
    obs2 = Observer(
        name='data_products_obs',
        dir_path=config['registration']['DATA_PRODUCT']['source_dir'],
        callback=Register('DATA_PRODUCT').register,
        # callback=RegisterDataProduct().register,
        interval=config['registration']['poll_interval_seconds'],
        full_scan_every_n_scans=config['registration']['full_scan_every_n_scans']
    )

    poller = Poller()
    poller.register(obs1)
    poller.register(obs2)
    poller.poll()

    # try:
    #     with RabbitMqConsumer(queue_name='registration') as consumer:
    #         while True:
    #             for message in consumer.consume_messages():
    #                 logger.info(f"Received message: {message}")
    #                 # process messages here
    #             poller.poll(loop=False)
    # except KeyboardInterrupt:
    #     logger.info('KeyboardInterrupt received. Exiting.')
