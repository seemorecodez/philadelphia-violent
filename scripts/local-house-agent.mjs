// Local coding assignment. Candidate output is saved for inspection, never executed here.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const model = 'qwen3-coder:30b';
const tags = await fetch('http://127.0.0.1:11434/api/tags').then(r => r.json());
const installed = tags.models.find(m => m.name === model);
if (!installed) throw new Error('Installed model required; no download.');
let prompt = `Write a small dependency-free JavaScript ES module for individualized Philadelphia houses.
Export houseProfile(id,height,reference). reference is an explicitly supplied object {id,wall:[r,g,b],trim:[r,g,b],roof:[r,g,b]} with RGB values 0..1 observed from local neighborhood reference photos. Never invent a reference, height, footprint, or claim exact reconstruction. Invalid id, nonpositive/nonfinite height, or malformed reference must return null. Valid string or finite numeric IDs accepted, including zero. Stable deterministic integer hash (Math.imul), no Math.random or time. A given id always produces the same profile. Different IDs vary modestly within the supplied reference palette, not psychedelic colors. Output {seed,referenceId,wall,trim,roof,door,floors,windowWidth,windowHeight,baySpacing,corniceDepth}. Floors integer 1..6 from height, floor spacing at least 2.4m (a very low structure can have one floor); windows must fit between floor bands for low heights. Wall variation at most +-0.035 per RGB channel; clamp channels. Trim/roof similar restrained variation. Door dark blue/green/brown individually chosen. Window widths .7..1.1m; baySpacing 1.8..2.8m; corniceDepth .10.. .25m. Less than 100 lines. Return only executable JavaScript (no markdown). This pure function does not generate landmarks or place vegetation; renderer handles real geometry. No imports, network, filesystem, eval, or side effects.`;
await mkdir('artifacts/local-agent/house-generator', { recursive: true });
const repair=process.argv.includes('--repair');
const prefix = `artifacts/local-agent/house-generator/profile${repair?'-repair':''}`;
if(repair)prompt+='\nYour previous candidate below failed review. REPAIR THESE CONCRETE ERRORS: id=0 must succeed; id="building-20" must succeed, do not use isFinite on strings; referenceId MUST equal reference.id, not house ID; validate every RGB array length===3 and every channel Number.isFinite and 0..1, require nonempty string reference.id; seed MUST be unsigned >>>0; vary door by seed among dark green, navy and brown; windowHeight MUST <= height/floors - 0.9 with positive clamp for very low structures. Use integer PRNG (Math.imul), not Math.sin. Return un-fenced JS only.\nPREVIOUS CANDIDATE:\n'+await readFile('artifacts/local-agent/house-generator/profile-candidate.txt','utf8');
await writeFile(`${prefix}-request.json`, JSON.stringify({model,digest:installed.digest,prompt},null,2));
console.log(`Local coding agent started: ${model}`);
const start = Date.now();
const response = await fetch('http://127.0.0.1:11434/api/chat', {
  method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(1200000),
  body:JSON.stringify({model,stream:true,keep_alive:0,messages:[{role:'user',content:prompt}],
    options:{temperature:0.15,num_ctx:8192,num_predict:2400,num_gpu:0,num_thread:8}}),
});
if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
let buffer='',output='',result={}; const decoder=new TextDecoder();
for await (const bytes of response.body) {
  buffer+=decoder.decode(bytes,{stream:true}); let end;
  while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;
    const chunk=JSON.parse(line);if(chunk.error)throw new Error(chunk.error);
    output+=chunk.message?.content??'';if(chunk.done)result=chunk;
  }
}
if(buffer.trim()){const chunk=JSON.parse(buffer);output+=chunk.message?.content??'';if(chunk.done)result=chunk;}
await writeFile(`${prefix}-candidate.txt`,output);
await writeFile(`${prefix}-result.json`,JSON.stringify({...result,message:undefined,elapsedSeconds:(Date.now()-start)/1000},null,2));
if(!result.done || result.done_reason==='length')throw new Error('Incomplete candidate; do not integrate.');
console.log(JSON.stringify({candidate:`${prefix}-candidate.txt`,elapsedSeconds:(Date.now()-start)/1000,tokens:result.eval_count}));
