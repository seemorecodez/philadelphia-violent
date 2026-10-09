import { Cartesian3, Matrix3, Matrix4 } from 'cesium';

export function wheelLocalMatrix(part,center,spin,steer){
  const transform=Matrix4.fromTranslation(Cartesian3.fromArray(center));
  Matrix4.multiply(transform,Matrix4.fromRotationTranslation(Matrix3.fromRotationY(-steer)),transform);
  Matrix4.multiply(transform,Matrix4.fromRotationTranslation(Matrix3.fromRotationX(spin)),transform);
  Matrix4.multiply(transform,Matrix4.fromTranslation(Cartesian3.negate(Cartesian3.fromArray(center),new Cartesian3())),transform);
  Matrix4.multiply(transform,Matrix4.fromArray(part.originalGlobal),transform);
  return Matrix4.multiply(Matrix4.fromArray(part.parentInverse),transform,new Matrix4());
}
export function createVehicleAnimator(model,rig,getState){
  if(!rig)return null;
  const wheels=rig.map(w=>({...w,spin:0,nodes:w.nodes.map(part=>({...part,node:model.getNode(part.name)}))}));
  if(wheels.some(w=>w.nodes.some(p=>!p.node)))throw new Error('A measured wheel node is missing from the car.');
  return {tick(dt){
    const state=getState();const speed=Number.isFinite(state.speed)?state.speed:0;
    const steer=(Number.isFinite(state.steer)?Math.max(-1,Math.min(1,state.steer)):0)*0.5/(1+Math.abs(speed)/12);
    for(const wheel of wheels){
      wheel.spin=(wheel.spin+speed*Math.max(0,Math.min(dt,0.05))/wheel.radius)%(Math.PI*2);
      for(const part of wheel.nodes)part.node.matrix=wheelLocalMatrix(part,wheel.center,wheel.spin,wheel.front?steer:0);
    }
  }};
}
