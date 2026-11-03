#!/usr/bin/env node
/*
  gen-aka-art.mjs — Images de décor du firmware AKA, générées depuis le VRAI moteur de rendu du jeu Web
  (src/engine/renderer.ts, méthode renderTableArtwork : sans flippers, billes ni ressort).

  Sortie : firmware/aka_idf/main/art/art<N>.z (N = ordre de PINBALL_TABLES ; flux deflate brut de l'image décrite ci-dessous)
    - 240 lignes ÉCRAN (la console est tournée de 90°) de 520 pixels RGB565 little-endian ;
    - ligne r = colonne x = 239 - r du plateau, pixels dans l'ordre y = 0..519 ;
    - format pixel = celui du pilote AKA : R sur les bits 0-4, V sur 5-10, B sur 11-15.
  Ainsi, à l'échelle 1, une ligne d'écran se recopie d'un seul memcpy.

  Usage : node scripts/gen-aka-art.mjs [--preview dossier]
  Utilise @napi-rs/canvas en pur Node.js (aucun navigateur externe requis), avec repli Playwright si besoin.
*/
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'firmware/aka_idf/main/art');
const previewIdx = process.argv.indexOf('--preview');
const previewDir = previewIdx > 0 ? process.argv[previewIdx + 1] : null;

fs.mkdirSync(outDir, { recursive: true });
if (previewDir) fs.mkdirSync(previewDir, { recursive: true });

function writeCompressedArt(i, id, rgba) {
  const buf = Buffer.alloc(240 * 520 * 2);
  for (let r = 0; r < 240; r++) {
    const x = 239 - r;
    for (let y = 0; y < 520; y++) {
      const o = (y * 240 + x) * 4;
      const v = (rgba[o] >> 3) | ((rgba[o + 1] >> 2) << 5) | ((rgba[o + 2] >> 3) << 11);
      buf.writeUInt16LE(v, (r * 520 + y) * 2);
    }
  }
  const z = zlib.deflateRawSync(buf, { level: 9 });
  fs.writeFileSync(path.join(outDir, `art${i}.z`), z);
  if (previewDir) {
    const ppm = Buffer.alloc(240 * 520 * 3);
    for (let p = 0; p < 240 * 520; p++) {
      ppm[p * 3] = rgba[p * 4];
      ppm[p * 3 + 1] = rgba[p * 4 + 1];
      ppm[p * 3 + 2] = rgba[p * 4 + 2];
    }
    fs.writeFileSync(
      path.join(previewDir, `art${i}.ppm`),
      Buffer.concat([Buffer.from('P6\n240 520\n255\n'), ppm])
    );
  }
  console.log(`art${i}.z  ${id.padEnd(14)}  ${buf.length} -> ${z.length} octets`);
}

let napiCanvas = null;
try {
  napiCanvas = req('@napi-rs/canvas');
} catch {
  napiCanvas = null;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aka-art-'));

try {
  if (napiCanvas) {
    const { createCanvas, Image, loadImage } = napiCanvas;
    globalThis.Image = Image;
    globalThis.window = globalThis;
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };

    const entry = path.join(tmp, 'node-art-entry.ts');
    const bundle = path.join(tmp, 'node-art-bundle.mjs');
    fs.writeFileSync(
      entry,
      `export { PinballCanvasRenderer } from ${JSON.stringify(path.join(root, 'src/engine/renderer.ts'))};\n` +
        `export { PINBALL_TABLES } from ${JSON.stringify(path.join(root, 'src/data/tables.ts'))};\n`
    );

    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: bundle,
      logLevel: 'error',
      loader: {
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.svg': 'dataurl',
        '.webp': 'dataurl',
      },
    });

    const { PinballCanvasRenderer, PINBALL_TABLES } = await import(pathToFileURL(bundle).href);
    const renderer = new PinballCanvasRenderer();

    // Précharge de façon synchrone/awaitée les illustrations data-URL éventuelles (ex. Temple Solaire)
    for (const t of PINBALL_TABLES) {
      if (t.artworkUrl) {
        const loaded = await loadImage(t.artworkUrl);
        renderer.artImages.set(t.id, loaded);
        if ((t.decorTheme ?? t.id) === 'solaire') {
          renderer.artImages.set('solaire', loaded);
        }
      }
    }

    for (let i = 0; i < PINBALL_TABLES.length; i++) {
      const canvas = createCanvas(240, 520);
      const ctx = canvas.getContext('2d');
      renderer.renderTableArtwork(ctx, PINBALL_TABLES[i].id);
      const rgba = ctx.getImageData(0, 0, 240, 520).data;
      writeCompressedArt(i, PINBALL_TABLES[i].id, rgba);
    }
  } else {
    let pw;
    try {
      pw = req('playwright');
    } catch {
      pw = createRequire(path.join(execSync('npm root -g').toString().trim(), '/'))('playwright');
    }
    const bundle = path.join(tmp, 'bundle.js');
    await build({
      entryPoints: [path.join(root, 'scripts/aka-art-entry.ts')],
      bundle: true,
      format: 'iife',
      outfile: bundle,
      platform: 'browser',
      logLevel: 'error',
      loader: {
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.svg': 'dataurl',
        '.webp': 'dataurl',
      },
    });
    const browser = await pw.chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ path: bundle });
    const ids = await page.evaluate(() => window.__akaArt.ids);
    for (let i = 0; i < ids.length; i++) {
      const rgba = await page.evaluate((n) => window.__akaArt.render(n), i);
      writeCompressedArt(i, ids[i], rgba);
    }
    await browser.close();
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
