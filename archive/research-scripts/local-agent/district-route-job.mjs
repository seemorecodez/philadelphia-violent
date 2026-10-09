// Third local coding assignment: vegetation placement constrained to source polygons.
import {mkdir,writeFile} from 'node:fs/promises';
const prompt="Write a pure JavaScript ES module function advanceAlongPath(points,distance), where points are finite local meter [x,y] points on an actual street polyline. Return {x,y,heading,length,finished} at clamped distance with heading radians clockwise from north. Skip zero-length consecutive segments, reject malformed/degenerate paths and nonfinite/negative distance with TypeError, at exact endpoint retain last segment heading. No randomness, imports, network or side effects. Include small meaningful node:test tests for a right-angle polyline, duplicates and endpoint. This is a route-sampling helper only, not complete traffic AI. Return code only.";
const model='qwen3-coder:30b',prefix='artifacts/local-agent/district-route';
await mkdir('artifacts/local-agent',{recursive:true});
await writeFile(`${prefix}-request.json`,JSON.stringify({model,prompt},null,2));
const start=Date.now();const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(600000),body:JSON.stringify({model,stream:true,keep_alive:0,messages:[{role:'user',content:prompt}],options:{temperature:0,num_ctx:8192,num_predict:2200,num_gpu:0,num_thread:8}})});
if(!r.ok)throw new Error(`Ollama HTTP ${r.status}`);let pending='',code='',last={};const decoder=new TextDecoder();
for await(const bytes of r.body){pending+=decoder.decode(bytes,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(!line)continue;const chunk=JSON.parse(line);if(chunk.error)throw new Error(chunk.error);code+=chunk.message?.content??'';if(chunk.done)last=chunk;}}
await writeFile(`${prefix}-candidate.txt`,code);await writeFile(`${prefix}-result.json`,JSON.stringify({...last,message:undefined,seconds:(Date.now()-start)/1000},null,2));
console.log(JSON.stringify({candidate:`${prefix}-candidate.txt`,complete:last.done,reason:last.done_reason,tokens:last.eval_count,seconds:(Date.now()-start)/1000}));
