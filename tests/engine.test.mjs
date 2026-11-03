// Tests headless du moteur physique (aucune dépendance de test : node:test + esbuild, déjà présent via Vite).
// Lancer : npm test
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let storageWrites = 0;
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {
    storageWrites++;
  },
};

let PinballSimulation;
let PINBALL_TABLES;

before(async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aka-pinball-test-'));
  const outfile = path.join(outDir, 'engine.mjs');
  const entry = path.join(outDir, 'entry.ts');
  fs.writeFileSync(
    entry,
    `export { PinballSimulation } from ${JSON.stringify(path.join(root, 'src/engine/physicsEngine.ts'))};\n` +
      `export { PINBALL_TABLES } from ${JSON.stringify(path.join(root, 'src/data/tables.ts'))};\n`
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
  ({ PinballSimulation, PINBALL_TABLES } = await import(pathToFileURL(outfile).href));
});

const IDLE = () => ({
  leftFlipper: false,
  rightFlipper: false,
  plunger: false,
  nudge: false,
  pauseBtn: false,
  dpadLeft: false,
  dpadRight: false,
  dpadUp: false,
  dpadDown: false,
});

/** Petit bot : tire le plunger puis frappe quand une bille est près des flippers. */
function botControls(sim, ctl, plungeState, dt) {
  ctl.plunger = false;
  ctl.leftFlipper = false;
  ctl.rightFlipper = false;
  const waiting = sim.balls.some((b) => b.inShooterLane && b.y > 430 && Math.abs(b.vy) < 45);
  if (waiting) {
    plungeState.t += dt;
    ctl.plunger = plungeState.t < 0.9;
    if (plungeState.t > 1.0) plungeState.t = 0;
  } else {
    plungeState.t = 0;
  }
  for (const b of sim.balls) {
    if (b.inShooterLane || b.y < 400) continue;
    if (b.x < 113) ctl.leftFlipper = true;
    else ctl.rightFlipper = true;
  }
}

function playBot(tableIndex, seed, seconds, hz = 60) {
  const sim = new PinballSimulation(seed);
  sim.selectedTableIndex = tableIndex;
  sim.syncTableGeometry();
  sim.startNewGame(1);
  const dt = 1 / hz;
  const ctl = IDLE();
  const plunge = { t: 0 };
  let bad = 0;
  let maxStuck = 0;
  const stuck = new Map();
  for (let t = 0; t < seconds && sim.gameState === 'PLAYING'; t += dt) {
    botControls(sim, ctl, plunge, dt);
    sim.step(dt, ctl);
    for (const b of sim.balls) {
      if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) bad++;
      if (b.x < 0 || b.x > 242 || b.y < -5 || b.y > 560) bad++;
      const slow = Math.hypot(b.vx, b.vy) < 6 && !b.inShooterLane && !b.heldInScoopId && b.layer === 0 && b.y < 500;
      const v = slow ? (stuck.get(b.id) ?? 0) + dt : 0;
      stuck.set(b.id, v);
      maxStuck = Math.max(maxStuck, v);
    }
  }
  return { sim, bad, maxStuck };
}

test('stabilité : aucune valeur invalide, bille hors plateau ou bille bloquée (12 tables)', () => {
  for (let ti = 0; ti < PINBALL_TABLES.length; ti++) {
    for (const seed of [11, 22, 33]) {
      const { bad, maxStuck } = playBot(ti, seed, 60);
      assert.equal(bad, 0, `table ${ti} (${PINBALL_TABLES[ti].id}) seed ${seed} : valeurs invalides ou bille hors plateau`);
      assert.ok(maxStuck < 2, `table ${ti} (${PINBALL_TABLES[ti].id}) seed ${seed} : bille immobile ${maxStuck.toFixed(1)} s`);
    }
  }
});

test('déterminisme : même graine, mêmes résultats', () => {
  const a = playBot(1, 4242, 40);
  const b = playBot(1, 4242, 40);
  assert.equal(a.sim.players[0].score, b.sim.players[0].score);
  assert.deepEqual(
    a.sim.balls.map((x) => [x.x, x.y]),
    b.sim.balls.map((x) => [x.x, x.y])
  );
});

test('indépendance au framerate : chute libre identique à 30/60/144/240 Hz', () => {
  const finals = [30, 60, 144, 240].map((hz) => {
    const sim = new PinballSimulation(1);
    sim.startNewGame(1);
    sim.introTimer = 0;
    const b = sim.balls[0];
    b.inShooterLane = false;
    b.x = 160;
    b.y = 140;
    b.vx = 12;
    b.vy = 0;
    const dt = 1 / hz;
    const frames = Math.round(0.3 * hz);
    for (let i = 0; i < frames; i++) sim.step(dt, IDLE());
    return { hz, x: sim.balls[0].x, y: sim.balls[0].y };
  });
  const ref = finals[1];
  for (const f of finals) {
    assert.ok(Math.abs(f.x - ref.x) < 0.8, `x à ${f.hz} Hz : ${f.x} vs ${ref.x}`);
    assert.ok(Math.abs(f.y - ref.y) < 0.8, `y à ${f.hz} Hz : ${f.y} vs ${ref.y}`);
  }
});

test('rampes Catmull-Rom : déplacement 100 % continu sans téléportation et redescente sur tir faible', () => {
  const starIdx = PINBALL_TABLES.findIndex((t) => t.id === 'star_galaxy');
  assert.ok(starIdx >= 0);

  // 1. Tir franc : franchissement complet sans aucun saut de position
  const sim = new PinballSimulation(101);
  sim.selectedTableIndex = starIdx;
  sim.syncTableGeometry();
  sim.startNewGame(1);
  sim.introTimer = 0;

  const ramp = sim.currentTable.ramps[0];
  const b = sim.balls[0];
  b.inShooterLane = false;
  b.x = ramp.entry.x - ramp.entryDir.x * 4;
  b.y = ramp.entry.y - ramp.entryDir.y * 4;
  b.vx = ramp.entryDir.x * 310;
  b.vy = ramp.entryDir.y * 310;

  let enteredRamp = false;
  let exitedRamp = false;
  let maxStepJump = 0;
  const dt = 1 / 120;

  for (let i = 0; i < 300; i++) {
    const prevX = b.x;
    const prevY = b.y;
    sim.step(dt, IDLE());
    const jump = Math.hypot(b.x - prevX, b.y - prevY);
    maxStepJump = Math.max(maxStepJump, jump);
    if (b.activeRampId === ramp.id) enteredRamp = true;
    if (enteredRamp && b.activeRampId === null) {
      exitedRamp = true;
      break;
    }
  }

  assert.ok(enteredRamp, 'la bille doit s’engager dans la rampe');
  assert.ok(exitedRamp, 'la bille doit ressortir au bout de la rampe');
  assert.ok(maxStepJump < 8, `aucune téléportation autorisée sur la rampe (saut max = ${maxStepJump.toFixed(2)} px)`);
  assert.ok(sim.players[0].score >= ramp.points, 'les points de rampe doivent être accordés au sommet');

  // 2. Tir trop mou : montée partielle puis redescente naturelle par l'entrée
  const weakSim = new PinballSimulation(102);
  weakSim.selectedTableIndex = starIdx;
  weakSim.syncTableGeometry();
  weakSim.startNewGame(1);
  weakSim.introTimer = 0;

  const wb = weakSim.balls[0];
  wb.inShooterLane = false;
  wb.x = ramp.entry.x - ramp.entryDir.x * 3;
  wb.y = ramp.entry.y - ramp.entryDir.y * 3;
  wb.vx = ramp.entryDir.x * 95;
  wb.vy = ramp.entryDir.y * 95;

  let weakEntered = false;
  let rolledBackOut = false;
  for (let i = 0; i < 300; i++) {
    const prevX = wb.x;
    const prevY = wb.y;
    weakSim.step(dt, IDLE());
    assert.ok(Math.hypot(wb.x - prevX, wb.y - prevY) < 6, 'aucun saut pendant le reflux sur la rampe');
    if (wb.activeRampId === ramp.id) weakEntered = true;
    if (weakEntered && wb.activeRampId === null) {
      rolledBackOut = true;
      break;
    }
  }
  assert.ok(weakEntered && rolledBackOut, 'un tir trop faible doit redescendre naturellement par l’entrée');
  assert.equal(weakSim.players[0].score, 0, 'un tir avorté ne doit pas valider la rampe');
  assert.ok(Math.hypot(wb.x - ramp.entry.x, wb.y - ramp.entry.y) < 22, 'la bille ressort bien à l’entrée de la rampe');
});

test('conduits aériens VUK : trajet continu en tube courbé sans téléportation instantanée', () => {
  const spaceIdx = PINBALL_TABLES.findIndex((t) => t.id === 'space_odyssey');
  const sim = new PinballSimulation(202);
  sim.selectedTableIndex = spaceIdx;
  sim.syncTableGeometry();
  sim.startNewGame(1);
  sim.introTimer = 0;

  const vuk = sim.currentTable.scoops.find((s) => s.kind === 'MID_VUK_TELEPORT');
  assert.ok(vuk, 'space_odyssey possède un conduit Trou de Ver');

  const b = sim.balls[0];
  b.inShooterLane = false;
  b.x = vuk.x;
  b.y = vuk.y;
  b.vx = 0;
  b.vy = -40;

  let sawTube = false;
  let finishedTube = false;
  const dt = 1 / 120;
  for (let i = 0; i < 360; i++) {
    const prevX = b.x;
    const prevY = b.y;
    sim.step(dt, IDLE());
    const jump = Math.hypot(b.x - prevX, b.y - prevY);
    assert.ok(jump < 8, `déplacement continu exigé dans le conduit VUK (saut = ${jump.toFixed(2)} px)`);
    if (b.activeTubeId === vuk.id) sawTube = true;
    if (sawTube && b.activeTubeId === null) {
      finishedTube = true;
      break;
    }
  }
  assert.ok(sawTube && finishedTube, 'la bille doit parcourir le conduit aérien puis en sortir');
  assert.ok(Math.hypot(b.x - vuk.ejectTo.x, b.y - vuk.ejectTo.y) < 15, 'sortie continue à l’extrémité du conduit');
});

test('étages supérieurs (layer = 2) : accès par rampe, isolation vis-à-vis du niveau 0 et retombée', () => {
  const upperIds = ['aka_esp32', 'solaire', 'farwest', 'halloween'];
  for (const id of upperIds) {
    const idx = PINBALL_TABLES.findIndex((t) => t.id === id);
    assert.ok(idx >= 0);
    const tbl = PINBALL_TABLES[idx];
    assert.ok(tbl.upperPlayfield, `${id} doit définir un étage supérieur`);
    const accessRamp = tbl.ramps.find((r) => r.exitsToUpperDeck);
    assert.ok(accessRamp, `${id} doit avoir une rampe montant à l'étage`);

    const sim = new PinballSimulation(303);
    sim.selectedTableIndex = idx;
    sim.syncTableGeometry();
    sim.startNewGame(1);
    sim.introTimer = 0;

    const b = sim.balls[0];
    b.inShooterLane = false;
    b.x = accessRamp.entry.x - accessRamp.entryDir.x * 3;
    b.y = accessRamp.entry.y - accessRamp.entryDir.y * 3;
    b.vx = accessRamp.entryDir.x * 330;
    b.vy = accessRamp.entryDir.y * 330;

    let reachedUpperDeck = false;
    let returnedToGround = false;
    const dt = 1 / 120;
    for (let i = 0; i < 900; i++) {
      sim.step(dt, IDLE());
      if (b.layer === 2) reachedUpperDeck = true;
      if (reachedUpperDeck && b.layer === 0) {
        returnedToGround = true;
        break;
      }
    }
    assert.ok(reachedUpperDeck, `${id} : la bille doit déboucher sur l'étage supérieur (layer = 2)`);
    assert.ok(returnedToGround, `${id} : la bille doit finir par retomber au niveau 0 par le rebord ouvert`);
  }
});

test('décors interactifs & Candy Pop : présents et physiquement actifs sur les 12 tables', () => {
  for (let ti = 0; ti < PINBALL_TABLES.length; ti++) {
    const tbl = PINBALL_TABLES[ti];
    assert.ok(tbl.interactiveToys && tbl.interactiveToys.length >= 1, `${tbl.id} doit avoir un décor interactif`);

    const sim = new PinballSimulation(404 + ti);
    sim.selectedTableIndex = ti;
    sim.syncTableGeometry();
    sim.startNewGame(1);
    sim.introTimer = 0;

    const toy = tbl.interactiveToys[0];
    const b = sim.balls[0];
    b.inShooterLane = false;
    b.x = toy.x;
    b.y = toy.y + toy.radius + 3;
    b.vx = 22;
    b.vy = -190;

    const scoreBefore = sim.players[0].score;
    for (let i = 0; i < 30; i++) sim.step(1 / 120, IDLE());
    const st = sim.toyStates[toy.id];
    assert.ok(st, `état runtime présent pour ${toy.id}`);
    assert.ok(
      sim.players[0].score > scoreBefore || Math.abs(st.omega) > 0.1 || st.flash > 0,
      `le décor interactif ${toy.id} sur ${tbl.id} doit réagir physiquement au contact de la bille`
    );
  }

  // Vérification spécifique de la richesse confiserie de Candy Pop
  const candy = PINBALL_TABLES.find((t) => t.id === 'candy');
  assert.ok(candy);
  assert.equal(candy.bumpers.length, 5);
  assert.equal(candy.interactiveToys[0].visual, 'RIBBON_VORTEX');
  assert.ok(candy.bumpers.some((b) => b.iconStyle === 'SWIRL_CANDY'));
  assert.ok(candy.bumpers.some((b) => b.iconStyle === 'PEPPERMINT'));
});

test('diversité des 12 architectures & respect de l’alignement C++ firmware AKA', () => {
  const rampSignatures = new Set();
  const bumperIconSets = new Set();

  for (let ti = 0; ti < PINBALL_TABLES.length; ti++) {
    const tbl = PINBALL_TABLES[ti];
    const rSig = tbl.ramps
      .map((r) => `${Math.round(r.entry.x / 6)}:${Math.round(r.entry.y / 6)}->${Math.round(r.path[r.path.length - 1].x / 8)}:${Math.round(r.path[r.path.length - 1].y / 8)}`)
      .join('|');
    rampSignatures.add(rSig);
    bumperIconSets.add(tbl.bumpers.map((b) => b.iconStyle).join('+'));

    // Vérification d'entrée directe C++ test_ramp_follow() sur les 2 premières rampes de chaque table
    for (let ri = 0; ri < 2; ri++) {
      const sim = new PinballSimulation(500 + ti * 10 + ri);
      sim.selectedTableIndex = ti;
      sim.syncTableGeometry();
      sim.startNewGame(1);
      sim.introTimer = 0;
      const r = tbl.ramps[ri];
      const b = sim.balls[0];
      b.inShooterLane = false;
      b.x = r.path[0].x;
      b.y = r.path[0].y + 4;
      b.vx = 0;
      b.vy = -260;

      let captured = false;
      for (let step = 0; step < 30; step++) {
        sim.step(1 / 120, IDLE());
        if (b.activeRampId === r.id) {
          captured = true;
          break;
        }
      }
      assert.ok(captured, `${tbl.id} ramp[${ri}] (${r.name}) doit capturer un tir vertical franc sans obstacle parasite`);
    }
  }

  assert.equal(rampSignatures.size, 12, 'Chacune des 12 tables doit avoir sa propre géométrie de rampes');
  assert.equal(bumperIconSets.size, 12, 'Chacune des 12 tables doit avoir sa propre combinaison de bumpers thématiques');

  // Invariants stricts Star Wars · Yavin (test_main.cpp)
  const sw = PINBALL_TABLES[2];
  assert.ok(sw.name.toLowerCase().includes('star wars'));
  assert.ok(sw.multiballName.toUpperCase().includes('ESCADRON'));
  assert.deepEqual(
    sw.rollovers.slice(0, 4).map((r) => [r.x, r.y]),
    [
      [68, 50],
      [98, 47],
      [128, 47],
      [158, 50],
    ]
  );
});

test('verrous Multibille : propres à chaque joueur', () => {
  const sim = new PinballSimulation(7);
  sim.initPlayers(2);
  sim.activePlayerIndex = 0;
  sim.lockedBallsCount = 1;
  assert.equal(sim.lockedBallsCount, 1);
  sim.activePlayerIndex = 1;
  assert.equal(sim.lockedBallsCount, 0, "le joueur 2 ne doit pas hériter du verrou du joueur 1");
  sim.activePlayerIndex = 0;
  assert.equal(sim.lockedBallsCount, 1);
});

test('couloirs : extinction mesurée en temps simulé (figée en pause)', () => {
  const sim = new PinballSimulation(3);
  sim.startNewGame(1);
  const rollover = sim.currentTable.rollovers.find((r) => r.groupId !== 'TOP_LANES');
  assert.ok(rollover, 'la table doit avoir un couloir hors TOP_LANES');
  const probe = { ...sim.balls[0], inShooterLane: false, x: rollover.x, y: rollover.y, vx: 0, vy: 0 };
  sim.checkRolloversAndSpinners(probe, 0.001);
  assert.ok(sim.litRollovers.has(rollover.id), 'couloir allumé');

  sim.gameState = 'PAUSED';
  for (let i = 0; i < 180; i++) sim.step(1 / 60, IDLE()); // 3 s de pause
  assert.ok(sim.litRollovers.has(rollover.id), 'toujours allumé pendant la pause');

  sim.gameState = 'PLAYING';
  for (let i = 0; i < 72; i++) sim.step(1 / 60, IDLE()); // 1,2 s de jeu
  assert.ok(!sim.litRollovers.has(rollover.id), 'éteint après 1 s de jeu');
});

test('pause : recommencer / quitter exigent une confirmation', () => {
  const sim = new PinballSimulation(5);
  sim.startNewGame(1);
  sim.players[0].score = 123;
  const press = (key) => {
    const c = IDLE();
    c[key] = true;
    sim.step(1 / 60, c);
    sim.step(1 / 60, IDLE());
  };
  press('pauseBtn');
  assert.equal(sim.gameState, 'PAUSED');

  press('nudge');
  assert.equal(sim.gameState, 'PAUSED', 'un seul appui ne relance pas la partie');
  assert.equal(sim.players[0].score, 123);

  press('nudge');
  assert.equal(sim.gameState, 'PLAYING', 'le second appui confirme');
  assert.equal(sim.players[0].score, 0);

  press('pauseBtn');
  press('leftFlipper');
  assert.equal(sim.gameState, 'PAUSED', 'un seul appui ne quitte pas au menu');
  press('leftFlipper');
  assert.equal(sim.gameState, 'TABLE_SELECT');
});

test('pause automatique quand la fenêtre perd le focus', () => {
  const sim = new PinballSimulation(9);
  sim.startNewGame(1);
  sim.pauseIfPlaying();
  assert.equal(sim.gameState, 'PAUSED');
});

test('records : écriture différée (pas à chaque point)', () => {
  const sim = new PinballSimulation(13);
  sim.startNewGame(1);
  sim.highScores[sim.currentTable.id] = 0;
  storageWrites = 0;
  for (let i = 0; i < 200; i++) sim.awardPoints(10);
  assert.equal(storageWrites, 0, 'aucune écriture localStorage pendant la rafale de points');
  sim.flushHighScores();
  assert.equal(storageWrites, 1, 'une seule écriture au flush');
  sim.flushHighScores();
  assert.equal(storageWrites, 1, 'pas de ré-écriture inutile');
});
