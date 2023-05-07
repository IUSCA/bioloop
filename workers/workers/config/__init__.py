import importlib
import os

from dotenv import load_dotenv
from dotmap import DotMap

from workers import utils
from workers.config import common

load_dotenv()  # take environment variables from .env.

env = os.environ.get('APP_ENV', None)
if env:
    env_module = importlib.import_module(f'workers.config.{env}')
    config = DotMap(utils.merge(common.config, env_module.config))
else:
    config = DotMap(common.config)
