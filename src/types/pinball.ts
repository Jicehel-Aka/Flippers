export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;
export const HUD_HEIGHT = 46;
export const VIEWPORT_HEIGHT = SCREEN_HEIGHT - HUD_HEIGHT; // 274px visible playfield window
export const WORLD_HEIGHT = 520; // ~1.9x screens tall: punchy, balanced arcade pinball proportions!
export const MAX_CAMERA_Y = WORLD_HEIGHT - VIEWPORT_HEIGHT; // 246px vertical scroll range
export const OVERVIEW_ZOOM = VIEWPORT_HEIGHT / WORLD_HEIGHT; // ~0.527x full-table overview zoom

export type GameState = 'TABLE_SELECT' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type ConsoleViewMode = 'CONSOLE_90' | 'SCREEN_ZOOM' | 'NATIVE_0';

export type TableThemeId = 'aka_esp32' | 'space_odyssey' | 'star_galaxy' | 'solaire' | 'classique' | 'prehistoire' | 'farwest' | 'halloween' | 'candy' | 'bonbons' | 'train';

export type BumperColorStyle = 'RED' | 'BLUE' | 'GOLD' | 'JADE';
export type BumperIconStyle = 'GEAR' | 'STAR' | 'CREST' | 'SUN';
export type RampVisualStyle = 'MOLDED_ACRYLIC' | 'WIREFORM_RAIL';
export type MissionEventKind = 'RAMP' | 'BUMPER' | 'TARGET' | 'SCOOP';

export interface Vec2 {
  x: number;
  y: number;
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  restitution?: number;
  isKicker?: boolean;
  kickerSide?: 'LEFT' | 'RIGHT';
  oneWayNormal?: Vec2;
}

export interface BeveledHousingDef {
  points: Vec2[];
  fillColor?: string;
}

export interface PostPeg {
  x: number;
  y: number;
  radius: number;
  restitution?: number;
}

export interface BumperDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  points: number;
  label: string;
  colorStyle: BumperColorStyle;
  iconStyle: BumperIconStyle;
}

export interface TargetDef {
  id: string;
  bankId: string;
  bankRole: 'MULTIPLIER' | 'MULTIBALL' | 'KICKBACK' | 'JACKPOT_BOOST';
  kind: 'DROP' | 'STANDUP';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  letter: string;
  lampColor: string;
  points: number;
}

export interface RampDef {
  id: string;
  name: string;
  style: RampVisualStyle;
  entry: Vec2;
  entryRadius: number;
  entryDir: Vec2;
  allowSideEntry?: boolean;
  path: Vec2[];
  points: number;
  chuteColor: string;
  railColor: string;
}

export interface RolloverDef {
  id: string;
  groupId: 'TOP_LANES' | 'MID_ORBITS' | 'INLANES';
  x: number;
  y: number;
  radius: number;
  letter: string;
  points: number;
}

export interface SpinnerDef {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  angle: number;
  pointsPerSpin: number;
}

export interface ScoopVukDef {
  id: string;
  name: string;
  kind: 'UPPER_LOCK' | 'MID_VUK_TELEPORT';
  x: number;
  y: number;
  radius: number;
  ejectTo: Vec2;
  ejectVelocity: Vec2;
  points: number;
  color: string;
}

export interface FlipperDef {
  id: string;
  side: 'LEFT' | 'RIGHT';
  zone: 'MAIN' | 'MID' | 'UPPER';
  pivot: Vec2;
  length: number;
  radius: number;
  restAngle: number;
  activeAngle: number;
}

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  targetKind: MissionEventKind;
  goal: number;
  rewardPoints: number;
  accentColor: string;
}

export interface TablePalette {
  bgPrimary: string;
  bgSecondary: string;
  cabinetFrame: string;
  cabinetHighlight: string;
  wallMetal: string;
  wallHighlight: string;
  accentPrimary: string;
  accentSecondary: string;
  accentWarm: string;
  flipperTop: string;
  flipperSkirt: string;
  slingshotMain: string;
  slingshotAccent: string;
  hudBg: string;
  hudBorder: string;
  hudDigits: string;
  hudStyle: 'CYBER_AKA' | 'LED_7SEG';
  ballTint: string;
}

export interface PinballTableDef {
  id: TableThemeId;
  name: string;
  subtitle: string;
  layoutBadge: string;
  environmentTag: string;
  description: string;
  artworkUrl?: string;
  multiballName: string;
  jackpotName: string;
  skillShotLabel: string;
  gravity: number;
  palette: TablePalette;
  extraFlippers: FlipperDef[];
  beveledHousings: BeveledHousingDef[];
  bumpers: BumperDef[];
  targets: TargetDef[];
  ramps: RampDef[];
  rollovers: RolloverDef[];
  spinners: SpinnerDef[];
  scoops: ScoopVukDef[];
  missions: [MissionDef, MissionDef, MissionDef];
  extraWalls: WallSegment[];
  extraPegs: PostPeg[];
  missionEmblemPos: Vec2;
  rulesSummary: {
    rampsRule: string;
    bumpersRule: string;
    targetsRule: string;
    multiballRule: string;
  };
}

export interface BallEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  layer: 0 | 1;
  activeRampId: string | null;
  rampProgress: number;
  rampSpeed: number;
  rampReverse: boolean;
  heldInScoopId: string | null;
  scoopTimer: number;
  inShooterLane: boolean;
  stuckTimer: number;
  trail: Vec2[];
}

export interface FlipperState extends FlipperDef {
  angle: number;
  angularVelocity: number;
  pressed: boolean;
}

export interface FloatingPopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface PlayerSession {
  playerIndex: number;
  score: number;
  displayScore: number;
  ballsRemaining: number;
  bonusPoints: number;
  bonusMultiplier: number;
  maxCombo: number;
  rampsCompleted: number;
  activeMissionIndex: number;
  missionStepProgress: number;
  missionsCompleted: number;
  /** Balls this player has locked towards the next Multiball (0..2). */
  lockedBalls: number;
}

export interface InputControlsState {
  leftFlipper: boolean;   // Bouton A
  rightFlipper: boolean;  // Bouton D
  plunger: boolean;       // Bouton R1
  nudge: boolean;         // Bouton B
  pauseBtn: boolean;      // Bouton C
  dpadLeft: boolean;
  dpadRight: boolean;
  dpadUp: boolean;
  dpadDown: boolean;
}

export interface LiveGameSnapshot {
  gameState: GameState;
  selectedTableId: TableThemeId;
  playerCount: number;
  activePlayerIndex: number;
  currentBallNumber: number;
  totalBallsPerGame: number;
  players: PlayerSession[];
  comboCount: number;
  comboTimer: number;
  maxComboTimer: number;
  lastPointsScored: number;
  lastCallout: string;
  calloutTimer: number;
  plungerTension: number;
  tiltWarning: number;
  isTilted: boolean;
  ballSaveTimer: number;
  kickbackLeftLit: boolean;
  kickbackRightLit: boolean;
  lockedBallsCount: number;
  multiballActive: boolean;
  activeBallsCount: number;
  jackpotLit: boolean;
  cameraY: number;
  cameraZoom: number;
  activeMissionTitle: string;
  activeMissionDesc: string;
  activeMissionProgress: number;
  activeMissionGoal: number;
  missionsCompleted: number;
  highScores: Record<TableThemeId, number>;
}
