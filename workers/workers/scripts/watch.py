import fnmatch
import logging
from pathlib import Path
from typing import Any

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
    def __init__(
        self,
        dataset_type: str,
        default_wf_name: str = 'integrated',
        wf_start_kwargs: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        self.dataset_type = dataset_type
        self.reg_config = config['registration'][self.dataset_type]
        self.reject_patterns: set[str] = set(self.reg_config['rejects'])
        self.default_wf_name = default_wf_name
        self.wf_start_kwargs: dict[str, Any] = wf_start_kwargs or {}
        self.batch_size: int = 100
        self.metadata = kwargs

    def is_a_reject(self, name) -> bool:
        return any([fnmatch.fnmatchcase(name, pat) for pat in self.reject_patterns])

    def register(self, event: str, new_dirs: list[Path]) -> None:
        logger.info(f'event: {event}, new_dirs: {len(new_dirs)}')
        if event not in ['add', 'full_scan']:
            return

        # Apply node-level rules to filter out rejected directory names
        candidates = [p for p in new_dirs if not self.is_a_reject(p.name)]

        # Batch registrations to avoid overwhelming the API
        for batch in batched(candidates, n=self.batch_size):
            self.register_batch(batch)

    def register_candidate(self, candidate: Path) -> None:
        # Idempotent: DatasetAlreadyExistsError is silently ignored because the
        # dataset was already created (possibly by a concurrent watch instance).
        logger.info(f'registering {self.dataset_type} dataset - {candidate.name}')
        dataset_payload = {
            'name': candidate.name,
            'type': self.dataset_type,
            'origin_path': str(candidate.resolve()),
            'create_method': 'SCAN',
        }
        if self.metadata:
            dataset_payload['metadata'] = self.metadata
        try:
            created_dataset = api.create_dataset(dataset_payload)
            self.run_workflows(created_dataset)
        except DatasetAlreadyExistsError:
            # Dataset already exists; nothing to do.
            return

    def register_batch(self, candidates: list[Path]) -> None:
        data = []
        for candidate in candidates:
            dataset_payload = {
                'name': candidate.name,
                'type': self.dataset_type,
                'origin_path': str(candidate.resolve()),
                'create_method': 'SCAN',
            }
            if self.metadata:
                dataset_payload['metadata'] = self.metadata
            data.append(dataset_payload)

        try:
            result = api.bulk_create_datasets(data)
            # result = {created: [...], conflicted: [...], errored: [...]}
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

        wf = Workflow(celery_app=celery_app, **wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
        wf.start(dataset_id, **self.wf_start_kwargs)


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
        interval=config['registration']['poll_interval_seconds'],
        full_scan_every_n_scans=config['registration']['full_scan_every_n_scans']
    )

    poller = Poller()
    poller.register(obs1)
    poller.register(obs2)
    poller.poll()
