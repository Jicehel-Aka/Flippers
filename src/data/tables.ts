import solaireArt from '../assets/images/pinball_solaire_art_1793554422501.jpg';
import {
  BUILTIN_THEME_IDS,
  BuiltinThemeId,
  InteractiveToyDef,
  InteractiveToyKind,
  InteractiveToyVisual,
  MissionDef,
  PinballTableDef,
  UpperPlayfieldDef,
  UpperPlayfieldStyle,
  resolveDecorTheme,
  resolveMusicTheme,
} from '../types/pinball';
import rawTablesConfig from './tables.config.json';

const HIGH_SCORE_STORAGE_KEY = 'gamebuino_aka_pinball_highscores_v4';
const CUSTOM_TABLES_STORAGE_KEY = 'gamebuino_aka_pinball_custom_tables_v1';

const INTERNAL_ARTWORKS: Record<string, string> = {
  solaire_temple: solaireArt,
};

const DEFAULT_HIGH_SCORES: Record<BuiltinThemeId, number> = {
  aka_esp32: 480000,
  space_odyssey: 420000,
  star_galaxy: 510000,
  solaire: 450000,
  classique: 390000,
  prehistoire: 400000,
  farwest: 410000,
  halloween: 430000,
  candy: 380000,
  bonbons: 390000,
  train: 420000,
  crypte: 440000,
};

export function cloneTableDef(table: PinballTableDef): PinballTableDef {
  return JSON.parse(JSON.stringify(table)) as PinballTableDef;
}

function hydrateArtwork(table: PinballTableDef): PinballTableDef {
  const copy = cloneTableDef(table);
  if (copy.artworkKey && INTERNAL_ARTWORKS[copy.artworkKey] && !copy.artworkUrl) {
    copy.artworkUrl = INTERNAL_ARTWORKS[copy.artworkKey];
  }
  copy.decorTheme = resolveDecorTheme(copy);
  copy.musicTheme = resolveMusicTheme(copy);
  return copy;
}

function stripRuntimeArtwork(table: PinballTableDef): PinballTableDef {
  const copy = cloneTableDef(table);
  if (copy.artworkKey && INTERNAL_ARTWORKS[copy.artworkKey]) {
    delete copy.artworkUrl;
  }
  return copy;
}

/** Catalogue de référence issu de `src/data/tables.config.json` (12 tables d'origine). */
export const BUILTIN_TABLES: readonly PinballTableDef[] = (
  rawTablesConfig.tables as unknown as PinballTableDef[]
).map(hydrateArtwork);

const BUILTIN_BY_ID = new Map<string, PinballTableDef>(
  BUILTIN_TABLES.map((t) => [t.id, t])
);

interface StoredCustomCatalog {
  overrides: Record<string, PinballTableDef>;
  customTables: PinballTableDef[];
}

function loadStoredCustomCatalog(): StoredCustomCatalog {
  try {
    const raw = localStorage.getItem(CUSTOM_TABLES_STORAGE_KEY);
    if (!raw) return { overrides: {}, customTables: [] };
    const parsed = JSON.parse(raw);
    const overrides: Record<string, PinballTableDef> = {};
    if (parsed && typeof parsed.overrides === 'object' && parsed.overrides !== null) {
      for (const [id, def] of Object.entries(parsed.overrides)) {
        if (BUILTIN_BY_ID.has(id)) {
          overrides[id] = validateAndNormalizeTable(def, id);
        }
      }
    }
    const customTables: PinballTableDef[] = [];
    if (Array.isArray(parsed?.customTables)) {
      for (const item of parsed.customTables) {
        const norm = validateAndNormalizeTable(item);
        if (!BUILTIN_BY_ID.has(norm.id)) {
          customTables.push(norm);
        }
      }
    }
    return { overrides, customTables };
  } catch {
    return { overrides: {}, customTables: [] };
  }
}

function persistStoredCustomCatalog(store: StoredCustomCatalog) {
  try {
    const serializable: StoredCustomCatalog = {
      overrides: Object.fromEntries(
        Object.entries(store.overrides).map(([k, v]) => [k, stripRuntimeArtwork(v)])
      ),
      customTables: store.customTables.map(stripRuntimeArtwork),
    };
    localStorage.setItem(CUSTOM_TABLES_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage quota errors
  }
}

let catalogStore: StoredCustomCatalog = loadStoredCustomCatalog();

/**
 * Tableau vivant des plateaux actifs (référence stable partagée par le moteur physique,
 * le rendu, l'éditeur de tables et les scripts de génération du firmware AKA).
 */
export const PINBALL_TABLES: PinballTableDef[] = [];

function rebuildActiveTablesInPlace() {
  const next: PinballTableDef[] = [
    ...BUILTIN_TABLES.map((base) =>
      catalogStore.overrides[base.id]
        ? hydrateArtwork(catalogStore.overrides[base.id])
        : cloneTableDef(base)
    ),
    ...catalogStore.customTables.map(hydrateArtwork),
  ];
  PINBALL_TABLES.splice(0, PINBALL_TABLES.length, ...next);
}

rebuildActiveTablesInPlace();

export function loadHighScores(): Record<string, number> {
  const defaults: Record<string, number> = { ...DEFAULT_HIGH_SCORES };
  for (const t of PINBALL_TABLES) {
    if (typeof defaults[t.id] !== 'number') {
      defaults[t.id] = 250000;
    }
  }
  try {
    const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const merged: Record<string, number> = { ...defaults };
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        merged[k] = v;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function saveHighScores(scores: Record<string, number>) {
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Ignore storage quota errors
  }
}

// ============================================================================
// VALIDATION, NORMALISATION & CRUD POUR L'ÉDITEUR DE TABLES MAISON
// ============================================================================

export function getTableById(id: string): PinballTableDef | undefined {
  return PINBALL_TABLES.find((t) => t.id === id);
}

export function isBuiltinTableId(id: string): boolean {
  return BUILTIN_BY_ID.has(id);
}

export function isTableModified(id: string): boolean {
  return Boolean(catalogStore.overrides[id]);
}

export function validateAndNormalizeTable(
  raw: unknown,
  forcedId?: string
): PinballTableDef {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Définition de table JSON invalide.');
  }
  const obj = raw as Partial<PinballTableDef>;
  const fallbackBase =
    (obj.decorTheme && BUILTIN_BY_ID.get(obj.decorTheme)) ||
    (obj.id && BUILTIN_BY_ID.get(String(obj.id))) ||
    BUILTIN_TABLES[4]; // Flipper Classique par défaut

  const id = (forcedId ?? String(obj.id || `custom_${Date.now()}`))
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const clamp = (n: unknown, fb: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;

  const rawMissions = Array.isArray(obj.missions) ? obj.missions : fallbackBase.missions;
  const normalizedMissions: [MissionDef, MissionDef, MissionDef] = [0, 1, 2].map((i) => {
    const m = rawMissions[i] ?? fallbackBase.missions[i];
    return {
      id: String(m?.id || `${id}_m${i + 1}`),
      title: String(m?.title || `MISSION ${i + 1}`).slice(0, 24),
      description: String(m?.description || fallbackBase.missions[i].description),
      targetKind:
        m?.targetKind === 'RAMP' ||
        m?.targetKind === 'BUMPER' ||
        m?.targetKind === 'TARGET' ||
        m?.targetKind === 'SCOOP'
          ? m.targetKind
          : fallbackBase.missions[i].targetKind,
      goal: Math.round(clamp(m?.goal, 3, 1, 25)),
      rewardPoints: Math.round(clamp(m?.rewardPoints, 50000, 1000, 500000)),
      accentColor: String(m?.accentColor || fallbackBase.missions[i].accentColor),
    };
  }) as [MissionDef, MissionDef, MissionDef];

  const palette = {
    ...fallbackBase.palette,
    ...(obj.palette && typeof obj.palette === 'object' ? obj.palette : {}),
  };

  const decorTheme: BuiltinThemeId =
    obj.decorTheme && (BUILTIN_THEME_IDS as readonly string[]).includes(obj.decorTheme)
      ? obj.decorTheme
      : (BUILTIN_THEME_IDS as readonly string[]).includes(id)
        ? (id as BuiltinThemeId)
        : fallbackBase.decorTheme ?? 'classique';

  const musicTheme: BuiltinThemeId =
    obj.musicTheme && (BUILTIN_THEME_IDS as readonly string[]).includes(obj.musicTheme)
      ? obj.musicTheme
      : decorTheme;

  const normalized: PinballTableDef = {
    id,
    name: String(obj.name || 'Nouveau Flipper').slice(0, 36),
    subtitle: String(obj.subtitle || fallbackBase.subtitle).slice(0, 64),
    layoutBadge: String(obj.layoutBadge || fallbackBase.layoutBadge).slice(0, 44),
    environmentTag: String(obj.environmentTag || fallbackBase.environmentTag).slice(0, 54),
    description: String(obj.description || fallbackBase.description),
    decorTheme,
    musicTheme,
    artworkKey: obj.artworkKey,
    artworkUrl: obj.artworkUrl,
    multiballName: String(obj.multiballName || fallbackBase.multiballName),
    jackpotName: String(obj.jackpotName || fallbackBase.jackpotName),
    skillShotLabel: String(obj.skillShotLabel || fallbackBase.skillShotLabel),
    gravity: clamp(obj.gravity, fallbackBase.gravity, 260, 390),
    palette,
    extraFlippers: Array.isArray(obj.extraFlippers)
      ? cloneTableDef({ ...fallbackBase, extraFlippers: obj.extraFlippers }).extraFlippers
      : [],
    beveledHousings: Array.isArray(obj.beveledHousings)
      ? cloneTableDef({ ...fallbackBase, beveledHousings: obj.beveledHousings }).beveledHousings
      : cloneTableDef(fallbackBase).beveledHousings,
    bumpers: Array.isArray(obj.bumpers)
      ? cloneTableDef({ ...fallbackBase, bumpers: obj.bumpers }).bumpers
      : cloneTableDef(fallbackBase).bumpers,
    targets: Array.isArray(obj.targets)
      ? cloneTableDef({ ...fallbackBase, targets: obj.targets }).targets
      : cloneTableDef(fallbackBase).targets,
    ramps:
      Array.isArray(obj.ramps) && obj.ramps.length > 0
        ? cloneTableDef({ ...fallbackBase, ramps: obj.ramps }).ramps
        : cloneTableDef(fallbackBase).ramps,
    rollovers:
      Array.isArray(obj.rollovers) && obj.rollovers.length > 0
        ? cloneTableDef({ ...fallbackBase, rollovers: obj.rollovers }).rollovers
        : cloneTableDef(fallbackBase).rollovers,
    spinners: Array.isArray(obj.spinners)
      ? cloneTableDef({ ...fallbackBase, spinners: obj.spinners }).spinners
      : cloneTableDef(fallbackBase).spinners,
    scoops:
      Array.isArray(obj.scoops) && obj.scoops.length > 0
        ? cloneTableDef({ ...fallbackBase, scoops: obj.scoops }).scoops
        : cloneTableDef(fallbackBase).scoops,
    upperPlayfield: (() => {
      const srcUp =
        'upperPlayfield' in obj
          ? obj.upperPlayfield
          : fallbackBase.upperPlayfield;
      if (!srcUp || typeof srcUp !== 'object') return undefined;
      const u = JSON.parse(JSON.stringify(srcUp)) as Partial<UpperPlayfieldDef> & {
        surfaceColor?: string;
        accentColor?: string;
      };
      const validStyles: UpperPlayfieldStyle[] = [
        'CYBER_GLASS',
        'WOOD_BALCONY',
        'STONE_TERRACE',
        'GOTHIC_GALLERY',
        'STEEL_CATWALK',
        'SWEET_LOFT',
      ];
      const bounds =
        Array.isArray(u.bounds) && u.bounds.length >= 3
          ? u.bounds.map((pt) => ({
              x: clamp(pt?.x, 120, 12, 214),
              y: clamp(pt?.y, 140, 24, 340),
            }))
          : [
              { x: 122, y: 90 },
              { x: 206, y: 90 },
              { x: 206, y: 214 },
              { x: 138, y: 214 },
              { x: 118, y: 174 },
            ];
      return {
        id: String(u.id || `${id}_upper`),
        name: String(u.name || 'ÉTAGE SUPÉRIEUR').slice(0, 24),
        bounds,
        openEdgeIndices: Array.isArray(u.openEdgeIndices)
          ? u.openEdgeIndices.filter((idx) => typeof idx === 'number' && idx >= 0 && idx < bounds.length)
          : [0],
        style: validStyles.includes(u.style as UpperPlayfieldStyle)
          ? (u.style as UpperPlayfieldStyle)
          : 'CYBER_GLASS',
        fillColor: String(u.fillColor || u.surfaceColor || palette.bgSecondary || '#0F172A').slice(0, 9),
        borderColor: String(u.borderColor || u.accentColor || palette.accentPrimary || '#38BDF8').slice(0, 9),
        flippers: Array.isArray(u.flippers) ? u.flippers : [],
        bumpers: Array.isArray(u.bumpers) ? u.bumpers : [],
        targets: Array.isArray(u.targets) ? u.targets : [],
        rollovers: Array.isArray(u.rollovers) ? u.rollovers : [],
      };
    })(),
    interactiveToys: (() => {
      const rawToys = Array.isArray(obj.interactiveToys)
        ? obj.interactiveToys
        : 'interactiveToys' in obj
          ? []
          : fallbackBase.interactiveToys ?? [];
      const validKinds: InteractiveToyKind[] = [
        'BASH_TOY',
        'SWING_DOORS',
        'TURNTABLE',
        'GRAVITY_WELL',
        'SLIDING_CRYPT',
        'ROTO_TARGET',
      ];
      const validVisuals: InteractiveToyVisual[] = [
        'ESP32_CHIP',
        'SATURN_RING',
        'DEATH_STAR_CORE',
        'SUN_WHEEL',
        'EM_ROTO_BELL',
        'VOLCANO',
        'SALOON_DOORS',
        'PUMPKIN_KING',
        'RIBBON_VORTEX',
        'LOLLIPOP_WHEEL',
        'RAIL_TURNTABLE',
        'SARCOPHAGUS',
      ];
      return rawToys
        .filter((item): item is InteractiveToyDef => Boolean(item && typeof item === 'object'))
        .map((t, idx) => ({
          id: String(t.id || `${id}_toy_${idx + 1}`),
          name: String(t.name || 'MÉCANISME CENTRAL').slice(0, 24),
          kind: validKinds.includes(t.kind) ? t.kind : 'BASH_TOY',
          visual: validVisuals.includes(t.visual) ? t.visual : 'ESP32_CHIP',
          x: clamp(t.x, 113, 24, 202),
          y: clamp(t.y, 210, 48, 435),
          radius: clamp(t.radius, 16, 10, 32),
          points: Math.round(clamp(t.points, 4000, 250, 50000)),
          hitsRequired: Math.round(clamp(t.hitsRequired, 4, 1, 16)),
          rewardPoints: Math.round(clamp(t.rewardPoints, 25000, 1000, 250000)),
          accentColor: String(t.accentColor || palette.accentPrimary || '#38BDF8').slice(0, 7),
        }));
    })(),
    missions: normalizedMissions,
    extraWalls: Array.isArray(obj.extraWalls) ? obj.extraWalls : [],
    extraPegs: Array.isArray(obj.extraPegs) ? obj.extraPegs : [],
    missionEmblemPos:
      obj.missionEmblemPos && typeof obj.missionEmblemPos.x === 'number'
        ? {
            x: clamp(obj.missionEmblemPos.x, 113, 30, 196),
            y: clamp(obj.missionEmblemPos.y, 364, 80, 440),
          }
        : { ...fallbackBase.missionEmblemPos },
    hunt: obj.hunt ? JSON.parse(JSON.stringify(obj.hunt)) : undefined,
    litBumperRotate: Boolean(obj.litBumperRotate),
    rulesSummary: {
      rampsRule: String(obj.rulesSummary?.rampsRule || fallbackBase.rulesSummary.rampsRule),
      bumpersRule: String(obj.rulesSummary?.bumpersRule || fallbackBase.rulesSummary.bumpersRule),
      targetsRule: String(obj.rulesSummary?.targetsRule || fallbackBase.rulesSummary.targetsRule),
      multiballRule: String(
        obj.rulesSummary?.multiballRule || fallbackBase.rulesSummary.multiballRule
      ),
      ...(obj.rulesSummary?.specialRule || fallbackBase.rulesSummary.specialRule
        ? {
            specialRule: String(
              obj.rulesSummary?.specialRule || fallbackBase.rulesSummary.specialRule
            ),
          }
        : {}),
    },
  };

  return hydrateArtwork(normalized);
}

export function saveTableDefinition(table: PinballTableDef): PinballTableDef {
  const normalized = validateAndNormalizeTable(table, table.id);
  if (BUILTIN_BY_ID.has(normalized.id)) {
    catalogStore.overrides[normalized.id] = normalized;
  } else {
    const idx = catalogStore.customTables.findIndex((t) => t.id === normalized.id);
    if (idx >= 0) catalogStore.customTables[idx] = normalized;
    else catalogStore.customTables.push(normalized);
  }
  persistStoredCustomCatalog(catalogStore);
  rebuildActiveTablesInPlace();
  return normalized;
}

export function duplicateTableDefinition(
  sourceId: string,
  customName?: string
): PinballTableDef {
  const src = PINBALL_TABLES.find((t) => t.id === sourceId) ?? BUILTIN_TABLES[4];
  const copy = cloneTableDef(src);
  const slug = `custom_${src.id}_${Math.floor(1000 + Math.random() * 9000)}`;
  copy.id = slug;
  copy.name = customName ? customName.slice(0, 36) : `${src.name} (Édition)`;
  copy.decorTheme = resolveDecorTheme(src);
  copy.musicTheme = resolveMusicTheme(src);
  return saveTableDefinition(copy);
}

export function createNewCustomTable(
  theme: BuiltinThemeId = 'classique',
  name: string = 'Mon Flipper Maison'
): PinballTableDef {
  const template = BUILTIN_BY_ID.get(theme) ?? BUILTIN_TABLES[4];
  const copy = cloneTableDef(template);
  const slug = `table_${theme}_${Math.floor(1000 + Math.random() * 9000)}`;
  copy.id = slug;
  copy.name = name.slice(0, 36);
  copy.subtitle = 'Plateau personnalisé créé dans l’éditeur maison';
  copy.layoutBadge = 'Création Originale · 240×520';
  copy.decorTheme = theme;
  copy.musicTheme = theme;
  return saveTableDefinition(copy);
}

export function resetTableDefinition(id: string): PinballTableDef | null {
  if (!BUILTIN_BY_ID.has(id)) return null;
  delete catalogStore.overrides[id];
  persistStoredCustomCatalog(catalogStore);
  rebuildActiveTablesInPlace();
  return PINBALL_TABLES.find((t) => t.id === id) ?? null;
}

export function resetAllTableDefinitions() {
  catalogStore = { overrides: {}, customTables: [] };
  persistStoredCustomCatalog(catalogStore);
  rebuildActiveTablesInPlace();
}

export function deleteCustomTableDefinition(id: string): boolean {
  if (BUILTIN_BY_ID.has(id)) return false;
  const before = catalogStore.customTables.length;
  catalogStore.customTables = catalogStore.customTables.filter((t) => t.id !== id);
  if (catalogStore.customTables.length !== before) {
    persistStoredCustomCatalog(catalogStore);
    rebuildActiveTablesInPlace();
    return true;
  }
  return false;
}

export function serializeTableToJson(id: string): string {
  const table = PINBALL_TABLES.find((t) => t.id === id) ?? PINBALL_TABLES[0];
  return JSON.stringify(stripRuntimeArtwork(table), null, 2) + '\n';
}

export function serializeCatalogToJson(): string {
  const payload = {
    version: 1,
    format: 'gamebuino-aka-pinball-tables',
    playfieldSize: { width: 240, height: 520 },
    tables: PINBALL_TABLES.map(stripRuntimeArtwork),
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

export function importTablesJson(rawJson: string): { count: number; firstId: string } {
  const parsed = JSON.parse(rawJson);
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.tables)
      ? parsed.tables
      : [parsed];

  if (list.length === 0) {
    throw new Error('Aucune table trouvée dans le fichier JSON.');
  }

  let firstId = '';
  let count = 0;
  for (const item of list) {
    const saved = saveTableDefinition(validateAndNormalizeTable(item));
    if (!firstId) firstId = saved.id;
    count++;
  }
  return { count, firstId };
}

/**
 * Vérifie les contraintes matérielles du générateur C++ embarqué (`scripts/gen-aka-tables.mjs`)
 * pour qu'une table soit également compilable sur ESP32-S3 / Gamebuino AKA.
 */
export function checkAkaFirmwareCompatibility(table: PinballTableDef): string[] {
  const issues: string[] = [];
  if (table.bumpers.length < 3 || table.bumpers.length > 6) {
    issues.push(`Bumpers : ${table.bumpers.length} (le firmware AKA attend entre 3 et 6 bumpers)`);
  }
  const totalExtraFlippers =
    table.extraFlippers.length + (table.upperPlayfield?.flippers.length ?? 0);
  if (totalExtraFlippers > 2) {
    issues.push(`Flippers sup. : ${totalExtraFlippers} (max 2 sur firmware AKA)`);
  }
  if (table.ramps.length < 2) {
    issues.push(`Rampes : ${table.ramps.length} (au moins 2 rampes attendues sur AKA)`);
  }
  if (!table.scoops.some((s) => s.kind === 'UPPER_LOCK')) {
    issues.push('Aucun puits UPPER_LOCK (requis pour le verrou Multibille AKA)');
  }
  if (table.rollovers.length !== 6) {
    issues.push(`Rollovers : ${table.rollovers.length} (exactement 6 attendus sur AKA : 4 haut + 2 retours)`);
  }
  if (table.beveledHousings.length > 6) {
    issues.push(`Boîtiers biseautés : ${table.beveledHousings.length} (max 6 sur AKA)`);
  }
  if (table.beveledHousings.some((h) => h.points.length > 5)) {
    issues.push('Un boîtier dépasse 5 sommets (max 5 par polygone sur AKA)');
  }
  if (table.targets.length > 12) {
    issues.push(`Cibles : ${table.targets.length} (max 12 sur AKA)`);
  }
  if (table.spinners.length > 3) {
    issues.push(`Spinners : ${table.spinners.length} (max 3 sur AKA)`);
  }
  if ((table.interactiveToys?.length ?? 0) > 2) {
    issues.push(`Décors interactifs : ${table.interactiveToys?.length} (max 2 sur AKA)`);
  }
  if (table.upperPlayfield && table.upperPlayfield.bounds.length > 6) {
    issues.push(`Sommets étage sup. : ${table.upperPlayfield.bounds.length} (max 6 sur AKA)`);
  }
  if (table.hunt && table.hunt.slots.length > 6) {
    issues.push(`Emplacements cible mobile : ${table.hunt.slots.length} (max 6 sur AKA)`);
  }
  return issues;
}
