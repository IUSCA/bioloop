import importlib
import os

from dotenv import load_dotenv

from workers import utils
from workers.config import common

load_dotenv()  # take environment variables from .env.

app_env = os.environ.get('APP_ENV', None)
print(f'loading {app_env} conf')
if app_env:
    env_module = importlib.import_module(f'workers.config.{app_env}')
    config = utils.merge(common.config, env_module.config)
else:
    config = common.config
