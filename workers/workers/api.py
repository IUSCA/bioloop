import logging
from datetime import datetime
from urllib.parse import urljoin

import requests
from glom import glom, assign as glom_assign
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
    d['du_size'] = utils.parse_number(d.get(key, None))
    return d


def int_to_str(d: dict, key: str):
    if key in d and d[key] is not None:
        d[key] = str(d[key])
    return d


def entity_getter(dataset: dict):
    date_format = '%Y-%m-%dT%H:%M:%S.%fZ'
    date_keys = ['created_at', 'updated_at']

    # convert du_size and size from string to int
    if dataset is None:
        return dataset

    for key in ['du_size', 'size']:
        str_to_int(dataset, key)
    dataset['files'] = [str_to_int(f, 'size') for f in dataset.get('files', [])]

    # convert date strings to date objects
    for date_key in date_keys:
        date_str = glom(dataset, date_key, default=None)
        if date_str is not None:
            try:
                glom_assign(dataset, date_key, datetime.strptime(date_str, date_format))
            except ValueError:  # unable to parse date string
                glom_assign(dataset, date_key, None)
    return dataset


def dataset_setter(dataset: dict):
    # convert du_size and size from int to string
    if dataset is not None:
        for key in ['du_size', 'size', 'bundle_size']:
            int_to_str(dataset, key)
    return dataset


def get_all_datasets(dataset_type=None, name=None, days_since_last_staged=None, deleted=False):
    with APIServerSession() as s:
        payload = {
            'type': dataset_type,
            'name': name,
            'days_since_last_staged': days_since_last_staged,
            'deleted': deleted
        }
        r = s.get('datasets', params=payload)
        r.raise_for_status()
        datasets = r.json()['datasets']
        return [entity_getter(dataset) for dataset in datasets]


def get_dataset(dataset_id: str, files: bool = False):
    with APIServerSession() as s:
        payload = {
            'files': files
        }
        r = s.get(f'datasets/{dataset_id}', params=payload)
        r.raise_for_status()
        return entity_getter(r.json())


def create_dataset(dataset):
    with APIServerSession() as s:
        r = s.post('datasets', json=dataset_setter(dataset))
        r.raise_for_status()
        return r.json()


def update_dataset(dataset_id, update_data):
    with APIServerSession() as s:
        r = s.patch(f'datasets/{dataset_id}', json=dataset_setter(update_data))
        r.raise_for_status()
        return r.json()


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


def add_workflow_to_dataset(dataset_id, workflow_id):
    with APIServerSession() as s:
        r = s.post(f'datasets/{dataset_id}/workflows', json={
            'workflow_id': workflow_id
        })
        r.raise_for_status()


def get_bundle(name: str, checksum: str):
    with APIServerSession() as s:
        payload = {
            'name': name,
            'checksum': checksum
        }
        r = s.get(f'bundle', params=payload)
        r.raise_for_status()
        return entity_getter(r.json())


def post_bundle(data: dict):
    with APIServerSession(enable_retry=False) as s:
        r = s.post('bundle', json=data)
        r.raise_for_status()
        return r.json()


def register_process(worker_process: dict):
    with APIServerSession(enable_retry=False) as s:
        r = s.post(f'workflows/processes', json=worker_process)
        r.raise_for_status()
        return r.json()


def post_worker_logs(process_id: str, logs: list[dict]):
    with APIServerSession(enable_retry=False) as s:
        r = s.post(f'workflows/processes/{process_id}/logs', json=logs)
        r.raise_for_status()


if __name__ == '__main__':
    pass
