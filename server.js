import express from 'express';
import { createServer as createViteServer } from 'vite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 5173);
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

if (production) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.use((request, response, next) => {
    if (request.method !== 'GET') return next();
    response.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const vite = await createViteServer({
    root,
    configFile: path.join(root, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use(async (request, response, next) => {
    if (request.method !== 'GET') return next();
    try {
      const template = await readFile(path.join(root, 'index.html'), 'utf8');
      const html = await vite.transformIndexHtml(request.originalUrl, template);
      response.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

app.listen(port, host, () => {
  console.log(`FSU portal server listening on http://127.0.0.1:${port}`);
});
