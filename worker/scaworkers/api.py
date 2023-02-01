from urllib.parse import urljoin

import requests

import scaworkers.utils as utils
from scaworkers.config import config


# https://stackoverflow.com/a/51026159/2580077
class APIServerSession(requests.Session):
    def __init__(self):
        super().__init__()
        self.auth = (config['api']['username'], config['api']['password'])
        self.base_url = config['api']['base_url']

    def request(self, method, url, *args, **kwargs):
        joined_url = urljoin(self.base_url, url)
        return super().request(method, joined_url, *args, **kwargs)


def batch_getter(batch):
    # convert du_size and size from string to int
    if batch is not None:
        batch['du_size'] = utils.parse_int(batch.get('du_size', None))
        batch['size'] = utils.parse_int(batch.get('size', None))
    return batch


def batch_setter(batch):
    # convert du_size and size from int to string
    if batch is not None:
        if 'du_size' in batch and batch['du_size'] is not None:
            batch['du_size'] = str(batch['du_size'])
        if 'size' in batch and batch['size'] is not None:
            batch['size'] = str(batch['size'])
    return batch


def get_all_batches(include_checksums=False):
    with APIServerSession() as s:
        payload = {
            'include_checksums': int(include_checksums)
        }
        r = s.get('batch', params=payload)
        if r.status_code == 200:
            batches = r.json()
            return [batch_getter(batch) for batch in batches]
        else:
            raise Exception('Server responded with non-200 code')


def get_batch(batch_id, include_checksums=False):
    with APIServerSession() as s:
        payload = {
            'include_checksums': int(include_checksums)
        }
        r = s.get(f'batch/{batch_id}', params=payload)
        if r.status_code == 200:
            return batch_getter(r.json())
        else:
            raise Exception('Server responded with non-200 code')


def create_batch(batch):
    with APIServerSession() as s:
        r = s.post('batch', json=batch_setter(batch))
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def update_batch(batch_id, update_data):
    with APIServerSession() as s:
        r = s.patch(f'batch/{batch_id}', json=batch_setter(update_data))
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def add_checksums_to_batch(batch_id, checksums):
    with APIServerSession() as s:
        r = s.post(f'batch/{batch_id}/checksums', json=checksums)
        if r.status_code != 200:
            raise Exception('Server responded with non-200 code')


if __name__ == '__main__':
    pass
