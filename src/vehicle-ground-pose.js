import { Cartesian3, Cartographic, Matrix4, Transforms } from 'cesium';

const finite = Number.isFinite;

/**
 * Fit a visual support plane to nine currently loaded terrain heights across
 * the measured body footprint. This is terrain alignment, not suspension or
 * surveyed wheel contact. No terrain, discontinuous terrain, or excessive slope
 * returns null; the caller decides how to retain its previous valid pose.
 *
 * Model axes: X forward, Y left, Z up. state.heading is clockwise from north.
 * Apply pitch/roll with Cesium heading=state.heading-Math.PI/2. Returned height
 * is absolute in the input height datum; verticalOffset is relative to the
 * returned centerHeight, not an older state.height. Display clearance is left
 * to the caller. Terrain fetching and the sampling schedule remain external.
 */
export function fitVehicleGroundPose(state, vehicle, getHeight, {
  maxSlope = Math.PI / 6, maxResidual = 0.2,
} = {}) {
  if (!state || !vehicle || typeof getHeight !== 'function'
      || ![state.longitude, state.latitude, state.heading, vehicle.length, vehicle.width, maxSlope, maxResidual].every(finite)
      || Math.abs(state.longitude)>180 || Math.abs(state.latitude)>=85
      || vehicle.length<=0 || vehicle.length>50 || vehicle.width<=0 || vehicle.width>20
      || maxSlope<=0 || maxSlope>=Math.PI/2 || maxResidual<0) return null;

  try {
    const centerHeight=getHeight(state.longitude,state.latitude);
    if (!finite(centerHeight)) return null;
    const origin=Cartesian3.fromDegrees(state.longitude,state.latitude,centerHeight);
    const frame=Transforms.eastNorthUpToFixedFrame(origin);
    const inverse=Matrix4.inverseTransformation(frame,new Matrix4());
    const forwardEast=Math.sin(state.heading);const forwardNorth=Math.cos(state.heading);
    const leftEast=-forwardNorth;const leftNorth=forwardEast;
    const samples=[];
    for (const forward of [-vehicle.length/2,0,vehicle.length/2]) {
      for (const left of [-vehicle.width/2,0,vehicle.width/2]) {
        if (forward===0 && left===0) { samples.push({forward:0,left:0,height:0}); continue; }
        const target=Matrix4.multiplyByPoint(frame,new Cartesian3(
          forwardEast*forward+leftEast*left,forwardNorth*forward+leftNorth*left,0,
        ),new Cartesian3());
        const geographic=Cartographic.fromCartesian(target);
        const longitude=geographic.longitude*180/Math.PI;const latitude=geographic.latitude*180/Math.PI;
        const height=getHeight(longitude,latitude);
        if (!finite(height)) return null;
        const observed=Matrix4.multiplyByPoint(inverse,Cartesian3.fromDegrees(longitude,latitude,height),new Cartesian3());
        samples.push({forward:observed.x*forwardEast+observed.y*forwardNorth,
          left:observed.x*leftEast+observed.y*leftNorth,height:observed.z});
      }
    }

    // Least-squares plane z=a*forward+b*left+c in the local tangent frame.
    // Using observed Cartesian positions includes geodetic curvature and avoids
    // confusing longitude/latitude angular distances with measured dimensions.
    const mean=samples.reduce((sum,p)=>({forward:sum.forward+p.forward,left:sum.left+p.left,height:sum.height+p.height}),{forward:0,left:0,height:0});
    for (const key of Object.keys(mean)) mean[key]/=samples.length;
    let ff=0;let ll=0;let fl=0;let fz=0;let lz=0;
    for (const p of samples) {
      const f=p.forward-mean.forward;const l=p.left-mean.left;const z=p.height-mean.height;
      ff+=f*f;ll+=l*l;fl+=f*l;fz+=f*z;lz+=l*z;
    }
    const determinant=ff*ll-fl*fl;
    if (!finite(determinant) || determinant<=1e-12) return null;
    const a=(fz*ll-lz*fl)/determinant;const b=(lz*ff-fz*fl)/determinant;
    const intercept=mean.height-a*mean.forward-b*mean.left;
    const slope=Math.atan(Math.hypot(a,b));
    if (!finite(slope) || slope>maxSlope) return null;
    let residual=0;let lift=0;
    for (const p of samples) {
      const difference=p.height-(a*p.forward+b*p.left+intercept);
      residual=Math.max(residual,Math.abs(difference));lift=Math.max(lift,difference);
    }
    if (residual>maxResidual+1e-6) return null;
    // Lift only by the observed positive residual, keeping the fitted footprint
    // above sampled bumps without inventing a constant flat base elevation.
    const verticalOffset=intercept+lift;
    const pitch=Math.atan(a);
    // Cesium Quaternion.fromHeadingPitchRoll composes Ry(-pitch)*Rx(roll).
    // Its combined tilt needs this coupling to align the actual model normal.
    const roll=Math.atan(b*Math.cos(pitch));
    return {pitch,roll,height:centerHeight+verticalOffset,verticalOffset,centerHeight,
      maxResidual:residual,slope,sampleCount:samples.length};
  } catch {
    // A provider may reject a location while tiles change. It cannot produce a
    // partially sampled orientation or a made-up replacement ground height.
    return null;
  }
}
