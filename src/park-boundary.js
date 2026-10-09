export function inPark(point, geometry) {
  // Local Ollama candidate, corrected for malformed collections, string
  // coordinates, and islands inside other polygons' holes after review.
  if (!Array.isArray(point) || point.length !== 2 ||
      !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
      point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90)
    return false;

  if (!geometry || !geometry.type) return false;
  
  const [lon, lat] = point;
  let polygons = [];
  
  if (geometry.type === 'Polygon') {
    polygons = [geometry.coordinates];
  } else if (geometry.type === 'MultiPolygon') {
    polygons = geometry.coordinates;
  } else {
    return false;
  }
  
  if(!Array.isArray(polygons)||polygons.length===0)return false;
  // Validate all polygons
  for (const coords of polygons) {
    if (!Array.isArray(coords)||coords.length===0) return false;
    for (const ring of coords) {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      if (!ring.every(p => Array.isArray(p) && p.length === 2 &&
                          Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
                          p[0] >= -180 && p[0] <= 180 &&
                          p[1] >= -90 && p[1] <= 90))
        return false;
      if (ring[0][0] !== ring[ring.length-1][0] || 
          ring[0][1] !== ring[ring.length-1][1])
        return false;
    }
  }
  
  let inside = false;
  for (const coords of polygons) {
    const [exterior, ...holes] = coords;
    if (rayCrossing(lon, lat, exterior)) {
      if (!holes.some(hole => rayCrossing(lon, lat, hole))) {
        inside = true;
      }
    }
  }
  
  return inside;
}

function rayCrossing(lon, lat, ring) {
  let crossings = 0;
  const n = ring.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    
    // Check if point is on the segment
    if (Math.abs((y2 - y1) * (lon-x1) - (x2 - x1) * (lat-y1)) < 1e-10*Math.max(1e-12,Math.hypot(x2-x1,y2-y1)) &&
        Math.min(x1, x2) <= lon && lon <= Math.max(x1, x2) &&
        Math.min(y1, y2) <= lat && lat <= Math.max(y1, y2))
      return true;
    
    // Ray crossing test
    if ((y1 > lat) !== (y2 > lat) &&
        lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1)
      crossings++;
  }
  
  return crossings % 2 === 1;
}
