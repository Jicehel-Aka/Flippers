// Génère firmware/aka_idf/main/game/tables_data.inc à partir de src/data/tables.ts.
// Une seule source de vérité pour les plateaux : le web et la console AKA lisent les mêmes données.
//   node scripts/gen-aka-tables.mjs            -> réécrit le fichier
//   node scripts/gen-aka-tables.mjs --check    -> échoue si le fichier généré n'est pas à jour (CI)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'firmware/aka_idf/main/game/tables_data.inc');
const check = process.argv.includes('--check');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aka-gen-'));
const bundle = path.join(tmp, 'tables.mjs');
const entry = path.join(tmp, 'entry.ts');
fs.writeFileSync(entry, `export { PINBALL_TABLES } from ${JSON.stringify(path.join(root, 'src/data/tables.ts'))};\n`);
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
  logLevel: 'error',
});
const { PINBALL_TABLES } = await import(pathToFileURL(bundle).href);

// --- helpers -----------------------------------------------------------------
const ascii = (s) =>
  s
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[·•]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, '')
    .toUpperCase();
const cstr = (s) => JSON.stringify(ascii(s));
const hex = (c) => '0x' + c.replace('#', '').toUpperCase().padStart(6, '0');
const f = (n) => {
  const v = Math.round(n * 100) / 100;
  return (Number.isInteger(v) ? v.toFixed(1) : String(v)) + 'f';
};
const deg = (r) => f((r * 180) / Math.PI);

const BUMPER_COLORS = {
  RED: ['0xDC2626', '0xFECACA'],
  BLUE: ['0x2563EB', '0xBFDBFE'],
  GOLD: ['0xEAB308', '0xFEF08A'],
  JADE: ['0x10B981', '0xA7F3D0'],
};
// Lettre de rollover affichable avec la police 8x8 ASCII du SDK
const ROLL_CHAR = { '★': '*', '☀': '*', '◆': '+', '◄': '<', '►': '>', '!': '!' };
const rollChar = (l) => ROLL_CHAR[l] ?? (/^[A-Za-z0-9]$/.test(l) ? l.toUpperCase() : '*');
const MISSION_KIND = { BUMPER: 0, RAMP: 1, TARGET: 2, SCOOP: 2 };
const DECOR = { aka_esp32: 0, space_odyssey: 1, star_galaxy: 2, solaire: 3 };

// Rééchantillonne un chemin de rampe sur exactement 5 points (le moteur embarqué en suit 5).
function resample5(path) {
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    seg.push(d);
    total += d;
  }
  const out = [];
  for (let k = 0; k < 5; k++) {
    let want = (total * k) / 4;
    let i = 0;
    while (i < seg.length - 1 && want > seg[i]) {
      want -= seg[i];
      i++;
    }
    const t = seg[i] > 0 ? Math.min(1, want / seg[i]) : 0;
    out.push({ x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t });
  }
  out[0] = { ...path[0] };
  out[4] = { ...path[path.length - 1] };
  return out;
}

let o = '';
o += '// GENERE par scripts/gen-aka-tables.mjs depuis src/data/tables.ts : NE PAS EDITER A LA MAIN.\n';
o += '// Regenerer avec : node scripts/gen-aka-tables.mjs\n';
o += 'static const TableDef TABLES[TABLE_COUNT] = {\n';
for (const t of PINBALL_TABLES) {
  const p = t.palette;
  if (t.bumpers.length > 6) throw new Error(`${t.id}: plus de 6 bumpers`);
  if (t.extraFlippers.length > 2) throw new Error(`${t.id}: plus de 2 flippers supplementaires`);
  if (t.ramps.length < 2) throw new Error(`${t.id}: moins de 2 rampes`);
  const lock = t.scoops.find((s) => s.kind === 'UPPER_LOCK');
  if (!lock) throw new Error(`${t.id}: pas de verrou multibille`);
  if (t.missions.length !== 3) throw new Error(`${t.id}: 3 missions attendues`);

  o += '  {\n';
  o += `    ${cstr(t.name)}, ${cstr(t.subtitle)}, ${cstr(t.multiballName)}, ${DECOR[t.id] ?? 0},\n`;
  o += `    ${hex(p.bgPrimary)}, ${hex(p.bgSecondary)}, ${hex(p.accentWarm)}, ${hex(p.accentPrimary)}, ${hex(p.flipperSkirt)},\n`;
  o += `    ${f(t.gravity)},\n`;
  o += `    ${t.bumpers.length},\n    {\n`;
  for (let i = 0; i < 6; i++) {
    const b = t.bumpers[i];
    if (!b) {
      o += '      {0, 0, 0, 0, 0, 0, ""},\n';
      continue;
    }
    const [fill, rim] = BUMPER_COLORS[b.colorStyle];
    o += `      {${f(b.x)}, ${f(b.y)}, ${f(b.radius)}, ${fill}, ${rim}, ${b.points}, ${cstr(b.label)}},\n`;
  }
  o += '    },\n';
  o += `    ${t.extraFlippers.length},\n    {\n`;
  for (let i = 0; i < 2; i++) {
    const e = t.extraFlippers[i];
    if (!e) {
      o += '      {false, 0, 0, 0, 0, 0},\n';
      continue;
    }
    o += `      {${e.side === 'LEFT'}, ${f(e.pivot.x)}, ${f(e.pivot.y)}, ${f(e.length)}, ${deg(e.restAngle)}, ${deg(e.activeAngle)}},\n`;
  }
  o += '    },\n    {\n';
  for (let i = 0; i < 2; i++) {
    const r = t.ramps[i];
    const pts = resample5(r.path)
      .map((q) => `{${f(q.x)}, ${f(q.y)}}`)
      .join(', ');
    o += `      {{${pts}}, ${r.style === 'WIREFORM_RAIL'}, ${f(r.entryRadius)}, ${hex(r.chuteColor)}, ${r.points}, ${cstr(r.name)}},\n`;
  }
  o += '    },\n';
  o += `    {${f(lock.x)}, ${f(lock.y)}}, ${f(lock.radius)},\n    {\n`;
  for (const m of t.missions) {
    o += `      {${cstr(m.title)}, ${MISSION_KIND[m.targetKind]}, ${m.goal}, ${m.rewardPoints}, ${hex(m.accentColor)}},\n`;
  }
  o += '    },\n';
  if (t.rollovers.length !== 6) throw new Error(`${t.id}: 6 rollovers attendus (4 haut + 2 retours)`);
  o += `    {${f(t.missionEmblemPos.x)}, ${f(t.missionEmblemPos.y)}},\n    {\n`;
  for (const r of t.rollovers) {
    o += `      {${f(r.x)}, ${f(r.y)}, ${f(r.radius)}, '${rollChar(r.letter)}', ${r.points}, ${r.groupId === 'TOP_LANES' ? 0 : 1}},\n`;
  }
  o += '    },\n';
  if (t.beveledHousings.length > 6) throw new Error(`${t.id}: plus de 6 boitiers`);
  o += `    ${t.beveledHousings.length},\n    {\n`;
  for (let i = 0; i < 6; i++) {
    const h = t.beveledHousings[i];
    if (!h) { o += '      {0, {}},\n'; continue; }
    if (h.points.length > 5) throw new Error(`${t.id}: boitier a plus de 5 points`);
    o += `      {${h.points.length}, {${h.points.map((q) => `{${f(q.x)}, ${f(q.y)}}`).join(', ')}}},\n`;
  }
  o += '    }\n  },\n';
}
o += '};\n';

if (check) {
  const cur = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (cur !== o) {
    console.error('tables_data.inc n\'est pas a jour : lancez `node scripts/gen-aka-tables.mjs` et commitez le resultat.');
    process.exit(1);
  }
  console.log('tables_data.inc a jour.');
} else {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, o);
  console.log('ecrit', path.relative(root, outFile), `(${PINBALL_TABLES.length} tables)`);
}
