import logging
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import requests
from glom import assign as glom_assign
from glom import glom
from requests.adapters import HTTPAdapter, Retry

import workers.utils as utils
from workers.config import config

logger = logging.getLogger(__name__)


class LogRetry(Retry):

    def increment(self,
                  method=None,
                  url=None,
                  response=None,
                  error=None,
                  _pool=None,
                  _stacktrace=None, ):
        """Override the increment method to log a warning when retries happen."""
        retries = super().increment(method=method, url=url, response=response, error=error, _pool=_pool,
                                    _stacktrace=_stacktrace)
        if retries:
            logger.warning(
                f"Retrying {method} request to {url} (retry number {len(self.history)}). Error: {error.args}")
        return retries


def make_retry_adapter():
    # https://stackoverflow.com/questions/15431044/can-i-set-max-retries-for-requests-request
    # https://majornetwork.net/2022/04/handling-retries-in-python-requests/
    # https://urllib3.readthedocs.io/en/latest/reference/urllib3.util.html#module-urllib3.util.retry
    # retry for all HTTP methods (even non-idempotent methods like POST)
    # retry for all connection failures
    # retry for transient HTTP error response codes:
    #   429 - Too Many Requests
    #   502 - Bad Gateway
    #   503 - Service Unavailable
    #   not including 500, 504, because retrying for all HTTP methods could be dangerous
    #   if some process has already happened
    # delays between retries follow exponential backoff pattern
    # A backoff factor to apply between attempts after the second try.
    # delay = {backoff factor} * (2 ** ({number of total retries} - 1))
    # backoff_factor=5, delays = [0, 10, 20, 40, 80, 120, 120, 120, 120]
    # max idle time is 10 min 30s
    return HTTPAdapter(max_retries=LogRetry(
        total=9,
        backoff_factor=5,
        allowed_methods=None,
        status_forcelist=[429, 502, 503]
    ))


# https://stackoverflow.com/a/51026159/2580077
class APIServerSession(requests.Session):
    def __init__(self, enable_retry: bool = True):
        super().__init__()
        # Every step in the workflow calls this API at least twice
        # Failing a long run step because the API is momentarily down for maintenance is wasteful
        # Retry adapter will keep trying to re-connect on connection and other transient errors up to 10m30s
        if enable_retry:
            adapter = make_retry_adapter()
            # noinspection HttpUrlsUsage
            self.mount("http://", adapter)
            self.mount("https://", adapter)
        self.base_url = config['api']['base_url']
        self.timeout = (config['api']['conn_timeout'], config['api']['read_timeout'])
        self.auth_token = config['api']['auth_token']

    def request(self, method, url, *args, **kwargs):
        joined_url = urljoin(self.base_url, url)
        if 'timeout' not in kwargs:
            kwargs['timeout'] = self.timeout

        # Add auth header
        headers = kwargs.pop('headers', {})
        headers['Authorization'] = f'Bearer {self.auth_token}'
        kwargs['headers'] = headers

        return super().request(method, joined_url, *args, **kwargs)


def str_to_int(d: dict, key: str):
    d[key] = utils.parse_number(d.get(key, None))
    return d


def int_to_str(d: dict, key: str):
    if key in d and d[key] is not None:
        d[key] = str(d[key])
    return d


def entity_getter(entity: dict, date_keys: list, int_keys: list):
    date_format = '%Y-%m-%dT%H:%M:%S.%fZ'

    if entity is None:
        return entity

    # convert int values from string to int
    for key in int_keys:
        str_to_int(entity, key)

    # convert date strings to date objects
    for date_key in date_keys:
        date_str = glom(entity, date_key, default=None)
        if date_str is not None:
            try:
                glom_assign(entity, date_key, datetime.strptime(date_str, date_format))
            except ValueError:  # unable to parse date string
                glom_assign(entity, date_key, None)
    return entity


def dataset_getter(dataset: dict):
    _dataset = entity_getter(dataset, ['created_at', 'updated_at'], ['du_size', 'size'])
    _dataset['files'] = [str_to_int(f, 'size') for f in _dataset.get('files', [])]
    return _dataset


def dataset_setter(dataset: dict):
    # convert du_size and size from int to string
    if dataset is not None:
        for key in ['du_size', 'size', 'bundle_size']:
            int_to_str(dataset, key)
    return dataset


def get_all_datasets(
        dataset_type=None,
        name=None,
        days_since_last_staged=None,
        deleted=False,
        archived=None,
        bundle=False,
        is_duplicate=False,
        include_duplications=False,
        match_name_exact=False,
        include_audit_logs=False):
    with APIServerSession() as s:
        payload = {
            'type': dataset_type,
            'name': name,
            'days_since_last_staged': days_since_last_staged,
            'deleted': deleted,
            'archived': archived,
            'bundle': bundle,
            'match_name_exact': match_name_exact,
            'include_audit_logs': include_audit_logs,
            'is_duplicate': is_duplicate,
            'include_duplications': include_duplications,
        }
        r = s.get('datasets', params=payload)
        r.raise_for_status()
        datasets = r.json()['datasets']
        return [dataset_getter(dataset) for dataset in datasets]


def get_dataset(
    dataset_id: str,
    files: bool = False,
    bundle: bool = False,
    workflows: bool = False,
    include_audit_logs: bool = False,
    include_duplications: bool = False,
):
    with APIServerSession() as s:
        payload = {
            'files': files,
            'bundle': bundle,
            'workflows': workflows,
            'include_audit_logs': include_audit_logs,
            'include_duplications': include_duplications,
        }
        r = s.get(f'datasets/{dataset_id}', params=payload)
        r.raise_for_status()
        dataset = dataset_getter(r.json())

        if include_audit_logs:
            # Flatten create_method from the creation audit entry onto the dataset
            # so callers can access dataset['create_method'] directly.
            create_entry = next(
                (log for log in (dataset.get('audit_logs') or []) if log.get('action') == 'create'),
                None,
            )
            if create_entry:
                dataset['create_method'] = create_entry.get('create_method')

        return dataset


def get_workflows_for_dataset(
    dataset_id: int,
    last_task_runs: bool = False,
    prev_task_runs: bool = False,
) -> dict[str, Any]:
    """
    Fetch all workflows linked to a dataset via GET /workflows?dataset_id=<id>.

    Returns { metadata: { total: N, ... }, results: [...] }.

    When total == 0 the API returns immediately from Postgres without calling
    the Rhythm API.  When total > 0 each result is hydrated with live workflow
    details from Rhythm; if Rhythm is unreachable the API returns a 5xx and
    raise_for_status() will raise, failing loudly rather than returning stale data.
    """
    with APIServerSession() as s:
        r = s.get(
            'workflows',
            params={
                'dataset_id': dataset_id,
                'last_task_runs': last_task_runs,
                'prev_task_runs': prev_task_runs,
            },
        )
        r.raise_for_status()
        return r.json()


def get_workflow(
    workflow_id: str,
    last_task_runs: bool = True,
    prev_task_runs: bool = True,
) -> dict[str, Any]:
    """
    Fetch a single workflow by ID via GET /workflows/<workflow_id>.

    Returns the workflow document hydrated with live task-run details from
    Rhythm, including per-step status and run history.  Raises HTTPError if
    Rhythm is unreachable.
    """
    with APIServerSession() as s:
        r = s.get(
            f'workflows/{workflow_id}',
            params={
                'last_task_runs': last_task_runs,
                'prev_task_runs': prev_task_runs,
            },
        )
        r.raise_for_status()
        return r.json()


class DatasetAlreadyExistsError(Exception):
    pass


def dataset_name_exists(name: str, dataset_type: str) -> bool:
    """Return True if a non-deleted dataset with NAME and DATASET_TYPE already exists."""
    with APIServerSession() as s:
        r = s.get(f'datasets/{dataset_type}/{name}/exists')
        r.raise_for_status()
        return r.json().get('exists', False)


def create_dataset(dataset):
    with APIServerSession() as s:
        r = s.post('datasets', json=dataset_setter(dataset))
        if r.status_code == 409:
            raise DatasetAlreadyExistsError()
        r.raise_for_status()
        return r.json()


def bulk_create_datasets(datasets):
    with APIServerSession() as s:
        # not using dataset_setter because each dataset only has name, type, and origin_path
        r = s.post('datasets/bulk', json={
            "datasets": datasets
        })
        r.raise_for_status()
        return r.json()


def get_duplication_candidate(dataset_id: int) -> dict:
    """
    Returns the best duplicate candidate for a given dataset_id, determined by
    Jaccard similarity of MD5 checksums over INSPECTED, non-deleted datasets of
    the same type created before the incoming dataset.

    Response: { candidate: { dataset, content_similarity_score, common_files,
                              incoming_total_files, original_total_files } | None }
    """
    with APIServerSession() as s:
        r = s.get(f'datasets/duplication/{dataset_id}/candidate')
        r.raise_for_status()
        return r.json()


def register_duplicate(dataset_id: int, original_dataset_id: int,
                       comparison_process_id: str | None = None,
                       comparison_status: str = 'PENDING') -> dict:
    """
    Marks dataset_id as a duplicate of original_dataset_id, creates the
    dataset_duplication record, and transitions the dataset to
    DUPLICATE_REGISTERED — all in a single API transaction.
    """
    with APIServerSession() as s:
        payload = {
            'original_dataset_id': original_dataset_id,
            'comparison_process_id': comparison_process_id,
            'comparison_status': comparison_status,
        }
        r = s.post(f'datasets/duplication/{dataset_id}', json=payload)
        r.raise_for_status()
        return r.json()


def save_comparison_result(dataset_id: int, comparison_result: dict) -> None:
    """
    Persists the comparison results produced by compare_duplicate_datasets.
    Advances the duplicate dataset to DUPLICATE_READY in a single transaction.
    """
    with APIServerSession() as s:
        r = s.put(f'datasets/duplication/{dataset_id}/comparison', json=comparison_result)
        r.raise_for_status()


def update_comparison_progress(dataset_id: int, fraction_done: float) -> None:
    """
    Reports incremental progress of the compare_duplicate_datasets task.

    FRACTION_DONE must be in [0.0, 1.0].  Call this at meaningful checkpoints
    during comparison so the UI can display a progress indicator.
    """
    with APIServerSession() as s:
        r = s.patch(
            f'datasets/duplication/{dataset_id}/comparison/progress',
            json={'fraction_done': fraction_done},
        )
        r.raise_for_status()


def get_duplication_config() -> dict:
    """Returns the server-side duplication feature flags and thresholds."""
    with APIServerSession() as s:
        r = s.get('datasets/duplication/config')
        r.raise_for_status()
        return r.json()


def update_dataset(dataset_id, update_data):
    with APIServerSession() as s:
        r = s.patch(f'datasets/{dataset_id}', json=dataset_setter(update_data))
        r.raise_for_status()
        return r.json()


def get_dataset_files(dataset_id: str, filters: dict = None):
    with APIServerSession() as s:
        r = s.get(f'datasets/{dataset_id}/files/search', params=filters)
        r.raise_for_status()
        files = r.json()
        return [entity_getter(file, ['created_at'], ['size']) for file in files]


def delete_dataset(dataset_id: int):
    with APIServerSession() as s:
        r = s.delete(f'datasets/{dataset_id}')
        r.raise_for_status()


def add_files_to_dataset(dataset_id, files: list[dict]):
    with APIServerSession() as s:
        req_body = [int_to_str(f, 'size') for f in files]
        r = s.post(f'datasets/{dataset_id}/files', json=req_body)
        r.raise_for_status()


def upload_report(dataset_id, report_filename):
    filename = report_filename.name
    file_obj = open(report_filename, 'rb')
    with APIServerSession() as s:
        r = s.put(f'datasets/{dataset_id}/report', files={
            'report': (filename, file_obj)
        })
        r.raise_for_status()


def send_metrics(metrics):
    with APIServerSession() as s:
        r = s.post('metrics', json=metrics)
        r.raise_for_status()


def add_associations(associations):
    with APIServerSession() as s:
        r = s.post(f'datasets/associations', json=associations)
        r.raise_for_status()


def add_state_to_dataset(dataset_id, state, metadata=None):
    with APIServerSession() as s:
        r = s.post(f'datasets/{dataset_id}/states', json={
            'state': state,
            'metadata': metadata
        })
        r.raise_for_status()
        

def update_dataset_action_item(dataset_id: int, action_item_id: int, data: dict):
    with APIServerSession() as s:
        r = s.patch(f'datasets/{dataset_id}/action-item/{action_item_id}', json=data)
        r.raise_for_status()
        return r.json()


def add_workflow_to_dataset(dataset_id, workflow_id):
    with APIServerSession() as s:
        r = s.post(f'datasets/{dataset_id}/workflows', json={
            'workflow_id': workflow_id
        })
        r.raise_for_status()


def register_process(worker_process: dict):
    with APIServerSession(enable_retry=False) as s:
        r = s.post(f'workflows/processes', json=worker_process)
        r.raise_for_status()
        return r.json()


def post_worker_logs(process_id: str, logs: list[dict]):
    with APIServerSession(enable_retry=False) as s:
        r = s.post(f'workflows/processes/{process_id}/logs', json=logs)
        r.raise_for_status()


def get_all_workflows():
    with APIServerSession() as s:
        r = s.get('workflows/current')
        r.raise_for_status()
        return r.json()


def get_dataset_uploads():
    with APIServerSession() as s:
        r = s.get(f'datasets/uploads')
        r.raise_for_status()
        return r.json()


def update_dataset_upload(uploaded_dataset_id: int, log_data: dict):
    with APIServerSession() as s:
        r = s.patch(f'datasets/uploads/{uploaded_dataset_id}', json=log_data)
        r.raise_for_status()


def get_stalled_uploads():
    """Get uploads that are UPLOADED but workflow hasn't started (>30s)"""
    with APIServerSession() as s:
        r = s.get('datasets/uploads/stalled')
        r.raise_for_status()
        return r.json()


def get_expired_uploads(status='UPLOADING', age_days=0.25):
    """Get uploads that have been stuck in *status* for longer than *age_days*."""
    with APIServerSession() as s:
        r = s.get('datasets/uploads/expired', params={
            'status': status,
            'age_days': age_days,
        })
        r.raise_for_status()
        return r.json()


def get_failed_uploads(max_retry_count=2, max_age_hours=72):
    """Get PROCESSING_FAILED uploads eligible for retry"""
    with APIServerSession() as s:
        r = s.get('datasets/uploads/failed', params={
            'max_retry_count': max_retry_count,
            'max_age_hours': max_age_hours,
        })
        r.raise_for_status()
        return r.json()


def update_upload_retry(upload_id: int, retry_count: int, status: str = None, failure_reason: str = None):
    """Update upload retry count and status"""
    with APIServerSession() as s:
        data = {'retry_count': retry_count}
        if status:
            data['status'] = status
        if failure_reason:
            data['metadata'] = {'failure_reason': failure_reason}
        r = s.patch(f'datasets/uploads/{upload_id}/upload-log', json=data)
        r.raise_for_status()
        return r.json()


def get_dataset_upload_log(dataset_id: int) -> dict:
    """Get upload log for a dataset"""
    with APIServerSession() as s:
        r = s.get(f'datasets/uploads/{dataset_id}/upload-log')
        r.raise_for_status()
        return r.json()


def update_dataset_upload_log(
    dataset_id: int,
    log_data: dict,
    workflow_id: str | None = None,
) -> dict:
    """Update upload log metadata, status, and/or retry count.

    If *workflow_id* is supplied it is sent to the API which will associate the
    workflow with the dataset inside the same DB transaction as the upload-log
    update, providing atomicity for the VERIFIED → COMPLETE transition.
    """
    body = dict(log_data)
    if workflow_id is not None:
        body['workflow_id'] = workflow_id
    with APIServerSession() as s:
        r = s.patch(f'datasets/uploads/{dataset_id}/upload-log', json=body)
        r.raise_for_status()
        return r.json()


def create_notification(payload: dict):
    with APIServerSession() as s:
        r = s.post('notifications', json=payload)
        r.raise_for_status()



def get_all_projects():
    with APIServerSession() as s:
        r = s.get('projects/all')
        r.raise_for_status()
        projects = r.json()['projects']
        return projects


def get_project(project_id: str,
                include_datasets: bool = False):
    with APIServerSession() as s:
        r = s.get(f'projects/{project_id}',
                  params={
                      'include_datasets': include_datasets,
                  })
        r.raise_for_status()
        return r.json()


def initiate_workflow(dataset_id: int, workflow_name: str):
    with APIServerSession() as s:
        r = s.post(f'datasets/{dataset_id}/workflow/{workflow_name}')
        r.raise_for_status()
        return r.json()


if __name__ == '__main__':
    pass
