import {readFile,writeFile,mkdir} from 'node:fs/promises';
const template=await readFile('scripts/local-park-agent.mjs','utf8');
const prompt='Write a pure JavaScript ES module function advanceAlongPath(points,distance), where points are finite local meter [x,y] points on an actual street polyline. Return {x,y,heading,length,finished} at clamped distance with heading radians clockwise from north. Skip zero-length consecutive segments, reject malformed/degenerate paths and nonfinite/negative distance with TypeError, at exact endpoint retain last segment heading. No randomness, imports, network or side effects. Include small meaningful node:test tests for a right-angle polyline, duplicates and endpoint. This is a route-sampling helper only, not complete traffic AI. Return code only.';
await mkdir('artifacts/local-agent',{recursive:true});
const code=template.replace(/const prompt=`[\s\S]*?`;/,`const prompt=${JSON.stringify(prompt)};`).replaceAll('park-boundary','district-route');
await writeFile('artifacts/local-agent/district-route-job.mjs',code);
await import('../artifacts/local-agent/district-route-job.mjs');
