// Tests de la configuration JSON (12 tables + éditeur maison) et des 12 compositions musicales longues.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const memoryStore = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => {
    memoryStore.set(k, String(v));
  },
  removeItem: (k) => {
    memoryStore.delete(k);
  },
};

let BUILTIN_THEME_IDS;
let BUILTIN_TABLES;
let PINBALL_TABLES;
let checkAkaFirmwareCompatibility;
let createNewCustomTable;
let saveTableDefinition;
let serializeTableToJson;
let importTablesJson;
let resetAllTableDefinitions;
let evaluateMusicStep;
let MUSIC_THEME_META;

before(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aka-pinball-cfg-test-'));
  const outfile = path.join(outDir, 'bundle.mjs');
  const entry = path.join(outDir, 'entry.ts');
  fs.writeFileSync(
    entry,
    [
      `export { BUILTIN_THEME_IDS } from ${JSON.stringify(path.join(root, 'src/types/pinball.ts'))};`,
      `export { BUILTIN_TABLES, PINBALL_TABLES, checkAkaFirmwareCompatibility, createNewCustomTable, saveTableDefinition, serializeTableToJson, importTablesJson, resetAllTableDefinitions } from ${JSON.stringify(path.join(root, 'src/data/tables.ts'))};`,
      `export { evaluateMusicStep, MUSIC_THEME_META } from ${JSON.stringify(path.join(root, 'src/audio/musicEngine.ts'))};`,
    ].join('\n')
  );
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
    logLevel: 'error',
  });
  ({
    BUILTIN_THEME_IDS,
    BUILTIN_TABLES,
    PINBALL_TABLES,
    checkAkaFirmwareCompatibility,
    createNewCustomTable,
    saveTableDefinition,
    serializeTableToJson,
    importTablesJson,
    resetAllTableDefinitions,
    evaluateMusicStep,
    MUSIC_THEME_META,
  } = await import(pathToFileURL(outfile).href));
});

test('tables.config.json : les 12 tables officielles sont valides et 100 % compatibles firmware AKA', () => {
  const rawConfig = JSON.parse(
    fs.readFileSync(path.join(root, 'src/data/tables.config.json'), 'utf8')
  );
  assert.equal(rawConfig.tables.length, 12);
  assert.equal(BUILTIN_TABLES.length, 12);

  const distinctIconSets = new Set();
  for (const tbl of BUILTIN_TABLES) {
    const issues = checkAkaFirmwareCompatibility(tbl);
    assert.deepEqual(issues, [], `Incompatibilité AKA sur ${tbl.id}: ${issues.join(', ')}`);
    assert.equal(tbl.missions.length, 3);
    distinctIconSets.add(tbl.bumpers.map((b) => b.iconStyle).join('+'));
  }
  assert.ok(distinctIconSets.size >= 10, 'Les plateaux doivent avoir des icônes de bumpers spécialisées');
});

test('éditeur de tables maison : création, modification, export/import JSON et remise à zéro', () => {
  resetAllTableDefinitions();
  assert.equal(PINBALL_TABLES.length, 12);

  const custom = createNewCustomTable('farwest', 'Canyon Express Maison');
  assert.equal(PINBALL_TABLES.length, 13);
  assert.equal(custom.decorTheme, 'farwest');
  assert.equal(custom.musicTheme, 'farwest');

  custom.musicTheme = 'train';
  custom.bumpers[0].iconStyle = 'SHERIFF';
  saveTableDefinition(custom);

  const exportedJson = serializeTableToJson(custom.id);
  resetAllTableDefinitions();
  assert.equal(PINBALL_TABLES.length, 12);

  const imported = importTablesJson(exportedJson);
  assert.equal(imported.count, 1);
  assert.equal(PINBALL_TABLES.length, 13);
  const reloaded = PINBALL_TABLES.find((t) => t.id === custom.id);
  assert.ok(reloaded);
  assert.equal(reloaded.name, 'Canyon Express Maison');
  assert.equal(reloaded.musicTheme, 'train');
  assert.equal(reloaded.bumpers[0].iconStyle, 'SHERIFF');

  resetAllTableDefinitions();
  assert.equal(PINBALL_TABLES.length, 12);
});

test('musicEngine : 12 bandes-son uniques, sans blanc mort initial, longues (512 pas) et évolutives', () => {
  assert.equal(BUILTIN_THEME_IDS.length, 12);
  const signatures = new Set();

  for (const themeId of BUILTIN_THEME_IDS) {
    assert.ok(MUSIC_THEME_META[themeId], `Métadonnées manquantes pour ${themeId}`);

    // 1. Aucune ouverture muette : au moins une note mélodique dès la première demi-mesure (pas 0..7)
    let openingLeadNotes = 0;
    for (let s = 0; s < 8; s++) {
      const ev = evaluateMusicStep(themeId, s, false, false);
      if (ev.leadMidi !== null) openingLeadNotes++;
    }
    assert.ok(openingLeadNotes >= 1, `Silence d'ouverture excessif sur le thème ${themeId}`);

    // 2. Richesse sur les 8 sections (512 pas = 32 mesures) et unicité de la mélodie
    const cycle0Notes = [];
    for (let s = 0; s < 512; s++) {
      const ev = evaluateMusicStep(themeId, s, false, false);
      cycle0Notes.push(ev.leadMidi ?? -1);
    }
    const activeLeadCount = cycle0Notes.filter((n) => n > 0).length;
    assert.ok(
      activeLeadCount >= 90,
      `La partition de ${themeId} est trop clairsemée (${activeLeadCount} attaques sur 512 pas)`
    );

    const sig = cycle0Notes.slice(0, 128).join(',');
    assert.ok(!signatures.has(sig), `La mélodie de ${themeId} duplique un autre thème !`);
    signatures.add(sig);

    // 3. Variations multi-cycles entre le cycle 0 (pas 0..511) et le cycle 1 (pas 512..1023)
    let diffCount = 0;
    for (let s = 0; s < 512; s++) {
      const c0 = evaluateMusicStep(themeId, s, false, false);
      const c1 = evaluateMusicStep(themeId, s + 512, false, false);
      if (
        c0.leadMidi !== c1.leadMidi ||
        c0.arpMidi !== c1.arpMidi ||
        c0.harmonyMidi !== c1.harmonyMidi ||
        c0.leadTimbre !== c1.leadTimbre
      ) {
        diffCount++;
      }
    }
    assert.ok(
      diffCount >= 64,
      `Variations multi-cycles insuffisantes sur ${themeId} (${diffCount} différences)`
    );
  }

  // Star Wars doit conserver un tempo symphonique majestueux et posé (non précipité)
  assert.ok(
    MUSIC_THEME_META.star_galaxy.bpm <= 95,
    `Star Wars joué trop vite sur Web (${MUSIC_THEME_META.star_galaxy.bpm} BPM)`
  );
  const swStep = evaluateMusicStep('star_galaxy', 0, false, false);
  assert.ok(
    swStep.stepDurationSec >= 0.16,
    `Pas rythmique Star Wars trop court (${swStep.stepDurationSec}s)`
  );
});

test('firmware AKA music.cpp : 12 thèmes valides (6×32 pas), denses, périodiques et dans les bornes matérielles', () => {
  const cpp = fs.readFileSync(
    path.join(root, 'firmware/aka_idf/main/game/music.cpp'),
    'utf8'
  );
  const themeHeaderRe =
    /\{\s*([0-9.]+)f\s*,\s*(\d+)\s*,\s*(WAVE_[A-Z]+)\s*,\s*(WAVE_[A-Z]+)\s*,\s*([0-9.]+)f\s*,\s*([0-9.]+)f\s*,\s*\{(\s*\{[\s\S]*?\})\s*\}\s*\}/g;
  const orderMatch = cpp.match(/ORDER\[PHRASE_SLOTS\]\s*=\s*\{([^}]+)\}/);
  assert.ok(orderMatch, 'Tableau ORDER[PHRASE_SLOTS] introuvable dans music.cpp');
  const order = orderMatch[1]
    .trim()
    .split(/\s*,\s*/)
    .filter(Boolean)
    .map(Number);
  assert.equal(order.length, 24);

  const themes = [];
  let m;
  while ((m = themeHeaderRe.exec(cpp)) !== null) {
    const rootHz = Number(m[1]);
    const stepMs = Number(m[2]);
    const vol = Number(m[5]);
    const altVol = Number(m[6]);
    const phrasesBlock = m[7];
    const phraseMatches = [...phrasesBlock.matchAll(/\{([^}]+)\}/g)];
    assert.equal(phraseMatches.length, 6, `Chaque thème AKA doit comporter exactement 6 phrases`);
    const ph = phraseMatches.map((pm, idx) => {
      const steps = pm[1]
        .trim()
        .split(/\s*,\s*/)
        .filter(Boolean)
        .map((tok) => (tok === 'R' ? 99 : Number(tok)));
      assert.equal(steps.length, 32, `Phrase ${idx} ne fait pas 32 pas (${steps.length})`);
      return steps;
    });
    themes.push({ rootHz, stepMs, vol, altVol, ph });
  }

  assert.equal(themes.length, 12, 'music.cpp doit définir exactement 12 thèmes');

  const MUSIC_STEPS = 768;
  const akaSigs = new Set();
  themes.forEach((t, decor) => {
    assert.ok(t.vol > 0 && t.vol <= 0.5, `decor ${decor}: vol hors plage (${t.vol})`);
    assert.ok(t.altVol > 0 && t.altVol <= 0.5, `decor ${decor}: altVol hors plage (${t.altVol})`);
    assert.notEqual(t.ph[order[0]][0], 99, `decor ${decor}: le pas 0 ne doit pas être un silence`);

    let notes = 0;
    for (let st = 0; st < MUSIC_STEPS * 2; st++) {
      const pos = st % MUSIC_STEPS;
      const phraseId = order[Math.floor(pos / 32)];
      const s = (t.ph[phraseId] ?? t.ph[phraseId - 4])[pos % 32];
      if (s === 99) continue;
      notes++;
      let freq = t.rootHz * Math.pow(2, s / 12);
      if (freq > 1950) freq *= 0.5;
      if (freq < 85) freq *= 2.0;
      assert.ok(freq >= 80 && freq <= 2000, `decor ${decor}: fréquence hors bornes (${freq})`);
    }
    assert.ok(
      notes >= Math.floor((MUSIC_STEPS * 2) / 3),
      `decor ${decor}: boucle AKA trop vide (${notes} notes sur 1536 pas)`
    );

    const sig = t.ph[0].join(',');
    assert.ok(!akaSigs.has(sig), `decor ${decor}: phrase A dupliquée dans music.cpp`);
    akaSigs.add(sig);
  });

  // Star Wars (decor 2) sur console AKA doit également avoir un pas ample et solennel
  assert.ok(
    themes[2].stepMs >= 175,
    `Star Wars joué trop vite sur AKA (stepMs=${themes[2].stepMs} ms)`
  );
});

