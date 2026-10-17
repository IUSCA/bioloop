"""Save bounded diagnostics with generated credentials and query strings redacted."""
import os
from pathlib import Path
import re
import subprocess

state = Path(os.environ['PREVIEW_STATE_DIR'])
tools = Path(__file__).resolve().parent
prefix = ['docker', 'compose', '--env-file', '/dev/null', '--project-name', os.environ['COMPOSE_PROJECT_NAME'], '--file', str(tools.parent.parent / 'docker-compose-preview.yml')]
redactions = []
for env_file in state.glob('*.env'):
    for line in env_file.read_text().splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            if any(word in key for word in ('PASSWORD', 'PASS', 'TOKEN', 'SECRET', 'DATABASE_URL')) and len(value) >= 8:
                redactions.append(value)
parts = []
for command in (['ps', '--all'], ['logs', '--no-color', '--tail', '80']):
    try:
        output = subprocess.run(prefix + command, capture_output=True, text=True, timeout=20)
        parts.append(output.stdout + output.stderr)
    except subprocess.TimeoutExpired:
        parts.append('Diagnostic collection timed out.\n')
content = '\n'.join(parts)
for value in sorted(redactions, key=len, reverse=True):
    content = content.replace(value, '[REDACTED]')
content = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[JWT REDACTED]', content)
content = re.sub(r'(\?)[^\s"\']+', '?[QUERY REDACTED]', content)
destination = state / 'diagnostics.txt'
destination.write_text(content, encoding='utf-8')
print(f'Redacted diagnostics saved to {destination}; review before sharing.')
