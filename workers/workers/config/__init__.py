import importlib
import os

from dotenv import load_dotenv

from workers import utils
from workers.config import common

load_dotenv()  # take environment variables from .env.

raw_app_env = os.environ.get('APP_ENV', None)
app_env = 'docker' if raw_app_env == 'ci' else raw_app_env
print(f'loading workers config for APP_ENV={raw_app_env} (resolved={app_env})')
if app_env:
    env_module = importlib.import_module(f'workers.config.{app_env}')
    config = utils.merge(common.config, env_module.config)
else:
    config = common.config
