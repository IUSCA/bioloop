from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter, Retry

import scaworkers.utils as utils
from scaworkers.config import config


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
    return HTTPAdapter(max_retries=Retry(
        total=9,
        backoff_factor=5,
        allowed_methods=None,
        status_forcelist=[429, 502, 503]
    ))


# https://stackoverflow.com/a/51026159/2580077
class APIServerSession(requests.Session):
    def __init__(self):
        super().__init__()
        # Every step in the workflow calls this API at least twice
        # Failing a long run step because the API is momentarily down for maintenance is wasteful
        # Retry adapter will keep trying to re-connect on connection and other transient errors up to 10m30s
        adapter = make_retry_adapter()
        self.mount("http://", adapter)
        self.mount("https://", adapter)
        self.auth = (config['api']['username'], config['api']['password'])
        self.base_url = config['api']['base_url']

    def request(self, method, url, *args, **kwargs):
        joined_url = urljoin(self.base_url, url)
        print(method, joined_url, args, kwargs)
        return super().request(method, joined_url, *args, **kwargs)


def batch_getter(batch):
    # convert du_size and size from string to int
    if batch is not None:
        batch['du_size'] = utils.parse_number(batch.get('du_size', None))
        batch['size'] = utils.parse_number(batch.get('size', None))
    return batch


def batch_setter(batch):
    # convert du_size and size from int to string
    if batch is not None:
        if 'du_size' in batch and batch['du_size'] is not None:
            batch['du_size'] = str(batch['du_size'])
        if 'size' in batch and batch['size'] is not None:
            batch['size'] = str(batch['size'])
    return batch


def get_all_batches(batch_type=None, name=None):
    with APIServerSession() as s:
        payload = {
            'type': batch_type,
            'name': name,
        }
        r = s.get('batches', params=payload)
        if r.status_code == 200:
            batches = r.json()
            return [batch_getter(batch) for batch in batches]
        else:
            raise Exception('Server responded with non-200 code')


def get_batch(batch_id, checksums=False):
    with APIServerSession() as s:
        payload = {
            'checksums': int(checksums)
        }
        r = s.get(f'batches/{batch_id}', params=payload)
        if r.status_code == 200:
            return batch_getter(r.json())
        else:
            raise Exception('Server responded with non-200 code')


def create_batch(batch):
    with APIServerSession() as s:
        r = s.post('batches', json=batch_setter(batch))
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def update_batch(batch_id, update_data):
    with APIServerSession() as s:
        r = s.patch(f'batches/{batch_id}', json=batch_setter(update_data))
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def add_checksums_to_batch(batch_id, checksums):
    with APIServerSession() as s:
        r = s.post(f'batches/{batch_id}/checksums', json=checksums)
        if r.status_code != 200:
            raise Exception('Server responded with non-200 code')


def upload_report(batch_id, report_filename):
    filename = report_filename.name
    fileobj = open(report_filename, 'rb')
    with APIServerSession() as s:
        r = s.put(f'batches/{batch_id}/report', files={
            'report': (filename, fileobj)
        })
        if r.status_code != 200:
            print(r, r.status_code)
            raise Exception('Server responded with non-200 code')


def send_metrics(metrics):
    with APIServerSession() as s:
        r = s.post('metrics', json=metrics)
        if r.status_code != 200:
            print(r, r.status_code)
            raise Exception('Server responded with non-200 code')


def add_associations(associations):
    with APIServerSession() as s:
        r = s.post(f'batches/associations', json=associations)
        if r.status_code != 200:
            raise Exception('Server responded with non-200 code')


def add_state_to_batch(batch_id, state, metadata=None):
    with APIServerSession() as s:
        r = s.post(f'batches/{batch_id}/states', json={
            'state': state,
            'metadata': metadata
        })
        if r.status_code != 200:
            raise Exception('Server responded with non-200 code')


if __name__ == '__main__':
    pass
