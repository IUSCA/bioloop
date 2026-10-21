"""Generate disposable settings; never read a developer's or production .env."""
import json
import os
from pathlib import Path
import secrets
import subprocess


def write_env(path, values):
    path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()), encoding='utf-8')
    path.chmod(0o600)


def prepare(state):
    state.mkdir(parents=True, exist_ok=True)
    password = secrets.token_hex(24)
    common = {
        'MONGO_HOST': 'mongo', 'MONGO_PORT': '27017', 'MONGO_DB': 'celery',
        'MONGO_AUTH_SOURCE': 'admin', 'MONGO_USER': 'preview', 'MONGO_PASS': password,
        'QUEUE_URL': 'queue:5672/preview', 'QUEUE_USER': 'preview', 'QUEUE_PASS': password,
    }
    write_env(state / 'database.env', {
        'POSTGRES_DB': 'app', 'POSTGRES_USER': 'appuser', 'POSTGRES_PASSWORD': password,
    })
    write_env(state / 'mongo.env', {
        'MONGO_INITDB_ROOT_USERNAME': 'preview', 'MONGO_INITDB_ROOT_PASSWORD': password,
    })
    write_env(state / 'queue.env', {
        'RABBITMQ_DEFAULT_USER': 'preview', 'RABBITMQ_DEFAULT_PASS': password,
        'RABBITMQ_DEFAULT_VHOST': 'preview',
    })
    write_env(state / 'signet.env', {
        'APP_ENV': '', 'POSTGRES_HOST': 'signet_db', 'POSTGRES_PORT': '5432',
        'POSTGRES_USER': 'appuser', 'POSTGRES_PASSWORD': password, 'POSTGRES_DB': 'app',
        'ISSUER': 'preview', 'AUTHLIB_INSECURE_TRANSPORT': '1',
    })
    write_env(state / 'rhythm.env', {**common, 'APP_ENV': ''})
    write_env(state / 'workers.env', {
        **common, 'APP_ENV': 'docker', 'BIOLOOP_PREVIEW_MODE': '1', 'ALIAS_SALT': secrets.token_hex(16),
        'API_BASE_URL': 'http://api:3030', 'APP_API_TOKEN': 'not-issued-yet',
    })
    write_env(state / 'download.env', {
        'NODE_ENV': 'docker', 'JWKS_URI': 'http://signet:5050/oauth/jwks',
        'EXPRESS_HOST': '0.0.0.0', 'DOWNLOAD_PATH': '/opt/sca/data/downloads',
    })
    api_config = {
        'auth': {name: {'enabled': False} for name in ('google', 'cilogon', 'microsoft')},
    }
    write_env(state / 'api.env', {
        'NODE_ENV': 'ci', 'BIOLOOP_PREVIEW_MODE': '1', 'POSTGRES_HOST': 'postgres', 'DATABASE_PASSWORD': password,
        'DATABASE_URL': f'postgresql://appuser:{password}@postgres:5432/app?schema=public',
        'WORKFLOW_SERVER_BASE_URL': 'http://rhythm:5001', 'WORKFLOW_AUTH_TOKEN': 'not-issued-yet',
        'OAUTH_BASE_URL': 'http://signet:5050',
        'OAUTH_DOWNLOAD_CLIENT_ID': 'not-issued-yet', 'OAUTH_DOWNLOAD_CLIENT_SECRET': 'not-issued-yet',
        'GOOGLE_OAUTH_CLIENT_ID': 'preview', 'GOOGLE_OAUTH_CLIENT_SECRET': 'preview',
        'CILOGON_OAUTH_CLIENT_ID': 'preview', 'CILOGON_OAUTH_CLIENT_SECRET': 'preview',
        'MICROSOFT_OAUTH_CLIENT_ID': 'preview', 'MICROSOFT_OAUTH_CLIENT_SECRET': 'preview',
        'DOWNLOAD_SERVER_BASE_URL': 'http://localhost:8080/',
        'UPLOAD_MAX_FILE_SIZE_BYTES': str(25 * 1024 * 1024),
        'E2E_ADMIN': 'e2eAdmin', 'E2E_OPERATOR': 'e2eOperator', 'E2E_USER': 'e2eUser',
        'NODE_CONFIG': json.dumps(api_config, separators=(',', ':')),
    })
    for service in ('api', 'rhythm', 'signet'):
        keys = state / f'{service}-keys'
        keys.mkdir(exist_ok=True)
        subprocess.run(['openssl', 'genrsa', '-out', str(keys / 'auth.key'), '2048'], check=True, capture_output=True)
        subprocess.run(['openssl', 'rsa', '-in', str(keys / 'auth.key'), '-pubout', '-out', str(keys / 'auth.pub')], check=True, capture_output=True)
        (keys / 'auth.key').chmod(0o600)


if __name__ == '__main__':
    prepare(Path(os.environ['PREVIEW_STATE_DIR']).resolve())
