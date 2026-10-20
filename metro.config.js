// expo-sqlite on web runs SQLite as WebAssembly in a worker and talks to it through
// SharedArrayBuffer, which browsers only allow on cross-origin-isolated pages.
const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// The isolation headers must be on the HTML document itself. In SDK 58 the dev server's
// HTML is served by Expo's manifest middleware, which runs *before* `server.enhanceMiddleware`,
// so the snippet from the expo-sqlite docs only reaches JS bundles. Instead, add the headers to
// every dev-server response. This only affects local `expo start`; production hosting must send
// the same headers (configured for EAS Hosting via the expo-router plugin in app.json).
const ISOLATION_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
      if (!this.hasHeader(name)) this.setHeader(name, value);
    }
  }
  return writeHead.apply(this, args);
};

module.exports = config;
