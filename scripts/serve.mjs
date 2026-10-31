import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(path.resolve(root) + path.sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Dosya bulunamadı.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
