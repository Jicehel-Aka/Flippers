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
fs.writeFileSync(entry, `export { PINBALL_TABLES } from ${JSON.stringify(path.join(root, 'src/data/tables.ts'))};\nexport { buildRampSpline, buildVukTubeSpline } from ${JSON.stringify(path.join(root, 'src/engine/rampSpline.ts'))};\n`);
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
const { PINBALL_TABLES, buildRampSpline, buildVukTubeSpline } = await import(pathToFileURL(bundle).href);

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
const hex = (c) => '0x' + c.replace('#', '').slice(0, 6).toUpperCase().padStart(6, '0');
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
  PURPLE: ['0x7C3AED', '0xDDD6FE'],
  ORANGE: ['0xEA580C', '0xFED7AA'],
  PINK: ['0xDB2777', '0xFBCFE8'],
  ICE: ['0x0284C7', '0xBAE6FD'],
};
// Lettre de rollover affichable avec la police 8x8 ASCII du SDK
const ROLL_CHAR = { '★': '*', '☀': '*', '◆': '+', '◄': '<', '►': '>', '!': '!' };
const rollChar = (l) => ROLL_CHAR[l] ?? (/^[A-Za-z0-9]$/.test(l) ? l.toUpperCase() : '*');
const MISSION_KIND = { BUMPER: 0, RAMP: 1, TARGET: 2, SCOOP: 2 };
const DECOR = { aka_esp32: 0, space_odyssey: 1, star_galaxy: 2, solaire: 3, classique: 4, prehistoire: 5, farwest: 6, halloween: 7, candy: 8, bonbons: 9, train: 10, crypte: 11 };

const RAMP_PTS = 16;
// Echantillonne la spline REELLE du decor (meme courbe que la bille suit cote Web) en RAMP_PTS points a pas egal.
function sampleSpline(spline) {
  const sm = spline.samples;
  const out = [];
  for (let k = 0; k < RAMP_PTS; k++) {
    const d = (spline.totalLen * k) / (RAMP_PTS - 1);
    let i = 0;
    while (i < sm.length - 2 && sm[i + 1].dist < d) i++;
    const seg = sm[i + 1].dist - sm[i].dist;
    const u = seg > 0 ? Math.max(0, Math.min(1, (d - sm[i].dist) / seg)) : 0;
    out.push({ x: sm[i].x + (sm[i + 1].x - sm[i].x) * u, y: sm[i].y + (sm[i + 1].y - sm[i].y) * u });
  }
  return out;
}
const resampleRamp = (path) => sampleSpline(buildRampSpline(path, 9, false));

const ROLE = { MULTIPLIER: 0, MULTIBALL: 1, KICKBACK: 2, JACKPOT_BOOST: 3 };
const TOY_KIND = { BASH_TOY: 0, SWING_DOORS: 1, TURNTABLE: 2, GRAVITY_WELL: 3, SLIDING_CRYPT: 4, ROTO_TARGET: 5 };
const TOY_VISUAL = ['ESP32_CHIP', 'SATURN_RING', 'DEATH_STAR_CORE', 'SUN_WHEEL', 'EM_ROTO_BELL', 'VOLCANO', 'SALOON_DOORS', 'PUMPKIN_KING', 'RIBBON_VORTEX', 'LOLLIPOP_WHEEL', 'RAIL_TURNTABLE', 'SARCOPHAGUS'];
const padList = (items, n, empty) => {
  const a = items.slice();
  while (a.length < n) a.push(empty);
  return a;
};
const targetC = (tg, bank) =>
  `{${f(tg.x1)}, ${f(tg.y1)}, ${f(tg.x2)}, ${f(tg.y2)}, '${rollChar(tg.letter)}', ${bank}, ${ROLE[tg.bankRole] ?? 0}, ${tg.kind === 'DROP'}, ${tg.points}, ${hex(tg.lampColor)}}`;
const EMPTY_TARGET = "{0, 0, 0, 0, ' ', 0, 0, false, 0, 0}";
const EMPTY_BUMPER = '{0, 0, 0, 0, 0, 0, ""}';
const EMPTY_ROLL = "{0, 0, 0, ' ', 0, 0}";
// Conduit aerien du VUK : meme courbe que buildVukTubeSpline (arche vers le haut/centre), rechantillonnee sur 5 points.
function vukTube(from, to) {
  const mx = (from.x + to.x) * 0.5, my = (from.y + to.y) * 0.5;
  const dx = to.x - from.x, dy = to.y - from.y;
  const chord = Math.hypot(dx, dy) || 1;
  const archSign = mx <= 113 ? 1 : -1;
  const ctrl = {
    x: Math.max(24, Math.min(200, mx + (-dy / chord) * Math.min(28, chord * 0.22) * archSign)),
    y: Math.max(36, Math.min(448, my + -Math.min(24, chord * 0.16))),
  };
  return sampleSpline(buildVukTubeSpline(from, to));
}

let o = '';
o += '// GENERE par scripts/gen-aka-tables.mjs depuis src/data/tables.ts : NE PAS EDITER A LA MAIN.\n';
o += '// Regenerer avec : node scripts/gen-aka-tables.mjs\n';
o += 'static const TableDef TABLES[TABLE_COUNT] = {\n';
for (const t of PINBALL_TABLES) {
  const p = t.palette;
  const akaExtraFlippers = t.extraFlippers;
  if (t.bumpers.length > 6) throw new Error(`${t.id}: plus de 6 bumpers`);
  if (akaExtraFlippers.length > 2) throw new Error(`${t.id}: plus de 2 flippers supplementaires`);
  if (t.ramps.length < 2) throw new Error(`${t.id}: moins de 2 rampes`);
  const lock = t.scoops.find((s) => s.kind === 'UPPER_LOCK');
  if (!lock) throw new Error(`${t.id}: pas de verrou multibille`);
  if (t.missions.length !== 3) throw new Error(`${t.id}: 3 missions attendues`);

  o += '  {\n';
  o += `    ${cstr(t.name)}, ${cstr(t.subtitle)}, ${cstr(t.multiballName)}, ${DECOR[t.decorTheme ?? t.id] ?? 0},\n`;
  o += `    ${hex(p.bgPrimary)}, ${hex(p.bgSecondary)}, ${hex(p.accentWarm)}, ${hex(p.accentPrimary)}, ${hex(p.flipperSkirt)},\n`;
  o += `    ${f(t.gravity)},\n`;
  o += `    ${t.bumpers.length},\n    {\n`;
  for (let i = 0; i < 6; i++) {
    const b = t.bumpers[i];
    if (!b) {
      o += '      {0, 0, 0, 0, 0, 0, ""},\n';
      continue;
    }
    const [fill, rim] = BUMPER_COLORS[b.colorStyle] ?? BUMPER_COLORS.GOLD;
    o += `      {${f(b.x)}, ${f(b.y)}, ${f(b.radius)}, ${fill}, ${rim}, ${b.points}, ${cstr(b.label)}},\n`;
  }
  o += '    },\n';
  o += `    ${akaExtraFlippers.length},\n    {\n`;
  for (let i = 0; i < 2; i++) {
    const e = akaExtraFlippers[i];
    if (!e) {
      o += '      {false, 0, 0, 0, 0, 0},\n';
      continue;
    }
    o += `      {${e.side === 'LEFT'}, ${f(e.pivot.x)}, ${f(e.pivot.y)}, ${f(e.length)}, ${deg(e.restAngle)}, ${deg(e.activeAngle)}},\n`;
  }
  o += '    },\n    {\n';
  for (let i = 0; i < 2; i++) {
    const r = t.ramps[i];
    const pts = resampleRamp(r.path)
      .map((q) => `{${f(q.x)}, ${f(q.y)}}`)
      .join(', ');
    o += `      {{${pts}}, ${r.style === 'WIREFORM_RAIL'}, ${!!(r.exitsToUpperDeck && t.upperPlayfield)}, ${f(r.entryRadius)}, ${hex(r.chuteColor)}, ${r.points}, ${cstr(r.name)}},\n`;
  }
  o += '    },\n';
  // --- ejecteur (VUK) -----------------------------------------------------------
  const vuk = t.scoops.find((sc) => sc.kind !== 'UPPER_LOCK');
  if (vuk) {
    const tube = vukTube({ x: vuk.x, y: vuk.y }, vuk.ejectTo).map((q) => `{${f(q.x)}, ${f(q.y)}}`).join(', ');
    o += `    {true, ${f(vuk.x)}, ${f(vuk.y)}, ${f(vuk.radius)}, {${tube}}, ${f(vuk.ejectVelocity.x)}, ${f(vuk.ejectVelocity.y)}, ${vuk.points}, ${hex(vuk.color)}, ${cstr(vuk.name)}},\n`;
  } else {
    o += `    {false, 0, 0, 0, {${Array(16).fill('{0, 0}').join(', ')}}, 0, 0, 0, 0, ""},\n`;
  }
  // --- cibles du plateau : banques numerotees par ordre d'apparition -----------------
  if (t.targets.length > 8) throw new Error(`${t.id}: plus de 8 cibles`);
  const bankIds = [];
  for (const tg of t.targets) if (!bankIds.includes(tg.bankId)) bankIds.push(tg.bankId);
  if (bankIds.length > 2) throw new Error(`${t.id}: plus de 2 banques de cibles`);
  o += `    ${t.targets.length}, {${padList(t.targets.map((tg) => targetC(tg, bankIds.indexOf(tg.bankId))), 8, EMPTY_TARGET).join(', ')}},\n`;
  // --- spinners, murs et plots supplementaires ----------------------------------
  if (t.spinners.length > 2) throw new Error(`${t.id}: plus de 2 spinners`);
  o += `    ${t.spinners.length}, {${padList(t.spinners.map((sp) => `{${f(sp.x)}, ${f(sp.y)}, ${f(sp.width)}, ${f(sp.angle)}, ${sp.pointsPerSpin}}`), 2, '{0, 0, 0, 0, 0}').join(', ')}},\n`;
  if (t.extraWalls.length > 4) throw new Error(`${t.id}: plus de 4 murs supplementaires`);
  o += `    ${t.extraWalls.length}, {${padList(t.extraWalls.map((w) => `{${f(w.x1)}, ${f(w.y1)}, ${f(w.x2)}, ${f(w.y2)}, ${f(w.restitution ?? 0.45)}}`), 4, '{0, 0, 0, 0, 0}').join(', ')}},\n`;
  if (t.extraPegs.length > 6) throw new Error(`${t.id}: plus de 6 plots supplementaires`);
  o += `    ${t.extraPegs.length}, {${padList(t.extraPegs.map((pg) => `{${f(pg.x)}, ${f(pg.y)}, ${f(pg.radius)}, ${f(pg.restitution ?? 0.55)}}`), 6, '{0, 0, 0, 0}').join(', ')}},\n`;
  // --- jouet interactif ------------------------------------------------------------
  const toy = (t.interactiveToys ?? [])[0];
  if ((t.interactiveToys ?? []).length > 1) throw new Error(`${t.id}: un seul jouet interactif supporte`);
  if (toy) {
    o += `    {true, ${TOY_KIND[toy.kind]}, ${TOY_VISUAL.indexOf(toy.visual)}, ${f(toy.x)}, ${f(toy.y)}, ${f(toy.radius)}, ${toy.points}, ${toy.hitsRequired}, ${toy.rewardPoints}, ${hex(toy.accentColor)}, ${cstr(toy.name)}},\n`;
  } else {
    o += '    {false, 0, 0, 0, 0, 0, 0, 0, 0, 0, ""},\n';
  }
  // --- etage superieur (couche 2) -------------------------------------------------
  const up = t.upperPlayfield;
  if (up) {
    if (up.bounds.length > 6) throw new Error(`${t.id}: etage a plus de 6 sommets`);
    if (up.bumpers.length > 2 || up.targets.length > 3 || up.rollovers.length > 2 || up.flippers.length > 1)
      throw new Error(`${t.id}: etage trop charge pour le firmware`);
    const mask = up.openEdgeIndices.reduce((m, i) => m | (1 << i), 0);
    const bl = padList(up.bounds.map((q) => `{${f(q.x)}, ${f(q.y)}}`), 6, '{0, 0}');
    const ub = up.bumpers.map((b) => {
      const [fill, rim] = BUMPER_COLORS[b.colorStyle] ?? BUMPER_COLORS.GOLD;
      return `{${f(b.x)}, ${f(b.y)}, ${f(b.radius)}, ${fill}, ${rim}, ${b.points}, ${cstr(b.label)}}`;
    });
    const ut = up.targets.map((tg) => targetC(tg, 2));
    const ur = up.rollovers.map((r) => `{${f(r.x)}, ${f(r.y)}, ${f(r.radius)}, '${rollChar(r.letter)}', ${r.points}, 2}`);
    const uf = up.flippers.map((e) => `{${e.side === 'LEFT'}, ${f(e.pivot.x)}, ${f(e.pivot.y)}, ${f(e.length)}, ${deg(e.restAngle)}, ${deg(e.activeAngle)}}`);
    o += `    {true, ${up.bounds.length}, {${bl.join(', ')}}, ${mask}, ${hex(up.fillColor)}, ${hex(up.borderColor)}, ${cstr(up.name)},\n`;
    o += `      ${ub.length}, {${padList(ub, 2, EMPTY_BUMPER).join(', ')}},\n`;
    o += `      ${ut.length}, {${padList(ut, 3, EMPTY_TARGET).join(', ')}},\n`;
    o += `      ${ur.length}, {${padList(ur, 2, EMPTY_ROLL).join(', ')}},\n`;
    o += `      ${uf.length}, {${padList(uf, 1, '{false, 0, 0, 0, 0, 0}').join(', ')}}},\n`;
  } else {
    o += `    {false, 0, {{0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}}, 0, 0, 0, "",\n      0, {${EMPTY_BUMPER}, ${EMPTY_BUMPER}},\n      0, {${EMPTY_TARGET}, ${EMPTY_TARGET}, ${EMPTY_TARGET}},\n      0, {${EMPTY_ROLL}, ${EMPTY_ROLL}},\n      0, {{false, 0, 0, 0, 0, 0}}},\n`;
  }
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
  o += '    },\n';
  const h = t.hunt;
  if (h) {
    if (h.slots.length > 6) throw new Error(`${t.id}: plus de 6 emplacements de cible`);
    const KIND = { WANTED: 1, GHOST: 2, MAMMOTH: 3, LOLLIPOP: 4, LOCOMOTIVE: 5, ZOMBIE: 6 };
    const sl = h.slots.map((q) => `{${f(q.x)}, ${f(q.y)}}`);
    while (sl.length < 6) sl.push('{0, 0}');
    o += `    {${KIND[h.kind]}, ${h.slots.length}, ${h.sequential}, {${sl.join(', ')}}, ${f(h.radius)}, ${h.points}, ${h.goal}, ${h.reward}, ${hex(h.color)}, ${cstr(h.name)}},\n`;
  } else {
    o += '    {0, 0, false, {{0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}}, 0, 0, 0, 0, 0, ""},\n';
  }
  o += `    ${!!t.litBumperRotate}\n  },\n`;
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
