// Overhead photos retained in public/data/neighborhoods. Their roof forms and
// spacing inform the interpretation. Facade colors are authored masonry ranges
// guided by the existing local downtown photo atlas, NOT measured aerial colors.
const common={trim:[0.74,0.70,0.61],roof:[0.61,0.60,0.56]};
export const neighborhoodReferences=[
  {...common,id:'south',longitude:-75.1661,latitude:39.9317,wall:[0.48,0.30,0.23],street:{treeSpacing:15,treeScale:1.15,lampSpacing:29,gardenSpacing:18}},
  {...common,id:'west',longitude:-75.2182,latitude:39.9508,wall:[0.43,0.28,0.22],trim:[0.66,0.61,0.51],street:{treeSpacing:10,treeScale:1.55,lampSpacing:27,gardenSpacing:9}},
  {...common,id:'north',longitude:-75.1588,latitude:39.9914,wall:[0.49,0.33,0.26],street:{treeSpacing:13,treeScale:1.35,lampSpacing:30,gardenSpacing:15}},
];
export function nearestNeighborhood(longitude,latitude){
  return neighborhoodReferences.reduce((best,reference)=>{
    const distance=((reference.longitude-longitude)*Math.cos(latitude*Math.PI/180))**2+(reference.latitude-latitude)**2;
    return !best||distance<best.distance?{reference,distance}:best;
  },null).reference;
}
