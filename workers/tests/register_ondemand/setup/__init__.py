"""Shared paths for the register_ondemand test cases.

These are scripts rather than pytest tests; see the README in this directory.

Every path is derived rather than hardcoded, so the cases run both inside the
worker container and on a developer machine. `workers_root` is the directory the
`workers` package lives in, which is what `python -m workers.scripts.*` has to be
run from. The scratch and log directories sit under the configured data root,
which is /opt/sca/data in docker and the repository's ./data in dev.
"""

from pathlib import Path

from workers.config import config

# tests/register_ondemand/setup/__init__.py -> setup -> register_ondemand -> tests -> workers
workers_root = Path(__file__).resolve().parents[3]

_base = Path(config['paths']['root']) / 'tests' / 'register_ondemand'

logs_dir = _base / 'logs'
logs_dir.mkdir(parents=True, exist_ok=True)

data_dir = _base / 'data'
data_dir.mkdir(parents=True, exist_ok=True)
