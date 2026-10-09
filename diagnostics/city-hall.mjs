import {Viewer,Model,Axis,Cartesian3,Transforms,HeadingPitchRange,Color,JulianDate,ShadowMode,Matrix4,Math as CesiumMath} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
const status=document.querySelector('#status');
const district=new URLSearchParams(location.search).get('asset')==='reading-terminal';
const arch=new URLSearchParams(location.search).get('asset')==='arch-street';
const assetSlug=arch?'arch-street':district?'reading-terminal-block':'city-hall';
if(district){document.title='Reading Terminal source buildings';document.querySelector('h1').textContent='Reading Terminal district';document.querySelector('aside p').textContent='Five retained textured source records in their original arrangement.';document.querySelector('aside a').href=`/models/city/${assetSlug}-original.glb`;}
if(arch){document.title='Arch Street source buildings';document.querySelector('h1').textContent='Arch Street · Philadelphia';document.querySelector('aside p').textContent='Original textured source records along the district’s southern streets.';document.querySelector('aside a').href=`/models/city/${assetSlug}-original.glb`;}
const viewer=new Viewer('world',{baseLayer:false,animation:false,timeline:false,geocoder:false,homeButton:false,sceneModePicker:false,baseLayerPicker:false,navigationHelpButton:false,fullscreenButton:false,skyBox:false,skyAtmosphere:false,scene3DOnly:true,requestRenderMode:true});
viewer.scene.globe.show=false;
viewer.scene.backgroundColor=Color.fromCssColorString('#26323e');
if(viewer.scene.sun)viewer.scene.sun.show=false;
if(viewer.scene.moon)viewer.scene.moon.show=false;
viewer.clock.currentTime=JulianDate.fromIso8601('2026-06-21T17:00:00Z');
viewer.resolutionScale=1;
try{
 const provenance=await fetch(`/models/city/${assetSlug}-original.provenance.json`).then(r=>{if(!r.ok)throw new Error('Source manifest failed');return r.json();});
 const streetReview=arch?await fetch('/models/city/arch-street-review.json').then(r=>{if(!r.ok)throw new Error('Street review location missing');return r.json();}):null;
 viewer.camera.lookAt(Cartesian3.fromDegrees(...provenance.origin),new HeadingPitchRange(-.45,-.28,340));
 const model=await Model.fromGltfAsync({url:`/models/city/${assetSlug}-original.glb`,
  modelMatrix:Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...provenance.origin)),
  upAxis:Axis.Y,forwardAxis:Axis.X,scale:1,minimumPixelSize:0,incrementallyLoadTextures:false,shadows:ShadowMode.DISABLED});
 viewer.scene.primitives.add(model);
 if(arch){
  const detailProof=await fetch('/models/city/arch-street-facade-details.provenance.json').then(r=>{if(!r.ok)throw new Error('Facade detail manifest missing');return r.json();});
  const detail=await Model.fromGltfAsync({url:'/models/city/arch-street-facade-details.glb',modelMatrix:Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...detailProof.origin)),upAxis:Axis.Y,forwardAxis:Axis.X,scale:1,incrementallyLoadTextures:false,shadows:ShadowMode.DISABLED});
  detail.show=false;viewer.scene.primitives.add(detail);
  const toggle=document.createElement('button');toggle.textContent='Show physical façade detail';toggle.onclick=()=>{detail.show=!detail.show;toggle.textContent=detail.show?'Hide physical façade detail':'Show physical façade detail';viewer.scene.requestRender();};document.querySelector('aside').append(toggle);
 }
 const overview=()=>{viewer.camera.lookAt(model.boundingSphere.center,new HeadingPitchRange(district||arch?-.85:-.45,-.38,district?650:arch?500:440));viewer.scene.requestRender();};
 const facade=()=>{
  if(streetReview){
   viewer.camera.lookAtTransform(Matrix4.IDENTITY);
   viewer.camera.setView({destination:Cartesian3.fromDegrees(...streetReview.browserEyeLonLatHeight),orientation:{heading:CesiumMath.toRadians(streetReview.yawDegrees+90),pitch:CesiumMath.toRadians(streetReview.pitchDegrees),roll:0}});
  }else viewer.camera.lookAt(Cartesian3.fromDegrees(district?-75.15915:provenance.origin[0],district?39.95195:39.95218,38),new HeadingPitchRange(-.12,-.1,district?180:120));
  viewer.scene.requestRender();
 };
 const ready=()=>{overview();status.textContent=`${provenance.triangles.toLocaleString()} triangles · ${arch?'four shared original photographic atlases':district?'five original photographic atlases':'two original 4096 × 4096 photo atlases'}`;document.querySelector('#overview').onclick=overview;document.querySelector('#facade').onclick=facade;};
 model.readyEvent.addEventListener(ready);if(model.ready)ready();
 model.errorEvent.addEventListener(error=>{status.textContent=`Model failed: ${error.message}`;});
 viewer.scene.renderError.addEventListener((scene,error)=>{status.textContent=`Rendering failed: ${error.message}`;});
 viewer.scene.requestRender();
}catch(error){status.textContent=`Source could not load: ${error.message}`;}
