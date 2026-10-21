// Local preview server: serves saved Yahoo pages from ./fixtures at their real
// Yahoo paths, with the userscript injected, so the restyle can be checked
// without touching Yahoo.
//   node dev/serve.mjs          -> http://localhost:5178/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5178;
const SCRIPT = 'yahoo-fantasy-mobile.user.js';

// Yahoo path pattern -> saved page. Add a row per new fixture.
const ROUTES = [
  { path: /^\/nba\/\d+\/\d+(\/team)?\/?$/, fixture: 'team.html', example: '/nba/1161/1' },
];

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };

async function fixturePage(name, raw) {
  let html = await readFile(join(ROOT, 'fixtures', name), 'utf8');
  // Drop external scripts so the saved page stays offline and static.
  html = html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '');
  if (raw) return html;
  // SingleFile adds a CSP that only allows inline scripts, so inline it.
  const code = (await readFile(join(ROOT, SCRIPT), 'utf8')).replace(/<\/script/gi, '<\\/script');
  const inject = `<script>${code}</script>`;
  return html.includes('</body>') ? html.replace('</body>', inject + '</body>') : html + inject;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/') {
      const links = ROUTES.map(r => `<li><a href="${r.example}">${r.example}</a> (${r.fixture}) · <a href="${r.example}?raw=1">raw</a></li>`).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><meta charset=utf-8><title>Fixtures</title><ul>${links}</ul>`);
    }
    const route = ROUTES.find(r => r.path.test(url.pathname));
    if (route) {
      const body = await fixturePage(route.fixture, url.searchParams.has('raw'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(body);
    }
    const file = join(ROOT, url.pathname);
    if (!file.startsWith(ROOT + '/')) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(String(err.message || err));
  }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}/`));
