const http = require('http');

const express = require('express');

const { errorHandler, notFound } = require('../src/middleware/error');

function create_app(download_router) {
  const app = express();
  app.use((req, res, next) => {
    req.token = { scope: req.get('x-test-scope') || '' };
    next();
  });
  app.use('/download', download_router);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function request(app, request_path, scope = '') {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path: request_path,
        headers: { 'x-test-scope': scope },
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          resolve({
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
            status: res.statusCode,
          });
        });
      });
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

module.exports = { create_app, request };
