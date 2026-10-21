"""Security checks for generated settings and the pinned dependency correction."""
import importlib.util
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class GeneratedConfigurationTests(unittest.TestCase):
    def test_preview_settings_keep_existing_docker_defaults_unless_opted_in(self):
        source = Path(__file__).resolve().parents[2] / 'workers/workers/config/docker.py'
        with patch.dict(os.environ, {'BIOLOOP_PREVIEW_MODE': ''}):
            default = runpy.run_path(str(source))['config']
        with patch.dict(os.environ, {'BIOLOOP_PREVIEW_MODE': '1'}):
            preview = runpy.run_path(str(source))['config']
        self.assertEqual(default['registration']['recency_threshold_seconds'], 300)
        self.assertEqual(preview['registration']['recency_threshold_seconds'], 2)
        self.assertEqual(default['paths'], preview['paths'])

    def test_no_production_credentials_or_external_runtime_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            # OpenSSL is unrelated to these assertions. Create its expected output.
            def fake_openssl(command, **kwargs):
                Path(command[command.index('-out') + 1]).write_text('test-key')
            with patch.object(prepare.subprocess, 'run', side_effect=fake_openssl):
                prepare.prepare(root)
            api = dict(line.split('=', 1) for line in (root / 'api.env').read_text().splitlines())
            worker = dict(line.split('=', 1) for line in (root / 'workers.env').read_text().splitlines())
            self.assertEqual(api['NODE_ENV'], 'ci')
            self.assertEqual(api['BIOLOOP_PREVIEW_MODE'], '1')
            self.assertEqual(worker['APP_ENV'], 'docker')
            self.assertIn('@postgres:5432/app?schema=public', api['DATABASE_URL'])
            self.assertEqual(worker['API_BASE_URL'], 'http://api:3030')
            self.assertEqual(json.loads(api['NODE_CONFIG'])['auth']['google']['enabled'], False)
            self.assertEqual(api['UPLOAD_MAX_FILE_SIZE_BYTES'], '26214400')
            first = api['DATABASE_PASSWORD']
            with patch.object(prepare.subprocess, 'run', side_effect=fake_openssl):
                prepare.prepare(root)
            self.assertNotIn(f'DATABASE_PASSWORD={first}\n', (root / 'api.env').read_text())

    def test_public_dependencies_are_immutable_and_tunnel_has_checksum(self):
        manifest = json.loads(Path(__file__).with_name('dependencies.json').read_text())
        for name in ('rhythm', 'signet'):
            self.assertRegex(manifest[name]['revision'], r'^[a-f0-9]{40}$')
            self.assertTrue(manifest[name]['repository'].startswith('https://github.com/'))
        self.assertRegex(manifest['cloudflared']['sha256'], r'^[a-f0-9]{64}$')


if __name__ == '__main__':
    unittest.main()
