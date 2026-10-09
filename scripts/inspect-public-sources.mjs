import { mkdir, writeFile } from 'node:fs/promises';
import { SOURCES } from '../src/sources.js';
const sources = {
  buildings: `${SOURCES.buildings}?f=pjson`,
  imagery: `${SOURCES.imagery}?f=pjson`,
};
await mkdir('artifacts', { recursive: true });
await Promise.all(Object.entries(sources).map(async ([name, url]) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const body = await response.json();
    await writeFile(`artifacts/${name}-source.json`, JSON.stringify(body, null, 2));
    console.log(JSON.stringify({ name, status: response.status, error: body.error,
      nameInData: body.name, id: body.serviceItemId, href: body.href,
      extent: body.fullExtent || body.store?.extent,
      spatialReference: body.spatialReference, heightModelInfo: body.heightModelInfo,
      copyright: body.copyrightText, version: body.store?.version,
    }));
  } catch (error) { console.log(JSON.stringify({ name, error: error.message })); }
}));
