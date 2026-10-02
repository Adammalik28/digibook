// Server lokal untuk uji: menyajikan index.html dan /testdocs. Tidak ikut dipublikasikan.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = +process.env.PORT || 8766;

function send(res, code, body, type = 'text/plain') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')), 'text/html; charset=utf-8');
    if (p.startsWith('/testdocs/')) {
      const f = path.join(ROOT, p);
      if (f.startsWith(path.join(ROOT, 'testdocs')) && fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), 'application/octet-stream');
    }
    send(res, 404, 'not found');
  } catch (e) {
    console.error(e);
    send(res, 500, String(e));
  }
});
server.listen(PORT, () => console.log('test server on http://localhost:' + PORT));
