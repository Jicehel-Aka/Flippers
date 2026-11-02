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

test('stabilité : aucune valeur invalide, bille hors plateau ou bille bloquée (4 tables)', () => {
  for (let ti = 0; ti < PINBALL_TABLES.length; ti++) {
    for (const seed of [11, 22, 33]) {
      const { bad, maxStuck } = playBot(ti, seed, 60);
      assert.equal(bad, 0, `table ${ti} seed ${seed} : valeurs invalides ou bille hors plateau`);
      assert.ok(maxStuck < 2, `table ${ti} seed ${seed} : bille immobile ${maxStuck.toFixed(1)} s`);
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
