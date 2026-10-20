#!/usr/bin/env node
// Generates every app icon PNG from assets/icon/icon-budgup.svg using headless Chrome.
// Run after changing the SVG:  npm run icons
// Needs Google Chrome; set CHROME_PATH if it isn't in the default macOS location.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(ROOT, 'assets/icon');
const SOURCE = readFileSync(join(ICON_DIR, 'icon-budgup.svg'), 'utf8');

/** Background colour of the source icon; also used for the Android adaptive background and splash. */
export const BACKGROUND = '#12261d';
const GOLD = '#eecb4b';

// The source is a 1024x1024 square: a full-bleed background <rect> followed by the artwork.
const inner = SOURCE.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const artwork = inner.replace(/<rect width="1024" height="1024"[^>]*\/>/, '');
if (artwork === inner) throw new Error('Expected a full-size background <rect> as the first element of the SVG');

// Visible bounds of the artwork in the 1024 canvas (wallet, depth layer and clasp incl. stroke).
const BOUNDS = { x: 195, y: 215, w: 665, h: 632 };

/** A square viewBox centred on `b`, with `pad` units of margin. */
function squareAround(b, pad) {
  const side = Math.max(b.w, b.h) + pad * 2;
  return `${b.x - (side - b.w) / 2} ${b.y - (side - b.h) / 2} ${side} ${side}`;
}

const svg = (body, { size = 1024, viewBox = '0 0 1024 1024' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${body}</svg>`;

/** Artwork scaled about its own centre and placed at the canvas centre. */
function centred(body, scale) {
  const cx = BOUNDS.x + BOUNDS.w / 2;
  const cy = BOUNDS.y + BOUNDS.h / 2;
  return `<g transform="translate(512 512) scale(${scale}) translate(${-cx} ${-cy})">${body}</g>`;
}

// Android adaptive icons are 108dp; launchers mask them to shapes as small as a 66dp circle.
// 0.7 keeps the wallet's rounded corners inside that circle.
const ADAPTIVE_SCALE = 0.7;

// Single-colour silhouette for Android 13+ themed icons: wallet opaque, gold "B" and the dark
// outlines cut out. Only alpha matters, so it's built as a luminance mask.
const monochromeBody = (() => {
  const masked = artwork
    .replaceAll(`fill="${GOLD}"`, 'fill="black"')
    .replaceAll(`stroke="${BACKGROUND}"`, 'stroke="black"')
    .replaceAll('stroke="#3b6a4a"', 'stroke="black"')
    .replace(/fill="#(?!000)[0-9a-f]{6}"/gi, 'fill="white"');
  return `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${masked}</mask></defs>
    <rect width="1024" height="1024" fill="white" mask="url(#m)"/>`;
})();

const OUTPUTS = [
  // iOS app icon and the default for every platform: full square, opaque.
  { file: 'icon.png', size: 1024, svg: SOURCE },
  // Android adaptive icon foreground, transparent; the background is a solid colour in app.json.
  { file: 'adaptive-foreground.png', size: 1024, svg: svg(centred(artwork, ADAPTIVE_SCALE)) },
  { file: 'adaptive-monochrome.png', size: 1024, svg: svg(centred(monochromeBody, ADAPTIVE_SCALE)) },
  // Splash screen artwork, cropped to the wallet; shown on the BACKGROUND colour.
  {
    file: 'splash.png',
    size: 1024,
    svg: svg(artwork, { viewBox: squareAround(BOUNDS, 24) }),
  },
  // Browser tab icon.
  { file: 'favicon.png', size: 196, svg: SOURCE },
];

async function main() {
  const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const profile = mkdtempSync(join(tmpdir(), 'icons-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: 'ignore',
  });
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!targets) throw new Error(`Couldn't start Chrome at ${chromePath} (set CHROME_PATH)`);
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (pending.has(msg.id)) pending.get(msg.id)(msg);
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: n, method, params }));
      });

    await send('Page.enable');
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const out of OUTPUTS) {
      const sized = out.svg.replace(/<svg([^>]*?)width="\d+" height="\d+"/, `<svg$1width="${out.size}" height="${out.size}"`);
      const html = `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`;
      await send('Emulation.setDeviceMetricsOverride', { width: out.size, height: out.size, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: out.size, height: out.size, scale: 1 },
      });
      writeFileSync(join(ICON_DIR, out.file), Buffer.from(data, 'base64'));
      console.log(`assets/icon/${out.file}  ${out.size}x${out.size}`);
    }
    ws.close();
  } finally {
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
