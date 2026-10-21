"""Verify anonymous requests are redirected to the pinned provider's login."""
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect())
for path in ('/', '/api/health', '/api/auth/cas/verify', '/api/uploads/files', '/download/preview-hello.txt', '/data/preview-hello.txt'):
    try:
        response = opener.open(sys.argv[1] + path, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    location = urllib.parse.urlparse(response.headers.get('Location', ''))
    if response.code != 302 or location.scheme != 'https' or location.netloc != 'login.trycloudflare.com' or location.path != '/authorize':
        raise RuntimeError(f'Protected ingress check failed for {path}: {response.code}')
print('Anonymous application requests are blocked by the email authentication gateway.')
