// Color Together: tiny static server + WebSocket relay. Rooms persist to data.json.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data.json'), PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

let rooms = {};
try { rooms = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch {}
let timer;
const save = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(DATA, JSON.stringify(rooms), () => {}), 1000); };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 3 * 1024 * 1024 });
const clients = new Map(); // socket -> room code

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'join') {
      const code = String(m.room || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (!code) return;
      clients.set(ws, code);
      const r = rooms[code] || (rooms[code] = { img: null, strokes: [] });
      return ws.send(JSON.stringify({ type: 'init', img: r.img, strokes: r.strokes }));
    }
    const code = clients.get(ws); if (!code) return;
    const r = rooms[code];
    if (m.type === 'image') { r.img = m.img; r.strokes = []; save(); }
    else if (m.type === 'stroke') { r.strokes.push(m.stroke); if (r.strokes.length > 5000) r.strokes.shift(); save(); }
    else if (m.type === 'undo') { r.strokes = r.strokes.filter((s) => s.id !== m.id); save(); }
    else if (m.type !== 'live') return;
    const out = raw.toString();
    for (const [c, rc] of clients) if (c !== ws && rc === code && c.readyState === 1) c.send(out);
  });
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => console.log('Color Together running at http://localhost:' + PORT));
