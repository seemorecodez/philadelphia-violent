import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const LIMIT = 100 * 1024 * 1024;
const CLIP = /^\/__capture\/(philadelphia-drive-[0-9T-]+-[a-f0-9-]+\.webm)$/;

// Local development/preview exports only. There is no arbitrary path argument.
export function localCapture(root) {
  const folder = resolve(root, 'artifacts/videos');
  return async (req, res, next) => {
    if (req.url !== '/__capture' && !CLIP.test(req.url || '')) return next();
    const host = req.headers.host || '';
    if (!/^127\.0\.0\.1:\d+$/.test(host)) { res.writeHead(403); res.end(); return; }
    const fail = (code, message) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:message})); };
    try {
      const clip = CLIP.exec(req.url);
      if (req.method === 'GET' && clip) {
        const data = await readFile(resolve(folder,clip[1]));
        res.writeHead(200, {'Content-Type':'video/webm','Content-Length':data.length,'Cache-Control':'no-store'});
        res.end(data); return;
      }
      if (req.method !== 'POST' || req.url !== '/__capture') return fail(405,'Unsupported method.');
      if (req.headers.origin !== `http://${host}`) return fail(403,'Open the local game to save a clip.');
      if (!/^video\/webm(?:;|$)/i.test(req.headers['content-type'] || '')) return fail(415,'A WebM recording is required.');
      if (Number(req.headers['content-length']) > LIMIT) return fail(413,'Clip exceeds 100 MB.');
      const chunks=[]; let size=0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > LIMIT) return fail(413,'Clip exceeds 100 MB.');
        chunks.push(chunk);
      }
      const data=Buffer.concat(chunks);
      if (data.length < 32 || data.readUInt32BE(0) !== 0x1a45dfa3) return fail(400,'Invalid WebM header.');
      await mkdir(folder,{recursive:true});
      const filename=`philadelphia-drive-${new Date().toISOString().replace(/[:.Z]/g,'-')}-${randomUUID()}.webm`;
      const path=resolve(folder,filename);
      await writeFile(path,data,{flag:'wx'});
      res.writeHead(201,{'Content-Type':'application/json'});
      res.end(JSON.stringify({path,url:`/__capture/${filename}`,bytes:data.length}));
    } catch (error) {
      if (!res.headersSent) fail(error.code==='ENOENT'?404:500,'The local clip could not be saved or opened.');
      else res.end();
    }
  };
}
