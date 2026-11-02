import { soundEngine } from '../audio/soundEngine';
import { PINBALL_TABLES, loadHighScores, saveHighScores } from '../data/tables';
import {
  BallEntity,
  FlipperState,
  FloatingPopup,
  GameState,
  InputControlsState,
  LiveGameSnapshot,
  MAX_CAMERA_Y,
  MissionEventKind,
  OVERVIEW_ZOOM,
  PinballTableDef,
  PlayerSession,
  PostPeg,
  SCREEN_WIDTH,
  SparkParticle,
  TableThemeId,
  VIEWPORT_HEIGHT,
  Vec2,
  WORLD_HEIGHT,
  WallSegment,
} from '../types/pinball';

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
  public highScores: Record<TableThemeId, number> = loadHighScores();
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
  private rampLengthCache: Map<string, { segLens: number[]; totalLen: number }> = new Map();

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

  public get currentTable(): PinballTableDef {
    return PINBALL_TABLES[this.selectedTableIndex];
  }

  /**
   * Rebuilds flippers and beveled target/island housings specific to the selected table!
   */
  public syncTableGeometry() {
    const table = this.currentTable;
    soundEngine.setTheme(table.id === 'star_galaxy' ? 'starwars' : 'default');

    // 2 Main Lower Arena Flippers (y = 468) + Table-Specific Extra Flippers
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
      },
    ];

    const extras: FlipperState[] = table.extraFlippers.map((ef) => ({
      ...ef,
      angle: ef.restAngle,
      angularVelocity: 0,
      pressed: false,
    }));

    this.flippers = [...mainFlippers, ...extras];

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
    this.kickbackLeftLit = true;
    this.kickbackRightLit = false;
    this.jackpotMultiplierBoost = 1;
    this.cameraY = MAX_CAMERA_Y;

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
      rampProgress: 0,
      rampSpeed: 0,
      rampReverse: false,
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

    if (player.score > this.highScores[this.currentTable.id]) {
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

    // Drop target bank auto-resets
    for (const bankId of Object.keys(this.dropBankResetTimers)) {
      this.dropBankResetTimers[bankId] -= dt;
      if (this.dropBankResetTimers[bankId] <= 0) {
        delete this.dropBankResetTimers[bankId];
        for (const t of this.currentTable.targets) {
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
          if (!b.inShooterLane && b.layer === 0 && !b.heldInScoopId) {
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

  private stepBalls(dt: number) {
    const table = this.currentTable;
    const g = table.gravity;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];

      // Held in Scoop / VUK Teleport Tube?
      if (b.heldInScoopId) {
        b.scoopTimer -= dt;
        if (b.scoopTimer <= 0) {
          const scoop = table.scoops.find((s) => s.id === b.heldInScoopId);
          b.heldInScoopId = null;

          // If this was Lock 1/2 (physical ball capture!) and solo ball on playfield:
          if (
            scoop &&
            scoop.kind === 'UPPER_LOCK' &&
            !this.multiballActive &&
            this.lockedBallsCount === 1 &&
            this.balls.length === 1
          ) {
            // Physically lock this ball inside the saucer and auto-launch next ball!
            this.balls.splice(i, 1);
            this.ballSaveTimer = Math.max(this.ballSaveTimer, 12.0);
            this.spawnBallInShooter(true);
            continue;
          }

          if (scoop) {
            b.x = scoop.ejectTo.x;
            b.y = scoop.ejectTo.y;
            b.vx = scoop.ejectVelocity.x + (this.rand() - 0.5) * 18;
            b.vy = scoop.ejectVelocity.y;
            b.trail = [];
            this.scoopFlashTimers[scoop.id] = 0.35;
            soundEngine.playPlungerLaunch(0.95);
            this.spawnSparks(b.x, b.y, scoop.color, 14);
          }
        }
        continue;
      }

      if (Math.random() < 0.32) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();
      }

      // Layer 1: Overhead Ramp Track
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

      // Layer 0: Rigid-Body Playfield Motion
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

      // Check Overhead Ramp Entrances
      if (!this.isTilted && !b.inShooterLane) {
        for (const ramp of table.ramps) {
          const dx = b.x - ramp.entry.x;
          const dy = b.y - ramp.entry.y;
          if (dx * dx + dy * dy <= ramp.entryRadius * ramp.entryRadius) {
            const alignVel = b.vx * ramp.entryDir.x + b.vy * ramp.entryDir.y;
            const minUpwardCheck = ramp.allowSideEntry ? b.vy < 25 : b.vy < -45;
            if (alignVel > 125 && minUpwardCheck) {
              b.layer = 1;
              b.activeRampId = ramp.id;
              b.rampProgress = 0.02;
              if (alignVel >= 175) {
                b.rampReverse = false;
                b.rampSpeed = Math.max(310, Math.min(520, alignVel * 1.06));
                this.onRampCompleted(ramp.id, ramp.name, ramp.points, ramp.chuteColor, ramp.entry);
              } else {
                b.rampReverse = true;
                b.rampSpeed = alignVel * 0.85;
              }
              break;
            }
          }
        }
        if (b.layer === 1) continue;
      }

      // Check Scoops / Lock Chambers / VUK Teleporters
      if (!this.isTilted && !b.inShooterLane) {
        for (const sc of table.scoops) {
          const dx = b.x - sc.x;
          const dy = b.y - sc.y;
          if (dx * dx + dy * dy <= sc.radius * sc.radius) {
            b.heldInScoopId = sc.id;
            b.scoopTimer = 0.5;
            b.x = sc.x;
            b.y = sc.y;
            b.vx = 0;
            b.vy = 0;
            this.scoopFlashTimers[sc.id] = 0.5;
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
      for (const bmp of table.bumpers) {
        const kick = this.isTilted ? 0 : 298;
        const hit = this.collideBallWithCircle(b, bmp.x, bmp.y, bmp.radius, 0.86, kick);
        if (hit && !this.isTilted) {
          this.bumperFlashTimers[bmp.id] = 0.18;
          soundEngine.playBumperHit(this.comboCount);
          this.spawnSparks(bmp.x, bmp.y, table.palette.accentPrimary, 7);
          this.awardPoints(bmp.points, `${bmp.label} +${bmp.points}`, { x: bmp.x, y: bmp.y - 8 });
          this.advanceMission('BUMPER', { x: bmp.x, y: bmp.y });
        }
      }

      // Rollovers & Spinners
      if (!this.isTilted) {
        this.checkRolloversAndSpinners(b, dt);
      }

      // Collide with all Table Flippers
      for (const f of this.flippers) {
        this.collideBallWithFlipper(b, f);
      }

      // Fast Anti-Stuck Safeguard (0.7s)
      const spd = Math.hypot(b.vx, b.vy);
      const heldCradle = this.flippers.some(
        (f) => f.pressed && Math.hypot(b.x - f.pivot.x, b.y - f.pivot.y) < f.length + 12
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

    // Ball-to-Ball Collisions during Multiball!
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const b = this.balls[j];
        if (a.layer !== b.layer || a.heldInScoopId || b.heldInScoopId) continue;
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

  private stepBallOnRamp(b: BallEntity, ramp: PinballTableDef['ramps'][number], dt: number) {
    const pts = ramp.path;
    let cached = this.rampLengthCache.get(ramp.id);
    if (!cached) {
      const lens: number[] = [];
      let sum = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        lens.push(l);
        sum += l;
      }
      cached = { segLens: lens, totalLen: sum };
      this.rampLengthCache.set(ramp.id, cached);
    }
    const { segLens, totalLen } = cached;

    if (b.rampReverse) {
      b.rampSpeed -= 380 * dt;
      b.rampProgress += (b.rampSpeed * dt) / Math.max(1, totalLen);
      if (b.rampProgress <= 0) {
        b.layer = 0;
        b.activeRampId = null;
        b.x = pts[0].x;
        b.y = pts[0].y + 8;
        b.vx = -ramp.entryDir.x * 115;
        b.vy = 145;
        return;
      }
    } else {
      b.rampProgress += (b.rampSpeed * dt) / Math.max(1, totalLen);
      if (b.rampProgress >= 1) {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        b.layer = 0;
        b.activeRampId = null;
        b.x = last.x;
        b.y = last.y;
        b.vx = (dx / len) * 90;
        b.vy = Math.max(85, (dy / len) * 140);
        return;
      }
    }

    let targetDist = Math.max(0, Math.min(1, b.rampProgress)) * totalLen;
    for (let i = 0; i < segLens.length; i++) {
      if (targetDist <= segLens[i] || i === segLens.length - 1) {
        const t = segLens[i] > 0 ? targetDist / segLens[i] : 0;
        b.x = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
        b.y = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
        break;
      }
      targetDist -= segLens[i];
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
