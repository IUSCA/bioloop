"""Update generated env files without shell evaluation or printing credentials."""
import json
import os
from pathlib import Path
import re
import sys

from prepare import write_env

state = Path(os.environ['PREVIEW_STATE_DIR'])


def update(filename, changes):
    values = dict(line.split('=', 1) for line in (state / filename).read_text().splitlines() if line)
    for value in changes.values():
        if '\n' in value or '\r' in value:
            raise ValueError('Invalid multiline setting')
    write_env(state / filename, {**values, **changes})


if sys.argv[1] == 'workflow-token':
    token = (state / 'workflow-token').read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', token):
        raise ValueError('Invalid Rhythm token output')
    update('api.env', {'WORKFLOW_AUTH_TOKEN': token})
elif sys.argv[1] == 'bootstrap':
    data = json.loads((state / 'output' / 'bootstrap.json').read_text())
    for key in ('clientId', 'clientSecret', 'workerToken'):
        if not isinstance(data[key], str) or not re.fullmatch(r'[A-Za-z0-9_.-]+', data[key]):
            raise ValueError(f'Invalid generated {key}')
    update('api.env', {'OAUTH_DOWNLOAD_CLIENT_ID': data['clientId'], 'OAUTH_DOWNLOAD_CLIENT_SECRET': data['clientSecret']})
    update('workers.env', {'APP_API_TOKEN': data['workerToken']})
elif sys.argv[1] == 'public-url':
    url = sys.argv[2]
    if not re.fullmatch(r'https://[a-z0-9-]+\.trycloudflare\.com', url):
        raise ValueError('Unexpected tunnel URL')
    update('api.env', {'DOWNLOAD_SERVER_BASE_URL': f'{url}/'})
else:
    raise ValueError('Unknown configuration operation')
