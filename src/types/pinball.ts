export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 320;
export const HUD_HEIGHT = 46;
export const VIEWPORT_HEIGHT = SCREEN_HEIGHT - HUD_HEIGHT; // 274px visible playfield window
export const WORLD_HEIGHT = 520; // ~1.9x screens tall: punchy, balanced arcade pinball proportions!
export const MAX_CAMERA_Y = WORLD_HEIGHT - VIEWPORT_HEIGHT; // 246px vertical scroll range
export const OVERVIEW_ZOOM = VIEWPORT_HEIGHT / WORLD_HEIGHT; // ~0.527x full-table overview zoom

export type GameState = 'TABLE_SELECT' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type ConsoleViewMode = 'CONSOLE_90' | 'SCREEN_ZOOM' | 'NATIVE_0';

export const BUILTIN_THEME_IDS = [
  'aka_esp32',
  'space_odyssey',
  'star_galaxy',
  'solaire',
  'classique',
  'prehistoire',
  'farwest',
  'halloween',
  'candy',
  'bonbons',
  'train',
  'crypte',
] as const;

export type BuiltinThemeId = (typeof BUILTIN_THEME_IDS)[number];
export type TableThemeId = BuiltinThemeId | (string & {});

export type BumperColorStyle =
  | 'RED'
  | 'BLUE'
  | 'GOLD'
  | 'JADE'
  | 'PURPLE'
  | 'ORANGE'
  | 'PINK'
  | 'ICE';

export type BumperIconStyle =
  | 'GEAR'
  | 'CHIP'
  | 'STAR'
  | 'PLANET'
  | 'TURRET'
  | 'CREST'
  | 'SUN'
  | 'TOTEM'
  | 'VINTAGE_CAP'
  | 'VOLCANO'
  | 'DINO_EGG'
  | 'SKULL'
  | 'SHERIFF'
  | 'BARREL'
  | 'WHEEL'
  | 'PUMPKIN'
  | 'BAT'
  | 'HEART'
  | 'RIBBON'
  | 'SWIRL_CANDY'
  | 'PEPPERMINT'
  | 'LANTERN'
  | 'TOMBSTONE'
  | 'RUNE';

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
  /** Vrai si la sortie de la rampe dépose la bille sur l'étage supérieur (`layer = 2`). */
  exitsToUpperDeck?: boolean;
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
  /** Vrai si le conduit aérien dépose la bille sur l'étage supérieur (`layer = 2`). */
  ejectToUpperDeck?: boolean;
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

export type UpperPlayfieldStyle =
  | 'CYBER_GLASS'
  | 'WOOD_BALCONY'
  | 'STONE_TERRACE'
  | 'GOTHIC_GALLERY'
  | 'STEEL_CATWALK'
  | 'SWEET_LOFT';

/**
 * Étage supérieur (« Mezzanine / Terrasse / Balcon », `layer = 2`) surplombant le plateau principal.
 * La bille y accède par une rampe dédiée, interagit uniquement avec les éléments de l'étage
 * en passant au-dessus du décor inférieur, et redescend par les rebords ouverts (`openEdgeIndices`).
 */
export interface UpperPlayfieldDef {
  id: string;
  name: string;
  bounds: Vec2[];
  /** Indices des arêtes `[i -> (i+1)%n]` ouvertes par lesquelles la bille retombe au niveau 0. */
  openEdgeIndices: number[];
  style: UpperPlayfieldStyle;
  fillColor: string;
  borderColor: string;
  flippers: FlipperDef[];
  bumpers: BumperDef[];
  targets: TargetDef[];
  rollovers: RolloverDef[];
}

export type InteractiveToyKind =
  | 'BASH_TOY'
  | 'SWING_DOORS'
  | 'TURNTABLE'
  | 'GRAVITY_WELL'
  | 'SLIDING_CRYPT'
  | 'ROTO_TARGET';

export type InteractiveToyVisual =
  | 'ESP32_CHIP'
  | 'SATURN_RING'
  | 'DEATH_STAR_CORE'
  | 'SUN_WHEEL'
  | 'EM_ROTO_BELL'
  | 'VOLCANO'
  | 'SALOON_DOORS'
  | 'PUMPKIN_KING'
  | 'RIBBON_VORTEX'
  | 'LOLLIPOP_WHEEL'
  | 'RAIL_TURNTABLE'
  | 'SARCOPHAGUS';

/**
 * Élément de décor mécanique et interactif ancré directement dans l'illustration de la table :
 * réagit physiquement et visuellement aux impacts ou passages de la bille.
 */
export interface InteractiveToyDef {
  id: string;
  name: string;
  kind: InteractiveToyKind;
  visual: InteractiveToyVisual;
  x: number;
  y: number;
  radius: number;
  points: number;
  hitsRequired: number;
  rewardPoints: number;
  accentColor: string;
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

/** Cible mobile propre à une table : elle change d'emplacement à chaque fois qu'on la touche. */
export interface HuntDef {
  kind: 'WANTED' | 'GHOST' | 'MAMMOTH' | 'LOLLIPOP' | 'LOCOMOTIVE' | 'ZOMBIE';
  name: string;
  slots: Vec2[];
  radius: number;
  points: number;
  /** Nombre de touches qui déclenchent la prime. */
  goal: number;
  reward: number;
  /** Vrai : les emplacements se suivent dans l'ordre (le train avance) ; sinon ordre pseudo-aléatoire déterministe. */
  sequential: boolean;
  color: string;
}

export interface PinballTableDef {
  id: TableThemeId;
  name: string;
  subtitle: string;
  layoutBadge: string;
  environmentTag: string;
  description: string;
  /** Thème visuel du plateau et des éléments spécialisés (par défaut identique à `id` pour les 12 tables de base). */
  decorTheme?: BuiltinThemeId;
  /** Thème musical et sonore associé à la table (par défaut identique à `decorTheme`). */
  musicTheme?: BuiltinThemeId;
  /** Clé d'illustration interne (évite de stocker du binaire dans tables.config.json). */
  artworkKey?: string;
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
  /** Étage supérieur optionnel (`layer = 2`) propre à certaines tables thématiques. */
  upperPlayfield?: UpperPlayfieldDef;
  /** Éléments de décor interactifs (portes battantes, volcan, plaque tournante, sarcophage…). */
  interactiveToys?: InteractiveToyDef[];
  missions: [MissionDef, MissionDef, MissionDef];
  extraWalls: WallSegment[];
  extraPegs: PostPeg[];
  missionEmblemPos: Vec2;
  /** Mécanisme propre à la table : cible mobile à abattre. */
  hunt?: HuntDef;
  /** Mécanisme propre à la table : un bumper « doré » (points x3) change à chaque touche. */
  litBumperRotate?: boolean;
  rulesSummary: {
    rampsRule: string;
    bumpersRule: string;
    targetsRule: string;
    multiballRule: string;
    specialRule?: string;
  };
}

export interface BallEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 0 = plateau principal, 1 = dans une rampe / conduit aérien, 2 = sur un étage supérieur. */
  layer: 0 | 1 | 2;
  activeRampId: string | null;
  activeTubeId: string | null;
  rampProgress: number;
  rampDist: number;
  rampSpeed: number;
  rampReverse: boolean;
  rampCommitted: boolean;
  rampAwarded: boolean;
  rampExitCooldown: number;
  rampEntryOffset: Vec2;
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
  deckLayer: 0 | 2;
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
  highScores: Record<string, number>;
  /** Top 10 (score + trigramme) de chaque table. */
  scoreBoards: Record<string, { score: number; tri: string }[]>;
}

export function resolveDecorTheme(
  table: Pick<PinballTableDef, 'id' | 'decorTheme'>
): BuiltinThemeId {
  if (table.decorTheme && (BUILTIN_THEME_IDS as readonly string[]).includes(table.decorTheme)) {
    return table.decorTheme;
  }
  if ((BUILTIN_THEME_IDS as readonly string[]).includes(table.id)) {
    return table.id as BuiltinThemeId;
  }
  return 'classique';
}

export function resolveMusicTheme(
  table: Pick<PinballTableDef, 'id' | 'decorTheme' | 'musicTheme'>
): BuiltinThemeId {
  if (table.musicTheme && (BUILTIN_THEME_IDS as readonly string[]).includes(table.musicTheme)) {
    return table.musicTheme;
  }
  return resolveDecorTheme(table);
}
