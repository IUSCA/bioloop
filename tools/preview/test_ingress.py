"""Exercise the fail-closed ingress probe without calling an external service."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
import threading
import unittest


class IngressProbeTests(unittest.TestCase):
    def probe(self, status, location=''):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(status)
                if location:
                    self.send_header('Location', location)
                self.end_headers()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            return subprocess.run([
                sys.executable, str(Path(__file__).with_name('check-ingress.py')),
                f'http://127.0.0.1:{server.server_port}',
            ], capture_output=True, timeout=15).returncode
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_requires_the_expected_protected_login_redirect(self):
        self.assertEqual(self.probe(302, 'https://login.trycloudflare.com/authorize?state=example'), 0)

    def test_rejects_an_exposed_origin(self):
        self.assertNotEqual(self.probe(200), 0)

    def test_rejects_unrelated_redirects(self):
        self.assertNotEqual(self.probe(302, 'https://example.com/authorize'), 0)


if __name__ == '__main__':
    unittest.main()
