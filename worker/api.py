from urllib.parse import urljoin

import requests

from config import config


# session = requests.Session()
# session.auth = (utils['api']['username'], utils['api']['password'])

# https://stackoverflow.com/a/51026159/2580077
class APIServerSession(requests.Session):
    def __init__(self):
        super().__init__()
        self.auth = (config['api']['username'], config['api']['password'])
        self.base_url = config['api']['base_url']

    def request(self, method, url, *args, **kwargs):
        joined_url = urljoin(self.base_url, url)
        return super().request(method, joined_url, *args, **kwargs)


def get_all_batches(include_checksums=False):
    with APIServerSession() as s:
        payload = {
            'include_checksums': int(include_checksums)
        }
        r = s.get('/batch', params=payload)
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def get_batch(batch_id, include_checksums=False):
    with APIServerSession() as s:
        payload = {
            'include_checksums': int(include_checksums)
        }
        r = s.get(f'/batch/{batch_id}', params=payload)
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def create_batch(batch):
    with APIServerSession() as s:
        r = s.post('/batch', json=batch)
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def update_batch(batch_id, update_data):
    with APIServerSession() as s:
        r = s.patch(f'/batch/{batch_id}', json=update_data)
        if r.status_code == 200:
            return r.json()
        else:
            raise Exception('Server responded with non-200 code')


def add_checksums_to_batch(batch_id, checksums):
    with APIServerSession() as s:
        r = s.post(f'/batch/{batch_id}/checksums', json=checksums)
        if r.status_code != 200:
            raise Exception('Server responded with non-200 code')


if __name__ == '__main__':
    pass
