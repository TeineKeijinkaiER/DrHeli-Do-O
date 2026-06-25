const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const root = __dirname;
const host = '127.0.0.1';
const startPort = Number(process.env.PORT || process.argv[2] || 8080);
const maxPort = startPort + 20;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function toFilePath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(root, pathname));
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

function createServer() {
  return http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      send(res, 405, 'Method Not Allowed');
      return;
    }

    const filePath = toFilePath(req.url || '/');
    if (!filePath) {
      send(res, 403, 'Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        send(res, 404, 'Not Found');
        return;
      }

      const type = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      fs.createReadStream(filePath).pipe(res);
    });
  });
}

function openBrowser(url) {
  if (process.env.NO_OPEN === '1') return;

  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(command, () => {});
}

function listen(port) {
  const server = createServer();

  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port < maxPort) {
      listen(port + 1);
      return;
    }
    console.error(error.message);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    const url = `http://${host}:${port}/`;
    console.log(`DO-O Heli is running at ${url}`);
    console.log('Keep this window open while using the app.');
    openBrowser(url);
  });
}

listen(startPort);
