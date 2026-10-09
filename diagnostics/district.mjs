import {Viewer,Cartesian3,Color,GeometryInstance,Primitive,PerInstanceColorAppearance,ColorGeometryInstanceAttribute} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {buildDistrictCell,districtMaterial,createGameDistrict} from '../src/game-district.js';
import {createPublicTerrain} from '../src/public-terrain.js';
const label=document.querySelector('#status');
const viewer=new Viewer('world',{baseLayer:false,animation:false,timeline:false,geocoder:false,homeButton:false,sceneModePicker:false,baseLayerPicker:false,navigationHelpButton:false,fullscreenButton:false,skyBox:false,scene3DOnly:true});
viewer.scene.globe.baseColor=Color.DARKGRAY;
if(new URLSearchParams(location.search).has('controller')){
  if(new URLSearchParams(location.search).has('terrain'))viewer.terrainProvider=await createPublicTerrain();
  const district=createGameDistrict(viewer);await district.setEnabled(true);district.update(-75.15599,39.95493);
  viewer.camera.setView({destination:Cartesian3.fromDegrees(-75.15599,39.95293,320),orientation:{heading:0,pitch:-.9,roll:0}});
  let frames=0;viewer.scene.preUpdate.addEventListener(()=>district.tick(1/30));
  viewer.scene.postRender.addEventListener(()=>{frames++;label.textContent=`Controller frames ${frames} · ${JSON.stringify(district.getStats())}`;});
}else{
const data=await(await fetch('/data/district/cells/3_5.json')).json();
const start=performance.now(),built=buildDistrictCell(data,()=>12);
label.textContent=`Geometry built: ${(performance.now()-start).toFixed(1)}ms, ${built.triangles} triangles. Preparing primitive…`;
const primitive=viewer.scene.primitives.add(new Primitive({geometryInstances:new GeometryInstance({geometry:built.geometry,modelMatrix:built.frame,attributes:{color:ColorGeometryInstanceAttribute.fromColor(Color.GRAY)}}),appearance:new URLSearchParams(location.search).has('material')?districtMaterial():new PerInstanceColorAppearance({flat:true}),asynchronous:false}));
viewer.camera.setView({destination:Cartesian3.fromDegrees(-75.1559,39.9541,210),orientation:{heading:0,pitch:-1.25,roll:0}});
let frames=0;viewer.scene.postRender.addEventListener(()=>{frames++;label.textContent=`Isolated cell: ${built.triangles} triangles · ready ${primitive.ready} · ${frames} rendered frames`;});
viewer.scene.renderError.addEventListener((s,e)=>{label.textContent=String(e?.stack??e);});
}
