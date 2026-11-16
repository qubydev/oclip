import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root = fileURLToPath(new URL('../',import.meta.url));
const mime = {html:'text/html',css:'text/css',js:'text/javascript',jpg:'image/jpeg',png:'image/png',svg:'image/svg+xml',wav:'audio/wav'};
const port = Number(process.env.OCLIP_PORT || 4173);
createServer(async (req,res) => {
  const name = req.url === '/' ? '/index.html' : req.url;
  if (!/^\/(?:index\.html|src\/[\w.-]+|assets\/[\w.-]+)$/.test(name)) { res.writeHead(404).end(); return; }
  const file = join(root,name);
  try {
    const {size} = await stat(file);
    res.writeHead(200,{'Content-Type':mime[file.split('.').pop()] || 'application/octet-stream','Content-Length':size});
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port,'127.0.0.1',() => console.log('oclip preview: http://127.0.0.1:'+port));
