import { soundEngine } from '../audio/soundEngine';
import { PINBALL_TABLES, loadHighScores, saveHighScores } from '../data/tables';
import {
  BallEntity,
  FlipperState,
  FloatingPopup,
  GameState,
  InputControlsState,
  InteractiveToyDef,
  LiveGameSnapshot,
  MAX_CAMERA_Y,
  MissionEventKind,
  OVERVIEW_ZOOM,
  PinballTableDef,
  PlayerSession,
  PostPeg,
  RampDef,
  SCREEN_WIDTH,
  ScoopVukDef,
  SparkParticle,
  TableThemeId,
  UpperPlayfieldDef,
  VIEWPORT_HEIGHT,
  Vec2,
  WORLD_HEIGHT,
  WallSegment,
  resolveDecorTheme,
} from '../types/pinball';
import {
  RampSplineData,
  buildRampSpline,
  buildVukTubeSpline,
  isPointInPolygon,
  sampleSplineAtDistance,
} from './rampSpline';

export interface ToyRuntimeState {
  hits: number;
  flash: number;
  angle: number;
  spinVel: number;
  openRatio: number;
  activeTimer: number;
  cooldown: number;
}

const BALL_RADIUS = 4.8;
// Fixed-timestep physics: the simulation always advances in 1/720 s slices, whatever the display
// refresh rate (30/60/144/240 Hz...), so ball trajectories do not depend on the frame rate.
const PHYSICS_DT = 1 / 720;
const MAX_SUBSTEPS_PER_FRAME = 24; // matches the 33 ms frame clamp (0.033 s * 720 = 23.8)
const HIGH_SCORE_SAVE_INTERVAL = 2; // seconds of simulated time between two localStorage writes
const CONFIRM_WINDOW = 2.5; // seconds to confirm a destructive pause-menu action
const ROLLOVER_RELIGHT_DELAY = 1.0; // seconds before a non-lane rollover switches off
const TOTAL_BALLS_PER_GAME = 3;
const INTRO_TOTAL_DURATION = 2.35; // Overview hold (~0.8s) + smooth progressive zoom (~1.55s)

export class PinballSimulation {
  public gameState: GameState = 'TABLE_SELECT';
  public selectedTableIndex: number = 0;
  public playerCount: number = 1;
  public activePlayerIndex: number = 0;
  public currentBallNumber: number = 1;
  public players: PlayerSession[] = [];

  public balls: BallEntity[] = [];
  public flippers: FlipperState[] = [];
  public baseWalls: WallSegment[] = [];
  public basePegs: PostPeg[] = [];
  public tableHousingWalls: WallSegment[] = [];
  public tableHousingPegs: PostPeg[] = [];
  public upperDeckWalls: WallSegment[] = [];
  public upperDeckPegs: PostPeg[] = [];
  public toyStates: Record<string, ToyRuntimeState> = {};

  // Camera State: Overview Zoom Arrival + Lowest-Ball Smart Scrolling
  public cameraY: number = MAX_CAMERA_Y;
  public cameraZoom: number = 1.0;
  public introTimer: number = 0;

  // Interactive Playfield States
  public hitTargets: Set<string> = new Set();
  public litRollovers: Set<string> = new Set();
  public skillShotRolloverId: string | null = null;
  public skillShotAvailable: boolean = false;
  public bumperFlashTimers: Record<string, number> = {};
  public scoopFlashTimers: Record<string, number> = {};
  public slingshotFlash: { LEFT: number; RIGHT: number } = { LEFT: 0, RIGHT: 0 };
  public spinnerVelocities: Record<string, number> = {};
  public spinnerAngles: Record<string, number> = {};
  public spinnerMissionAccum: Record<string, number> = {};
  public gateOpenTimer: number = 0;
  public jackpotMultiplierBoost: number = 1;

  // Plunger, Nudge & Tilt
  public plungerTension: number = 0;
  public nudgeCooldown: number = 0;
  public tiltMeter: number = 0;
  public isTilted: boolean = false;
  public shakeOffset: Vec2 = { x: 0, y: 0 };

  // Combos, Callouts & Modes
  public comboCount: number = 0;
  public comboTimer: number = 0;
  public readonly maxComboTimer: number = 6.5;
  public lastPointsScored: number = 0;
  public lastCallout: string = 'PRÊT AU LANCEMENT';
  public calloutTimer: number = 0;
  public ballSaveTimer: number = 0;
  /** Cible mobile de la table (si elle en a une) : emplacement courant, touches cumulées, éclat. */
  public huntSlot: number = 0;
  public huntHits: number = 0;
  public huntFlash: number = 0;
  /** Bumper « doré » (points x3) quand la table a le mécanisme de rotation. */
  public litBumperIdx: number = 0;
  public kickbackLeftLit: boolean = true;
  public kickbackRightLit: boolean = false;
  public kickbackFlash: { LEFT: number; RIGHT: number } = { LEFT: 0, RIGHT: 0 };
  public multiballActive: boolean = false;
  public jackpotLit: boolean = false;
  public multiballSpawnQueue: number = 0;
  public multiballSpawnDelay: number = 0;
  public dropBankResetTimers: Record<string, number> = {};

  // Visual FX (in 240x520 World Coordinates)
  public popups: FloatingPopup[] = [];
  public sparks: SparkParticle[] = [];
  public highScores: Record<string, number> = loadHighScores();
  public clock: number = 0;

  private prevControls: InputControlsState = {
    leftFlipper: false,
    rightFlipper: false,
    plunger: false,
    nudge: false,
    pauseBtn: false,
    dpadLeft: false,
    dpadRight: false,
    dpadUp: false,
    dpadDown: false,
  };
  private nextBallId: number = 1;
  private nextPopupId: number = 1;

  // Fixed-timestep accumulator, seeded gameplay PRNG, deferred high-score saving
  private physicsAccumulator: number = 0;
  private rngState: number = 1;
  private highScoresDirty: boolean = false;
  private lastHighScoreSave: number = 0;
  private rolloverOffTimers: Record<string, number> = {};
  private rampSplineCache: Map<string, RampSplineData> = new Map();
  private tubeSplineCache: Map<string, RampSplineData> = new Map();

  // Two-step confirmation for destructive pause-menu actions
  public pendingConfirm: 'RESTART' | 'MENU' | null = null;
  public confirmTimer: number = 0;

  constructor(seed: number = (Date.now() ^ 0x9e3779b9) >>> 0) {
    this.setSeed(seed);
    this.buildSharedCabinetGeometry();
    this.syncTableGeometry();
    this.initPlayers(1);
  }

  /** Multiball locks belong to the player who earned them (not shared between players). */
  public get lockedBallsCount(): number {
    return this.players[this.activePlayerIndex]?.lockedBalls ?? 0;
  }

  public set lockedBallsCount(value: number) {
    const p = this.players[this.activePlayerIndex];
    if (p) p.lockedBalls = value;
  }

  /** Seeds the gameplay PRNG (launch jitter, nudges, scoop ejects) so runs can be reproduced. */
  public setSeed(seed: number) {
    this.rngState = seed >>> 0 || 1;
  }

  /** mulberry32: small, fast, deterministic. Used for everything that can influence gameplay. */
  private rand(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Writes pending high scores to localStorage (called at game over, on pause and on page hide). */
  public flushHighScores() {
    if (!this.highScoresDirty) return;
    this.highScoresDirty = false;
    this.lastHighScoreSave = this.clock;
    saveHighScores(this.highScores);
  }

  /** Auto-pause when the window loses focus so a ball is never lost in the background. */
  public pauseIfPlaying() {
    if (this.gameState === 'PLAYING') {
      this.gameState = 'PAUSED';
      this.pendingConfirm = null;
      this.flushHighScores();
    }
  }

  /** First call arms the confirmation, second call (within 2.5 s) restarts the table. */
  public requestRestart() {
    if (this.pendingConfirm === 'RESTART' && this.confirmTimer > 0) {
      this.pendingConfirm = null;
      this.startNewGame(this.playerCount);
    } else {
      this.pendingConfirm = 'RESTART';
      this.confirmTimer = CONFIRM_WINDOW;
      soundEngine.playMenuTick();
    }
  }

  /** First call arms the confirmation, second call (within 2.5 s) goes back to the table menu. */
  public requestMenu() {
    if (this.pendingConfirm === 'MENU' && this.confirmTimer > 0) {
      this.pendingConfirm = null;
      this.openTableMenu();
    } else {
      this.pendingConfirm = 'MENU';
      this.confirmTimer = CONFIRM_WINDOW;
      soundEngine.playMenuTick();
    }
  }

  private draftOverride: PinballTableDef | null = null;

  public setDraftTable(draft: PinballTableDef | null) {
    this.draftOverride = draft;
    this.syncTableGeometry();
  }

  public get currentTable(): PinballTableDef {
    if (this.draftOverride) return this.draftOverride;
    const safeIdx = Math.max(0, Math.min(this.selectedTableIndex, PINBALL_TABLES.length - 1));
    return PINBALL_TABLES[safeIdx];
  }

  /**
   * Recharge à chaud la géométrie et les caches de la table active (utilisé par l'Éditeur de tables).
   */
  public reloadActiveTable(selectId?: string) {
    if (selectId) {
      const idx = PINBALL_TABLES.findIndex((t) => t.id === selectId);
      if (idx !== -1) {
        this.selectedTableIndex = idx;
      }
    }
    this.selectedTableIndex = Math.max(
      0,
      Math.min(this.selectedTableIndex, Math.max(0, PINBALL_TABLES.length - 1))
    );
    this.highScores = { ...loadHighScores(), ...this.highScores };
    this.syncTableGeometry();
  }

  /**
   * Rebuilds flippers and beveled target/island housings specific to the selected table!
   */
  public syncTableGeometry() {
    this.selectedTableIndex = Math.max(
      0,
      Math.min(this.selectedTableIndex, Math.max(0, PINBALL_TABLES.length - 1))
    );
    this.rampSplineCache.clear();
    this.tubeSplineCache.clear();
    const table = this.currentTable;
    soundEngine.setTheme(resolveDecorTheme(table));

    // 2 Main Lower Arena Flippers (y = 468) + Table-Specific Extra Flippers + Upper Deck Flippers
    const mainFlippers: FlipperState[] = [
      {
        id: 'main_left',
        side: 'LEFT',
        zone: 'MAIN',
        pivot: { x: 72, y: 468 },
        length: 31,
        radius: 4.2,
        restAngle: 0.44,
        activeAngle: -0.5,
        angle: 0.44,
        angularVelocity: 0,
        pressed: false,
        deckLayer: 0,
      },
      {
        id: 'main_right',
        side: 'RIGHT',
        zone: 'MAIN',
        pivot: { x: 154, y: 468 },
        length: 31,
        radius: 4.2,
        restAngle: Math.PI - 0.44,
        activeAngle: Math.PI + 0.5,
        angle: Math.PI - 0.44,
        angularVelocity: 0,
        pressed: false,
        deckLayer: 0,
      },
    ];

    const extras: FlipperState[] = table.extraFlippers.map((ef) => ({
      ...ef,
      angle: ef.restAngle,
      angularVelocity: 0,
      pressed: false,
      deckLayer: 0,
    }));

    const upperFlippers: FlipperState[] = (table.upperPlayfield?.flippers ?? []).map((uf) => ({
      ...uf,
      angle: uf.restAngle,
      angularVelocity: 0,
      pressed: false,
      deckLayer: 2,
    }));

    this.flippers = [...mainFlippers, ...extras, ...upperFlippers];

    // Convert table beveledHousings polygons into solid collision walls & smooth corner pegs
    const hWalls: WallSegment[] = [];
    const hPegs: PostPeg[] = [];

    for (const housing of table.beveledHousings) {
      const pts = housing.points;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        // Skip back-edges that lie flush along outer walls x=9 or x=217
        const flushLeft = Math.abs(a.x - 9) < 0.2 && Math.abs(b.x - 9) < 0.2;
        const flushRight = Math.abs(a.x - 217) < 0.2 && Math.abs(b.x - 217) < 0.2;
        if (!flushLeft && !flushRight) {
          hWalls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, restitution: 0.44 });
        }
        if (a.x > 10.5 && a.x < 215.5) {
          hPegs.push({ x: a.x, y: a.y, radius: 2.0, restitution: 0.5 });
        }
      }
    }

    this.tableHousingWalls = hWalls;
    this.tableHousingPegs = hPegs;

    // Build Upper Playfield (Layer 2) closed curb walls & corner posts
    const uWalls: WallSegment[] = [];
    const uPegs: PostPeg[] = [];
    if (table.upperPlayfield && table.upperPlayfield.bounds.length >= 3) {
      const bounds = table.upperPlayfield.bounds;
      const openSet = new Set(table.upperPlayfield.openEdgeIndices);
      const n = bounds.length;
      for (let i = 0; i < n; i++) {
        const a = bounds[i];
        const b = bounds[(i + 1) % n];
        if (!openSet.has(i)) {
          uWalls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, restitution: 0.46 });
        }
        uPegs.push({ x: a.x, y: a.y, radius: 2.2, restitution: 0.52 });
      }
    }
    this.upperDeckWalls = uWalls;
    this.upperDeckPegs = uPegs;

    // Ensure every interactive decor toy has an initialized runtime state
    const nextToys: Record<string, ToyRuntimeState> = {};
    for (const toy of table.interactiveToys ?? []) {
      nextToys[toy.id] = this.toyStates[toy.id] ?? {
        hits: 0,
        flash: 0,
        angle: 0,
        spinVel: 0,
        openRatio: 0,
        activeTimer: 0,
        cooldown: 0,
      };
    }
    this.toyStates = nextToys;
  }

  public getRampSpline(ramp: RampDef): RampSplineData {
    let cached = this.rampSplineCache.get(ramp.id);
    if (!cached) {
      cached = buildRampSpline(ramp.path, 9, Boolean(ramp.exitsToUpperDeck));
      this.rampSplineCache.set(ramp.id, cached);
    }
    return cached;
  }

  public getTubeSpline(scoop: ScoopVukDef): RampSplineData {
    let cached = this.tubeSplineCache.get(scoop.id);
    if (!cached) {
      cached = buildVukTubeSpline({ x: scoop.x, y: scoop.y }, scoop.ejectTo);
      this.tubeSplineCache.set(scoop.id, cached);
    }
    return cached;
  }

  private buildSharedCabinetGeometry() {
    const walls: WallSegment[] = [];
    const pegs: PostPeg[] = [];

    // 1. Top Elliptical Arch in 240x520 World Space: (9, 72) around (121, 14) to (233, 72)
    const archSegments = 28;
    const cx = 121;
    const cy = 72;
    const rx = 112;
    const ry = 58;
    for (let i = 0; i < archSegments; i++) {
      const t1 = Math.PI - (i / archSegments) * Math.PI;
      const t2 = Math.PI - ((i + 1) / archSegments) * Math.PI;
      walls.push({
        x1: cx + rx * Math.cos(t1),
        y1: cy - ry * Math.sin(t1),
        x2: cx + rx * Math.cos(t2),
        y2: cy - ry * Math.sin(t2),
        restitution: 0.45,
      });
    }

    // 2. Top Rollover Dividers (30px spacing: 83, 113, 143)
    for (const dx of [83, 113, 143]) {
      walls.push({ x1: dx, y1: 41, x2: dx, y2: 59, restitution: 0.45 });
      pegs.push({ x: dx, y: 41, radius: 2.0 }, { x: dx, y: 59, radius: 2.0 });
    }

    walls.push(
      // 3. Outer Left Wall & Right Shooter Tunnel (y: 72 .. 514)
      { x1: 9, y1: 72, x2: 9, y2: 452, restitution: 0.48 },
      { x1: 233, y1: 72, x2: 233, y2: 514, restitution: 0.4 },
      { x1: 217, y1: 514, x2: 233, y2: 514, restitution: 0.2 },
      { x1: 217, y1: 86, x2: 217, y2: 516, restitution: 0.48 },
      // One-way gate at top of shooter lane
      {
        x1: 217,
        y1: 86,
        x2: 231,
        y2: 72,
        restitution: 0.45,
        oneWayNormal: { x: -0.58, y: -0.81 },
      },

      // 4. Lower Drain Aprons
      { x1: 9, y1: 452, x2: 89, y2: 504, restitution: 0.35 },
      { x1: 217, y1: 452, x2: 137, y2: 504, restitution: 0.35 },

      // 5. Spacious 18px Inlanes & Outlanes (Zero pinching!)
      { x1: 27, y1: 384, x2: 27, y2: 438, restitution: 0.45 },
      { x1: 27, y1: 438, x2: 72, y2: 468, restitution: 0.28 },
      { x1: 199, y1: 384, x2: 199, y2: 438, restitution: 0.45 },
      { x1: 199, y1: 438, x2: 154, y2: 468, restitution: 0.28 },

      // 6. Raised 3D Slingshots (35px clearance above inlane rails -> ZERO pinching!)
      { x1: 45, y1: 376, x2: 45, y2: 416, restitution: 0.5 },
      { x1: 45, y1: 416, x2: 70, y2: 431, restitution: 0.5 },
      { x1: 45, y1: 376, x2: 70, y2: 431, restitution: 0.88, isKicker: true, kickerSide: 'LEFT' },

      { x1: 181, y1: 376, x2: 181, y2: 416, restitution: 0.5 },
      { x1: 181, y1: 416, x2: 156, y2: 431, restitution: 0.5 },
      { x1: 181, y1: 376, x2: 156, y2: 431, restitution: 0.88, isKicker: true, kickerSide: 'RIGHT' }
    );

    const pegCoords: Vec2[] = [
      { x: 217, y: 86 },
      { x: 27, y: 384 },
      { x: 199, y: 384 },
      { x: 45, y: 376 },
      { x: 45, y: 416 },
      { x: 70, y: 431 },
      { x: 181, y: 376 },
      { x: 181, y: 416 },
      { x: 156, y: 431 },
    ];
    for (const p of pegCoords) {
      pegs.push({ x: p.x, y: p.y, radius: 2.2, restitution: 0.55 });
    }

    this.baseWalls = walls;
    this.basePegs = pegs;
  }

  public initPlayers(count: number) {
    this.playerCount = Math.max(1, Math.min(4, count));
    this.players = Array.from({ length: this.playerCount }, (_, idx) => ({
      playerIndex: idx,
      score: 0,
      displayScore: 0,
      ballsRemaining: TOTAL_BALLS_PER_GAME,
      bonusPoints: 10000,
      bonusMultiplier: 1,
      maxCombo: 1,
      rampsCompleted: 0,
      activeMissionIndex: 0,
      missionStepProgress: 0,
      missionsCompleted: 0,
      lockedBalls: 0,
    }));
    this.activePlayerIndex = 0;
    this.currentBallNumber = 1;
  }

  public selectTableById(tableId: TableThemeId) {
    const idx = PINBALL_TABLES.findIndex((t) => t.id === tableId);
    if (idx !== -1 && idx !== this.selectedTableIndex) {
      this.selectedTableIndex = idx;
      this.syncTableGeometry();
      soundEngine.playMenuTick();
      if (
        this.gameState === 'PLAYING' ||
        this.gameState === 'PAUSED' ||
        this.gameState === 'GAME_OVER'
      ) {
        this.startNewGame(this.playerCount);
      }
    } else if (idx !== -1) {
      this.syncTableGeometry();
    }
  }

  public cycleTable(delta: number) {
    const len = PINBALL_TABLES.length;
    this.selectedTableIndex = (this.selectedTableIndex + delta + len) % len;
    this.syncTableGeometry();
    soundEngine.playMenuTick();
  }

  public setPlayerCount(count: number) {
    const clamped = Math.max(1, Math.min(4, count));
    if (clamped !== this.playerCount) {
      this.playerCount = clamped;
      soundEngine.playMenuTick();
      if (this.gameState === 'TABLE_SELECT') {
        this.initPlayers(clamped);
      }
    }
  }

  public openTableMenu() {
    this.flushHighScores();
    this.pendingConfirm = null;
    this.gameState = 'TABLE_SELECT';
    this.balls = [];
    this.popups = [];
    this.sparks = [];
    this.cameraZoom = 1.0;
    this.introTimer = 0;
    soundEngine.playMenuTick();
  }

  public startNewGame(playerCount: number = this.playerCount) {
    this.syncTableGeometry();
    this.initPlayers(playerCount);
    this.gameState = 'PLAYING';
    this.pendingConfirm = null;
    this.physicsAccumulator = 0;
    this.activePlayerIndex = 0;
    this.currentBallNumber = 1;
    this.lockedBallsCount = 0;
    this.setupBallForCurrentPlayer('APERÇU DU PLATEAU · R1 LANCER', true);
    soundEngine.playMenuTick();
  }

  private setupBallForCurrentPlayer(bannerMsg: string, triggerOverviewIntro: boolean) {
    this.balls = [];
    this.hitTargets.clear();
    this.litRollovers.clear();
    this.rolloverOffTimers = {};
    this.dropBankResetTimers = {};
    this.spinnerMissionAccum = {};
    this.comboCount = 0;
    this.comboTimer = 0;
    this.plungerTension = 0;
    this.tiltMeter = 0;
    this.isTilted = false;
    this.multiballActive = false;
    this.jackpotLit = false;
    this.multiballSpawnQueue = 0;
    this.ballSaveTimer = 0;
    this.huntSlot = 0;
    this.huntHits = 0;
    this.huntFlash = 0;
    this.litBumperIdx = 0;
    this.kickbackLeftLit = true;
    this.kickbackRightLit = false;
    this.jackpotMultiplierBoost = 1;
    this.cameraY = MAX_CAMERA_Y;

    this.toyStates = {};
    for (const toy of this.currentTable.interactiveToys ?? []) {
      this.toyStates[toy.id] = {
        hits: 0,
        flash: 0,
        angle: 0,
        spinVel: 0,
        openRatio: 0,
        activeTimer: 0,
        cooldown: 0,
      };
    }

    // Cinematic Full-Table Overview Zoom -> Progressive Zoom into Gameplay!
    if (triggerOverviewIntro) {
      this.introTimer = INTRO_TOTAL_DURATION;
      this.cameraZoom = OVERVIEW_ZOOM;
    } else {
      this.introTimer = 0;
      this.cameraZoom = 1.0;
    }

    const p = this.players[this.activePlayerIndex];
    if (p) {
      p.bonusPoints = 10000;
      p.bonusMultiplier = 1;
    }

    const topLanes = this.currentTable.rollovers.filter((r) => r.groupId === 'TOP_LANES');
    this.skillShotRolloverId = topLanes[1]?.id ?? topLanes[0]?.id ?? null;
    this.skillShotAvailable = true;

    this.spawnBallInShooter(false);
    this.setCallout(bannerMsg, 0);
  }

  private spawnBallInShooter(autoLaunch: boolean) {
    const ball: BallEntity = {
      id: this.nextBallId++,
      x: 225,
      y: autoLaunch ? 448 : 473,
      vx: 0,
      vy: autoLaunch ? -(790 + this.rand() * 110) : 0,
      radius: BALL_RADIUS,
      layer: 0,
      activeRampId: null,
      activeTubeId: null,
      rampProgress: 0,
      rampDist: 0,
      rampSpeed: 0,
      rampReverse: false,
      rampCommitted: false,
      rampAwarded: false,
      rampExitCooldown: 0,
      rampEntryOffset: { x: 0, y: 0 },
      heldInScoopId: null,
      scoopTimer: 0,
      inShooterLane: true,
      stuckTimer: 0,
      trail: [],
    };
    this.balls.push(ball);
    if (autoLaunch) {
      soundEngine.playPlungerLaunch(0.9);
    }
  }

  private setCallout(msg: string, points: number) {
    this.lastCallout = msg;
    if (points > 0) {
      this.lastPointsScored = points;
    }
    this.calloutTimer = 2.8;
  }

  private awardPoints(basePoints: number, callout?: string, popupPos?: Vec2, popupColor?: string) {
    if (this.isTilted) return;
    const player = this.players[this.activePlayerIndex];
    if (!player) return;

    const total = Math.round(basePoints * (this.multiballActive ? 1.5 : 1));
    player.score += total;
    player.bonusPoints += Math.round(basePoints * 0.15);

    if (player.score > (this.highScores[this.currentTable.id] ?? 0)) {
      this.highScores[this.currentTable.id] = player.score;
      this.highScoresDirty = true;
    }

    if (callout) {
      this.setCallout(callout, total);
    } else {
      this.lastPointsScored = total;
      this.calloutTimer = Math.max(this.calloutTimer, 1.4);
    }

    if (popupPos && total >= 1500) {
      this.popups.push({
        id: this.nextPopupId++,
        x: Math.max(28, Math.min(SCREEN_WIDTH - 36, popupPos.x)),
        y: Math.max(20, popupPos.y),
        text: `+${total.toLocaleString('fr-FR')}`,
        color: popupColor ?? this.currentTable.palette.accentPrimary,
        life: 0.95,
        maxLife: 0.95,
      });
    }
  }

  private advanceMission(eventKind: MissionEventKind, pos: Vec2, isScoopJoker: boolean = false) {
    if (this.isTilted) return;
    const player = this.players[this.activePlayerIndex];
    if (!player) return;

    const missions = this.currentTable.missions;
    const activeMission = missions[player.activeMissionIndex % missions.length];
    if (!activeMission) return;

    if (!isScoopJoker && activeMission.targetKind !== eventKind) {
      return;
    }

    player.missionStepProgress++;

    if (player.missionStepProgress >= activeMission.goal) {
      player.missionStepProgress = 0;
      player.missionsCompleted++;
      player.activeMissionIndex = (player.activeMissionIndex + 1) % missions.length;

      soundEngine.playJackpotOrMultiball();
      this.spawnSparks(pos.x, pos.y, activeMission.accentColor, 18);

      // Every 3 completed missions triggers Wizard Finale + Multiball!
      if (player.missionsCompleted % 3 === 0) {
        this.awardPoints(
          100000,
          `MAÎTRE DU PLATEAU +100 000 !`,
          { x: 113, y: this.cameraY + 120 },
          '#FDE047'
        );
        if (!this.multiballActive) {
          this.triggerMultiball();
        }
      } else {
        this.awardPoints(
          activeMission.rewardPoints,
          `MISSION RÉUSSIE : ${activeMission.title}`,
          pos,
          activeMission.accentColor
        );
      }
    } else {
      this.setCallout(
        `${activeMission.title} (${player.missionStepProgress}/${activeMission.goal})`,
        0
      );
    }
  }

  private spawnSparks(x: number, y: number, color: string, count: number = 8) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = 40 + Math.random() * 90;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        color,
        size: 1.6 + Math.random() * 1.4,
        life: 0.34 + Math.random() * 0.2,
        maxLife: 0.54,
      });
    }
  }

  private shiftTopRollovers(dir: -1 | 1) {
    const topLanes = this.currentTable.rollovers.filter((r) => r.groupId === 'TOP_LANES');
    if (topLanes.length === 0) return;
    const states = topLanes.map((r) => this.litRollovers.has(r.id));
    const len = states.length;
    topLanes.forEach((r, idx) => {
      const srcIdx = (idx - dir + len) % len;
      if (states[srcIdx]) this.litRollovers.add(r.id);
      else this.litRollovers.delete(r.id);
    });
  }

  // ==========================================================================
  // SMART CAMERA: OVERVIEW ZOOM ARRIVAL + STRICT LOWEST-BALL TRACKING
  // ==========================================================================
  private updateSmartCamera(dt: number, controls: InputControlsState) {
    // 1. Update Full-Table Overview -> Gameplay Progressive Zoom
    if (this.introTimer > 0) {
      const fastForward =
        controls.plunger || controls.leftFlipper || controls.rightFlipper ? 3.2 : 1.0;
      this.introTimer = Math.max(0, this.introTimer - dt * fastForward);

      const elapsedRatio = 1 - this.introTimer / INTRO_TOTAL_DURATION;
      const holdPhase = 0.34; // ~0.8s seeing the entire 240x520 table cleanly!
      if (elapsedRatio <= holdPhase) {
        this.cameraZoom = OVERVIEW_ZOOM;
      } else {
        const u = Math.min(1, (elapsedRatio - holdPhase) / (1 - holdPhase));
        // Quintic smootherstep for cinema-grade progressive zoom-in
        const ease = u * u * u * (u * (u * 6 - 15) + 10);
        this.cameraZoom = OVERVIEW_ZOOM + (1 - OVERVIEW_ZOOM) * ease;
      }
    } else {
      this.cameraZoom = 1.0;
    }

    if (this.balls.length === 0) {
      this.cameraY += (MAX_CAMERA_Y - this.cameraY) * Math.min(1, dt * 8);
      return;
    }

    // 2. ALWAYS track the LOWEST active playfield ball (largest Y)!
    // During Multiball, if a secondary ball is still shooting up the isolated right shooter tunnel,
    // prioritize the lowest ball on the open playfield so the player never loses sight of flippers!
    const playfieldBalls = this.balls.filter((b) => !b.inShooterLane);
    const candidatePool = playfieldBalls.length > 0 ? playfieldBalls : this.balls;
    const lowestBall = candidatePool.reduce(
      (lowest, b) => (b.y > lowest.y ? b : lowest),
      candidatePool[0]
    );

    // 3. Velocity Look-Ahead (strong downward anticipation, gentle upward look-ahead)
    let lookAheadY = 0;
    if (lowestBall.vy > 40) {
      lookAheadY = Math.min(82, (lowestBall.vy - 40) * 0.21);
    } else if (lowestBall.vy < -100 && candidatePool.length === 1) {
      // Only look ahead upward when 1 ball is in play so we never pull away from lower balls in Multiball!
      lookAheadY = Math.max(-44, (lowestBall.vy + 100) * 0.1);
    }

    let focusWorldY = lowestBall.y + lookAheadY;

    // 4. Flipper Awareness
    if (controls.leftFlipper || controls.rightFlipper) {
      if (lowestBall.y > 300) {
        focusWorldY += 24;
      }
    }

    let targetCamY = focusWorldY - VIEWPORT_HEIGHT * 0.56;

    // 5. Magnetic Lower Arena Anchor: whenever lowest ball is in lower arena (y > 325),
    // smoothly lock to MAX_CAMERA_Y (246) so Main Flippers (y=468) stay rock-steady!
    if (lowestBall.y > 325) {
      const lowerBlend = Math.max(0, Math.min(1, (lowestBall.y - 325) / 75));
      targetCamY = targetCamY * (1 - lowerBlend) + MAX_CAMERA_Y * lowerBlend;
    } else if (lowestBall.y < 165 && lowestBall.vy > -200 && candidatePool.length === 1) {
      const upperBlend = Math.max(0, Math.min(1, (165 - lowestBall.y) / 50));
      targetCamY = targetCamY * (1 - upperBlend);
    }

    targetCamY = Math.max(0, Math.min(MAX_CAMERA_Y, targetCamY));

    // Asymmetric spring-damper: fast downward tracking (18.0), calm upward tracking (9.0)
    const delta = targetCamY - this.cameraY;
    const stiffness = delta > 0 ? 18.0 : 9.0;
    this.cameraY = Math.max(
      0,
      Math.min(MAX_CAMERA_Y, this.cameraY + delta * (1 - Math.exp(-stiffness * dt)))
    );

    // 6. HARD MATHEMATICAL INVARIANT: Lowest ball can NEVER drop below bottom margin!
    const minRequiredCamY = lowestBall.y - (VIEWPORT_HEIGHT - 44);
    if (this.cameraY < minRequiredCamY) {
      this.cameraY = Math.max(0, Math.min(MAX_CAMERA_Y, minRequiredCamY));
    }
  }

  public step(dtRaw: number, controls: InputControlsState) {
    const dt = Math.min(dtRaw, 0.033);
    this.clock += dt;

    for (const p of this.players) {
      if (p.displayScore < p.score) {
        const diff = p.score - p.displayScore;
        p.displayScore += Math.max(50, Math.ceil(diff * Math.min(1, dt * 16)));
        if (p.displayScore > p.score) p.displayScore = p.score;
      } else {
        p.displayScore = p.score;
      }
    }

    const justLeft = controls.leftFlipper && !this.prevControls.leftFlipper;
    const justRight = controls.rightFlipper && !this.prevControls.rightFlipper;
    const justPlunger = controls.plunger && !this.prevControls.plunger;
    const releasedPlunger = !controls.plunger && this.prevControls.plunger;
    const justNudge = controls.nudge && !this.prevControls.nudge;
    const justPause = controls.pauseBtn && !this.prevControls.pauseBtn;
    const justDpadLeft = controls.dpadLeft && !this.prevControls.dpadLeft;
    const justDpadRight = controls.dpadRight && !this.prevControls.dpadRight;
    const justDpadUp = controls.dpadUp && !this.prevControls.dpadUp;
    const justDpadDown = controls.dpadDown && !this.prevControls.dpadDown;

    if (this.gameState === 'TABLE_SELECT') {
      if (justLeft || justDpadLeft) this.cycleTable(-1);
      else if (justRight || justDpadRight) this.cycleTable(1);
      else if (justDpadUp) this.setPlayerCount((this.playerCount % 4) + 1);
      else if (justDpadDown) this.setPlayerCount(((this.playerCount + 2) % 4) + 1);
      else if (justPlunger || releasedPlunger || justNudge) this.startNewGame(this.playerCount);
      this.prevControls = { ...controls };
      return;
    }

    if (this.gameState === 'PAUSED') {
      if (this.confirmTimer > 0) {
        this.confirmTimer = Math.max(0, this.confirmTimer - dt);
        if (this.confirmTimer === 0) this.pendingConfirm = null;
      }
      if (justPause || justPlunger) {
        this.pendingConfirm = null;
        this.gameState = 'PLAYING';
        soundEngine.playMenuTick();
      } else if (justNudge) {
        this.requestRestart();
      } else if (justLeft) {
        this.requestMenu();
      }
      this.prevControls = { ...controls };
      return;
    }

    if (this.gameState === 'GAME_OVER') {
      if (justLeft || justDpadLeft) this.cycleTable(-1);
      else if (justRight || justDpadRight) this.cycleTable(1);
      else if (justPlunger || releasedPlunger) this.startNewGame(this.playerCount);
      else if (justPause || justNudge) this.openTableMenu();
      this.prevControls = { ...controls };
      return;
    }

    if (justPause) {
      this.gameState = 'PAUSED';
      this.pendingConfirm = null;
      this.flushHighScores();
      soundEngine.playMenuTick();
      this.prevControls = { ...controls };
      return;
    }

    if (!this.isTilted) {
      if (justLeft) {
        soundEngine.playFlipperUp('LEFT');
        this.shiftTopRollovers(-1);
      }
      if (justRight) {
        soundEngine.playFlipperUp('RIGHT');
        this.shiftTopRollovers(1);
      }
    }

    // Decay timers
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) this.comboCount = 0;
    }
    if (this.calloutTimer > 0) this.calloutTimer = Math.max(0, this.calloutTimer - dt);
    if (this.ballSaveTimer > 0) this.ballSaveTimer = Math.max(0, this.ballSaveTimer - dt);
    if (this.huntFlash > 0) this.huntFlash = Math.max(0, this.huntFlash - dt);
    if (this.gateOpenTimer > 0) this.gateOpenTimer = Math.max(0, this.gateOpenTimer - dt);
    if (this.nudgeCooldown > 0) this.nudgeCooldown = Math.max(0, this.nudgeCooldown - dt);
    if (this.tiltMeter > 0 && !this.isTilted) {
      this.tiltMeter = Math.max(0, this.tiltMeter - dt * 0.42);
    }

    this.shakeOffset.x *= Math.pow(0.001, dt);
    this.shakeOffset.y *= Math.pow(0.001, dt);

    for (const k of Object.keys(this.bumperFlashTimers)) {
      this.bumperFlashTimers[k] = Math.max(0, this.bumperFlashTimers[k] - dt);
    }
    for (const k of Object.keys(this.scoopFlashTimers)) {
      this.scoopFlashTimers[k] = Math.max(0, this.scoopFlashTimers[k] - dt);
    }
    this.slingshotFlash.LEFT = Math.max(0, this.slingshotFlash.LEFT - dt);
    this.slingshotFlash.RIGHT = Math.max(0, this.slingshotFlash.RIGHT - dt);
    this.kickbackFlash.LEFT = Math.max(0, this.kickbackFlash.LEFT - dt);
    this.kickbackFlash.RIGHT = Math.max(0, this.kickbackFlash.RIGHT - dt);

    // Non-lane rollovers switch off after a delay, measured in simulated time (frozen while paused)
    for (const id of Object.keys(this.rolloverOffTimers)) {
      this.rolloverOffTimers[id] -= dt;
      if (this.rolloverOffTimers[id] <= 0) {
        delete this.rolloverOffTimers[id];
        this.litRollovers.delete(id);
      }
    }

    // Drop target bank auto-resets (lower playfield + upper playfield)
    for (const bankId of Object.keys(this.dropBankResetTimers)) {
      this.dropBankResetTimers[bankId] -= dt;
      if (this.dropBankResetTimers[bankId] <= 0) {
        delete this.dropBankResetTimers[bankId];
        for (const t of this.currentTable.targets) {
          if (t.bankId === bankId) this.hitTargets.delete(t.id);
        }
        for (const t of this.currentTable.upperPlayfield?.targets ?? []) {
          if (t.bankId === bankId) this.hitTargets.delete(t.id);
        }
      }
    }

    // Multiball queued auto-launch
    if (this.multiballSpawnQueue > 0) {
      this.multiballSpawnDelay -= dt;
      if (this.multiballSpawnDelay <= 0) {
        const shooterBusy = this.balls.some((b) => b.inShooterLane && b.y > 380);
        if (!shooterBusy) {
          this.multiballSpawnQueue--;
          this.multiballSpawnDelay = 0.55;
          this.spawnBallInShooter(true);
        }
      }
    }

    // Spinners rotation & scoring
    for (const sp of this.currentTable.spinners) {
      const vel = this.spinnerVelocities[sp.id] ?? 0;
      if (Math.abs(vel) > 0.5) {
        const nextAngle = (this.spinnerAngles[sp.id] ?? 0) + Math.abs(vel) * dt;
        this.spinnerVelocities[sp.id] = vel * Math.pow(0.2, dt);
        let prog = nextAngle;
        while (prog >= Math.PI) {
          prog -= Math.PI;
          soundEngine.playSpinnerTick();
          this.awardPoints(sp.pointsPerSpin);
          const spins = (this.spinnerMissionAccum[sp.id] ?? 0) + 1;
          this.spinnerMissionAccum[sp.id] = spins;
          if (spins % 4 === 0) {
            this.advanceMission('BUMPER', { x: sp.x, y: sp.y });
          }
        }
        this.spinnerAngles[sp.id] = prog;
      } else {
        this.spinnerVelocities[sp.id] = 0;
      }
    }

    // Plunger R1 Tension & Calibrated 520px Launch
    const ballWaitingOnPlunger = this.balls.find(
      (b) => b.inShooterLane && b.y > 435 && Math.abs(b.vy) < 45
    );
    if (controls.plunger && !this.isTilted && ballWaitingOnPlunger) {
      this.plungerTension = Math.min(1, this.plungerTension + dt * 0.95);
    } else if (releasedPlunger && this.plungerTension > 0.05) {
      const launchPower = this.plungerTension;
      this.plungerTension = 0;
      this.introTimer = 0;
      this.cameraZoom = 1.0;
      for (const b of this.balls) {
        if (b.inShooterLane && b.y > 430) {
          b.vy = -(565 + launchPower * 385 + (this.rand() - 0.5) * 14);
          b.vx = (this.rand() - 0.5) * 4;
          soundEngine.playPlungerLaunch(launchPower);
        }
      }
    } else if (!controls.plunger) {
      this.plungerTension = Math.max(0, this.plungerTension - dt * 5);
    }

    // Nudge (Bouton B)
    if (justNudge && this.nudgeCooldown <= 0 && !this.isTilted) {
      this.nudgeCooldown = 0.24;
      this.tiltMeter += 1.0;
      this.shakeOffset = {
        x: (this.rand() > 0.5 ? 1 : -1) * 3.4,
        y: -3.2,
      };

      if (this.tiltMeter >= 2.85) {
        this.isTilted = true;
        this.setCallout('TILT ! FLIPPERS BLOQUÉS', 0);
        soundEngine.playNudge(true);
      } else {
        soundEngine.playNudge(false);
        this.setCallout(this.tiltMeter >= 1.85 ? 'DANGER TILT !' : 'SECOUSSE !', 0);
        for (const b of this.balls) {
          if (!b.inShooterLane && (b.layer === 0 || b.layer === 2) && !b.heldInScoopId) {
            b.vy -= 76;
            b.vx += (113 - b.x) * 0.55 + (this.rand() - 0.5) * 28;
          }
        }
      }
    }

    // Fixed 720 Hz physics: identical trajectories at any display refresh rate
    this.physicsAccumulator += dt;
    let substeps = 0;
    while (this.physicsAccumulator >= PHYSICS_DT && substeps < MAX_SUBSTEPS_PER_FRAME) {
      this.stepFlippers(PHYSICS_DT, controls);
      this.stepBalls(PHYSICS_DT);
      this.physicsAccumulator -= PHYSICS_DT;
      substeps++;
    }
    if (substeps === MAX_SUBSTEPS_PER_FRAME) this.physicsAccumulator = 0;

    // Update Overview Zoom + Lowest-Ball Smart Camera
    this.updateSmartCamera(dt, controls);

    // Update particles & floating popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.y -= dt * 20;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 120 * dt;
      if (sp.life <= 0) this.sparks.splice(i, 1);
    }

    this.checkDrainedBalls();
    if (this.highScoresDirty && this.clock - this.lastHighScoreSave >= HIGH_SCORE_SAVE_INTERVAL) {
      this.flushHighScores();
    }
    this.prevControls = { ...controls };
  }

  private stepFlippers(dt: number, controls: InputControlsState) {
    const upSpeed = 28.5;
    const downSpeed = 20.0;

    for (const f of this.flippers) {
      const wantActive =
        !this.isTilted && (f.side === 'LEFT' ? controls.leftFlipper : controls.rightFlipper);
      f.pressed = wantActive;
      const target = wantActive ? f.activeAngle : f.restAngle;
      const prevAngle = f.angle;
      const diff = target - f.angle;

      if (Math.abs(diff) < 0.001) {
        f.angle = target;
        f.angularVelocity = 0;
      } else {
        const speed = wantActive ? upSpeed : downSpeed;
        const maxStep = speed * dt;
        if (Math.abs(diff) <= maxStep) f.angle = target;
        else f.angle += Math.sign(diff) * maxStep;
        f.angularVelocity = (f.angle - prevAngle) / dt;
      }
    }
  }

  private stepToys(dt: number) {
    const toys = this.currentTable.interactiveToys;
    if (!toys || toys.length === 0) return;
    for (const toy of toys) {
      let st = this.toyStates[toy.id];
      if (!st) {
        st = {
          hits: 0,
          flash: 0,
          angle: 0,
          spinVel: 0,
          openRatio: 0,
          activeTimer: 0,
          cooldown: 0,
        };
        this.toyStates[toy.id] = st;
      }
      if (st.flash > 0) st.flash = Math.max(0, st.flash - dt);
      if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - dt);
      if (st.activeTimer > 0) {
        st.activeTimer = Math.max(0, st.activeTimer - dt);
        if (st.activeTimer === 0 && toy.kind === 'SLIDING_CRYPT') {
          st.openRatio = 0;
        }
      }

      if (toy.kind === 'TURNTABLE' || toy.kind === 'ROTO_TARGET') {
        const baseSpin = toy.kind === 'TURNTABLE' ? 1.1 : 0;
        st.angle = (st.angle + (baseSpin + st.spinVel) * dt) % (Math.PI * 2);
        st.spinVel *= Math.exp(-2.2 * dt);
      } else if (toy.kind === 'GRAVITY_WELL') {
        st.angle = (st.angle + (2.4 + st.spinVel) * dt) % (Math.PI * 2);
        st.spinVel *= Math.exp(-2.5 * dt);
      } else if (toy.kind === 'SWING_DOORS') {
        // Amortissement ressort des portes battantes en bois de saloon
        st.openRatio += st.spinVel * dt;
        st.spinVel += (-18 * st.openRatio - 5.5 * st.spinVel) * dt;
        st.openRatio = Math.max(-1.25, Math.min(1.25, st.openRatio));
      } else if (toy.kind === 'BASH_TOY') {
        st.openRatio *= Math.exp(-10 * dt);
      }
    }
  }

  private stepBalls(dt: number) {
    const table = this.currentTable;
    const g = table.gravity;

    this.stepToys(dt);

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.rampExitCooldown > 0) {
        b.rampExitCooldown = Math.max(0, b.rampExitCooldown - dt);
      }

      // Held in Scoop / Lock Chamber (brief physical capture before kickout or tube travel)
      if (b.heldInScoopId) {
        const heldScoop = table.scoops.find((s) => s.id === b.heldInScoopId);
        if (heldScoop) {
          const pull = 1 - Math.exp(-28 * dt);
          b.x += (heldScoop.x - b.x) * pull;
          b.y += (heldScoop.y - b.y) * pull;
        }
        b.scoopTimer -= dt;
        if (b.scoopTimer <= 0) {
          const scoop = heldScoop;
          b.heldInScoopId = null;

          // Physical Lock 1/2 capture when solo ball on playfield
          if (
            scoop &&
            scoop.kind === 'UPPER_LOCK' &&
            !this.multiballActive &&
            this.lockedBallsCount === 1 &&
            this.balls.length === 1
          ) {
            this.balls.splice(i, 1);
            this.ballSaveTimer = Math.max(this.ballSaveTimer, 12.0);
            this.spawnBallInShooter(true);
            continue;
          }

          if (scoop) {
            const distToExit = Math.hypot(scoop.ejectTo.x - scoop.x, scoop.ejectTo.y - scoop.y);
            this.scoopFlashTimers[scoop.id] = 0.35;
            soundEngine.playPlungerLaunch(0.95);
            this.spawnSparks(scoop.x, scoop.y, scoop.color, 12);

            if (distToExit > 10) {
              // ZERO TELEPORTATION: launch ball visibly through the curved overhead conduit!
              b.layer = 1;
              b.activeRampId = null;
              b.activeTubeId = scoop.id;
              b.rampDist = 0;
              b.rampProgress = 0;
              b.rampSpeed = 335;
              b.rampReverse = false;
              b.rampCommitted = true;
              b.rampAwarded = true;
              b.rampEntryOffset = { x: 0, y: 0 };
            } else {
              // Local saucer kickout right from the pocket (0px jump)
              b.layer = scoop.ejectToUpperDeck && table.upperPlayfield ? 2 : 0;
              b.x = scoop.x;
              b.y = scoop.y;
              b.vx = scoop.ejectVelocity.x + (this.rand() - 0.5) * 18;
              b.vy = scoop.ejectVelocity.y;
              b.rampExitCooldown = 0.2;
            }
          }
        }
        continue;
      }

      if ((Math.floor(this.clock * 720) + b.id * 5) % 6 === 0) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();
      }

      // Layer 1A: Continuous Overhead VUK Conduit Travel (zero teleportation!)
      if (b.layer === 1 && b.activeTubeId) {
        const scoop = table.scoops.find((s) => s.id === b.activeTubeId);
        if (!scoop) {
          b.layer = 0;
          b.activeTubeId = null;
          continue;
        }
        this.stepBallInTube(b, scoop, dt);
        continue;
      }

      // Layer 1B: Continuous Catmull-Rom Overhead Ramp Track
      if (b.layer === 1 && b.activeRampId) {
        const ramp = table.ramps.find((r) => r.id === b.activeRampId);
        if (!ramp) {
          b.layer = 0;
          b.activeRampId = null;
          continue;
        }
        this.stepBallOnRamp(b, ramp, dt);
        continue;
      }

      // Layer 2: Elevated Upper Playfield ("Étage Supérieur")
      if (b.layer === 2) {
        if (!table.upperPlayfield) {
          b.layer = 0;
        } else {
          this.stepBallOnUpperPlayfield(b, table.upperPlayfield, dt);
          continue;
        }
      }

      // Layer 0: Rigid-Body Main Playfield Motion
      b.vy += g * dt;
      b.vx *= 1 - 0.05 * dt;
      b.vy *= 1 - 0.03 * dt;

      const maxSpeed = 1180;
      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (speedSq > maxSpeed * maxSpeed) {
        const scale = maxSpeed / Math.sqrt(speedSq);
        b.vx *= scale;
        b.vy *= scale;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Plunger support in right shooter lane (y: 478..514)
      if (b.x > 217 && b.y < 515) {
        const plungerTopY = 478 + this.plungerTension * 22;
        if (b.y + b.radius > plungerTopY && b.vy >= 0) {
          b.y = plungerTopY - b.radius;
          b.vy = -b.vy * 0.12;
          b.vx *= 0.8;
        }
      }

      // Exit shooter lane into Upper Arena
      if (b.inShooterLane && b.x < 214 && b.y < 92) {
        b.inShooterLane = false;
        this.gateOpenTimer = 0.3;
        if (this.ballSaveTimer <= 0 && !this.multiballActive && !this.isTilted) {
          this.ballSaveTimer = 14.0;
        }
      }

      // Left & Right Outlane Kickback Shields (y: 438..462)
      if (!this.isTilted && b.y > 438 && b.y < 462 && b.vy > 0) {
        if (this.kickbackLeftLit && b.x < 27) {
          b.vy = -720;
          b.vx = 28;
          this.kickbackLeftLit = false;
          this.kickbackFlash.LEFT = 0.65;
          soundEngine.playPlungerLaunch(0.95);
          this.spawnSparks(18, 448, table.palette.accentSecondary, 14);
          this.awardPoints(
            12000,
            'KICKBACK GAUCHE !',
            { x: 32, y: 430 },
            table.palette.accentSecondary
          );
        } else if (this.kickbackRightLit && b.x > 199 && b.x < 217) {
          b.vy = -720;
          b.vx = -28;
          this.kickbackRightLit = false;
          this.kickbackFlash.RIGHT = 0.65;
          soundEngine.playPlungerLaunch(0.95);
          this.spawnSparks(208, 448, table.palette.accentPrimary, 14);
          this.awardPoints(
            12000,
            'BOUCLIER DROIT !',
            { x: 192, y: 430 },
            table.palette.accentPrimary
          );
        }
      }

      // Check Overhead Ramp Entrances (smooth sub-pixel funnel capture, zero snap!)
      if (!this.isTilted && !b.inShooterLane && b.rampExitCooldown <= 0) {
        for (const ramp of table.ramps) {
          const dx = b.x - ramp.entry.x;
          const dy = b.y - ramp.entry.y;
          if (dx * dx + dy * dy <= ramp.entryRadius * ramp.entryRadius) {
            const alignVel = b.vx * ramp.entryDir.x + b.vy * ramp.entryDir.y;
            const minUpwardCheck = ramp.allowSideEntry ? b.vy < 35 : b.vy < -32;
            if (alignVel > 88 && minUpwardCheck) {
              const spline = this.getRampSpline(ramp);
              if (spline.samples.length < 2) continue;

              // Find nearest initial arc-length near the ramp mouth so entry is 100% seamless
              let bestDist = 0;
              let bestD2 = Infinity;
              const searchCount = Math.min(8, spline.samples.length);
              for (let si = 0; si < searchCount; si++) {
                const smp = spline.samples[si];
                const d2 = (b.x - smp.x) ** 2 + (b.y - smp.y) ** 2;
                if (d2 < bestD2) {
                  bestD2 = d2;
                  bestDist = smp.dist;
                }
              }
              const s0 = sampleSplineAtDistance(spline, bestDist);

              b.layer = 1;
              b.activeRampId = ramp.id;
              b.activeTubeId = null;
              b.rampDist = bestDist;
              b.rampProgress = bestDist / spline.totalLen;
              b.rampEntryOffset = { x: b.x - s0.x, y: b.y - s0.y };
              b.rampAwarded = false;

              if (alignVel >= 168) {
                b.rampCommitted = true;
                b.rampReverse = false;
                b.rampSpeed = Math.max(265, Math.min(460, alignVel * 1.04));
              } else {
                // Weak shot: climbs part of the slope then rolls naturally back down!
                b.rampCommitted = false;
                b.rampReverse = false;
                b.rampSpeed = alignVel * 0.92;
              }
              break;
            }
          }
        }
        if (b.layer === 1) continue;
      }

      // Check Scoops / Lock Chambers / VUK Conduits
      if (!this.isTilted && !b.inShooterLane && b.rampExitCooldown <= 0) {
        for (const sc of table.scoops) {
          const dx = b.x - sc.x;
          const dy = b.y - sc.y;
          if (dx * dx + dy * dy <= sc.radius * sc.radius) {
            const distToExit = Math.hypot(sc.ejectTo.x - sc.x, sc.ejectTo.y - sc.y);
            b.heldInScoopId = sc.id;
            b.scoopTimer = distToExit > 10 ? 0.24 : 0.45;
            b.vx = 0;
            b.vy = 0;
            this.scoopFlashTimers[sc.id] = 0.45;
            this.onScoopEntered(sc);
            break;
          }
        }
        if (b.heldInScoopId) continue;
      }

      // Collide with Cabinet Base Walls + Table Housing Walls + Extra Walls
      for (const w of this.baseWalls) this.collideBallWithSegment(b, w);
      for (const w of this.tableHousingWalls) this.collideBallWithSegment(b, w);
      for (const w of table.extraWalls) this.collideBallWithSegment(b, w);

      // Collide with Flush-Mounted Targets
      for (const t of table.targets) {
        if (t.kind === 'DROP' && this.hitTargets.has(t.id)) continue;
        const hit = this.collideBallWithSegment(b, {
          x1: t.x1,
          y1: t.y1,
          x2: t.x2,
          y2: t.y2,
          restitution: 0.68,
        });
        if (hit && !this.isTilted) {
          this.onTargetHit(t.id);
        }
      }

      // Collide with Pegs
      for (const peg of this.basePegs) {
        this.collideBallWithCircle(b, peg.x, peg.y, peg.radius, peg.restitution ?? 0.55, 0);
      }
      for (const peg of this.tableHousingPegs) {
        this.collideBallWithCircle(b, peg.x, peg.y, peg.radius, peg.restitution ?? 0.55, 0);
      }
      for (const peg of table.extraPegs) {
        this.collideBallWithCircle(b, peg.x, peg.y, peg.radius, peg.restitution ?? 0.55, 0);
      }

      // Collide with Active 3D Pop Bumpers
      for (let bi = 0; bi < table.bumpers.length; bi++) {
        const bmp = table.bumpers[bi];
        const kick = this.isTilted ? 0 : 298;
        const hit = this.collideBallWithCircle(b, bmp.x, bmp.y, bmp.radius, 0.86, kick);
        if (hit && !this.isTilted) {
          this.bumperFlashTimers[bmp.id] = 0.18;
          soundEngine.playBumperHit(this.comboCount);
          this.spawnSparks(bmp.x, bmp.y, table.palette.accentPrimary, 7);
          const golden = !!table.litBumperRotate && bi === this.litBumperIdx % table.bumpers.length;
          const pts = golden ? bmp.points * 3 : bmp.points;
          this.awardPoints(pts, golden ? `${bmp.label} DORÉ ×3 +${pts}` : `${bmp.label} +${pts}`, {
            x: bmp.x,
            y: bmp.y - 8,
          });
          if (golden) this.litBumperIdx = (this.litBumperIdx + 1 + (this.huntHits++ % 2)) % table.bumpers.length;
          this.advanceMission('BUMPER', { x: bmp.x, y: bmp.y });
        }
      }

      // Interactive Decor Toys (Volcan, Portes Saloon, Plaque Tournante, Sarcophage, Roto-Cible...)
      if (table.interactiveToys && table.interactiveToys.length > 0) {
        this.stepBallWithInteractiveToys(b, table.interactiveToys, dt);
      }

      // Cible mobile propre à la table (WANTED, fantôme, mammouth, sucette, locomotive, zombie)
      if (table.hunt) {
        const hd = table.hunt;
        const slot = hd.slots[this.huntSlot % hd.slots.length];
        const hit = this.collideBallWithCircle(b, slot.x, slot.y, hd.radius, 0.7, this.isTilted ? 0 : 140);
        if (hit && !this.isTilted) {
          this.huntHits++;
          this.huntFlash = 0.35;
          soundEngine.playBumperHit(this.comboCount);
          this.spawnSparks(slot.x, slot.y, hd.color, 10);
          this.awardPoints(hd.points, `${hd.name} +${hd.points}`, { x: slot.x, y: slot.y - 10 }, hd.color);
          this.advanceMission('TARGET', { x: slot.x, y: slot.y });
          if (this.huntHits % hd.goal === 0) {
            this.awardPoints(hd.reward, `PRIME ${hd.name} +${hd.reward} !`, { x: 113, y: 250 }, hd.color);
          }
          const n = hd.slots.length;
          this.huntSlot = hd.sequential
            ? (this.huntSlot + 1) % n
            : (this.huntSlot + 1 + ((this.huntHits * 7) % Math.max(1, n - 1))) % n;
        }
      }

      // Rollovers & Spinners
      if (!this.isTilted) {
        this.checkRolloversAndSpinners(b, dt);
      }

      // Collide with Lower-Playfield Flippers ONLY (deckLayer === 0)
      for (const f of this.flippers) {
        if (f.deckLayer === 0) {
          this.collideBallWithFlipper(b, f);
        }
      }

      // Fast Anti-Stuck Safeguard (0.7s)
      const spd = Math.hypot(b.vx, b.vy);
      const heldCradle = this.flippers.some(
        (f) =>
          f.deckLayer === 0 &&
          f.pressed &&
          Math.hypot(b.x - f.pivot.x, b.y - f.pivot.y) < f.length + 12
      );
      if (!b.inShooterLane && !heldCradle && b.y < 490 && spd < 10) {
        b.stuckTimer += dt;
        if (b.stuckTimer > 0.7) {
          b.vy = -155;
          b.vx = (b.x < 113 ? 1 : -1) * 85;
          b.stuckTimer = 0;
        }
      } else {
        b.stuckTimer = 0;
      }
    }

    // Ball-to-Ball Collisions during Multiball (only on identical layer & not in ramps/tubes)
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const b = this.balls[j];
        if (
          a.layer !== b.layer ||
          a.layer === 1 ||
          a.heldInScoopId ||
          b.heldInScoopId
        ) {
          continue;
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist > 0.0001 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minDist - dist) * 0.5;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const relNormal = rvx * nx + rvy * ny;
          if (relNormal < 0) {
            const imp = -0.92 * relNormal;
            a.vx -= imp * nx;
            a.vy -= imp * ny;
            b.vx += imp * nx;
            b.vy += imp * ny;
          }
        }
      }
    }
  }

  private stepBallOnRamp(b: BallEntity, ramp: RampDef, dt: number) {
    const spline = this.getRampSpline(ramp);
    if (spline.samples.length < 2) {
      b.layer = 0;
      b.activeRampId = null;
      return;
    }

    const cur = sampleSplineAtDistance(spline, b.rampDist);
    const g = this.currentTable.gravity;

    if (b.rampCommitted) {
      // Realistic slope acceleration: uphill (ty < 0) decelerates, downhill (ty > 0) accelerates
      b.rampSpeed += g * 0.48 * cur.ty * dt;
      b.rampSpeed = Math.max(175, Math.min(490, b.rampSpeed));
    } else {
      // Uncommitted weak entry: decelerates uphill then rolls smoothly back out the entrance
      const pullBack = Math.min(-215, g * 0.72 * Math.min(-0.35, cur.ty));
      b.rampSpeed += pullBack * dt;
      if (b.rampSpeed < 0) b.rampReverse = true;
      b.rampSpeed = Math.max(-340, b.rampSpeed);
    }

    b.rampDist += b.rampSpeed * dt;
    b.rampProgress = Math.max(0, Math.min(1, b.rampDist / spline.totalLen));

    // Smoothly center entry offset inside the ramp mouth over the first ~15px
    const offsetDecay = Math.exp(-26 * dt);
    b.rampEntryOffset.x *= offsetDecay;
    b.rampEntryOffset.y *= offsetDecay;

    // Award ramp points & mission progress when cresting the ramp!
    if (!b.rampAwarded && b.rampCommitted && b.rampProgress >= 0.62) {
      b.rampAwarded = true;
      const crest = sampleSplineAtDistance(spline, b.rampDist);
      this.onRampCompleted(ramp.id, ramp.name, ramp.points, ramp.chuteColor, {
        x: crest.x,
        y: crest.y,
      });
    }

    // Rollback exit out the entrance
    if (b.rampDist <= 0 && b.rampSpeed < 0) {
      const sStart = spline.samples[0];
      b.layer = 0;
      b.activeRampId = null;
      b.rampExitCooldown = 0.22;
      b.x = sStart.x + b.rampEntryOffset.x;
      b.y = sStart.y + b.rampEntryOffset.y;
      const outSpd = Math.max(95, Math.min(235, Math.abs(b.rampSpeed)));
      b.vx = -sStart.tx * outSpd;
      b.vy = Math.max(75, -sStart.ty * outSpd);
      return;
    }

    // Forward exit at end of ramp (onto Upper Playfield Layer 2 or Lower Playfield Layer 0)
    if (b.rampDist >= spline.totalLen) {
      const sEnd = spline.samples[spline.samples.length - 1];
      if (!b.rampAwarded && b.rampCommitted) {
        b.rampAwarded = true;
        this.onRampCompleted(ramp.id, ramp.name, ramp.points, ramp.chuteColor, {
          x: sEnd.x,
          y: sEnd.y,
        });
      }
      const toUpper = Boolean(ramp.exitsToUpperDeck && this.currentTable.upperPlayfield);
      b.layer = toUpper ? 2 : 0;
      b.activeRampId = null;
      b.rampExitCooldown = 0.24;
      b.x = sEnd.x;
      b.y = sEnd.y;
      const exitSpd = Math.max(155, Math.min(340, b.rampSpeed * 0.78));
      b.vx = sEnd.tx * exitSpd;
      b.vy = sEnd.ty * exitSpd;
      if (toUpper && this.currentTable.upperPlayfield) {
        this.setCallout(`ÉTAGE : ${this.currentTable.upperPlayfield.name.toUpperCase()}`, 0);
      }
      return;
    }

    const next = sampleSplineAtDistance(spline, b.rampDist);
    b.x = next.x + b.rampEntryOffset.x;
    b.y = next.y + b.rampEntryOffset.y;
    b.vx = next.tx * b.rampSpeed;
    b.vy = next.ty * b.rampSpeed;
  }

  private stepBallInTube(b: BallEntity, scoop: ScoopVukDef, dt: number) {
    const spline = this.getTubeSpline(scoop);
    if (spline.samples.length < 2) {
      b.layer = 0;
      b.activeTubeId = null;
      return;
    }

    b.rampDist += b.rampSpeed * dt;
    b.rampProgress = Math.max(0, Math.min(1, b.rampDist / spline.totalLen));

    if (b.rampDist >= spline.totalLen) {
      const sEnd = spline.samples[spline.samples.length - 1];
      b.layer = scoop.ejectToUpperDeck && this.currentTable.upperPlayfield ? 2 : 0;
      b.activeTubeId = null;
      b.rampExitCooldown = 0.22;
      b.x = sEnd.x;
      b.y = sEnd.y;
      b.vx = scoop.ejectVelocity.x + (this.rand() - 0.5) * 14;
      b.vy = scoop.ejectVelocity.y;
      this.scoopFlashTimers[scoop.id] = 0.3;
      this.spawnSparks(b.x, b.y, scoop.color, 10);
      return;
    }

    const s = sampleSplineAtDistance(spline, b.rampDist);
    b.x = s.x;
    b.y = s.y;
    b.vx = s.tx * b.rampSpeed;
    b.vy = s.ty * b.rampSpeed;
  }

  private stepBallOnUpperPlayfield(b: BallEntity, up: UpperPlayfieldDef, dt: number) {
    const table = this.currentTable;
    const g = table.gravity;

    b.vy += g * dt;
    b.vx *= 1 - 0.05 * dt;
    b.vy *= 1 - 0.03 * dt;

    const maxSpeed = 1020;
    const speedSq = b.vx * b.vx + b.vy * b.vy;
    if (speedSq > maxSpeed * maxSpeed) {
      const scale = maxSpeed / Math.sqrt(speedSq);
      b.vx *= scale;
      b.vy *= scale;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Collide ONLY with upper-deck closed walls, posts, upper targets, upper bumpers & upper flippers
    for (const w of this.upperDeckWalls) this.collideBallWithSegment(b, w);
    // Safety clamp against outer cabinet walls
    if (b.x - b.radius < 10) {
      b.x = 10 + b.radius;
      if (b.vx < 0) b.vx = -b.vx * 0.48;
    } else if (b.x + b.radius > 215) {
      b.x = 215 - b.radius;
      if (b.vx > 0) b.vx = -b.vx * 0.48;
    }
    if (b.y - b.radius < 22) {
      b.y = 22 + b.radius;
      if (b.vy < 0) b.vy = -b.vy * 0.48;
    }

    for (const peg of this.upperDeckPegs) {
      this.collideBallWithCircle(b, peg.x, peg.y, peg.radius, peg.restitution ?? 0.52, 0);
    }

    for (const t of up.targets) {
      if (t.kind === 'DROP' && this.hitTargets.has(t.id)) continue;
      const hit = this.collideBallWithSegment(b, {
        x1: t.x1,
        y1: t.y1,
        x2: t.x2,
        y2: t.y2,
        restitution: 0.72,
      });
      if (hit && !this.isTilted) {
        const already = this.hitTargets.has(t.id);
        this.hitTargets.add(t.id);
        const mx = (t.x1 + t.x2) * 0.5;
        const my = (t.y1 + t.y2) * 0.5;
        this.spawnSparks(mx, my, t.lampColor, 8);
        if (!already) this.advanceMission('TARGET', { x: mx, y: my });

        const bank = up.targets.filter((x) => x.bankId === t.bankId);
        if (bank.length > 0 && bank.every((x) => this.hitTargets.has(x.id))) {
          soundEngine.playTargetHit(true);
          if (t.kind === 'DROP') {
            this.dropBankResetTimers[t.bankId] = 0.65;
          } else {
            for (const bt of bank) this.hitTargets.delete(bt.id);
          }
          this.awardPoints(
            28000,
            `ÉTAGE COMPLÉTÉ : ${up.name.toUpperCase()} !`,
            { x: mx, y: my },
            '#FDE047'
          );
        } else {
          soundEngine.playTargetHit(false);
          this.awardPoints(t.points * 2, `ÉTAGE ${t.letter} ×2`, { x: mx, y: my }, t.lampColor);
        }
      }
    }

    for (const bmp of up.bumpers) {
      const hit = this.collideBallWithCircle(
        b,
        bmp.x,
        bmp.y,
        bmp.radius,
        0.86,
        this.isTilted ? 0 : 280
      );
      if (hit && !this.isTilted) {
        this.bumperFlashTimers[bmp.id] = 0.2;
        soundEngine.playBumperHit(this.comboCount + 1);
        this.spawnSparks(bmp.x, bmp.y, up.borderColor, 8);
        const pts = bmp.points * 2;
        this.awardPoints(pts, `${bmp.label} ÉTAGE +${pts}`, { x: bmp.x, y: bmp.y - 8 }, up.borderColor);
        this.advanceMission('BUMPER', { x: bmp.x, y: bmp.y });
      }
    }

    if (!this.isTilted) {
      for (const r of up.rollovers) {
        const dx = b.x - r.x;
        const dy = b.y - r.y;
        if (dx * dx + dy * dy <= (r.radius + b.radius * 0.6) ** 2) {
          if (!this.litRollovers.has(r.id)) {
            this.litRollovers.add(r.id);
            this.rolloverOffTimers[r.id] = ROLLOVER_RELIGHT_DELAY;
            soundEngine.playRollover();
            this.awardPoints(r.points * 2, `PASSAGE ÉTAGE ${r.letter}`, { x: r.x, y: r.y });
          }
        }
      }
    }

    for (const f of this.flippers) {
      if (f.deckLayer === 2) {
        this.collideBallWithFlipper(b, f);
      }
    }

    // Drop smoothly back to Layer 0 as soon as ball crosses an open edge of the upper deck!
    if (!isPointInPolygon(b.x, b.y, up.bounds)) {
      b.layer = 0;
      b.rampExitCooldown = 0.22;
      this.spawnSparks(b.x, b.y, up.borderColor, 7);
      return;
    }

    // Anti-stuck safeguard on Upper Playfield
    const spd = Math.hypot(b.vx, b.vy);
    const cradled = this.flippers.some(
      (f) =>
        f.deckLayer === 2 &&
        f.pressed &&
        Math.hypot(b.x - f.pivot.x, b.y - f.pivot.y) < f.length + 12
    );
    if (!cradled && spd < 12) {
      b.stuckTimer += dt;
      if (b.stuckTimer > 0.6) {
        b.vy = 145;
        b.vx = (b.x < 113 ? 1 : -1) * 75;
        b.stuckTimer = 0;
      }
    } else {
      b.stuckTimer = 0;
    }
  }

  private stepBallWithInteractiveToys(b: BallEntity, toys: InteractiveToyDef[], dt: number) {
    for (const toy of toys) {
      const st = this.toyStates[toy.id];
      if (!st) continue;

      if (toy.kind === 'BASH_TOY') {
        const kick = this.isTilted ? 0 : st.activeTimer > 0 ? 335 : 255;
        const hit = this.collideBallWithCircle(b, toy.x, toy.y, toy.radius, 0.84, kick);
        if (hit && !this.isTilted && st.cooldown <= 0) {
          st.cooldown = 0.12;
          st.hits++;
          st.flash = 0.35;
          st.openRatio = 1.0;
          soundEngine.playBumperHit(this.comboCount + 1);
          this.spawnSparks(toy.x, toy.y, toy.accentColor, 11);
          this.advanceMission('TARGET', { x: toy.x, y: toy.y });
          if (st.hits % Math.max(1, toy.hitsRequired) === 0) {
            st.activeTimer = 4.0;
            soundEngine.playJackpotOrMultiball();
            this.spawnSparks(toy.x, toy.y, '#FDE047', 18);
            this.awardPoints(
              toy.rewardPoints,
              `${toy.name} SURACTIVÉ !`,
              { x: toy.x, y: toy.y - 10 },
              '#FDE047'
            );
          } else {
            this.awardPoints(
              toy.points,
              `${toy.name} (${st.hits % toy.hitsRequired}/${toy.hitsRequired})`,
              { x: toy.x, y: toy.y - 8 },
              toy.accentColor
            );
          }
        }
      } else if (toy.kind === 'SWING_DOORS') {
        // Deux montants latéraux en bois + portes battantes traversables au centre
        this.collideBallWithCircle(b, toy.x - toy.radius - 2, toy.y, 2.5, 0.55, 0);
        this.collideBallWithCircle(b, toy.x + toy.radius + 2, toy.y, 2.5, 0.55, 0);
        if (
          !this.isTilted &&
          st.cooldown <= 0 &&
          Math.abs(b.x - toy.x) <= toy.radius &&
          Math.abs(b.y - toy.y) <= 6.5 &&
          Math.abs(b.vy) > 35
        ) {
          st.cooldown = 0.3;
          st.hits++;
          st.flash = 0.35;
          const dir = b.vy < 0 ? 1 : -1;
          st.openRatio = dir * 0.95;
          st.spinVel = dir * 13;
          b.vx *= 0.95;
          b.vy *= 0.92;
          soundEngine.playTargetHit(st.hits % Math.max(1, toy.hitsRequired) === 0);
          this.spawnSparks(toy.x, toy.y, toy.accentColor, 8);
          this.advanceMission('RAMP', { x: toy.x, y: toy.y });
          if (st.hits % Math.max(1, toy.hitsRequired) === 0) {
            this.awardPoints(
              toy.rewardPoints,
              `${toy.name} : ENTRÉE FRACASSANTE !`,
              { x: toy.x, y: toy.y - 10 },
              '#FDE047'
            );
          } else {
            this.awardPoints(toy.points, toy.name, { x: toy.x, y: toy.y - 8 }, toy.accentColor);
          }
        }
      } else if (toy.kind === 'TURNTABLE') {
        const dx = b.x - toy.x;
        const dy = b.y - toy.y;
        const dist = Math.hypot(dx, dy);
        if (dist < toy.radius + b.radius && dist > 0.5) {
          const nx = dx / dist;
          const ny = dy / dist;
          // Force tangentielle d'entraînement du plateau tournant (dévie la trajectoire avec panache)
          const tangSign = st.spinVel >= 0 ? 1 : -1;
          const swirlForce = 210 + Math.min(220, Math.abs(st.spinVel) * 18);
          b.vx += -ny * tangSign * swirlForce * dt;
          b.vy += nx * tangSign * swirlForce * dt;

          if (!this.isTilted && st.cooldown <= 0 && dist < toy.radius) {
            st.cooldown = 0.28;
            st.hits++;
            st.flash = 0.3;
            const cross = dx * b.vy - dy * b.vx;
            st.spinVel = (cross >= 0 ? 1 : -1) * 15;
            soundEngine.playSpinnerTick();
            this.spawnSparks(b.x, b.y, toy.accentColor, 6);
            this.advanceMission('BUMPER', { x: toy.x, y: toy.y });
            if (st.hits % Math.max(1, toy.hitsRequired) === 0) {
              // Éjection centrifuge haute vitesse !
              b.vx += nx * 165;
              b.vy += ny * 165;
              soundEngine.playTargetHit(true);
              this.awardPoints(
                toy.rewardPoints,
                `TURBO ${toy.name} !`,
                { x: toy.x, y: toy.y - 10 },
                '#FDE047'
              );
            } else {
              this.awardPoints(toy.points, toy.name, { x: toy.x, y: toy.y - 8 }, toy.accentColor);
            }
          }
        }
      } else if (toy.kind === 'GRAVITY_WELL') {
        const dx = toy.x - b.x;
        const dy = toy.y - b.y;
        const dist = Math.hypot(dx, dy);
        const reach = toy.radius * 1.55;
        if (dist < reach && dist > 2) {
          const ux = dx / dist;
          const uy = dy / dist;
          const pull = 195 * (1 - dist / reach);
          b.vx += (ux * pull - uy * 125) * dt;
          b.vy += (uy * pull + ux * 125) * dt;
          // Garantit que la bille ne stagne jamais dans l'anneau gravitationnel
          const curSpd = Math.hypot(b.vx, b.vy);
          if (curSpd < 135) {
            b.vx += -uy * 95 * dt;
            b.vy += ux * 95 * dt;
          }

          if (!this.isTilted && st.cooldown <= 0 && dist < toy.radius * 0.72) {
            st.cooldown = 0.68;
            st.hits++;
            st.flash = 0.38;
            st.spinVel = 16;
            // Fronde orbitale !
            const slingSpd = Math.max(295, curSpd * 1.18);
            const outAng = Math.atan2(-uy, -ux) + 0.45;
            b.vx = Math.cos(outAng) * slingSpd;
            b.vy = Math.sin(outAng) * slingSpd;
            soundEngine.playRampClimb(this.comboCount + 1);
            this.spawnSparks(toy.x, toy.y, toy.accentColor, 12);
            this.advanceMission('RAMP', { x: toy.x, y: toy.y });
            if (st.hits % Math.max(1, toy.hitsRequired) === 0) {
              this.awardPoints(
                toy.rewardPoints,
                `FRONDE ${toy.name} !`,
                { x: toy.x, y: toy.y - 10 },
                '#FDE047'
              );
            } else {
              this.awardPoints(toy.points, toy.name, { x: toy.x, y: toy.y - 8 }, toy.accentColor);
            }
          }
        }
      } else if (toy.kind === 'SLIDING_CRYPT') {
        if (st.activeTimer > 0) {
          // Le couvercle de pierre est ouvert : passage secret vers la crypte !
          const dx = b.x - toy.x;
          const dy = b.y - toy.y;
          if (!this.isTilted && st.cooldown <= 0 && dx * dx + dy * dy <= (toy.radius * 0.9) ** 2) {
            st.cooldown = 0.45;
            st.flash = 0.45;
            b.vx = (this.rand() - 0.5) * 90;
            b.vy = -430;
            soundEngine.playJackpotOrMultiball();
            this.spawnSparks(toy.x, toy.y, '#38BDF8', 18);
            this.advanceMission('SCOOP', { x: toy.x, y: toy.y }, true);
            this.awardPoints(
              toy.rewardPoints,
              `TRÉSOR DU ${toy.name} !`,
              { x: toy.x, y: toy.y - 12 },
              '#FDE047'
            );
          }
        } else {
          // Couvercle scellé : chaque impact fait coulisser la dalle de pierre
          const hit = this.collideBallWithCircle(
            b,
            toy.x,
            toy.y,
            toy.radius,
            0.78,
            this.isTilted ? 0 : 225
          );
          if (hit && !this.isTilted && st.cooldown <= 0) {
            st.cooldown = 0.15;
            st.hits++;
            st.flash = 0.35;
            const req = Math.max(1, toy.hitsRequired);
            const stepInCycle = st.hits % req;
            if (stepInCycle === 0) {
              st.activeTimer = 7.5;
              st.openRatio = 1.0;
              soundEngine.playTargetHit(true);
              this.spawnSparks(toy.x, toy.y, toy.accentColor, 15);
              this.awardPoints(
                toy.points * 2,
                `${toy.name} OUVERT ! TIREZ DEDANS !`,
                { x: toy.x, y: toy.y - 10 },
                toy.accentColor
              );
            } else {
              st.openRatio = stepInCycle / req;
              soundEngine.playTargetHit(false);
              this.spawnSparks(toy.x, toy.y, toy.accentColor, 7);
              this.awardPoints(
                toy.points,
                `SCEAU ${stepInCycle}/${req}`,
                { x: toy.x, y: toy.y - 8 },
                toy.accentColor
              );
            }
            this.advanceMission('TARGET', { x: toy.x, y: toy.y });
          }
        }
      } else if (toy.kind === 'ROTO_TARGET') {
        const hit = this.collideBallWithCircle(
          b,
          toy.x,
          toy.y,
          toy.radius,
          0.82,
          this.isTilted ? 0 : 240
        );
        if (hit && !this.isTilted && st.cooldown <= 0) {
          st.cooldown = 0.14;
          st.hits++;
          st.flash = 0.35;
          st.spinVel = 22;
          const mult = 1 + (st.hits % 3);
          soundEngine.playTargetHit(st.hits % Math.max(1, toy.hitsRequired) === 0);
          this.spawnSparks(toy.x, toy.y, toy.accentColor, 9);
          this.advanceMission('TARGET', { x: toy.x, y: toy.y });
          if (st.hits % Math.max(1, toy.hitsRequired) === 0) {
            this.awardPoints(
              toy.rewardPoints,
              `ROTO SPÉCIAL +${toy.rewardPoints} !`,
              { x: toy.x, y: toy.y - 10 },
              '#FDE047'
            );
          } else {
            this.awardPoints(
              toy.points * mult,
              `${toy.name} ×${mult}`,
              { x: toy.x, y: toy.y - 8 },
              toy.accentColor
            );
          }
        }
      }
    }
  }

  private onScoopEntered(scoop: PinballTableDef['scoops'][number]) {
    // Any scoop hit also advances the current mission as a Command Joker!
    this.advanceMission('SCOOP', { x: scoop.x, y: scoop.y }, true);

    if (scoop.kind === 'UPPER_LOCK') {
      if (!this.multiballActive) {
        this.lockedBallsCount++;
        if (this.lockedBallsCount >= 2) {
          this.lockedBallsCount = 0;
          this.triggerMultiball();
        } else {
          soundEngine.playJackpotOrMultiball();
          this.awardPoints(
            25000,
            `BILLE 1 VERROUILLÉE (1/2) !`,
            { x: scoop.x, y: scoop.y },
            '#FDE047'
          );
        }
      } else {
        soundEngine.playJackpotOrMultiball();
        this.awardPoints(
          45000,
          `SUPER JACKPOT VERROU !`,
          { x: scoop.x, y: scoop.y },
          '#FDE047'
        );
      }
    } else {
      soundEngine.playRampClimb(this.comboCount + 1);
      this.comboCount = this.comboTimer > 0 ? this.comboCount + 1 : 1;
      this.comboTimer = this.maxComboTimer;
      this.awardPoints(
        scoop.points * Math.max(1, this.comboCount),
        scoop.name,
        { x: scoop.x, y: scoop.y },
        scoop.color
      );
    }
  }

  private onRampCompleted(
    _rampId: string,
    rampName: string,
    basePoints: number,
    color: string,
    pos: Vec2
  ) {
    this.comboCount = this.comboTimer > 0 ? this.comboCount + 1 : 1;
    this.comboTimer = this.maxComboTimer;

    const p = this.players[this.activePlayerIndex];
    if (p) {
      p.rampsCompleted++;
      if (this.comboCount > p.maxCombo) p.maxCombo = this.comboCount;
    }

    if (this.jackpotLit && this.multiballActive) {
      const jackpotPts = 60000 * Math.max(1, this.comboCount) * this.jackpotMultiplierBoost;
      soundEngine.playJackpotOrMultiball();
      this.spawnSparks(pos.x, pos.y, '#FDE047', 16);
      this.awardPoints(jackpotPts, `${this.currentTable.jackpotName} !`, pos, '#FDE047');
    } else {
      const pts = basePoints * Math.max(1, this.comboCount) * this.jackpotMultiplierBoost;
      soundEngine.playRampClimb(this.comboCount);
      this.spawnSparks(pos.x, pos.y, color, 10);
      const comboSuffix = this.comboCount > 1 ? ` ×${this.comboCount}` : '';
      this.awardPoints(pts, `${rampName}${comboSuffix}`, pos, color);
    }

    this.advanceMission('RAMP', pos);
  }

  private onTargetHit(targetId: string) {
    const table = this.currentTable;
    const target = table.targets.find((t) => t.id === targetId);
    if (!target) return;

    const alreadyHit = this.hitTargets.has(targetId);
    this.hitTargets.add(targetId);

    const bankTargets = table.targets.filter((t) => t.bankId === target.bankId);
    const bankComplete = bankTargets.every((t) => this.hitTargets.has(t.id));

    const midPos = { x: (target.x1 + target.x2) * 0.5, y: (target.y1 + target.y2) * 0.5 };
    this.spawnSparks(midPos.x, midPos.y, target.lampColor, 6);

    if (!alreadyHit) {
      this.advanceMission('TARGET', midPos);
    }

    if (bankComplete) {
      soundEngine.playTargetHit(true);
      if (target.kind === 'DROP') {
        this.dropBankResetTimers[target.bankId] = 0.6;
      } else {
        for (const bt of bankTargets) this.hitTargets.delete(bt.id);
      }

      if (target.bankRole === 'MULTIPLIER') {
        const p = this.players[this.activePlayerIndex];
        if (p) {
          p.bonusMultiplier = Math.min(8, p.bonusMultiplier + 1);
          this.awardPoints(
            20000,
            `BANQUE COMPLÈTE · BONUS ×${p.bonusMultiplier}`,
            midPos,
            '#FACC15'
          );
        }
      } else if (target.bankRole === 'MULTIBALL') {
        this.triggerMultiball();
      } else if (target.bankRole === 'KICKBACK') {
        this.kickbackLeftLit = true;
        this.kickbackRightLit = true;
        this.awardPoints(18000, 'DOUBLES BOUCLIERS ACTIFS !', midPos, '#22C55E');
      } else if (target.bankRole === 'JACKPOT_BOOST') {
        this.jackpotMultiplierBoost = Math.min(3, this.jackpotMultiplierBoost + 1);
        this.awardPoints(
          20000,
          `RAMPES & JACKPOTS ×${this.jackpotMultiplierBoost} !`,
          midPos,
          '#38BDF8'
        );
      }
    } else {
      soundEngine.playTargetHit(false);
      const pts = alreadyHit ? Math.round(target.points * 0.5) : target.points;
      this.awardPoints(pts, `CIBLE ${target.letter}`, midPos, target.lampColor);
    }
  }

  public triggerMultiball() {
    const table = this.currentTable;
    soundEngine.playJackpotOrMultiball();
    this.multiballActive = true;
    this.jackpotLit = true;
    this.lockedBallsCount = 0;
    this.ballSaveTimer = Math.max(this.ballSaveTimer, 16.0);

    const neededBalls = Math.max(1, 3 - this.balls.length);
    this.multiballSpawnQueue = Math.min(3, this.multiballSpawnQueue + neededBalls);
    this.multiballSpawnDelay = 0.2;

    this.awardPoints(
      40000,
      `${table.multiballName} (3 BILLES) !`,
      { x: 113, y: this.cameraY + 120 },
      '#FDE047'
    );
    this.spawnSparks(113, this.cameraY + 120, '#FDE047', 20);
  }

  private checkRolloversAndSpinners(b: BallEntity, dt: number) {
    const table = this.currentTable;

    for (const r of table.rollovers) {
      const dx = b.x - r.x;
      const dy = b.y - r.y;
      if (dx * dx + dy * dy <= (r.radius + b.radius * 0.6) ** 2) {
        if (!this.litRollovers.has(r.id)) {
          this.litRollovers.add(r.id);
          soundEngine.playRollover();

          if (this.skillShotAvailable && r.id === this.skillShotRolloverId) {
            this.skillShotAvailable = false;
            this.spawnSparks(r.x, r.y, '#FDE047', 14);
            this.awardPoints(
              30000,
              `${table.skillShotLabel} +30 000 !`,
              { x: r.x, y: r.y + 8 },
              '#FDE047'
            );
          } else {
            this.skillShotAvailable = false;
            this.awardPoints(r.points, `COULOIR ${r.letter}`, { x: r.x, y: r.y + 8 });
          }

          if (r.groupId === 'TOP_LANES') {
            const topLanes = table.rollovers.filter((x) => x.groupId === 'TOP_LANES');
            if (topLanes.every((x) => this.litRollovers.has(x.id))) {
              topLanes.forEach((x) => this.litRollovers.delete(x.id));
              this.kickbackLeftLit = true;
              const p = this.players[this.activePlayerIndex];
              if (p) p.bonusMultiplier = Math.min(8, p.bonusMultiplier + 1);
              soundEngine.playTargetHit(true);
              this.awardPoints(15000, 'BONUS + KICKBACK ACTIVÉ !', { x: 113, y: 70 }, '#FACC15');
            }
          } else {
            this.rolloverOffTimers[r.id] = ROLLOVER_RELIGHT_DELAY;
          }
        }
      }
    }

    if (!b.inShooterLane && b.y > 120) {
      this.skillShotAvailable = false;
    }

    for (const sp of table.spinners) {
      const sdx = b.x - sp.x;
      const sdy = b.y - sp.y;
      if (sdx * sdx + sdy * sdy < (sp.width * 0.65) ** 2) {
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 65) {
          this.spinnerVelocities[sp.id] =
            Math.max(this.spinnerVelocities[sp.id] ?? 0, spd * 0.15) * (1 + dt);
        }
      }
    }
  }

  private collideBallWithSegment(b: BallEntity, w: WallSegment): boolean {
    if (w.oneWayNormal && b.inShooterLane) {
      const approach = b.vx * w.oneWayNormal.x + b.vy * w.oneWayNormal.y;
      if (approach > 0) return false;
    }

    const vx = w.x2 - w.x1;
    const vy = w.y2 - w.y1;
    const segLenSq = vx * vx + vy * vy;
    if (segLenSq < 0.0001) return false;

    const wx = b.x - w.x1;
    const wy = b.y - w.y1;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / segLenSq));

    const cx = w.x1 + t * vx;
    const cy = w.y1 + t * vy;
    const dx = b.x - cx;
    const dy = b.y - cy;
    const distSq = dx * dx + dy * dy;

    if (distSq >= b.radius * b.radius || distSq < 1e-8) return false;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    b.x += nx * (b.radius - dist);
    b.y += ny * (b.radius - dist);

    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const rest = w.restitution ?? 0.45;
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;

      if (w.isKicker && !this.isTilted && Math.abs(vn) > 35) {
        const kickDirX = w.kickerSide === 'LEFT' ? 0.85 : -0.85;
        const kickDirY = -0.52;
        if (nx * kickDirX + ny * kickDirY > 0.4) {
          b.vx = kickDirX * 345;
          b.vy = kickDirY * 345;
          if (w.kickerSide) this.slingshotFlash[w.kickerSide] = 0.16;
          soundEngine.playSlingshot();
          this.awardPoints(750);
        }
      }
      return true;
    }
    return false;
  }

  private collideBallWithCircle(
    b: BallEntity,
    cx: number,
    cy: number,
    r: number,
    restitution: number,
    activeKick: number
  ): boolean {
    const dx = b.x - cx;
    const dy = b.y - cy;
    const minDist = b.radius + r;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist || distSq < 1e-8) return false;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    b.x = cx + nx * minDist;
    b.y = cy + ny * minDist;

    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0 || activeKick > 0) {
      if (vn < 0) {
        b.vx -= (1 + restitution) * vn * nx;
        b.vy -= (1 + restitution) * vn * ny;
      }
      if (activeKick > 0) {
        const curOut = b.vx * nx + b.vy * ny;
        const boost = Math.max(activeKick, curOut);
        b.vx += (boost - curOut) * nx;
        b.vy += (boost - curOut) * ny;
      }
      return true;
    }
    return false;
  }

  private collideBallWithFlipper(b: BallEntity, f: FlipperState) {
    const tipX = f.pivot.x + Math.cos(f.angle) * f.length;
    const tipY = f.pivot.y + Math.sin(f.angle) * f.length;

    const vx = tipX - f.pivot.x;
    const vy = tipY - f.pivot.y;
    const lenSq = vx * vx + vy * vy;

    const wx = b.x - f.pivot.x;
    const wy = b.y - f.pivot.y;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));

    const cx = f.pivot.x + t * vx;
    const cy = f.pivot.y + t * vy;

    const dx = b.x - cx;
    const dy = b.y - cy;
    const minDist = b.radius + f.radius;
    const distSq = dx * dx + dy * dy;

    if (distSq >= minDist * minDist || distSq < 1e-8) return;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    b.x = cx + nx * (minDist + 0.15);
    b.y = cy + ny * (minDist + 0.15);

    const leverDist = t * f.length;
    const surfVx = -leverDist * Math.sin(f.angle) * f.angularVelocity;
    const surfVy = leverDist * Math.cos(f.angle) * f.angularVelocity;

    const relVx = b.vx - surfVx;
    const relVy = b.vy - surfVy;
    const relNormal = relVx * nx + relVy * ny;

    if (relNormal < 0) {
      const restitution = Math.abs(f.angularVelocity) > 2 ? 0.54 : 0.26;
      const j = -(1 + restitution) * relNormal;
      b.vx += j * nx;
      b.vy += j * ny;

      const tx = -ny;
      const ty = nx;
      const relTang = relVx * tx + relVy * ty;
      b.vx -= relTang * 0.18 * tx;
      b.vy -= relTang * 0.18 * ty;

      if (Math.abs(f.angularVelocity) > 8 && ny < -0.15) {
        const extraSnap = (f.zone === 'MAIN' ? 82 : 65) + t * 105;
        b.vx += nx * extraSnap;
        b.vy += ny * extraSnap;
      }
    }
  }

  private checkDrainedBalls() {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.y - b.radius > WORLD_HEIGHT + 8) {
        this.balls.splice(i, 1);

        if (this.ballSaveTimer > 0 && !this.isTilted) {
          // During Multiball ball-save or regular ball-save, re-serve saved balls!
          if (this.multiballActive && this.balls.length + this.multiballSpawnQueue < 3) {
            this.multiballSpawnQueue++;
            this.multiballSpawnDelay = 0.25;
            this.setCallout('MULTIBILLE SAUVÉE !', 0);
            continue;
          } else if (!this.multiballActive && this.balls.length === 0) {
            this.ballSaveTimer = 0;
            this.spawnBallInShooter(true);
            this.setCallout('BILLE SAUVÉE !', 0);
            continue;
          }
        }
      }
    }

    if (this.multiballActive && this.balls.length <= 1 && this.multiballSpawnQueue === 0) {
      this.multiballActive = false;
      this.jackpotLit = false;
    }

    if (this.balls.length === 0 && this.multiballSpawnQueue === 0 && this.gameState === 'PLAYING') {
      soundEngine.playDrain();
      const player = this.players[this.activePlayerIndex];

      if (player && !this.isTilted) {
        const bonusAward = player.bonusPoints * player.bonusMultiplier;
        player.score += bonusAward;
        if (player.score > this.highScores[this.currentTable.id]) {
          this.highScores[this.currentTable.id] = player.score;
          this.highScoresDirty = true;
        }
      }

      if (player) player.ballsRemaining--;

      let foundNext = false;
      for (let step = 1; step <= this.playerCount; step++) {
        const candIdx = (this.activePlayerIndex + step) % this.playerCount;
        if (this.players[candIdx].ballsRemaining > 0) {
          this.activePlayerIndex = candIdx;
          this.currentBallNumber = TOTAL_BALLS_PER_GAME - this.players[candIdx].ballsRemaining + 1;
          foundNext = true;
          break;
        }
      }

      if (foundNext) {
        const pTag = this.playerCount > 1 ? `JOUEUR ${this.activePlayerIndex + 1} · ` : '';
        // Only show full-table overview zoom on Ball 1 (or multiplayer switch), keep Balls 2-3 snappy!
        const showOverview = this.currentBallNumber === 1 && this.activePlayerIndex === 0;
        this.setupBallForCurrentPlayer(
          `${pTag}BILLE ${this.currentBallNumber}/${TOTAL_BALLS_PER_GAME}`,
          showOverview
        );
      } else {
        this.gameState = 'GAME_OVER';
        this.flushHighScores();
        this.setCallout('FIN DE PARTIE', 0);
      }
    }
  }

  public getSnapshot(): LiveGameSnapshot {
    const activePlayer = this.players[this.activePlayerIndex];
    const missions = this.currentTable.missions;
    const activeMission =
      missions[(activePlayer?.activeMissionIndex ?? 0) % missions.length] ?? missions[0];

    return {
      gameState: this.gameState,
      selectedTableId: this.currentTable.id,
      playerCount: this.playerCount,
      activePlayerIndex: this.activePlayerIndex,
      currentBallNumber: this.currentBallNumber,
      totalBallsPerGame: TOTAL_BALLS_PER_GAME,
      players: this.players.map((p) => ({ ...p })),
      comboCount: this.comboCount,
      comboTimer: this.comboTimer,
      maxComboTimer: this.maxComboTimer,
      lastPointsScored: this.lastPointsScored,
      lastCallout: this.lastCallout,
      calloutTimer: this.calloutTimer,
      plungerTension: this.plungerTension,
      tiltWarning: this.tiltMeter,
      isTilted: this.isTilted,
      ballSaveTimer: this.ballSaveTimer,
      kickbackLeftLit: this.kickbackLeftLit,
      kickbackRightLit: this.kickbackRightLit,
      lockedBallsCount: this.lockedBallsCount,
      multiballActive: this.multiballActive,
      activeBallsCount: this.balls.length + this.multiballSpawnQueue,
      jackpotLit: this.jackpotLit,
      cameraY: this.cameraY,
      cameraZoom: this.cameraZoom,
      activeMissionTitle: activeMission.title,
      activeMissionDesc: activeMission.description,
      activeMissionProgress: activePlayer?.missionStepProgress ?? 0,
      activeMissionGoal: activeMission.goal,
      missionsCompleted: activePlayer?.missionsCompleted ?? 0,
      highScores: { ...this.highScores },
    };
  }
}
