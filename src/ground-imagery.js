import { Credit, Rectangle, Resource, SingleTileImageryProvider, UrlTemplateImageryProvider, WebMercatorTilingScheme } from 'cesium';
import { SOURCES } from './sources.js';

// QUARANTINED VISUAL EXPERIMENT: the plain palette fails Frank's requirement
// to preserve photographic city detail. Not imported by the gameplay runtime.

// Draw the municipality's measured plan boundaries. No aerial photos, tree
// symbols, vehicle symbols, labels, or imagined road centerlines are included.
// These colors are authored materials; they do not establish surveyed surfaces.
const fill = color => ({ type: 'esriSFS', style: 'esriSFSSolid', color, outline: null });
const asphalt = [66, 71, 75, 255];
const concrete = [173, 168, 154, 255];
const vegetation = [98, 117, 79, 255];
const water = [53, 86, 99, 255];
const colors = {
  1000: asphalt, 1010: concrete, 1020: asphalt, 1200: asphalt,
  1210: [99, 92, 82, 255], 1220: concrete, 2200: asphalt,
  2210: concrete, 2220: concrete, 2230: concrete, 2240: asphalt,
  2250: concrete, 2260: water, 2300: [120, 105, 85, 255],
  2310: [99, 92, 82, 255], 9999: vegetation,
};

function exportProvider(service, layerId, renderer, credit) {
  const layers = [{
    id: layerId, source: { type: 'mapLayer', mapLayerId: layerId },
    minScale: 0, maxScale: 0,
    drawingInfo: { renderer, showLabels: false, transparency: 0 },
  }];
  const parameters = new URLSearchParams({
    f: 'image', bboxSR: '3857', imageSR: '3857', size: '512,512',
    format: 'png32', transparent: 'true', dpi: '96',
    dynamicLayers: JSON.stringify(layers),
  });
  const provider = new UrlTemplateImageryProvider({
    url: `${service}/export`,
    tilingScheme: new WebMercatorTilingScheme(),
    rectangle: Rectangle.fromDegrees(-75.30, 39.86, -74.94, 40.15),
    minimumLevel: 9, maximumLevel: 20, tileWidth: 512, tileHeight: 512,
    hasAlphaChannel: true, enablePickFeatures: false, credit: new Credit(credit, false),
  });
  // The host rejects the full renderer in a GET URL (~3.6KB). POST the same
  // read-only export, preserving Cesium's request priority/cancellation path.
  provider.requestImage = (x, y, level, request) => {
    const bounds = provider.tilingScheme.tileXYToNativeRectangle(x, y, level);
    const body = new URLSearchParams(parameters);
    body.set('bbox', [bounds.west, bounds.south, bounds.east, bounds.north].join(','));
    const pending = new Resource({ url: `${service}/export`, request }).post(body.toString(), {
      responseType: 'blob', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    // undefined is the provider's throttled/retry-later contract.
    return pending?.then(async blob => {
      if (!blob.type.startsWith('image/') || blob.size > 8 * 1024 * 1024) throw new Error('Ground export did not return a bounded image.');
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
      });
      if (bitmap.width !== 512 || bitmap.height !== 512) { bitmap.close(); throw new Error('Ground tile dimensions do not match.'); }
      return bitmap;
    });
  };
  return provider;
}

export function createGroundImagery() {
  // Water is below pavement so actual mapped bridge footprints remain visible.
  return [
    // Cesium stretches the first imagery layer outside its rectangle. A solid
    // global base prevents it from stretching edge-water or pavement pixels.
    new SingleTileImageryProvider({ url: '/materials/neutral-ground.png', tileWidth: 2, tileHeight: 2 }),
    exportProvider(SOURCES.hydrography, 9, { type: 'simple', symbol: fill(water) },
      'Hydrography: City of Philadelphia / PASDA, 2025'),
    exportProvider(SOURCES.ground, 11, {
      type: 'uniqueValue', field1: 'FCODE', fieldDelimiter: ',',
      defaultSymbol: fill([0, 0, 0, 0]),
      uniqueValueInfos: Object.entries(colors).map(([value, color]) => ({ value, symbol: fill(color) })),
    }, 'Surface boundaries: City of Philadelphia / PASDA; Pictometry Intelligent Images; Intergraph Services Company; Sanborn Mapping Services'),
  ];
}
