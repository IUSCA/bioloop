import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

class VerboseHTTPRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.log_verbose_request()
        self.send_verbose_response()

    def __paylod_method(self):
        self.log_verbose_request()
        content_length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(content_length) if content_length else b''
        if data:
            print(f"* Upload completely sent off: {content_length} bytes")
            print(data.decode('utf-8'))
        self.send_verbose_response()

    def do_POST(self):
        self.__paylod_method()

    def do_PUT(self):
        self.__paylod_method()

    def do_DELETE(self):
        self.log_verbose_request()
        self.send_verbose_response()

    def do_PATCH(self):
        self.__paylod_method()
        

    def log_verbose_request(self):
        print(f"* Connected to {self.client_address[0]} ({self.client_address[0]}) port {self.server.server_port}")
        print(f"> {self.command} {self.path} {self.request_version}")
        for header, value in self.headers.items():
            print(f"> {header}: {value}")
        print(">")

    def send_verbose_response(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        response_body = "OK"
        print(f"< HTTP/1.1 200 OK")
        print(f"< Content-Type: text/plain")
        print(f"< Content-Length: {len(response_body)}")
        print("<")
        print(response_body)
        self.wfile.write(response_body.encode('utf-8'))

    def log_message(self, format, *args):
        return  # Suppress default logging

if __name__ == "__main__":
    port = int(sys.argv[1] if len(sys.argv) > 1 else 8000)
    server_address = ('', port)
    httpd = HTTPServer(server_address, VerboseHTTPRequestHandler)
    print(f"* Listening on port {port}...")
    try:
      httpd.serve_forever()
    except KeyboardInterrupt:
      print("\n* Server stopped by user")
