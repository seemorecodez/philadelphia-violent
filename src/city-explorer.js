// Source labels are data: insert only with textContent, never HTML.
export function createCityExplorer(toolbar,{onVisit}){
  const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent='Find a landmark';toolbar.append(button);
  const panel=document.createElement('div');panel.hidden=true;panel.className='city-explorer';
  const label=document.createElement('label');label.textContent='Search Philadelphia landmarks';
  const search=document.createElement('input');search.type='search';search.placeholder='Art Museum, City Hall, school, park…';search.setAttribute('aria-label','Search Philadelphia landmarks');
  const note=document.createElement('p');note.textContent='Loading the city directory…';
  const results=document.createElement('div');results.className='city-explorer-results';label.append(search);panel.append(label,note,results);toolbar.append(panel);
  let entries=[],loaded=false;
  function draw(){results.replaceChildren();const term=search.value.trim().toLowerCase();
    const found=entries.filter(e=>e.name.toLowerCase().includes(term));
    note.textContent=term?`${found.length} matching places. Detail varies by source.`:'Search named buildings, parks and monuments from the city directory.';
    for(const entry of found.slice(0,30)){const item=document.createElement('button');item.type='button';item.className='quiet';item.textContent=entry.name;
      item.addEventListener('click',()=>{onVisit({...entry,heading:0,street:entry.name});panel.hidden=true;});results.append(item);}
  }
  button.addEventListener('click',async()=>{panel.hidden=!panel.hidden;if(panel.hidden)return;search.focus();if(loaded)return;
    try{const [buildings,points,parks]=await Promise.all(['/data/landmark-buildings.json','/data/landmarks.geojson','/data/parks.geojson'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Directory unavailable');return r.json();}));
      const parkEntries=parks.features.filter(f=>f.properties?.PUBLIC_NAM&&['Polygon','MultiPolygon'].includes(f.geometry?.type)).map(f=>{
        const p=f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2);
        return {id:`park-${f.id}`,name:f.properties.PUBLIC_NAM,longitude:(Math.min(...p.map(p=>p[0]))+Math.max(...p.map(p=>p[0])))/2,latitude:(Math.min(...p.map(p=>p[1]))+Math.max(...p.map(p=>p[1])))/2};});
      entries=[...buildings,...parkEntries,...points.features.filter(f=>f.geometry?.type==='Point'&&f.properties?.NAME).map(f=>({id:`landmark-${f.id}`,name:f.properties.NAME,longitude:f.geometry.coordinates[0],latitude:f.geometry.coordinates[1]}))]
        .filter(e=>Number.isFinite(e.longitude)&&Number.isFinite(e.latitude)).sort((a,b)=>a.name.localeCompare(b.name));loaded=true;draw();
    }catch{note.textContent='The local city directory could not load. Close and open to retry.';}});
  search.addEventListener('input',draw);
}
