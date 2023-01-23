import requests
from urllib.parse import urljoin

from config import config


# session = requests.Session()
# session.auth = (utils['api']['username'], utils['api']['password'])

# https://stackoverflow.com/a/51026159/2580077
class APIServerSession(requests.Session):
    def __init__(self):
        super().__init__()
        super().auth = (config['api']['username'], config['api']['password'])
        self.base_url = config['api']['base_url']

    def request(self, method, url, *args, **kwargs):
        joined_url = urljoin(self.base_url, url)
        return super().request(method, joined_url, *args, **kwargs)

def get_all_batches():
    pass

def create_batch(batch):
    pass