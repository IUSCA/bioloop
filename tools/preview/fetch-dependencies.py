"""Fetch exact public revisions and apply a narrowly checked upstream fix."""
import json
import os
from pathlib import Path
import subprocess

tools = Path(__file__).resolve().parent
manifest = json.loads((tools / 'dependencies.json').read_text())
root = Path(os.environ['PREVIEW_STATE_DIR']) / 'dependencies'
root.mkdir(parents=True, exist_ok=True)
for name in ('rhythm', 'signet'):
    spec = manifest[name]
    destination = root / name
    subprocess.run(['git', 'init', str(destination)], check=True)
    subprocess.run(['git', '-C', str(destination), 'fetch', '--depth=1', spec['repository'], spec['revision']], check=True)
    subprocess.run(['git', '-C', str(destination), 'checkout', '--detach', 'FETCH_HEAD'], check=True)
    actual = subprocess.check_output(['git', '-C', str(destination), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != spec['revision']:
        raise RuntimeError(f'{name}: unexpected source revision')

loader = root / 'rhythm' / 'rhythm_api' / 'config' / '__init__.py'
# Read the immutable git object so retries do not try to patch the already
# corrected working file a second time.
source = subprocess.check_output([
    'git', '-C', str(root / 'rhythm'), 'show', 'HEAD:rhythm_api/config/__init__.py',
], text=True)
old = 'from rhythm_api.config.common import config'
if source.count(old) != 1:
    raise RuntimeError('Rhythm upstream changed: review the config import patch')
loader.write_text(source.replace(old, 'from rhythm_api.config import common'))
print('Applied documented Rhythm config import correction to the pinned source.')
