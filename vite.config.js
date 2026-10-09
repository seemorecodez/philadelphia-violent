import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { localCapture } from './scripts/local-capture.mjs';

// Serve Cesium's own version-matched workers/assets locally, including production.
const cesiumRoot = resolve('node_modules/cesium/Build/Cesium');
// AWS public Terrain Tiles has no browser CORS header. Proxy only numeric
// Terrarium tile paths, without credentials, to this one public-data bucket.
const terrainProxy = {
  '^/terrain/[0-9]+/[0-9]+/[0-9]+\\.png$': {
    target: 'https://s3.amazonaws.com', changeOrigin: true,
    rewrite: path => path.replace('/terrain/', '/elevation-tiles-prod/terrarium/'),
  },
};
export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  server: { proxy: terrainProxy, watch: {
    // Unreal import/save temporaries can be exclusively locked on Windows.
    // They are not browser source; watching them crashed the live city preview.
    ignored: ['**/Unreal/**', '**/artifacts/**'],
  } },
  preview: { proxy: terrainProxy },
  plugins: [{
    name: 'local-gameplay-capture',
    configureServer(server) { server.middlewares.use(localCapture(process.cwd())); },
    configurePreviewServer(server) { server.middlewares.use(localCapture(process.cwd())); },
  },{
    name: 'cesium-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/cesium/')) {
          req.url = req.url.replace('/cesium/', '/node_modules/cesium/Build/Cesium/');
        }
        next();
      });
    },
    closeBundle() {
      if (!existsSync(cesiumRoot)) throw new Error('Cesium assets are missing. Run npm install.');
      for (const name of ['Workers', 'Assets', 'Widgets', 'ThirdParty']) {
        cpSync(resolve(cesiumRoot, name), resolve('dist/cesium', name), { recursive: true });
      }
    },
  }],
  build: { chunkSizeWarningLimit: 1700 },
});
