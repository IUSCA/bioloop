"""Register directories found by a watcher as datasets owned by a group.

One instance watches one ingestion directory. Everything that varies between
directories arrives as a constructor argument rather than being looked up here,
so the same class serves a directory of raw sequencer output and a directory of
processed products without knowing which is which.

@see docs/design/groups/dataset-creation.md — The watch script
"""

import fnmatch
import json
import logging
from pathlib import Path
from typing import Any

from sca_rhythm import Workflow

import workers.api as api
import workers.workflow_utils as wf_utils
from workers.utils import batched

logger = logging.getLogger(__name__)

# POST /v2/datasets/bulk validates `datasets` as isArray({ min: 1, max: 100 }).
# A larger request is rejected whole, so the client splits candidates into batches
# no bigger than this. Lower it freely; raising it past the route's own limit turns
# every scan of a busy directory into a 422.
# @see api/src/routes/datasets_v2/index.js — Bulk create
MAX_DATASETS_PER_BULK_REQUEST = 100


class RegisterV2:
    """Registers scanned directories through the v2 dataset API.

    What a dataset becomes is required, because none of it has a sensible fallback:
    a type, an owning group, and a workflow are decisions the caller has already
    made. How registration is carried out is optional and defaulted here, and here
    only, so no caller repeats a default this class already holds.

    Args:
        app: the Celery app that workflows are started on.
        dataset_type: the type every dataset from this directory gets.
        owner_group_id: the group that will own them. A scan has no user to ask,
            so the group is a property of the watched directory.
        wf_name: workflow started for each dataset actually created.
        rejects: fnmatch patterns for directory names never to register.
            None and an empty list both mean nothing is rejected.
        dry_run: log the request that would be sent and send nothing.
        batch_size: datasets per bulk request, capped by the route's own limit.
        **metadata: recorded as the dataset's metadata, unchanged. Use it for
            facts about the source, such as an instrument or an intake programme.
    """

    def __init__(
        self,
        app,
        dataset_type: str,
        owner_group_id: str,
        wf_name: str,
        rejects: list[str] | None = None,
        dry_run: bool = False,
        batch_size: int = MAX_DATASETS_PER_BULK_REQUEST,
        **metadata: Any,
    ) -> None:
        if not owner_group_id:
            raise ValueError('RegisterV2 needs an owner_group_id; v2 will not create a dataset that no group owns')
        if not wf_name:
            raise ValueError('RegisterV2 needs a wf_name; the caller decides which workflow a scan starts')
        if batch_size < 1 or batch_size > MAX_DATASETS_PER_BULK_REQUEST:
            raise ValueError(
                f'batch_size must be between 1 and {MAX_DATASETS_PER_BULK_REQUEST}, got {batch_size}'
            )

        self.app = app
        self.dataset_type = dataset_type
        self.owner_group_id = owner_group_id
        self.wf_name = wf_name
        self.reject_patterns: set[str] = set(rejects or [])
        self.dry_run = dry_run
        self.batch_size = batch_size
        self.metadata = metadata

    def is_a_reject(self, name: str) -> bool:
        return any(fnmatch.fnmatchcase(name, pat) for pat in self.reject_patterns)

    def register(self, event: str, new_dirs: list[Path]) -> None:
        logger.info(f'event: {event}, new_dirs: {len(new_dirs)}')
        if event not in ['add', 'full_scan']:
            return

        # apply node level rules to filter out bad directories
        candidates = [p for p in new_dirs if not self.is_a_reject(p.name)]

        # a first scan of an established directory can find thousands of
        # subdirectories, so send them in batches the route will accept
        for batch in batched(candidates, n=self.batch_size):
            self.register_batch(batch)

    def build_payload(self, candidate: Path) -> dict:
        payload = {
            'name': candidate.name,
            'type': self.dataset_type,
            'owner_group_id': self.owner_group_id,
            'origin_path': str(candidate.resolve()),
            'create_method': 'SCAN',
        }
        if self.metadata:
            payload['metadata'] = self.metadata
        return payload

    def register_batch(self, candidates: list[Path]) -> None:
        # fault tolerance: the hard case is a failure after the datasets are created.
        # Those datasets have no workflow, which the UI surfaces so an operator can
        # start one by hand.
        data = [self.build_payload(c) for c in candidates]

        if len(data) > MAX_DATASETS_PER_BULK_REQUEST:
            raise ValueError(
                f'{len(data)} datasets exceeds the {MAX_DATASETS_PER_BULK_REQUEST} '
                f'the bulk route accepts'
            )

        if self.dry_run:
            logger.info(
                f'DRY RUN - would POST {len(data)} datasets to v2/datasets/bulk '
                f'under group {self.owner_group_id}'
            )
            logger.info(json.dumps(data, indent=2))
            return

        try:
            # failure point but has built in retry ability
            result = api.bulk_create_datasets_v2(data)
            # only start workflows for datasets actually created; a conflict is the
            # same directory seen on an earlier scan
            for dataset in result['created']:
                try:
                    self.run_workflows(dataset)
                except Exception as e:
                    logger.error(f'Error running workflows for dataset {dataset["name"]}: {e}')
        except Exception as e:
            logger.error(f'Error bulk creating datasets: {e}')

    def run_workflows(self, dataset: dict) -> None:
        logger.info(f'Registered {self.dataset_type} {dataset["name"]}')
        dataset_id = dataset['id']
        wf_body = wf_utils.get_wf_body(wf_name=self.wf_name)

        # connects to mongodb to create a document in the workflows collection - failure point
        wf = Workflow(celery_app=self.app, **wf_body)

        # connects to API - failure point - has built in retry ability
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])

        # connects to celery - failure point
        wf.start(dataset_id)
