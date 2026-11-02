#!/usr/bin/env node
/*
  gen-aka-art.mjs — Images de décor du firmware AKA, générées depuis le VRAI moteur de rendu du jeu Web
  (src/engine/renderer.ts, méthode renderTableArtwork : sans flippers, billes ni ressort).

  Sortie : firmware/aka_idf/main/art/art<N>.bin (N = ordre de PINBALL_TABLES)
    - 240 lignes ECRAN (la console est tournée de 90°) de 520 pixels RGB565 little-endian ;
    - ligne r = colonne x = 239 - r du plateau, pixels dans l'ordre y = 0..519 ;
    - format pixel = celui du pilote AKA : R sur les bits 0-4, V sur 5-10, B sur 11-15.
  Ainsi, à l'échelle 1, une ligne d'écran se recopie d'un seul memcpy.

  Usage : node scripts/gen-aka-art.mjs [--preview dossier]     (Chromium + Playwright requis)
  Les images sont COMMITEES : ce script ne tourne pas en CI (le rendu dépend des polices du navigateur).
*/
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Playwright : local au dépôt, sinon installation globale npm.
const req = createRequire(import.meta.url);
let pw;
try { pw = req('playwright'); }
catch { pw = createRequire(path.join(execSync('npm root -g').toString().trim(), '/'))('playwright'); }
const { chromium } = pw;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'firmware/aka_idf/main/art');
const previewIdx = process.argv.indexOf('--preview');
const previewDir = previewIdx > 0 ? process.argv[previewIdx + 1] : null;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aka-art-'));
const bundle = path.join(tmp, 'bundle.js');
await build({
  entryPoints: [path.join(root, 'scripts/aka-art-entry.ts')],
  bundle: true, format: 'iife', outfile: bundle, platform: 'browser', logLevel: 'error',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
});

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ path: bundle });
const ids = await page.evaluate(() => window.__akaArt.ids);
fs.mkdirSync(outDir, { recursive: true });
if (previewDir) fs.mkdirSync(previewDir, { recursive: true });

for (let i = 0; i < ids.length; i++) {
  const rgba = await page.evaluate((n) => window.__akaArt.render(n), i);
  const buf = Buffer.alloc(240 * 520 * 2);
  for (let r = 0; r < 240; r++) {
    const x = 239 - r;
    for (let y = 0; y < 520; y++) {
      const o = (y * 240 + x) * 4;
      const v = (rgba[o] >> 3) | ((rgba[o + 1] >> 2) << 5) | ((rgba[o + 2] >> 3) << 11);
      buf.writeUInt16LE(v, (r * 520 + y) * 2);
    }
  }
  fs.writeFileSync(path.join(outDir, `art${i}.bin`), buf);
  if (previewDir) {   // portrait RGB brut (PPM) pour contrôle visuel
    const ppm = Buffer.alloc(240 * 520 * 3);
    for (let p = 0; p < 240 * 520; p++) { ppm[p * 3] = rgba[p * 4]; ppm[p * 3 + 1] = rgba[p * 4 + 1]; ppm[p * 3 + 2] = rgba[p * 4 + 2]; }
    fs.writeFileSync(path.join(previewDir, `art${i}.ppm`), Buffer.concat([Buffer.from('P6\n240 520\n255\n'), ppm]));
  }
  console.log(`art${i}.bin  ${ids[i]}  ${buf.length} octets`);
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
