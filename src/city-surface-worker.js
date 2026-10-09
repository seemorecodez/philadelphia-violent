import {fetchCitySurfaceCell} from './city-surface-cell.js';
const jobs=new Map();
self.onmessage=async({data})=>{
  if(data.cancel){jobs.get(data.id)?.abort();return;}
  const abort=new AbortController();jobs.set(data.id,abort);
  const timer=setTimeout(()=>abort.abort(),60000);
  try{const cell=await fetchCitySurfaceCell(data.x,data.y,{signal:abort.signal});self.postMessage({id:data.id,cell});}
  catch(error){self.postMessage({id:data.id,error:error.message});}
  finally{clearTimeout(timer);jobs.delete(data.id);}
};
