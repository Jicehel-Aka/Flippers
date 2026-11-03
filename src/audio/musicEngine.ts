import { BuiltinThemeId, BUILTIN_THEME_IDS, GameState, TableThemeId } from '../types/pinball';
import { getTableById } from '../data/tables';

/**
 * Moteur musical procédural multi-sections pour Gamebuino AKA Pinball.
 *
 * Conception orchestrale & anti-monotonie :
 * - 12 bandes-son 100 % originales et distinctes composées sur mesure pour chacun des 12 univers :
 *   1. AKA ESP32       : Synthwave / Chiptune néo-arcade en La Dorien (124 BPM)
 *   2. Odyssée Spatiale: Séquenceur Kosmische / Berlin-School en Ré Lydien (108 BPM)
 *   3. Star Galaxy     : Marche symphonique Space-Opera en Sol Mineur / Si♭ (88 BPM)
 *   4. Temple Solaire  : Flûte inca de jade & marimba cérémoniel en Ré Dorien-Harmonique (116 BPM)
 *   5. Classique       : Orgue Hammond Boogie-Woogie de salle d'arcade 1960 en Do Mixolydien (130 BPM)
 *   6. Préhistoire     : Flûte d'os tribale & tambours volcaniques en Mi Pentatonique/Dorien (112 BPM)
 *   7. Far West        : Banjo Ragtime de saloon & cavalcade canyon en Ré Majeur/Mixolydien (136 BPM)
 *   8. Halloween       : Toccata d'orgue gothique & clavecin macabre en Do Mineur Harmonique (114 BPM)
 *   9. Candy Pop       : Future-Pop Harajuku / Shōjo étincelante en Sol Majeur (138 BPM)
 *   10. Bonbons        : Gavotte de boîte à musique & célesta confiseur en Fa Majeur (118 BPM)
 *   11. Train Express  : Marche ferroviaire à vapeur, piston 16es & cuivres en La Mineur (132 BPM)
 *   12. Crypte         : Procession de cathédrale givrée & glas en Ré Phrygien Dominant (86 BPM)
 *
 * - Architecture longue de 32 mesures par cycle (8 sections × 4 mesures × 16 doubles-croches = 512 pas,
 *   soit ~55 à 90 secondes pour un seul cycle complet, sans aucun vide mort à l'ouverture).
 * - Évolution continue sur plusieurs cycles (> 3 à 5 minutes sans redite mécanique) :
 *   rotation des arpèges, contre-chants à la tierce/sixte, broderies mélodiques, traits de liaison
 *   (turnaround fills), alternance de registres/timbres, et dynamique temps réel (Menu / Jeu / Multibille).
 */

const R = -1; // Silence
const H = -2; // Tenue de la note précédente

export type LeadTimbre =
  | 'WARM_TRI'
  | 'PULSE_CHIP'
  | 'SPACE_PAD'
  | 'HERO_BRASS'
  | 'PAN_FLUTE'
  | 'BELL_OCT'
  | 'VINTAGE_ORGAN'
  | 'TRIBAL_FLUTE'
  | 'PRIMAL_HORN'
  | 'STONE_MALLET'
  | 'HONKY_BANJO'
  | 'COUNTRY_FIDDLE'
  | 'GOTHIC_ORGAN'
  | 'KAWAII_BELL'
  | 'CELESTA_BOX'
  | 'STEAM_BRASS'
  | 'CATHEDRAL_CHOIR';

export type GrooveStyle =
  | 'CYBER'
  | 'COSMIC'
  | 'MARCH'
  | 'RITUAL'
  | 'PRIMAL'
  | 'BOOGIE'
  | 'COUNTRY'
  | 'GOTHIC'
  | 'POP'
  | 'MUSICBOX'
  | 'TRAIN_CHUG'
  | 'SOLEMN';

export interface MusicThemeMeta {
  id: BuiltinThemeId;
  label: string;
  bpm: number;
  style: string;
}

export const MUSIC_THEME_META: Record<BuiltinThemeId, MusicThemeMeta> = {
  aka_esp32: {
    id: 'aka_esp32',
    label: 'AKA ESP32 · Cyber-Chiptune',
    bpm: 124,
    style: 'Synthwave 8-bit nerveuse en La Dorien',
  },
  space_odyssey: {
    id: 'space_odyssey',
    label: 'Odyssée · Hymne Stellaire',
    bpm: 104,
    style: 'Synthé analogique lyrique & nappes cosmiques douces en Ré Lydien',
  },
  star_galaxy: {
    id: 'star_galaxy',
    label: 'Yavin · Fanfare Galactique',
    bpm: 88,
    style: 'Grande fanfare symphonique majestueuse, thème de la Force & marche impériale',
  },
  solaire: {
    id: 'solaire',
    label: 'Temple Solaire · Flûte d’Or',
    bpm: 116,
    style: 'Flûte de Pan mystique & marimba de jade',
  },
  classique: {
    id: 'classique',
    label: 'Classique · Orgue Boogie 60s',
    bpm: 130,
    style: 'Orgue rotatif swing & basse walking d’arcade',
  },
  prehistoire: {
    id: 'prehistoire',
    label: 'Préhistoire · Tambours Primitifs',
    bpm: 108,
    style: 'Corne de guerre grave, maillets d’os & pilonnage tribal brutal',
  },
  farwest: {
    id: 'farwest',
    label: 'Far West · Country Hoedown',
    bpm: 134,
    style: 'Guitare twang, banjo country, violon fiddle & rythmique boom-chicka',
  },
  halloween: {
    id: 'halloween',
    label: 'Halloween · Ténèbres Gothiques',
    bpm: 96,
    style: 'Orgue sépulcral grave, tritons sinistres & chœur spectral en Do Mineur',
  },
  candy: {
    id: 'candy',
    label: 'Candy · Shōjo Future-Pop',
    bpm: 138,
    style: 'Clochettes kawaii pétillantes en Sol Majeur',
  },
  bonbons: {
    id: 'bonbons',
    label: 'Bonbons · Boîte à Musique',
    bpm: 118,
    style: 'Célesta confiseur & gavotte enchantée en Fa Majeur',
  },
  train: {
    id: 'train',
    label: 'Express · Locomotive en Marche',
    bpm: 134,
    style: 'Halètement vapeur tchou-tchou, roulement sur rails & sifflet express',
  },
  crypte: {
    id: 'crypte',
    label: 'Crypte · Requiem Givré',
    bpm: 86,
    style: 'Chœur d’orgue glacial & glas en Ré Phrygien Dominant',
  },
};

export interface EvaluatedMusicStep {
  stepDurationSec: number;
  sectionIndex: number; // 0..7 dans le cycle de 32 mesures
  cycleIndex: number;   // numéro de tour complet de 32 mesures
  variantId: number;    // 0..5 : signature de variation courante
  groove: GrooveStyle;
  stepInBar: number;
  chord: readonly [number, number, number, number];
  leadMidi: number | null;
  leadSteps: number;    // durée en doubles-croches (1..16)
  leadGain: number;
  leadTimbre: LeadTimbre;
  harmonyMidi: number | null;
  arpMidi: number | null;
  arpGain: number;
  bassMidi: number | null;
  bassSteps: number;
  bassGain: number;
  kick: boolean;
  hatGain: number;
}

interface ThemeScoreDef {
  id: BuiltinThemeId;
  bpm: number;
  defaultTimbre: LeadTimbre;
  altTimbre: LeadTimbre;
  groove: GrooveStyle;
  arpOctaveShift: number;
  /** 8 sections de 4 mesures = 32 accords de 4 notes MIDI [fondamentale, 3ce, 5te, 7e/9e] */
  sectionsChords: readonly (readonly (readonly [number, number, number, number])[])[];
  /** Gamme mélodique sur 2 octaves (14 degrés) propre à l'univers */
  scale: readonly number[];
  /** 8 phrases mélodiques de 64 pas exclusives ou spécialisées */
  melodies: readonly (readonly number[])[];
  bassPattern: readonly number[]; // 16 pas : 0=silence, 1=tonique grave, 2=octave, 3=quinte, 4=tierce/approche
}

/** Garantit qu'une phrase compte exactement 64 pas (4 mesures de 16 doubles-croches). */
function p64(steps: readonly number[]): readonly number[] {
  if (steps.length === 64) return steps;
  const out = new Array<number>(64).fill(R);
  for (let i = 0; i < Math.min(64, steps.length); i++) out[i] = steps[i];
  return out;
}

// ============================================================================
// 1. AKA ESP32 — Synthwave / Chiptune néo-arcade (A Dorien : E4..C6, A4 = deg 3)
// ============================================================================
const AKA_P0 = p64([
  3, H, 6, R,  7, H, 8, R,  7, H, 6, H,  3, H, R, R,
  5, H, 7, R,  8, H, 10, H, 9, H, 8, 7,  6, H, R, 5,
  3, H, 6, H,  8, H, 11, H, 10, H, 8, H, 7, H, 6, R,
  5, H, 6, H,  7, H, 8, H,  6, H, 3, H,  H, H, R, R,
]);
const AKA_P1 = p64([
  3, H, H, 6,  7, H, 8, H,  H, 7, 6, H,  5, H, 3, R,
  5, H, H, 7,  8, H, 10, H, 9, H, 8, H,  7, H, R, R,
  6, H, 7, H,  8, H, 11, H, 12, H, 11, 10, 8, H, 7, H,
  8, H, H, 7,  6, H, 5, H,  3, H, H, H,  H, R, R, R,
]);
const AKA_P2 = p64([
  8, H, 7, 6,  8, H, 11, H, 10, H, 8, 7, 6, H, R, R,
  7, H, 6, 5,  7, H, 10, H, 8, H, 7, 6,  5, H, 3, R,
  3, 5, 6, 7,  8, H, 10, H, 11, H, 13, H, 12, 11, 10, 8,
  9, H, 8, 7,  8, H, H, H,  7, H, 6, 5,  3, H, R, R,
]);
const AKA_P3 = p64([
  11, H, H, 10, 8, H, 11, H, 13, H, 12, 11, 10, H, 8, R,
  9, H, H, 8,  7, H, 9, H,  11, H, 10, 8,  7, H, R, 6,
  8, H, 10, H, 11, H, 13, H, 12, H, 11, 10, 8, H, 6, H,
  7, H, 8, H,  9, H, 7, H,  8, H, H, H,  H, R, R, R,
]);
const AKA_P4 = p64([
  8, H, H, H,  7, H, H, R,  6, H, H, H,  5, H, R, R,
  3, H, 6, H,  7, H, H, H,  8, H, 7, H,  6, H, R, R,
  10, H, H, H, 9, H, 8, H,  7, H, H, H,  6, H, 5, R,
  3, H, 5, H,  6, H, 8, H,  7, H, H, H,  6, H, R, R,
]);
const AKA_P5 = p64([
  3, R, 6, 3,  7, R, 8, 7,  6, R, 5, 6,  3, H, R, R,
  5, R, 7, 5,  8, R, 10, 8, 9, 8, 7, 6,  7, H, R, 6,
  8, R, 11, 8, 10, R, 12, 10, 11, 10, 8, 7, 6, H, 8, H,
  7, H, 6, 5,  3, H, 6, H,  3, H, H, H,  H, R, R, R,
]);
const AKA_P6 = p64([
  1, H, 3, H,  5, H, 6, R,  3, H, 5, H,  7, H, 8, R,
  5, H, 7, H,  8, H, 9, R,  7, H, 8, H,  10, H, 11, H,
  8, 10, 11, 12, 13, H, 11, H, 10, 11, 12, 10, 8, H, 7, H,
  8, H, 9, H,  11, H, 12, H, 11, H, 10, 8, 7, H, R, R,
]);
const AKA_P7 = p64([
  11, H, 10, 8, 7, H, 8, H,  9, H, 8, 7,  6, H, R, R,
  8, H, 7, 6,  5, H, 6, H,  7, H, 6, 5,  3, H, R, R,
  3, H, 6, H,  7, H, 8, H,  10, H, 8, 7, 6, H, 5, H,
  3, H, H, H,  6, H, 3, H,  H, H, H, H,  R, R, R, R,
]);

// ============================================================================
// 2. ODYSSÉE SPATIALE — Hymne Stellaire Lyrique (D Lydien : D4=0, A4=4, D5=7, F#5=9, A5=11, D6=13)
// ============================================================================
const SPA_P0 = p64([
  0, H, H, R,  4, H, H, R,  7, H, H, H,  9, H, 8, R,
  7, H, 5, H,  4, H, 3, H,  4, H, 7, H,  5, H, R, R,
  0, H, 2, H,  4, H, 7, H,  10, H, 9, H, 8, H, 7, R,
  5, H, 7, H,  9, H, 8, 7,  4, H, H, H,  7, H, R, R,
]);
const SPA_P1 = p64([
  0, H, 4, H,  7, H, H, 8,  9, H, 10, H, 11, H, 9, R,
  8, H, 7, H,  5, H, 7, H,  9, H, 8, 7,  4, H, R, R,
  2, H, 4, H,  5, H, 7, H,  11, H, 12, H, 11, 9, 8, R,
  7, H, 9, H,  11, H, 9, 7, 8, H, 7, H,  H, H, R, R,
]);
const SPA_P2 = p64([
  7, H, 8, H,  9, H, 11, H, 10, H, 9, 8, 7, H, 4, R,
  5, H, 7, H,  8, H, 9, H,  7, H, 5, 4,  2, H, R, R,
  4, H, 5, H,  7, H, 9, H,  12, H, 11, H, 9, H, 8, H,
  9, H, 7, H,  5, H, 4, H,  7, H, H, H,  H, R, R, R,
]);
const SPA_P3 = p64([
  9, H, H, 10, 11, H, 13, H, 12, H, 11, 9, 8, H, 7, R,
  7, H, H, 8,  9, H, 11, H, 9, H, 8, 7,  5, H, R, 4,
  5, H, 7, H,  9, H, 10, H, 11, H, 13, H, 12, 11, 9, 8,
  9, H, 11, H, 8, H, 7, H,  7, H, H, H,  H, R, R, R,
]);
const SPA_P4 = p64([
  11, H, H, 9, 8, H, 7, R,  9, H, H, 8,  7, H, 4, R,
  5, H, 7, H,  8, H, 5, R,  4, H, 2, H,  0, H, R, R,
  2, H, 4, H,  7, H, 8, H,  9, H, 10, H, 8, H, 7, R,
  5, H, 7, H,  9, H, 11, H, 9, H, H, 8,  7, H, R, R,
]);
const SPA_P5 = p64([
  0, 2, 4, H,  4, 5, 7, H,  7, 8, 9, H,  8, 7, 5, R,
  2, 4, 5, H,  5, 7, 9, H,  11, 9, 8, H, 7, H, 4, R,
  4, 5, 7, 8,  9, H, 11, H, 10, 9, 8, 7, 9, H, 7, R,
  8, H, 7, 5,  4, H, 2, H,  7, H, H, H,  H, R, R, R,
]);
const SPA_P6 = p64([
  0, H, 3, H,  4, H, 7, R,  2, H, 5, H,  7, H, 9, R,
  4, H, 7, H,  9, H, 11, R, 7, H, 9, H,  11, H, 13, H,
  12, H, 11, 9, 10, H, 9, 7, 8, H, 7, 5, 7, H, 4, R,
  5, H, 7, H,  9, H, 11, H, 9, H, 8, H,  7, H, R, R,
]);
const SPA_P7 = p64([
  13, H, 11, H, 9, H, 8, 7, 9, H, 7, H,  4, H, R, R,
  11, H, 9, H,  7, H, 5, 4, 5, H, 4, H,  2, H, R, R,
  0, H, 4, H,  7, H, 9, H,  11, H, 9, 8, 7, H, 4, H,
  7, H, H, H,  4, H, 7, H,  H, H, H, R,  R, R, R, R,
]);

// ============================================================================
// 3. STAR GALAXY — Grande Fanfare Symphonique style Star Wars (Si♭ Majeur / Sol Mineur, 88 BPM majestueux)
// ============================================================================
const SW_P0 = p64([
  3, 3, 3, 6,   H, H, H, H,   R, 10, H, H,  H, H, H, R,
  R, 9, 8, 7,   13, H, H, H,  H, H, H, R,   10, H, H, H,
  R, 9, 8, 7,   13, H, H, H,  H, H, H, R,   10, H, H, H,
  R, 9, 8, 9,   7, H, H, H,   H, H, H, H,   R, R, R, R,
]);
const SW_P1 = p64([
  3, 3, 3, 6,   H, H, H, H,   R, 10, H, H,  H, H, H, R,
  R, 9, 8, 7,   13, H, H, H,  H, H, H, R,   10, H, H, H,
  R, 9, 8, 7,   13, H, H, H,  H, R, 10, H,  H, H, H, R,
  9, 8, 9, 7,   H, H, H, R,   3, H, 6, H,   H, H, R, R,
]);
const SW_P2 = p64([
  3, H, 4, H,   H, H, H, 4,   9, H, 8, H,   7, H, 6, H,
  6, H, 7, 8,   7, H, 5, H,   H, H, H, R,   3, H, 3, R,
  4, H, H, H,   H, R, 9, H,   8, H, 7, H,   10, H, 6, H,
  11, H, 10, H, 9, H, 8, H,   10, H, H, H,  H, R, R, R,
]);
const SW_P3 = p64([
  1, H, 4, H,   H, H, H, R,   5, H, 6, H,   7, H, 6, H,
  1, H, H, R,   4, H, 6, H,   8, H, H, 9,   8, H, H, R,
  8, H, 9, H,   11, H, H, H,  10, H, 8, H,  6, H, H, R,
  5, H, 6, H,   8, H, 5, H,   4, H, H, H,   H, R, R, R,
]);
const SW_P4 = p64([
  4, H, H, R,   4, H, H, R,   4, H, H, R,   2, H, H, 6,
  4, H, H, R,   2, H, H, 6,   4, H, H, H,   H, H, R, R,
  8, H, H, R,   8, H, H, R,   8, H, H, R,   9, H, H, 6,
  4, H, H, R,   2, H, H, 6,   4, H, H, H,   H, R, R, R,
]);
const SW_P5 = p64([
  11, H, H, R,  4, H, H, 4,   11, H, H, R,  10, H, H, 9,
  8, H, 7, 8,   H, R, 2, H,   7, H, H, R,   6, H, H, 5,
  6, H, 5, 6,   H, R, 2, H,   6, H, H, R,   4, H, H, 6,
  8, H, H, R,   4, H, H, 6,   8, H, H, H,   H, R, R, R,
]);
const SW_P6 = p64([
  3, H, 6, H,   H, H, 8, H,   10, H, H, 9,  8, H, 6, R,
  4, H, 8, H,   H, H, 10, H,  11, H, 10, H, 8, H, H, R,
  6, H, 9, H,   11, H, H, 10, 9, H, 8, H,   7, H, 6, H,
  7, H, 8, H,   10, H, H, 8,  10, H, H, H,  H, R, R, R,
]);
const SW_P7 = p64([
  6, H, H, R,   6, H, 10, H,  H, H, 6, H,   13, H, H, R,
  9, H, H, R,   7, H, 9, H,   10, H, 11, H, 12, H, 10, H,
  13, H, H, H,  H, H, 10, H,  8, H, 6, H,   10, H, H, R,
  6, H, H, 3,   6, H, 13, H,  6, H, H, H,   R, R, R, R,
]);

// ============================================================================
// 4. TEMPLE SOLAIRE — Flûte Inca & Marimba de Jade (D Mineur Dorien/Harm.)
// ============================================================================
const SOL_P0 = p64([
  4, H, 6, R,  7, 6, 4, R,  4, H, 7, R,  9, 8, 7, R,
  6, H, 7, R,  8, H, 11, H, 10, 8, 7, 6, 7, H, R, R,
  8, H, 7, 6,  4, H, 6, R,  7, H, 8, 9,  8, H, 6, R,
  4, H, 3, H,  4, H, 7, H,  4, H, H, H,  H, R, R, R,
]);
const SOL_P1 = p64([
  4, H, 6, R,  8, H, 7, H,  6, H, 4, R,  3, H, 4, H,
  6, H, 7, R,  8, H, 9, H,  11, 9, 8, 6, 7, H, R, R,
  8, H, 10, R, 9, H, 8, H,  6, H, 8, R,  7, H, 6, H,
  4, H, H, 3,  4, H, 8, H,  4, H, H, H,  H, R, R, R,
]);
const SOL_P2 = p64([
  8, H, 11, R, 9, 8, 7, R,  8, H, 12, R, 11, 9, 8, R,
  7, H, 9, R,  8, 7, 6, R,  7, 8, 10, H, 11, H, R, R,
  11, H, 13, R, 12, 11, 9, H, 8, H, 11, R, 10, 8, 7, H,
  8, H, 6, H,  7, H, 10, H, 11, H, H, H, H, R, R, R,
]);
const SOL_P3 = p64([
  11, H, H, 9, 8, H, 11, H, 12, H, 11, 9, 8, H, 7, R,
  9, H, H, 8,  7, H, 9, H,  8, H, 6, 4,  6, H, R, 7,
  8, H, 9, H,  11, H, 13, H, 12, 11, 10, 8, 7, H, 8, H,
  11, H, H, 8, 7, H, 6, H,  4, H, H, H,  H, R, R, R,
]);
const SOL_P4 = p64([
  8, H, H, H,  11, H, 8, R, 7, H, H, H,  9, H, 7, R,
  6, H, H, H,  8, H, 6, R,  4, H, 3, H,  4, H, R, R,
  8, H, 10, H, 11, H, H, R, 9, H, 8, H,  7, H, R, R,
  6, H, 7, H,  8, H, 10, H, 8, H, H, H,  7, H, R, R,
]);
const SOL_P5 = p64([
  4, 6, 8, R,  8, 7, 6, R,  6, 7, 9, R,  9, 8, 7, R,
  7, 8, 11, R, 11, 9, 8, R, 10, 8, 7, 6, 8, H, R, R,
  11, 9, 8, R, 12, 11, 9, R, 11, 9, 8, 7, 6, 7, 8, H,
  7, 6, 4, 3,  4, H, 8, H,  4, H, H, H,  H, R, R, R,
]);
const SOL_P6 = p64([
  1, H, 4, 6,  7, H, 4, R,  3, H, 6, 7,  8, H, 6, R,
  4, H, 7, 8,  9, H, 7, R,  6, H, 8, 10, 11, H, 10, H,
  11, H, 12, 11, 9, H, 11, 9, 8, H, 10, 8, 7, H, 8, H,
  9, H, 10, H, 11, H, 13, H, 10, H, H, H, 8, H, R, R,
]);
const SOL_P7 = p64([
  11, H, 9, 8, 7, H, 8, H,  6, H, 7, 6,  4, H, R, R,
  8, H, 7, 6,  4, H, 6, H,  7, H, 6, 4,  3, H, R, R,
  4, H, 6, H,  8, H, 10, H, 11, 9, 8, 6, 4, H, 3, H,
  4, H, H, H,  8, H, 4, H,  H, H, H, R,  R, R, R, R,
]);

// ============================================================================
// 5. CLASSIQUE — Orgue Hammond Boogie-Woogie 60s (C Mixolydien : C4..A5, Bb4=6, B4=7)
// ============================================================================
const CLA_P0 = p64([
  0, 2, 3, 5,  6, 5, 3, 2,  0, 3, 5, 6,  8, H, 5, R,
  4, 5, 8, 9,  10, 9, 8, 5, 5, 7, 9, 11, 8, H, 5, R,
  0, 2, 3, 5,  8, R, 6, 5,  4, 5, 8, 6,  5, H, 3, R,
  2, 4, 5, 7,  9, 8, 6, 5,  8, H, 5, 3,  0, H, R, R,
]);
const CLA_P1 = p64([
  8, R, 6, 5,  3, 5, 0, R,  8, R, 9, 8,  6, 5, 3, R,
  4, R, 8, 9,  10, 9, 8, 5, 8, R, 6, 5,  3, 2, 0, R,
  5, R, 7, 9,  11, 9, 7, 5, 4, R, 6, 8,  10, 8, 6, 4,
  5, 7, 8, 9,  11, 9, 8, 5, 8, H, H, H,  H, R, R, R,
]);
const CLA_P2 = p64([
  5, 8, 10, R, 9, 8, 6, 5,  3, 5, 8, R,  6, 5, 3, R,
  4, 8, 11, R, 10, 9, 8, 5, 7, 9, 11, 12, 9, H, 7, R,
  8, 10, 12, R, 13, 12, 10, 8, 9, 11, 12, 10, 8, 6, 5, R,
  4, 6, 8, 9,  7, 9, 11, 9, 8, H, 6, 5,  8, H, R, R,
]);
const CLA_P3 = p64([
  8, H, 10, 12, 13, R, 12, 10, 8, H, 6, 5, 8, H, R, 5,
  9, H, 11, 12, 13, R, 12, 9,  8, H, 10, 8, 7, H, R, 5,
  8, R, 8, 10, 12, R, 10, 8, 9, R, 9, 11, 12, 11, 9, 8,
  7, 9, 11, 13, 12, 10, 8, 6, 8, H, H, H, H, R, R, R,
]);
const CLA_P4 = p64([
  8, H, H, 6,  5, H, 3, R,  4, H, H, 5,  8, H, R, R,
  7, H, H, 5,  4, H, 2, R,  3, 5, 6, 5,  3, H, R, R,
  4, H, 8, H,  9, H, 8, 6,  5, H, 8, H,  10, H, 8, R,
  7, H, 9, H,  11, H, 9, 7, 8, H, 6, H,  5, H, R, R,
]);
const CLA_P5 = p64([
  0, R, 5, 0,  3, R, 6, 3,  5, R, 8, 5,  6, 5, 3, R,
  4, R, 8, 4,  6, R, 9, 6,  8, R, 10, 8, 9, 8, 5, R,
  7, R, 11, 7, 9, R, 12, 9, 8, 10, 12, 10, 8, 6, 5, 3,
  2, 4, 5, 7,  8, R, 5, R,  8, H, H, H,  H, R, R, R,
]);
const CLA_P6 = p64([
  1, 3, 5, 7,  8, 7, 5, 3,  2, 4, 6, 8,  9, 8, 6, 4,
  3, 5, 7, 9,  10, 9, 7, 5, 4, 6, 8, 10, 11, 10, 8, 6,
  5, 8, 10, 12, 13, 12, 10, 8, 7, 9, 11, 13, 12, 11, 9, 7,
  8, R, 10, R, 11, R, 12, R, 13, 12, 10, 8, 7, H, R, R,
]);
const CLA_P7 = p64([
  12, 10, 8, 6, 5, 8, 10, R, 11, 9, 7, 5, 4, 7, 9, R,
  10, 8, 6, 5,  3, 5, 8, R,  7, 9, 11, 9, 8, H, R, R,
  0, 2, 3, 5,  6, 8, 9, 10, 12, 10, 8, 6, 5, 3, 2, 0,
  8, H, 6, 5,  8, H, H, H,  H, H, R, R,  R, R, R, R,
]);

// ============================================================================
// 6. PRÉHISTOIRE — Pilonnage Tribal Brutal & Corne d'Os Grave (E3=1, G3=3, A3=4, Bb3=5, B3=6, D4=7, E4=8)
// ============================================================================
const PRE_P0 = p64([
  1, H, 1, R,  3, R, 1, H,  1, R, 5, 4,  3, R, 1, R,
  1, H, 1, R,  6, R, 5, H,  4, 3, 1, R,  0, H, 1, R,
  1, R, 1, 3,  4, R, 5, H,  4, R, 3, 1,  2, H, 1, R,
  0, R, 1, 1,  3, R, 6, H,  5, 4, 3, 1,  1, H, R, R,
]);
const PRE_P1 = p64([
  1, 1, R, 3,  1, 1, R, 6,  5, H, 4, 3,  1, H, 0, R,
  1, 1, R, 3,  4, 4, R, 8,  7, H, 6, 4,  1, H, R, R,
  3, 3, R, 4,  6, 6, R, 5,  4, R, 3, 1,  2, H, 1, R,
  0, 1, 3, R,  4, 5, 6, R,  8, H, 1, H,  1, H, R, R,
]);
const PRE_P2 = p64([
  6, H, 5, 4,  3, R, 1, H,  6, H, 8, 6,  5, R, 4, R,
  3, R, 3, 4,  6, R, 5, 3,  1, R, 0, 1,  3, H, 1, R,
  6, R, 6, 8,  10, H, 8, 6, 5, R, 6, 4,  3, H, 1, R,
  2, R, 1, 0,  1, R, 6, H,  5, 3, 1, R,  1, H, R, R,
]);
const PRE_P3 = p64([
  8, H, 8, R,  10, 8, 6, R, 8, H, 5, H,  4, 3, 1, R,
  6, H, 6, R,  8, 6, 4, R,  5, H, 4, 3,  1, H, R, 0,
  1, R, 3, 4,  6, R, 8, H,  9, 8, 6, 5,  4, H, 3, R,
  1, 1, R, 6,  5, H, 3, H,  1, H, H, H,  H, R, R, R,
]);
const PRE_P4 = p64([
  1, H, H, 0,  1, H, 3, R,  2, H, H, 1,  0, H, 1, R,
  5, H, H, 4,  3, H, 1, R,  0, H, 1, 3,  1, H, R, R,
  6, H, H, 5,  4, H, 3, R,  5, H, 4, 3,  2, H, 1, R,
  0, H, 1, H,  3, H, 5, H,  4, H, 3, 1,  1, H, R, R,
]);
const PRE_P5 = p64([
  1, R, 1, 3,  1, R, 4, 3,  1, R, 5, 4,  3, 1, 0, R,
  1, R, 3, 6,  5, R, 4, 3,  1, R, 3, 4,  6, H, R, R,
  8, R, 8, 6,  8, R, 10, 8, 6, R, 5, 4,  3, R, 1, R,
  2, 2, 1, 0,  1, R, 6, R,  1, H, H, H,  H, R, R, R,
]);
const PRE_P6 = p64([
  0, 1, 1, R,  3, 4, 4, R,  5, 4, 3, 1,  3, H, 1, R,
  1, 3, 3, R,  4, 6, 6, R,  8, 7, 6, 4,  6, H, R, R,
  8, 8, R, 10, 9, 8, 6, R,  7, 7, R, 8,  6, 4, 3, R,
  5, R, 4, R,  3, R, 6, H,  5, 4, 3, 1,  1, H, R, R,
]);
const PRE_P7 = p64([
  8, R, 6, 5,  4, R, 3, 1,  6, R, 5, 4,  3, H, 1, R,
  5, R, 4, 3,  2, R, 1, 0,  1, R, 3, 4,  6, H, R, R,
  1, 1, R, 3,  4, 5, 6, 8,  6, 5, 4, 3,  1, 0, 1, H,
  1, H, H, R,  6, H, 1, H,  H, H, R, R,  R, R, R, R,
]);

// ============================================================================
// 7. FAR WEST — Country Hoedown, Guitare Twang, Banjo & Fiddle (D Majeur Country)
// ============================================================================
const FW_P0 = p64([
  0, 1, 2, R,  4, 5, 6, 2,  7, 6, 5, 3,  2, H, 0, 1,
  2, R, 4, 5,  6, 7, 9, 6,  8, H, 6, 5,  6, H, 0, 1,
  2, R, 4, 5,  6, 2, 7, 6,  9, 10, 11, 12, 9, 6, 5, 3,
  2, 5, 6, 9,  7, 6, 5, 3,  2, H, 6, 2,  2, H, R, R,
]);
const FW_P1 = p64([
  0, 1, 2, 2,  4, 5, 6, R,  7, 6, 5, 3,  2, 3, 5, R,
  7, 7, 9, 7,  6, 5, 3, 2,  3, 4, 5, 7,  6, H, 0, 1,
  2, 2, 4, 5,  6, 7, 9, R,  8, 9, 8, 6,  7, 6, 5, 3,
  2, 4, 5, 6,  9, 7, 6, 5,  2, H, 9, H,  2, H, R, R,
]);
const FW_P2 = p64([
  2, 5, 6, 9,  6, 5, 2, 6,  7, 9, 12, 9, 7, 6, 5, 3,
  2, 5, 6, 9,  11, 12, 13, 9, 8, 6, 5, 3, 6, H, 5, 3,
  2, 5, 6, 9,  6, 5, 3, 2,  1, 3, 5, 7,  6, 5, 3, 1,
  0, 1, 2, 5,  6, 7, 9, 6,  9, H, 6, 5,  2, H, R, R,
]);
const FW_P3 = p64([
  9, H, 11, 12, 13, 12, 9, 6, 7, H, 9, 7, 6, 5, 3, R,
  9, H, 11, 12, 13, 9, 12, 9, 8, H, 7, 6, 6, H, 5, 6,
  9, 9, 12, 9, 13, 13, 12, 9, 7, 9, 7, 6, 5, 6, 5, 3,
  2, 4, 5, 6,  7, 9, 6, 5,  9, H, 2, H,  9, H, R, R,
]);
const FW_P4 = p64([
  6, H, 4, 5,  2, H, 0, 1,  2, H, 5, 6,  7, H, 6, R,
  8, H, 6, 5,  3, H, 2, R,  0, 1, 2, 3,  6, H, R, 0,
  2, H, 4, 5,  6, H, 9, 7,  8, H, 7, 6,  5, H, 3, R,
  2, 3, 4, 5,  6, 7, 9, 6,  5, H, 3, H,  2, H, R, R,
]);
const FW_P5 = p64([
  2, R, 6, 2,  4, 5, 6, R,  7, R, 9, 7,  6, 5, 3, 1,
  2, R, 6, 2,  8, R, 6, 5,  3, 4, 5, 7,  6, H, 0, 1,
  2, R, 9, 6,  11, 12, 13, 9, 8, R, 9, 7, 6, 5, 3, 2,
  0, 1, 2, 5,  6, 9, 7, 5,  2, H, H, H,  H, R, R, R,
]);
const FW_P6 = p64([
  0, 1, 2, 3,  4, 5, 6, 7,  9, 7, 6, 5,  7, 6, 5, 3,
  2, 3, 5, 6,  7, 9, 12, 9, 13, 12, 9, 7, 6, H, 5, R,
  8, 9, 8, 6,  7, 9, 7, 5,  6, 7, 6, 3,  4, 5, 2, 0,
  1, 2, 4, 5,  6, 9, 12, 9, 13, 12, 9, 6, 9, H, R, R,
]);
const FW_P7 = p64([
  13, 12, 9, 6, 11, 12, 9, R, 8, 7, 6, 5, 7, 6, 5, 3,
  2, 5, 6, 9,  7, 6, 5, 3,  0, 1, 2, 5,  6, H, 0, 1,
  2, 4, 5, 6,  7, 9, 11, 12, 13, 12, 9, 6, 5, 3, 2, 0,
  2, H, 4, 5,  9, H, 2, H,  H, H, R, R,  R, R, R, R,
]);

// ============================================================================
// 8. HALLOWEEN — Orgue Sépulcral Sombre, Tritons & Chœur Spectral (C Mineur / Locrien)
// ============================================================================
const HAL_P0 = p64([
  3, H, 7, H,  6, H, 7, R,  8, H, 7, 6,  5, H, 3, R,
  3, H, 1, H,  0, H, 2, H,  3, H, 6, H,  7, H, R, R,
  7, H, 8, 7,  6, H, 5, R,  4, H, 5, 3,  2, H, 0, R,
  1, H, 2, H,  3, H, 6, H,  5, H, 2, H,  3, H, R, R,
]);
const HAL_P1 = p64([
  10, 9, 10, R, 7, H, 6, R, 8, 7, 6, 5,  3, H, 2, R,
  3, H, 5, H,  6, H, 8, H,  7, H, 6, 5,  2, H, R, R,
  3, R, 7, 6,  8, R, 7, 5,  6, H, 5, 4,  3, H, 1, R,
  0, H, 1, H,  2, H, 6, H,  7, 6, 5, 2,  3, H, R, R,
]);
const HAL_P2 = p64([
  3, 5, 7, 6,  3, 5, 8, 7,  3, 5, 6, 5,  2, H, 0, R,
  1, 3, 5, 8,  6, H, 5, 3,  4, 6, 7, 9,  7, H, R, R,
  10, 8, 7, 6, 8, 7, 5, 3,  6, 5, 4, 2,  3, H, 1, R,
  0, 2, 3, 5,  6, H, 8, 6,  7, H, 2, H,  3, H, R, R,
]);
const HAL_P3 = p64([
  10, H, 12, 10, 9, H, 8, H, 7, H, 6, H, 7, H, 3, R,
  8, H, 10, 8, 7, H, 6, H,  5, H, 4, 2,  3, H, R, 2,
  3, H, 5, 6,  7, H, 8, H,  12, H, 9, 8, 7, H, 6, H,
  8, H, 7, 5,  6, H, 2, H,  3, H, H, H,  H, R, R, R,
]);
const HAL_P4 = p64([
  3, H, H, 1,  0, H, H, R,  6, H, H, 5,  3, H, R, R,
  8, H, H, 7,  6, H, 5, H,  2, H, H, 1,  0, H, R, R,
  3, H, 6, H,  7, H, 8, R,  6, H, 5, H,  4, H, 2, R,
  1, H, 0, H,  2, H, 6, H,  5, H, 2, H,  3, H, R, R,
]);
const HAL_P5 = p64([
  3, R, 6, 3,  7, R, 8, 7,  6, R, 5, 3,  2, H, 0, R,
  1, R, 5, 1,  6, R, 5, 3,  2, R, 6, 7,  3, H, R, R,
  7, R, 10, 9, 8, R, 7, 6,  5, R, 8, 7,  6, 5, 3, 2,
  1, 3, 5, 6,  8, 7, 6, 2,  3, H, H, H,  H, R, R, R,
]);
const HAL_P6 = p64([
  0, 1, 2, 3,  5, 6, 7, 8,  7, 6, 5, 3,  2, H, 0, R,
  1, 2, 3, 5,  6, 7, 8, 9,  10, 8, 7, 6, 7, H, R, R,
  8, H, 7, 6,  5, H, 6, 7,  9, H, 8, 7,  6, H, 5, H,
  3, R, 6, R,  8, H, 9, H,  10, 8, 6, 2, 3, H, R, R,
]);
const HAL_P7 = p64([
  10, H, 9, 8, 7, H, 6, H,  5, H, 3, 2,  1, H, R, R,
  8, H, 7, 6,  5, H, 3, H,  2, 3, 6, 8,  7, H, R, R,
  3, H, 6, H,  7, 8, 9, 10, 8, 7, 6, 5,  3, 1, 2, H,
  3, H, H, H,  0, H, 3, H,  H, H, R, R,  R, R, R, R,
]);

// ============================================================================
// 9. CANDY POP — Future-Pop Shōjo Harajuku (G Majeur : G4..F#6, G4=0, G5=7)
// ============================================================================
const CAN_P0 = p64([
  7, R, 8, 9,  11, H, 9, R, 10, R, 9, 8, 7, H, 5, R,
  6, R, 8, 9,  11, H, 13, R, 12, 11, 9, 8, 11, H, 9, R,
  7, R, 8, 9,  11, 12, 11, 9, 10, R, 11, 12, 9, H, 7, R,
  5, 7, 8, 9,  11, 9, 8, 6, 7, H, 9, H,  7, H, R, R,
]);
const CAN_P1 = p64([
  4, R, 7, 8,  9, H, 7, R,  5, R, 8, 9,  11, H, 9, R,
  6, R, 9, 11, 12, 11, 9, 7, 8, 9, 11, 8, 9, H, R, 7,
  10, R, 12, 11, 9, H, 7, R, 8, R, 11, 9, 6, H, 4, R,
  5, 7, 9, 11, 12, 11, 9, 8, 7, H, H, H, H, R, R, R,
]);
const CAN_P2 = p64([
  4, 6, 8, 11, 9, 8, 6, 4,  5, 7, 9, 12, 11, 9, 7, 5,
  6, 8, 10, 13, 12, 11, 9, 8, 7, 9, 11, 13, 12, 11, 8, R,
  9, R, 11, 12, 13, H, 11, R, 10, R, 9, 8, 9, H, 7, R,
  8, 9, 11, 12, 11, 9, 7, 6, 7, H, H, H, H, R, R, R,
]);
const CAN_P3 = p64([
  11, H, 12, 13, 11, H, 9, 7, 10, H, 11, 12, 9, H, 7, R,
  8, H, 9, 11, 12, H, 11, 9, 8, 9, 11, 12, 11, H, R, 9,
  10, H, 12, 11, 9, H, 11, 9, 8, H, 9, 8, 6, H, 7, H,
  8, 9, 11, 13, 12, 11, 9, 8, 7, H, H, H, H, R, R, R,
]);
const CAN_P4 = p64([
  9, H, H, 11, 8, H, H, 9,  7, H, 8, 9,  11, H, 8, R,
  10, H, 11, 12, 13, H, 11, R, 12, 11, 9, 8, 9, H, R, R,
  7, H, H, 8,  9, H, 7, R,  5, H, 7, 8,  9, H, 7, R,
  6, H, 8, H,  9, H, 11, H, 9, H, H, 8,  7, H, R, R,
]);
const CAN_P5 = p64([
  7, 7, R, 9,  11, R, 9, 7, 8, 8, R, 10, 12, R, 10, 8,
  9, 9, R, 11, 13, R, 11, 9, 12, 11, 9, 8, 11, H, R, R,
  10, 10, R, 12, 11, R, 9, 7, 8, 8, R, 11, 9, R, 7, 5,
  4, 5, 7, 8,  9, 11, 8, 6, 7, H, H, H,  H, R, R, R,
]);
const CAN_P6 = p64([
  3, 5, 7, 9,  8, 7, 5, 3,  4, 6, 8, 11, 9, 8, 6, 4,
  5, 7, 9, 12, 11, 9, 7, 5, 6, 8, 11, 13, 12, 11, 9, 8,
  7, 9, 11, 13, 12, 13, 11, 9, 8, 10, 12, 13, 11, 9, 8, 7,
  8, R, 9, R,  11, R, 13, H, 12, 11, 9, 8, 9, H, R, R,
]);
const CAN_P7 = p64([
  13, R, 12, 11, 12, R, 11, 9, 10, R, 9, 7, 8, H, R, R,
  11, R, 9, 8, 9, R, 8, 6,  7, 8, 9, 11, 8, H, R, R,
  4, 5, 7, 8,  9, 11, 12, 13, 12, 11, 9, 8, 7, 6, 8, H,
  7, H, H, H,  11, H, 7, H, H, H, R, R,  R, R, R, R,
]);

// ============================================================================
// 10. BONBONS — Gavotte de Boîte à Musique & Célesta (F Majeur : F4..D6)
// ============================================================================
const BON_P0 = p64([
  7, R, 9, 11, 13, H, 11, R, 12, R, 11, 10, 9, H, 7, R,
  8, R, 10, 12, 11, H, 9, R, 10, 9, 8, 6,  7, H, R, R,
  7, R, 9, 11, 13, H, 12, 11, 10, R, 12, 10, 9, H, 7, R,
  5, 7, 8, 10, 9, 8, 7, 6,  7, H, 11, H,  7, H, R, R,
]);
const BON_P1 = p64([
  11, H, 13, R, 12, 11, 9, 7, 10, H, 12, R, 11, 10, 9, 7,
  8, H, 11, R, 10, 9, 8, 7,  6, 8, 11, 10, 9, H, R, 7,
  11, H, 9, 7, 10, H, 8, 5,  9, H, 7, 4,  8, 7, 6, 7,
  8, 10, 11, 13, 12, 11, 10, 9, 7, H, H, H, H, R, R, R,
]);
const BON_P2 = p64([
  7, 11, 9, 11, 7, 11, 9, 11, 8, 12, 10, 12, 8, 12, 10, 12,
  9, 13, 11, 13, 10, 13, 12, 13, 11, 10, 9, 8, 7, H, R, R,
  5, 9, 7, 9,  4, 7, 9, 11, 5, 8, 10, 12, 9, H, 7, R,
  6, 8, 10, 11, 12, 11, 9, 8, 7, H, H, H, H, R, R, R,
]);
const BON_P3 = p64([
  13, H, 12, 11, 9, H, 11, H, 10, H, 9, 8, 7, H, 9, R,
  11, H, 10, 9,  8, H, 10, H, 9, H, 8, 7,  6, H, R, 7,
  9, H, 11, 12, 13, H, 11, 9, 10, H, 12, 10, 9, H, 7, H,
  8, 9, 10, 11, 12, 10, 9, 6, 7, H, H, H, H, R, R, R,
]);
const BON_P4 = p64([
  10, H, 9, 10, 12, H, 10, R, 9, H, 8, 9, 11, H, 9, R,
  8, H, 10, 11, 12, 13, 11, R, 10, 9, 8, 7, 6, H, R, R,
  7, H, 9, H,  11, H, 9, R,  8, H, 10, H, 9, H, 7, R,
  5, H, 8, H,  7, H, 10, H,  9, H, H, 8,  7, H, R, R,
]);
const BON_P5 = p64([
  4, R, 7, 9,  11, R, 9, 7, 5, R, 8, 10, 12, R, 10, 8,
  6, R, 9, 11, 13, R, 11, 9, 12, 11, 10, 8, 9, H, R, R,
  7, R, 11, 9, 13, R, 11, 9, 10, R, 12, 10, 8, R, 10, 8,
  7, 9, 11, 9, 8, 7, 6, 8,  7, H, H, H,  H, R, R, R,
]);
const BON_P6 = p64([
  4, 7, 9, 11, 13, 11, 9, 7, 5, 8, 10, 12, 13, 12, 10, 8,
  6, 8, 11, 12, 13, 12, 10, 8, 7, 9, 11, 13, 11, H, 9, R,
  8, 10, 12, 10, 9, 11, 13, 11, 10, 12, 13, 12, 11, 9, 8, 7,
  8, R, 10, R, 11, R, 13, H, 12, 11, 10, 9, 8, H, R, R,
]);
const BON_P7 = p64([
  13, H, 11, 9, 10, H, 8, 7, 9, H, 7, 5, 7, H, R, R,
  11, H, 9, 7,  8, H, 6, 5,  4, 6, 8, 10, 9, H, R, R,
  7, 9, 11, 13, 12, 10, 9, 7, 8, 10, 9, 7, 6, 8, 9, H,
  7, H, H, H,  11, H, 7, H,  H, H, R, R, R, R, R, R,
]);

// ============================================================================
// 11. TRAIN EXPRESS — Locomotive qui Roule, Sifflet Vapeur & Blues Ferroviaire (A Dorien / Blues)
// ============================================================================
const TRN_P0 = p64([
  7, H, H, R,  7, H, 11, H, H, H, 9, 8,  7, 6, 4, R,
  0, 0, 1, 2,  4, 4, 5, 4,  6, 5, 4, 2,  4, H, 0, R,
  0, 0, 1, 3,  4, 4, 7, 4,  8, 7, 6, 4,  5, 4, 2, 1,
  0, 1, 2, 4,  7, 6, 4, 2,  7, H, 4, 2,  0, H, R, R,
]);
const TRN_P1 = p64([
  0, 0, 4, 0,  5, 4, 6, 4,  0, 0, 4, 0,  7, 6, 5, 4,
  2, 2, 6, 2,  7, 6, 8, 6,  7, H, 11, H, H, 9, 7, R,
  0, 0, 4, 0,  5, 4, 7, 4,  8, 9, 10, 11, 9, 8, 7, 5,
  4, 4, 6, 4,  7, 6, 4, 2,  7, H, H, R,  4, H, R, R,
]);
const TRN_P2 = p64([
  4, 4, 7, 4,  5, 5, 7, 5,  6, 6, 7, 6,  5, 4, 2, 0,
  4, 4, 7, 4,  8, 8, 11, 8, 9, 8, 7, 5,  7, H, 4, R,
  7, 7, 11, 7, 9, 9, 11, 9, 12, 11, 9, 8, 7, 6, 4, 2,
  1, 2, 3, 4,  7, 6, 4, 2,  7, H, H, H,  H, R, R, R,
]);
const TRN_P3 = p64([
  11, H, H, R, 11, H, 13, H, H, 12, 11, 9, 8, 9, 7, R,
  9, H, H, R,  9, H, 11, H, 9, 8, 7, 6,  7, H, 4, R,
  7, 7, 8, 9,  11, 11, 12, 11, 13, 12, 11, 9, 8, 7, 6, 4,
  5, 6, 7, 9,  11, 9, 8, 6, 7, H, H, H,  H, R, R, R,
]);
const TRN_P4 = p64([
  7, H, 11, H, 9, H, 7, R,  6, H, 9, H,  7, H, 4, R,
  0, 0, 2, 2,  4, 4, 5, 5,  6, 6, 7, 8,  7, H, R, R,
  4, H, 7, H,  8, H, 7, R,  6, H, 8, H,  9, H, 7, R,
  4, 5, 6, 7,  8, 9, 11, 9, 7, H, 6, H,  4, H, R, R,
]);
const TRN_P5 = p64([
  0, 4, 0, 5,  0, 6, 5, 4,  2, 6, 2, 7,  2, 8, 7, 6,
  4, 7, 4, 8,  4, 9, 8, 7,  11, 9, 8, 7, 7, H, 4, R,
  7, 11, 7, 12, 7, 13, 12, 11, 9, 11, 9, 8, 7, 6, 4, 2,
  3, 4, 7, 6,  4, 2, 1, 0,  7, H, H, H,  H, R, R, R,
]);
const TRN_P6 = p64([
  0, 1, 2, 4,  2, 4, 5, 7,  4, 5, 7, 8,  7, 8, 9, 11,
  11, 11, 9, 8, 9, 9, 8, 7, 8, 7, 6, 4,  7, H, 4, R,
  7, 8, 9, 11, 12, 11, 9, 7, 8, 9, 10, 11, 13, H, 11, R,
  11, R, 12, R, 13, H, 11, 9, 8, 9, 7, 6, 7, H, R, R,
]);
const TRN_P7 = p64([
  11, H, H, R, 13, H, 11, 9, 8, 9, 7, 6, 4, H, 2, R,
  9, 8, 7, 6,  4, 5, 7, 4,  2, 3, 4, 6,  7, H, R, R,
  0, 0, 1, 3,  4, 6, 7, 9,  11, 9, 8, 7, 6, 4, 2, 4,
  7, H, 11, H, 7, H, H, H,  H, H, R, R,  R, R, R, R,
]);

// ============================================================================
// 12. CRYPTE — Cathédrale Givrée & Glas Solennel (D Phrygien Dom. / Harm. Min.)
// ============================================================================
const CRY_P0 = p64([
  0, H, 4, H,  5, 4, 3, H,  2, H, 3, 4,  5, 4, 2, R,
  0, H, 4, H,  7, H, 6, 5,  4, H, 3, 2,  0, H, R, R,
  4, H, 7, H,  8, 7, 5, H,  4, H, 6, 5,  4, H, 2, R,
  1, H, 2, 4,  5, H, 4, 2,  0, H, 4, H,  0, H, R, R,
]);
const CRY_P1 = p64([
  7, H, 9, 8,  7, H, 5, R,  4, H, 6, 5,  4, H, 2, R,
  3, H, 5, 7,  6, H, 8, H,  7, 6, 5, 4,  2, H, R, R,
  7, H, 11, 10, 9, H, 7, R, 8, H, 7, 6,  4, H, 5, H,
  6, 5, 4, 2,  1, 2, 4, 5,  4, H, H, H,  H, R, R, R,
]);
const CRY_P2 = p64([
  0, 4, 7, 4,  1, 5, 7, 5,  2, 4, 7, 4,  3, 5, 7, 5,
  4, 6, 9, 6,  5, 7, 10, 7, 6, 5, 4, 2,  0, H, R, R,
  4, 7, 9, 7,  5, 8, 10, 8, 6, 9, 11, 9, 7, H, 5, R,
  4, 5, 6, 8,  7, 6, 5, 4,  7, H, H, H,  H, R, R, R,
]);
const CRY_P3 = p64([
  11, H, 9, 8, 7, H, 9, H,  8, H, 7, 6,  4, H, 5, R,
  9, H, 8, 7,  5, H, 7, H,  6, H, 5, 4,  2, H, R, 4,
  7, H, 8, 9,  11, H, 12, H, 11, 9, 8, 7, 6, H, 8, H,
  7, H, 5, 4,  6, H, 4, 2,  7, H, H, H,  H, R, R, R,
]);
const CRY_P4 = p64([
  7, H, H, 5,  4, H, H, R,  5, H, H, 4,  2, H, R, R,
  8, H, H, 7,  6, H, 5, H,  4, H, H, H,  2, H, R, R,
  0, 2, 4, 5,  7, 5, 4, 2,  1, 3, 5, 4,  0, H, R, R,
  4, H, 5, H,  6, H, 8, H,  7, H, H, 5,  4, H, R, R,
]);
const CRY_P5 = p64([
  7, R, 11, 10, 9, R, 7, 5, 4, R, 8, 7,  5, R, 3, 2,
  1, R, 5, 4,  3, 2, 1, 0,  4, H, 2, 1,  0, H, R, R,
  7, R, 9, 8,  7, R, 11, 9, 8, R, 10, 8, 6, 8, 7, 5,
  4, 5, 7, 8,  6, 5, 4, 2,  7, H, H, H,  H, R, R, R,
]);
const CRY_P6 = p64([
  0, 2, 4, 5,  4, 5, 7, 8,  5, 7, 8, 9,  8, 7, 5, 4,
  2, 4, 5, 7,  6, 7, 9, 10, 7, 9, 11, 12, 11, 9, 8, 7,
  8, H, 9, 8,  7, H, 8, 7,  6, H, 8, 9,  11, H, 9, H,
  8, R, 9, R,  11, H, 12, H, 11, 9, 8, 6, 7, H, R, R,
]);
const CRY_P7 = p64([
  11, H, 9, 8, 7, H, 5, 4,  5, H, 4, 2,  4, H, R, R,
  9, H, 8, 7,  5, H, 4, 2,  1, 2, 4, 6,  7, H, R, R,
  0, H, 4, H,  7, H, 8, 7,  5, 4, 2, 1,  0, 2, 4, H,
  7, H, H, H,  0, H, 7, H,  H, H, R, R,  R, R, R, R,
]);

const THEME_SCORES: Record<BuiltinThemeId, ThemeScoreDef> = {
  // 1. Gamebuino AKA · ESP32 : Electro-Chiptune / Synthwave en La Dorien (124 BPM)
  aka_esp32: {
    id: 'aka_esp32',
    bpm: 124,
    defaultTimbre: 'PULSE_CHIP',
    altTimbre: 'BELL_OCT',
    groove: 'CYBER',
    arpOctaveShift: 0,
    scale: [64, 66, 67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84, 86], // E4..D6 (A4=3, E5=7, A5=10)
    sectionsChords: [
      [[57, 60, 64, 71], [53, 57, 60, 64], [50, 53, 57, 64], [52, 57, 59, 64]],
      [[57, 60, 64, 67], [55, 59, 62, 64], [53, 57, 60, 64], [52, 55, 59, 62]],
      [[50, 53, 57, 60], [57, 60, 64, 67], [53, 57, 60, 64], [52, 56, 59, 64]],
      [[53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64], [57, 60, 64, 71]],
      [[57, 60, 64, 69], [54, 57, 62, 66], [53, 57, 60, 64], [55, 59, 62, 67]],
      [[57, 60, 64, 67], [48, 55, 60, 64], [50, 53, 57, 62], [52, 56, 59, 64]],
      [[53, 57, 60, 64], [50, 53, 57, 64], [47, 53, 57, 62], [52, 56, 59, 64]],
      [[53, 57, 60, 64], [55, 59, 62, 67], [57, 60, 64, 71], [57, 60, 64, 69]],
    ],
    melodies: [AKA_P0, AKA_P1, AKA_P2, AKA_P3, AKA_P4, AKA_P5, AKA_P6, AKA_P7],
    bassPattern: [1, 0, 2, 0,  1, 0, 2, 1,  1, 0, 2, 0,  3, 0, 2, 0],
  },

  // 2. Odyssée Spatiale : Hymne Stellaire Lyrique en Ré Lydien (104 BPM)
  space_odyssey: {
    id: 'space_odyssey',
    bpm: 104,
    defaultTimbre: 'SPACE_PAD',
    altTimbre: 'BELL_OCT',
    groove: 'COSMIC',
    arpOctaveShift: 0,
    scale: [62, 64, 66, 68, 69, 71, 73, 74, 76, 78, 80, 81, 83, 86],
    sectionsChords: [
      [[50, 57, 62, 66], [52, 56, 59, 64], [50, 57, 61, 66], [45, 52, 57, 61]],
      [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]],
      [[50, 57, 61, 66], [54, 57, 61, 64], [43, 50, 55, 59], [52, 56, 59, 64]],
      [[47, 54, 57, 62], [43, 50, 55, 59], [50, 57, 61, 66], [45, 52, 57, 61]],
      [[43, 50, 54, 59], [45, 52, 57, 61], [50, 57, 61, 66], [47, 54, 57, 62]],
      [[50, 57, 61, 66], [52, 56, 59, 64], [43, 50, 55, 59], [45, 52, 55, 62]],
      [[52, 55, 59, 64], [54, 57, 61, 64], [43, 50, 55, 59], [45, 52, 57, 61]],
      [[43, 50, 55, 59], [45, 52, 57, 61], [50, 57, 61, 64], [50, 57, 62, 66]],
    ],
    melodies: [SPA_P0, SPA_P1, SPA_P2, SPA_P3, SPA_P4, SPA_P5, SPA_P6, SPA_P7],
    bassPattern: [1, 0, 0, 0,  0, 0, 0, 0,  3, 0, 0, 0,  0, 0, 0, 0],
  },

  // 3. Star Galaxy · Yavin : Grande Fanfare Spatiale style Star Wars en Si♭ Majeur / Sol Mineur (88 BPM)
  star_galaxy: {
    id: 'star_galaxy',
    bpm: 88,
    defaultTimbre: 'HERO_BRASS',
    altTimbre: 'WARM_TRI',
    groove: 'MARCH',
    arpOctaveShift: 0,
    scale: [58, 62, 63, 65, 67, 69, 70, 72, 74, 75, 77, 79, 81, 82],
    sectionsChords: [
      [[46, 53, 58, 62], [46, 51, 55, 60], [44, 51, 56, 60], [41, 48, 53, 60]],
      [[46, 53, 58, 62], [46, 51, 55, 63], [44, 51, 56, 60], [41, 48, 53, 60]],
      [[51, 55, 58, 62], [50, 53, 57, 60], [48, 51, 55, 58], [41, 48, 53, 57]],
      [[43, 50, 55, 58], [51, 55, 58, 63], [46, 53, 58, 62], [50, 54, 57, 62]],
      [[43, 50, 55, 58], [39, 46, 51, 55], [48, 51, 55, 60], [38, 45, 50, 54]],
      [[43, 50, 55, 58], [44, 51, 56, 60], [51, 55, 58, 63], [41, 48, 53, 57]],
      [[46, 53, 58, 62], [43, 50, 55, 58], [51, 55, 58, 63], [41, 48, 53, 60]],
      [[42, 49, 54, 58], [44, 51, 56, 60], [46, 53, 58, 62], [46, 53, 58, 62]],
    ],
    melodies: [SW_P0, SW_P1, SW_P2, SW_P3, SW_P4, SW_P5, SW_P6, SW_P7],
    bassPattern: [1, 0, 0, 0,  3, 0, 0, 0,  1, 0, 0, 1,  3, 0, 0, 0],
  },

  // 4. Temple Solaire : Flûte de Jade & Marimba d'Or en Ré Mineur Harmonique / Dorien (116 BPM)
  solaire: {
    id: 'solaire',
    bpm: 116,
    defaultTimbre: 'PAN_FLUTE',
    altTimbre: 'BELL_OCT',
    groove: 'RITUAL',
    arpOctaveShift: 0,
    scale: [60, 62, 64, 65, 62, 64, 65, 67, 69, 70, 73, 74, 76, 77], // Ré dorien/harmonique (C#5=10)
    sectionsChords: [
      [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61]],
      [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 55, 61]],
      [[43, 50, 55, 58], [50, 57, 62, 65], [46, 53, 57, 62], [45, 52, 55, 61]],
      [[53, 57, 60, 65], [48, 55, 60, 64], [50, 57, 60, 65], [45, 52, 57, 60]],
      [[50, 57, 60, 64], [50, 56, 59, 62], [46, 53, 57, 62], [45, 52, 55, 61]],
      [[50, 57, 62, 65], [53, 57, 60, 65], [43, 50, 55, 58], [45, 52, 55, 61]],
      [[46, 53, 57, 62], [48, 55, 60, 64], [50, 57, 62, 65], [45, 52, 55, 61]],
      [[43, 50, 55, 58], [45, 52, 55, 61], [50, 57, 62, 64], [50, 57, 62, 65]],
    ],
    melodies: [SOL_P0, SOL_P1, SOL_P2, SOL_P3, SOL_P4, SOL_P5, SOL_P6, SOL_P7],
    bassPattern: [1, 0, 0, 3,  0, 0, 1, 0,  0, 3, 2, 0,  3, 0, 1, 0],
  },

  // 5. Flipper Classique : Orgue Hammond Boogie-Woogie d'arcade 1960 en Do Mixolydien (130 BPM)
  classique: {
    id: 'classique',
    bpm: 130,
    defaultTimbre: 'VINTAGE_ORGAN',
    altTimbre: 'BELL_OCT',
    groove: 'BOOGIE',
    arpOctaveShift: 0,
    scale: [60, 62, 64, 67, 69, 70, 71, 72, 74, 76, 77, 79, 81, 84], // Do blues/mixolydien (Bb4=5, B4=6, C5=7? wait C5=7, G5=11, C6=13)
    sectionsChords: [
      [[48, 52, 55, 58], [53, 57, 60, 63], [48, 52, 55, 58], [55, 59, 62, 65]],
      [[48, 52, 55, 60], [52, 55, 59, 64], [53, 57, 60, 65], [55, 59, 62, 67]],
      [[53, 57, 60, 63], [53, 56, 60, 65], [48, 52, 55, 60], [57, 61, 64, 67]],
      [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 60], [53, 57, 60, 65]],
      [[57, 60, 64, 67], [55, 59, 62, 67], [53, 57, 60, 65], [52, 56, 59, 64]],
      [[48, 52, 55, 58], [53, 57, 60, 63], [50, 54, 57, 60], [55, 59, 62, 65]],
      [[50, 53, 57, 62], [52, 55, 59, 64], [53, 57, 60, 65], [55, 59, 62, 67]],
      [[53, 57, 60, 63], [55, 59, 62, 65], [48, 53, 55, 60], [48, 52, 55, 60]],
    ],
    melodies: [CLA_P0, CLA_P1, CLA_P2, CLA_P3, CLA_P4, CLA_P5, CLA_P6, CLA_P7],
    bassPattern: [1, 0, 4, 0,  3, 0, 2, 0,  1, 0, 4, 0,  3, 0, 4, 0], // Walking boogie !
  },

  // 6. Préhistoire : Corne de Guerre Grave, Maillets d'Os & Tambours Primitifs (108 BPM)
  prehistoire: {
    id: 'prehistoire',
    bpm: 108,
    defaultTimbre: 'PRIMAL_HORN',
    altTimbre: 'STONE_MALLET',
    groove: 'PRIMAL',
    arpOctaveShift: 0,
    scale: [50, 52, 53, 55, 57, 58, 59, 62, 64, 65, 67, 69, 70, 71],
    sectionsChords: [
      [[40, 47, 52, 59], [40, 47, 52, 55], [41, 48, 53, 60], [40, 47, 52, 59]],
      [[40, 47, 52, 59], [43, 50, 55, 62], [38, 45, 50, 57], [40, 47, 52, 59]],
      [[43, 50, 55, 62], [45, 52, 57, 64], [40, 47, 52, 59], [41, 48, 53, 60]],
      [[40, 47, 52, 59], [46, 53, 58, 65], [43, 50, 55, 62], [40, 47, 52, 59]],
      [[40, 47, 52, 59], [41, 48, 53, 60], [38, 45, 50, 57], [40, 47, 52, 59]],
      [[40, 47, 52, 59], [43, 50, 55, 62], [46, 53, 58, 65], [45, 52, 57, 64]],
      [[38, 45, 50, 57], [40, 47, 52, 59], [43, 50, 55, 62], [41, 48, 53, 60]],
      [[43, 50, 55, 62], [41, 48, 53, 60], [38, 45, 50, 57], [40, 47, 52, 59]],
    ],
    melodies: [PRE_P0, PRE_P1, PRE_P2, PRE_P3, PRE_P4, PRE_P5, PRE_P6, PRE_P7],
    bassPattern: [1, 0, 1, 1,  0, 0, 3, 0,  1, 0, 1, 1,  3, 1, 0, 0],
  },

  // 7. Far West : Country Hoedown, Guitare Twang, Banjo & Fiddle en Ré Majeur (134 BPM)
  farwest: {
    id: 'farwest',
    bpm: 134,
    defaultTimbre: 'HONKY_BANJO',
    altTimbre: 'COUNTRY_FIDDLE',
    groove: 'COUNTRY',
    arpOctaveShift: 12,
    scale: [57, 59, 62, 64, 65, 66, 69, 71, 72, 74, 76, 77, 78, 81],
    sectionsChords: [
      [[38, 50, 57, 66], [43, 50, 55, 59], [38, 50, 57, 66], [45, 52, 57, 61]],
      [[38, 50, 57, 66], [48, 52, 55, 60], [43, 50, 55, 59], [38, 50, 57, 66]],
      [[38, 50, 57, 66], [43, 50, 55, 59], [40, 47, 52, 56], [45, 52, 57, 61]],
      [[43, 50, 55, 59], [38, 50, 57, 66], [45, 52, 57, 61], [38, 50, 57, 66]],
      [[47, 54, 59, 62], [43, 50, 55, 59], [38, 50, 57, 66], [45, 52, 57, 61]],
      [[38, 50, 57, 66], [48, 52, 55, 60], [43, 50, 55, 59], [38, 50, 57, 66]],
      [[40, 47, 52, 56], [43, 50, 55, 59], [38, 50, 57, 66], [45, 52, 57, 61]],
      [[43, 50, 55, 59], [45, 52, 57, 61], [38, 50, 55, 62], [38, 50, 57, 66]],
    ],
    melodies: [FW_P0, FW_P1, FW_P2, FW_P3, FW_P4, FW_P5, FW_P6, FW_P7],
    bassPattern: [1, 0, 0, 0,  0, 0, 0, 0,  3, 0, 0, 0,  0, 0, 4, 0],
  },

  // 8. Halloween : Orgue Sépulcral Sombre & Tritons Hantés en Do Mineur (96 BPM)
  halloween: {
    id: 'halloween',
    bpm: 96,
    defaultTimbre: 'GOTHIC_ORGAN',
    altTimbre: 'CATHEDRAL_CHOIR',
    groove: 'GOTHIC',
    arpOctaveShift: 0,
    scale: [55, 56, 59, 60, 62, 63, 66, 67, 68, 71, 72, 74, 75, 78],
    sectionsChords: [
      [[36, 43, 48, 51], [42, 45, 48, 51], [41, 44, 48, 53], [43, 47, 50, 56]],
      [[36, 43, 48, 51], [39, 46, 51, 54], [44, 47, 51, 56], [43, 47, 50, 56]],
      [[36, 43, 48, 51], [37, 44, 49, 53], [42, 45, 48, 51], [43, 47, 50, 55]],
      [[44, 48, 51, 56], [41, 44, 48, 53], [42, 45, 48, 51], [43, 47, 50, 56]],
      [[36, 43, 48, 51], [35, 41, 44, 50], [37, 44, 49, 53], [43, 47, 50, 56]],
      [[41, 44, 48, 53], [36, 43, 48, 51], [42, 45, 48, 51], [43, 47, 50, 56]],
      [[39, 46, 51, 54], [44, 47, 51, 56], [37, 44, 49, 53], [43, 47, 50, 56]],
      [[41, 44, 48, 53], [42, 45, 48, 51], [43, 47, 50, 56], [36, 43, 48, 51]],
    ],
    melodies: [HAL_P0, HAL_P1, HAL_P2, HAL_P3, HAL_P4, HAL_P5, HAL_P6, HAL_P7],
    bassPattern: [1, 0, 0, 0,  0, 0, 4, 0,  1, 0, 0, 0,  3, 0, 0, 0],
  },

  // 9. Candy Pop : Future-Pop Shōjo Harajuku en Sol Majeur (IV-V-iii-vi Royal Road, 138 BPM)
  candy: {
    id: 'candy',
    bpm: 138,
    defaultTimbre: 'KAWAII_BELL',
    altTimbre: 'PULSE_CHIP',
    groove: 'POP',
    arpOctaveShift: 12,
    scale: [67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84, 86, 88, 90], // Sol majeur (G4=0, D5=4, G5=7)
    sectionsChords: [
      [[48, 55, 60, 64], [50, 57, 62, 66], [47, 54, 59, 62], [52, 59, 64, 67]], // Cmaj7 - D - Bm7 - Em7 !
      [[45, 52, 57, 60], [50, 57, 62, 66], [43, 50, 55, 59], [43, 50, 55, 62]],
      [[48, 55, 60, 64], [50, 57, 62, 66], [51, 57, 63, 66], [52, 59, 64, 67]],
      [[48, 55, 60, 64], [50, 57, 62, 66], [47, 54, 59, 62], [52, 59, 64, 67]],
      [[45, 52, 57, 60], [47, 54, 59, 62], [48, 55, 60, 64], [50, 57, 62, 66]],
      [[43, 50, 55, 59], [47, 54, 59, 62], [52, 59, 64, 67], [48, 55, 60, 64]],
      [[45, 52, 57, 60], [47, 54, 59, 62], [48, 55, 60, 64], [50, 57, 62, 66]],
      [[48, 55, 60, 64], [50, 57, 62, 66], [43, 50, 55, 60], [43, 50, 55, 59]],
    ],
    melodies: [CAN_P0, CAN_P1, CAN_P2, CAN_P3, CAN_P4, CAN_P5, CAN_P6, CAN_P7],
    bassPattern: [1, 0, 2, 0,  1, 2, 0, 1,  0, 2, 1, 0,  3, 0, 2, 0],
  },

  // 10. Bonbons : Gavotte de Boîte à Musique & Célesta Confiseur en Fa Majeur (118 BPM)
  bonbons: {
    id: 'bonbons',
    bpm: 118,
    defaultTimbre: 'CELESTA_BOX',
    altTimbre: 'WARM_TRI',
    groove: 'MUSICBOX',
    arpOctaveShift: 12,
    scale: [65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84, 86, 88], // Fa majeur (F4=0, C5=4, F5=7)
    sectionsChords: [
      [[41, 48, 53, 57], [48, 55, 60, 64], [50, 57, 62, 65], [45, 52, 57, 60]],
      [[46, 53, 58, 62], [41, 48, 53, 57], [43, 50, 55, 58], [48, 55, 60, 64]],
      [[41, 48, 53, 57], [43, 50, 55, 58], [45, 52, 57, 60], [46, 53, 58, 62]],
      [[50, 57, 62, 65], [45, 52, 57, 60], [46, 53, 58, 62], [48, 55, 60, 64]],
      [[46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60], [50, 57, 62, 65]],
      [[43, 50, 55, 58], [48, 55, 60, 64], [41, 48, 53, 57], [50, 57, 62, 65]],
      [[46, 53, 58, 62], [47, 53, 59, 62], [48, 53, 57, 60], [48, 55, 60, 64]],
      [[43, 50, 55, 58], [48, 55, 60, 64], [41, 46, 53, 57], [41, 48, 53, 57]],
    ],
    melodies: [BON_P0, BON_P1, BON_P2, BON_P3, BON_P4, BON_P5, BON_P6, BON_P7],
    bassPattern: [1, 0, 0, 0,  3, 0, 0, 0,  2, 0, 0, 0,  3, 0, 0, 0],
  },

  // 11. Train Express : Locomotive en Marche, Bielles & Sifflet Vapeur en La Blues/Dorien (134 BPM)
  train: {
    id: 'train',
    bpm: 134,
    defaultTimbre: 'STEAM_BRASS',
    altTimbre: 'HONKY_BANJO',
    groove: 'TRAIN_CHUG',
    arpOctaveShift: 0,
    scale: [57, 60, 62, 63, 64, 66, 67, 69, 72, 74, 75, 76, 78, 81],
    sectionsChords: [
      [[45, 52, 57, 61], [45, 52, 57, 63], [50, 57, 62, 66], [45, 52, 57, 61]],
      [[45, 52, 57, 60], [50, 57, 62, 66], [45, 52, 57, 60], [52, 56, 59, 64]],
      [[45, 52, 57, 60], [55, 59, 62, 67], [50, 57, 62, 66], [52, 56, 59, 64]],
      [[50, 57, 62, 66], [45, 52, 57, 60], [47, 54, 59, 62], [52, 56, 59, 64]],
      [[45, 52, 57, 60], [55, 59, 62, 67], [53, 57, 60, 64], [52, 56, 59, 64]],
      [[45, 52, 57, 60], [50, 57, 62, 66], [52, 56, 59, 64], [45, 52, 57, 60]],
      [[45, 52, 57, 60], [48, 55, 60, 64], [50, 57, 62, 66], [52, 56, 59, 64]],
      [[50, 57, 62, 66], [52, 56, 59, 64], [45, 52, 57, 63], [45, 52, 57, 61]],
    ],
    melodies: [TRN_P0, TRN_P1, TRN_P2, TRN_P3, TRN_P4, TRN_P5, TRN_P6, TRN_P7],
    bassPattern: [1, 0, 2, 1,  3, 0, 2, 3,  1, 0, 2, 1,  4, 0, 3, 2],
  },

  // 12. Crypte : Cathédrale Givrée & Glas Solennel en Ré Phrygien Dominant / Mineur Harm. (86 BPM)
  crypte: {
    id: 'crypte',
    bpm: 86,
    defaultTimbre: 'CATHEDRAL_CHOIR',
    altTimbre: 'BELL_OCT',
    groove: 'SOLEMN',
    arpOctaveShift: 12,
    scale: [57, 58, 61, 62, 65, 67, 68, 69, 70, 73, 74, 77, 79, 81], // La phrygien dom. / Ré mineur harm. (A3=0, D4=3? wait D4=62=3, A4=69=7, D5=74=10)
    sectionsChords: [
      [[38, 45, 50, 53], [34, 41, 46, 50], [43, 50, 55, 58], [45, 52, 57, 61]],
      [[38, 45, 50, 53], [41, 48, 53, 57], [34, 41, 46, 50], [45, 52, 57, 61]],
      [[43, 50, 55, 58], [38, 45, 50, 53], [40, 46, 52, 55], [45, 52, 57, 61]],
      [[34, 41, 46, 50], [48, 55, 60, 64], [38, 45, 50, 53], [45, 52, 57, 61]],
      [[38, 45, 50, 53], [39, 46, 51, 55], [45, 52, 57, 61], [38, 45, 50, 53]],
      [[43, 50, 55, 58], [34, 41, 46, 50], [45, 52, 57, 61], [38, 45, 50, 53]],
      [[34, 41, 46, 50], [43, 50, 55, 58], [45, 52, 57, 61], [46, 53, 58, 62]],
      [[43, 50, 55, 58], [45, 52, 57, 61], [38, 45, 50, 52], [38, 45, 50, 53]],
    ],
    melodies: [CRY_P0, CRY_P1, CRY_P2, CRY_P3, CRY_P4, CRY_P5, CRY_P6, CRY_P7],
    bassPattern: [1, 0, 0, 0,  3, 0, 0, 0,  1, 0, 0, 0,  2, 0, 3, 0],
  },
};

const ARP_PATTERNS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 2, 1, 2, 3], // Pendulaire fluide
  [0, 2, 1, 3, 0, 3, 1, 2], // Alberti ouvert
  [3, 2, 1, 0, 1, 2, 3, 1], // Cascade descendante
  [0, 1, 3, 2, 4, 3, 2, 1], // Scintillant à l'octave (4 = fondam + 12)
  [0, 3, 2, 4, 3, 1, 2, 0], // Spiralé large
];

function resolveScoreTheme(themeId: TableThemeId): BuiltinThemeId {
  if ((BUILTIN_THEME_IDS as readonly string[]).includes(themeId)) {
    return themeId as BuiltinThemeId;
  }
  const tbl = getTableById(themeId);
  if (tbl?.musicTheme && (BUILTIN_THEME_IDS as readonly string[]).includes(tbl.musicTheme)) {
    return tbl.musicTheme;
  }
  if (tbl?.decorTheme && (BUILTIN_THEME_IDS as readonly string[]).includes(tbl.decorTheme)) {
    return tbl.decorTheme;
  }
  return 'aka_esp32';
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Calcule de façon pure et déterministe les événements musicaux du pas `globalStep`.
 * Un cycle structurel complet compte 512 pas (32 mesures), enrichi de variations multi-cycles.
 */
export function evaluateMusicStep(
  themeId: TableThemeId,
  globalStep: number,
  isMenu: boolean = false,
  isMultiball: boolean = false
): EvaluatedMusicStep {
  const builtinId = resolveScoreTheme(themeId);
  const score = THEME_SCORES[builtinId] ?? THEME_SCORES.aka_esp32;
  const tempoScale = isMultiball
    ? builtinId === 'star_galaxy'
      ? 1.06
      : 1.12
    : isMenu
      ? builtinId === 'star_galaxy'
        ? 0.95
        : 0.92
      : 1.0;
  const effectiveBpm = score.bpm * tempoScale;
  const stepDurationSec = 60 / effectiveBpm / 4; // 1 double-croche

  const stepInCycle = ((globalStep % 512) + 512) % 512;
  const cycleIndex = Math.max(0, Math.floor(globalStep / 512));
  const sectionIndex = Math.floor(stepInCycle / 64); // 0..7
  const stepInSection = stepInCycle % 64;            // 0..63
  const barInSection = Math.floor(stepInSection / 16); // 0..3
  const stepInBar = stepInSection % 16;              // 0..15

  const chord = score.sectionsChords[sectionIndex][barInSection];
  const variantId = (cycleIndex * 3 + sectionIndex) % 6;
  const isBridge = sectionIndex === 4;

  // --- 1. MÉLODIE PRINCIPALE & VARIATIONS MULTI-CYCLES ---
  const phrase = score.melodies[sectionIndex];
  const rawDeg = phrase[stepInSection];

  // Respiration sur les cycles suivants uniquement pendant les 2 premières mesures du pont C
  const sparseBreath = cycleIndex > 0 && cycleIndex % 3 === 2 && isBridge && barInSection < 2;

  let leadMidi: number | null = null;
  let leadSteps = 1;
  let harmonyMidi: number | null = null;
  let leadTimbre: LeadTimbre =
    cycleIndex % 2 === 1 && (sectionIndex === 4 || sectionIndex === 5)
      ? score.altTimbre
      : cycleIndex % 3 === 2 && sectionIndex === 2
        ? score.altTimbre
        : score.defaultTimbre;

  if (!sparseBreath) {
    if (rawDeg >= 0) {
      let deg = Math.min(score.scale.length - 1, rawDeg);

      // Variation mélodique cyclique : sur les tours impairs, légère inflexion diatonique sur les temps faibles de fin de mesure
      if (cycleIndex % 2 === 1 && stepInBar >= 10 && stepInBar % 2 === 0 && deg >= 1 && deg < score.scale.length - 1) {
        deg += (sectionIndex + barInSection) % 2 === 0 ? 1 : -1;
      }

      leadMidi = score.scale[deg];

      let look = stepInSection + 1;
      while (look < 64 && phrase[look] === H) {
        leadSteps++;
        look++;
      }

      // Variation 1 : registre cristallin à l'octave sur certains ponts/refrains (sauf univers graves/orchestraux)
      const keepDarkOrGrounded =
        builtinId === 'prehistoire' || builtinId === 'halloween' || builtinId === 'star_galaxy';
      if (
        !keepDarkOrGrounded &&
        cycleIndex % 3 === 1 &&
        (sectionIndex === 2 || sectionIndex === 4) &&
        leadMidi < 76
      ) {
        leadMidi += 12;
        leadTimbre = score.altTimbre;
      }

      // Variation 2 : contre-chant harmonique (et double-corde de sifflet vapeur sur Train / Fiddle Country !)
      if (
        builtinId === 'train' &&
        leadTimbre === 'STEAM_BRASS' &&
        leadSteps >= 3 &&
        deg >= 2
      ) {
        harmonyMidi = score.scale[Math.max(0, deg - 2)];
      } else if (
        builtinId === 'farwest' &&
        leadTimbre === 'COUNTRY_FIDDLE' &&
        leadSteps >= 2 &&
        deg >= 2
      ) {
        harmonyMidi = score.scale[Math.max(0, deg - 2)];
      } else if (
        (sectionIndex === 3 || (cycleIndex > 0 && (sectionIndex === 6 || sectionIndex === 7))) &&
        deg >= 2 &&
        builtinId !== 'prehistoire'
      ) {
        const harmOffset = cycleIndex % 2 === 0 ? 2 : Math.min(deg, 4);
        harmonyMidi = score.scale[deg - harmOffset];
      }

      // Variation 3 : articuler une note longue pour insérer une broderie mélodique vivante
      if (
        (variantId === 2 || variantId === 5) &&
        leadSteps >= 4 &&
        builtinId !== 'star_galaxy' &&
        builtinId !== 'space_odyssey'
      ) {
        leadSteps = 2;
      }
    } else if (
      // Broderie mélodique sur la suite d'une note tenue
      rawDeg === H &&
      (variantId === 2 || variantId === 5) &&
      builtinId !== 'star_galaxy' &&
      builtinId !== 'space_odyssey' &&
      stepInSection >= 2 &&
      phrase[stepInSection - 2] >= 0 &&
      phrase[stepInSection - 1] === H
    ) {
      const baseDeg = phrase[stepInSection - 2];
      const shift = (barInSection + cycleIndex) % 2 === 0 ? 1 : -1;
      const ornDeg = Math.max(0, Math.min(score.scale.length - 1, baseDeg + shift));
      leadMidi = score.scale[ornDeg];
      leadSteps = 2;
    } else if (
      // Trait de liaison (turnaround fill) en fin de 4e mesure (pas 56..63)
      rawDeg === R &&
      stepInSection >= 56 &&
      stepInSection % 2 === 0 &&
      (cycleIndex + sectionIndex) % 2 === 1
    ) {
      const fillIdx = Math.floor((stepInSection - 56) / 2); // 0..3
      const octaveAdd = builtinId === 'prehistoire' || builtinId === 'halloween' ? 0 : 12;
      leadMidi = chord[fillIdx % 4] + octaveAdd;
      leadSteps = 2;
    }
  }

  // En mode Menu : version feutrée en préservant les timbres identitaires
  if (isMenu && leadMidi !== null) {
    if (builtinId === 'aka_esp32') {
      leadTimbre = 'WARM_TRI';
    }
    if (sectionIndex % 2 === 1 && barInSection === 3 && stepInBar >= 8) {
      leadMidi = null;
      harmonyMidi = null;
    }
  }

  // --- 2. ARPÈGE / ACCOMPAGNEMENT ÉVOLUTIF ADAPTÉ AU STYLE ---
  const arpPattern = ARP_PATTERNS[(sectionIndex + cycleIndex * 2) % ARP_PATTERNS.length];
  let arpMidi: number | null = null;
  let playArpOnStep = false;
  switch (score.groove) {
    case 'COSMIC':
      // Odyssée Spatiale : zéro arpège répétitif en doubles-croches ! Seulement 2 respirations cristallines douces par mesure
      playArpOnStep = stepInBar === 4 || stepInBar === 12;
      break;
    case 'PRIMAL':
      // Préhistoire : frappes sèches de quintes tribales sur les appuis lourds
      playArpOnStep = !isMenu && (stepInBar === 0 || stepInBar === 6 || stepInBar === 12);
      break;
    case 'COUNTRY':
      // Far West : « boom-chick-a » country authentique sur les contretemps et temps 2 & 4
      playArpOnStep = stepInBar % 4 === 2 || stepInBar === 4 || stepInBar === 12;
      break;
    case 'GOTHIC':
      // Halloween : ostinato sombre en croches graves
      playArpOnStep = stepInBar % 2 === 0;
      break;
    case 'MARCH':
      // Star Wars : accompagnement orchestral posé en noires sous la fanfare (sans précipitation)
      playArpOnStep = stepInBar % 4 === 0 || stepInBar === 14;
      break;
    case 'TRAIN_CHUG':
      // Train : accords rythmiques de bielles synchronisés avec les pistons vapeur
      playArpOnStep = isMenu ? stepInBar % 2 === 0 : stepInBar % 4 !== 0;
      break;
    default:
      playArpOnStep = isBridge || isMenu ? stepInBar % 2 === 0 : true;
      break;
  }

  if (playArpOnStep) {
    if (score.groove === 'PRIMAL') {
      arpMidi = chord[stepInBar === 6 ? 2 : 0];
    } else {
      const arpChoice = arpPattern[stepInBar % arpPattern.length];
      if (arpChoice === 4) {
        arpMidi = chord[0] + 12 + score.arpOctaveShift;
      } else {
        arpMidi = chord[arpChoice % 4] + score.arpOctaveShift;
      }
      if (arpMidi > 86) arpMidi -= 12;
      if (score.groove === 'GOTHIC' && arpMidi > 62) arpMidi -= 12;
    }
    if (leadMidi !== null && arpMidi === leadMidi) {
      arpMidi -= 12;
    }
  }

  // --- 3. LIGNE DE BASSE IDIOMATIQUE ---
  let bassMidi: number | null = null;
  let bassSteps = 2;
  const rootGrave = Math.max(33, chord[0] - (chord[0] >= 48 ? 12 : 0));

  if (isBridge && score.groove !== 'MARCH' && score.groove !== 'PRIMAL' && score.groove !== 'TRAIN_CHUG') {
    if (stepInBar === 0) {
      bassMidi = rootGrave;
      bassSteps = 10;
    } else if (stepInBar === 12) {
      bassMidi = Math.max(33, chord[2] - 12);
      bassSteps = 4;
    }
  } else if (isMenu) {
    if (stepInBar === 0 || stepInBar === 8) {
      bassMidi = stepInBar === 0 ? rootGrave : Math.max(33, chord[2] - 12);
      bassSteps = 6;
    }
  } else {
    const bp =
      isMultiball && score.groove !== 'COSMIC' && score.groove !== 'COUNTRY'
        ? stepInBar % 2 === 0
          ? stepInBar % 4 === 0
            ? 1
            : 2
          : 0
        : score.bassPattern[stepInBar];

    if (bp === 1) {
      bassMidi = rootGrave;
      bassSteps =
        score.groove === 'COSMIC'
          ? 7
          : score.groove === 'SOLEMN' || score.groove === 'GOTHIC' || score.groove === 'COUNTRY'
            ? 4
            : score.groove === 'MARCH'
              ? 3
              : 2;
    } else if (bp === 2) {
      bassMidi = rootGrave + 12;
      bassSteps = 2;
    } else if (bp === 3) {
      bassMidi = Math.max(33, chord[2] - (chord[2] >= 52 ? 12 : 0));
      bassSteps =
        score.groove === 'COSMIC'
          ? 7
          : score.groove === 'COUNTRY'
            ? 4
            : score.groove === 'MARCH'
              ? 3
              : 2;
    } else if (bp === 4) {
      bassMidi = Math.max(33, chord[1] - (chord[1] >= 52 ? 12 : 0));
      bassSteps = score.groove === 'GOTHIC' ? 3 : 2;
    }
  }

  // --- 4. PULSATION RYTHMIQUE ADAPTÉE À L'UNIVERS ---
  let kick = false;
  let hatGain = 0;
  if (!isMenu && (!isBridge || score.groove === 'MARCH' || score.groove === 'PRIMAL' || score.groove === 'TRAIN_CHUG')) {
    switch (score.groove) {
      case 'COSMIC':
        // Odyssée Spatiale : zéro charleston répétitif, pulsation sub-grave feutrée toutes les 2 mesures
        kick = stepInBar === 0 && barInSection % 2 === 0;
        hatGain = 0;
        break;
      case 'TRAIN_CHUG':
        // Roulement sur rails (« TA-dam ... TA-dam ») + halètement vapeur continu en doubles-croches !
        kick = stepInBar === 0 || stepInBar === 3 || stepInBar === 8 || stepInBar === 11;
        hatGain =
          stepInBar % 4 === 2
            ? 0.052
            : stepInBar % 4 === 3
              ? 0.028
              : 0.019;
        break;
      case 'COUNTRY':
        kick = stepInBar === 0 || stepInBar === 8;
        hatGain =
          stepInBar === 4 || stepInBar === 12
            ? 0.044
            : stepInBar % 4 === 2
              ? 0.022
              : stepInBar === 15
                ? 0.016
                : 0;
        break;
      case 'PRIMAL':
        kick =
          stepInBar === 0 ||
          stepInBar === 3 ||
          stepInBar === 6 ||
          stepInBar === 8 ||
          stepInBar === 11 ||
          stepInBar === 14;
        hatGain = stepInBar === 4 || stepInBar === 12 ? 0.042 : 0;
        break;
      case 'GOTHIC':
        kick = stepInBar === 0 || (stepInBar === 10 && barInSection % 2 === 1);
        hatGain = stepInBar === 12 ? 0.014 : 0;
        break;
      case 'BOOGIE':
        kick = stepInBar === 0 || stepInBar === 8 || stepInBar === 14;
        hatGain = stepInBar % 4 === 2 ? 0.028 : stepInBar % 4 === 3 ? 0.015 : 0;
        break;
      case 'RITUAL':
        kick = stepInBar === 0 || stepInBar === 3 || stepInBar === 8 || stepInBar === 11;
        hatGain = stepInBar % 2 === 0 ? 0.02 : 0;
        break;
      case 'MUSICBOX':
        kick = stepInBar === 0 && barInSection % 2 === 0;
        hatGain = stepInBar === 4 || stepInBar === 12 ? 0.014 : 0;
        break;
      case 'SOLEMN':
        kick = stepInBar === 0 || (stepInBar === 8 && barInSection % 2 === 1);
        hatGain = stepInBar === 8 ? 0.016 : 0;
        break;
      case 'MARCH':
        kick = stepInBar === 0 || stepInBar === 8 || (stepInBar === 6 && barInSection % 2 === 1);
        hatGain =
          stepInBar === 4 || stepInBar === 12
            ? 0.028
            : barInSection % 2 === 1 && (stepInBar === 14 || stepInBar === 15)
              ? 0.02
              : 0;
        break;
      default:
        kick =
          stepInBar === 0 ||
          stepInBar === 8 ||
          (stepInSection >= 60 && stepInBar === 14 && cycleIndex % 2 === 1);
        if (stepInBar % 4 === 2) {
          hatGain = 0.026;
        } else if (stepInBar % 2 === 1 && (isMultiball || variantId === 4)) {
          hatGain = 0.014;
        }
        if (stepInSection >= 61) {
          hatGain = 0.022;
        }
        break;
    }
  }

  const leadGain =
    builtinId === 'space_odyssey'
      ? isMenu
        ? 0.095
        : 0.132
      : builtinId === 'star_galaxy'
        ? isMenu
          ? 0.088
          : 0.124
        : builtinId === 'prehistoire'
          ? isMenu
            ? 0.092
            : 0.128
          : builtinId === 'farwest' || builtinId === 'train'
            ? isMenu
              ? 0.082
              : 0.115
            : isMenu
              ? 0.065
              : 0.095;

  const arpGain =
    score.groove === 'COSMIC'
      ? 0.016
      : score.groove === 'MARCH'
        ? isMenu
          ? 0.018
          : 0.023
        : score.groove === 'GOTHIC'
          ? isMenu
            ? 0.022
            : 0.028
          : score.groove === 'PRIMAL'
            ? 0.044
            : score.groove === 'TRAIN_CHUG'
              ? isMenu
                ? 0.022
                : 0.03
              : isMenu
                ? 0.03
                : isBridge
                  ? 0.042
                  : 0.036;

  const bassGain =
    score.groove === 'COSMIC'
      ? isMenu
        ? 0.055
        : 0.072
      : score.groove === 'PRIMAL'
        ? isMenu
          ? 0.095
          : 0.145
        : score.groove === 'TRAIN_CHUG' || score.groove === 'COUNTRY' || score.groove === 'GOTHIC'
          ? isMenu
            ? 0.082
            : 0.122
          : isMenu
            ? 0.072
            : 0.105;

  return {
    stepDurationSec,
    sectionIndex,
    cycleIndex,
    variantId,
    groove: score.groove,
    stepInBar,
    chord,
    leadMidi,
    leadSteps,
    leadGain,
    leadTimbre,
    harmonyMidi,
    arpMidi,
    arpGain,
    bassMidi,
    bassSteps,
    bassGain,
    kick,
    hatGain,
  };
}

class ProceduralMusicEngine {
  private enabled: boolean = true;
  private sfxMasterMuted: boolean = false;
  private themeId: TableThemeId = 'aka_esp32';
  private gameState: GameState = 'TABLE_SELECT';
  private multiball: boolean = false;
  private windowFocused: boolean = true;
  private editorPreviewActive: boolean = false;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private toneFilter: BiquadFilterNode | null = null;
  private echoSend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime: number = 0;
  private globalStep: number = 0;
  private duckUntilTime: number = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isEditorPreviewActive(): boolean {
    return this.editorPreviewActive;
  }

  public setEditorPreview(themeId: BuiltinThemeId | null, sharedCtx: AudioContext | null) {
    if (sharedCtx) {
      this.attachContext(sharedCtx);
    }
    if (themeId) {
      const changed = this.themeId !== themeId || !this.editorPreviewActive;
      this.themeId = themeId;
      this.editorPreviewActive = true;
      if (changed) {
        this.globalStep = 64; // Lance directement le thème principal A1
      }
    } else {
      this.editorPreviewActive = false;
    }
    this.syncPlaybackState();
  }

  public setEnabled(enabled: boolean, sharedCtx: AudioContext | null) {
    this.enabled = enabled;
    if (sharedCtx) {
      this.attachContext(sharedCtx);
    }
    this.syncPlaybackState();
  }

  public setSfxMasterMuted(muted: boolean) {
    this.sfxMasterMuted = muted;
    this.syncPlaybackState();
  }

  public attachContext(ctx: AudioContext | null) {
    if (!ctx || this.ctx === ctx) {
      if (this.ctx && this.ctx.state === 'running') {
        this.syncPlaybackState();
      }
      return;
    }

    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2100;
    filter.Q.value = 0.7;

    const echoIn = ctx.createGain();
    echoIn.gain.value = 0.2;
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.26;
    const echoFb = ctx.createGain();
    echoFb.gain.value = 0.24;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 1550;

    echoIn.connect(delay);
    delay.connect(echoLp);
    echoLp.connect(master);
    echoLp.connect(echoFb);
    echoFb.connect(delay);

    master.connect(filter);
    filter.connect(ctx.destination);

    this.masterGain = master;
    this.toneFilter = filter;
    this.echoSend = echoIn;
    this.noiseBuffer = this.createShortNoiseBuffer(ctx);

    this.syncPlaybackState();
  }

  private createShortNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.08));
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x12345678;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buf;
  }

  public updateGameContext(
    themeId: TableThemeId,
    gameState: GameState,
    multiball: boolean,
    focused: boolean = true
  ) {
    if (this.editorPreviewActive) {
      this.windowFocused = focused;
      this.syncPlaybackState();
      return;
    }
    const resolved = resolveScoreTheme(themeId);
    const themeChanged = resolveScoreTheme(this.themeId) !== resolved;
    this.themeId = resolved;
    this.gameState = gameState;
    this.multiball = multiball;
    this.windowFocused = focused;

    if (themeChanged) {
      this.globalStep = gameState === 'PLAYING' ? 64 : 0;
    }

    this.syncPlaybackState();
  }

  /** Atténue brièvement la musique de fond lors d'une grande fanfare (Jackpot / Multibille). */
  public duckBriefly(durationSec: number = 0.85) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.duckUntilTime = Math.max(this.duckUntilTime, now + durationSec);
    if (this.shouldPlay()) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.08, now, 0.03);
      this.masterGain.gain.setTargetAtTime(this.targetMasterVolume(), now + durationSec, 0.18);
    }
  }

  private shouldPlay(): boolean {
    if (!this.windowFocused || !this.ctx) return false;
    if (this.editorPreviewActive) return !this.sfxMasterMuted;
    if (!this.enabled || this.sfxMasterMuted) return false;
    return this.gameState === 'PLAYING' || this.gameState === 'TABLE_SELECT';
  }

  private targetMasterVolume(): number {
    if (!this.shouldPlay()) return 0.0001;
    if (this.editorPreviewActive) return 0.30;
    return this.gameState === 'TABLE_SELECT' ? 0.22 : 0.30;
  }

  private syncPlaybackState() {
    if (typeof window === 'undefined') return;

    if (this.ctx && this.masterGain && this.toneFilter) {
      const now = this.ctx.currentTime;
      const targetVol = this.targetMasterVolume();
      if (now >= this.duckUntilTime || !this.shouldPlay()) {
        this.masterGain.gain.setTargetAtTime(targetVol, now, 0.06);
      }
      const cutoff =
        !this.editorPreviewActive && this.gameState === 'TABLE_SELECT'
          ? 1450
          : this.multiball
            ? 3200
            : 2350;
      this.toneFilter.frequency.setTargetAtTime(cutoff, now, 0.12);
    }

    if (this.shouldPlay()) {
      if (this.timerId === null && this.ctx) {
        this.nextNoteTime = Math.max(this.ctx.currentTime + 0.04, this.nextNoteTime);
        if (this.nextNoteTime > this.ctx.currentTime + 0.5) {
          this.nextNoteTime = this.ctx.currentTime + 0.04;
        }
        this.timerId = setInterval(() => this.schedulerTick(), 45);
      }
    } else if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private schedulerTick() {
    if (!this.ctx || !this.masterGain || !this.shouldPlay()) return;
    if (this.ctx.state !== 'running') return;

    const lookAheadSec = 0.14;
    const now = this.ctx.currentTime;
    if (this.nextNoteTime < now - 0.1) {
      this.nextNoteTime = now + 0.02;
    }

    while (this.nextNoteTime < now + lookAheadSec) {
      const isMenu = !this.editorPreviewActive && this.gameState === 'TABLE_SELECT';
      const step = evaluateMusicStep(
        this.themeId,
        this.globalStep,
        isMenu,
        !this.editorPreviewActive && this.multiball
      );
      this.scheduleStepVoices(step, this.nextNoteTime);
      this.nextNoteTime += step.stepDurationSec;
      this.globalStep++;
    }
  }

  private scheduleStepVoices(step: EvaluatedMusicStep, t: number) {
    if (!this.ctx || !this.masterGain) return;

    if (step.leadMidi !== null) {
      const dur = Math.max(0.075, step.leadSteps * step.stepDurationSec * 0.92);
      this.triggerLeadVoice(midiToHz(step.leadMidi), t, dur, step.leadGain, step.leadTimbre);
      if (step.harmonyMidi !== null) {
        const harmTimbre: LeadTimbre =
          step.leadTimbre === 'STEAM_BRASS'
            ? 'STEAM_BRASS'
            : step.leadTimbre === 'COUNTRY_FIDDLE'
              ? 'COUNTRY_FIDDLE'
              : step.leadTimbre === 'HERO_BRASS'
                ? 'HERO_BRASS'
                : step.leadTimbre === 'GOTHIC_ORGAN' || step.leadTimbre === 'CATHEDRAL_CHOIR'
                  ? step.leadTimbre
                  : 'WARM_TRI';
        const harmGainScale =
          step.leadTimbre === 'STEAM_BRASS'
            ? 0.58
            : step.leadTimbre === 'COUNTRY_FIDDLE'
              ? 0.52
              : step.leadTimbre === 'HERO_BRASS'
                ? 0.46
                : 0.42;
        this.triggerLeadVoice(
          midiToHz(step.harmonyMidi),
          t,
          dur,
          step.leadGain * harmGainScale,
          harmTimbre
        );
      }
    }

    if (step.arpMidi !== null) {
      const arpDur =
        step.groove === 'COSMIC'
          ? step.stepDurationSec * 3.2
          : step.groove === 'PRIMAL'
            ? step.stepDurationSec * 0.65
            : step.stepDurationSec * 0.85;
      this.triggerArpVoice(midiToHz(step.arpMidi), t, arpDur, step.arpGain, step.groove);

      // Accord gratté "boom-chicka" country sur les temps 2 et 4
      if (step.groove === 'COUNTRY' && (step.stepInBar === 4 || step.stepInBar === 12)) {
        const upperStrumMidi = Math.min(81, step.chord[2] + 12);
        this.triggerArpVoice(
          midiToHz(upperStrumMidi),
          t + 0.014,
          step.stepDurationSec * 0.72,
          step.arpGain * 0.82,
          step.groove
        );
      }
    }

    if (step.bassMidi !== null) {
      const bDur = Math.max(0.085, step.bassSteps * step.stepDurationSec * 0.88);
      this.triggerBassVoice(midiToHz(step.bassMidi), t, bDur, step.bassGain, step.groove);
    }

    if (step.kick) {
      this.triggerSoftKick(t, step.groove, step.stepInBar);
    }
    if (step.hatGain > 0) {
      this.triggerSoftHat(t, step.hatGain, step.groove, step.stepInBar);
    }
  }

  private triggerLeadVoice(
    freq: number,
    t: number,
    dur: number,
    peakGain: number,
    timbre: LeadTimbre
  ) {
    const ctx = this.ctx!;
    const out = this.masterGain!;

    const isPluck =
      timbre === 'HONKY_BANJO' ||
      timbre === 'STONE_MALLET' ||
      timbre === 'CELESTA_BOX' ||
      timbre === 'KAWAII_BELL';
    const isPad = timbre === 'SPACE_PAD' || timbre === 'CATHEDRAL_CHOIR';
    const isDryLead =
      timbre === 'PRIMAL_HORN' || timbre === 'STONE_MALLET' || timbre === 'HONKY_BANJO';

    const env = ctx.createGain();
    const attack =
      timbre === 'SPACE_PAD'
        ? 0.022
        : timbre === 'CATHEDRAL_CHOIR'
          ? 0.036
          : timbre === 'COUNTRY_FIDDLE'
            ? 0.024
            : timbre === 'HERO_BRASS' || timbre === 'STEAM_BRASS' || timbre === 'PRIMAL_HORN'
              ? 0.016
              : isPluck
                ? 0.004
                : 0.011;
    const effectiveDur =
      timbre === 'HONKY_BANJO'
        ? Math.min(dur, 0.24)
        : timbre === 'STONE_MALLET'
          ? Math.min(dur, 0.22)
          : dur;
    const sustainRatio = isPluck
      ? 0.18
      : timbre === 'SPACE_PAD' || timbre === 'HERO_BRASS' || timbre === 'COUNTRY_FIDDLE'
        ? 0.68
        : 0.52;

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peakGain, t + Math.min(attack, effectiveDur * 0.35));
    env.gain.exponentialRampToValueAtTime(
      Math.max(0.0008, peakGain * sustainRatio),
      t + effectiveDur * 0.75
    );
    env.gain.exponentialRampToValueAtTime(0.0001, t + effectiveDur + 0.038);

    env.connect(out);
    if (this.echoSend && !isDryLead) {
      env.connect(this.echoSend);
    }

    const osc1 = ctx.createOscillator();
    osc1.type =
      timbre === 'PULSE_CHIP' || timbre === 'GOTHIC_ORGAN' || timbre === 'STONE_MALLET'
        ? 'square'
        : timbre === 'SPACE_PAD' ||
            timbre === 'HERO_BRASS' ||
            timbre === 'STEAM_BRASS' ||
            timbre === 'HONKY_BANJO' ||
            timbre === 'COUNTRY_FIDDLE' ||
            timbre === 'PRIMAL_HORN'
          ? 'sawtooth'
          : timbre === 'BELL_OCT' ||
              timbre === 'CELESTA_BOX' ||
              timbre === 'KAWAII_BELL' ||
              timbre === 'VINTAGE_ORGAN'
            ? 'sine'
            : 'triangle';

    // Inflexions expressives d'attaque (twang country, violon, sifflet vapeur, cor primitif)
    if (timbre === 'HONKY_BANJO') {
      osc1.frequency.setValueAtTime(freq * 0.96, t);
      osc1.frequency.exponentialRampToValueAtTime(freq, t + 0.018);
    } else if (timbre === 'COUNTRY_FIDDLE') {
      osc1.frequency.setValueAtTime(freq * 0.952, t);
      osc1.frequency.exponentialRampToValueAtTime(freq, t + 0.034);
    } else if (timbre === 'STEAM_BRASS' && effectiveDur >= 0.24) {
      osc1.frequency.setValueAtTime(freq * 0.968, t);
      osc1.frequency.exponentialRampToValueAtTime(freq, t + 0.042);
    } else if (timbre === 'PRIMAL_HORN') {
      osc1.frequency.setValueAtTime(freq * 0.972, t);
      osc1.frequency.exponentialRampToValueAtTime(freq, t + 0.028);
    } else {
      osc1.frequency.setValueAtTime(freq, t);
    }

    // Vibrato expressif sur les notes tenues, violon country ou orgue
    if (
      effectiveDur >= 0.28 ||
      timbre === 'VINTAGE_ORGAN' ||
      timbre === 'COUNTRY_FIDDLE'
    ) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const vibRate =
        timbre === 'VINTAGE_ORGAN'
          ? 6.4
          : timbre === 'COUNTRY_FIDDLE'
            ? 5.8
            : timbre === 'GOTHIC_ORGAN' || timbre === 'CATHEDRAL_CHOIR'
              ? 4.3
              : 5.0;
      lfo.frequency.setValueAtTime(vibRate, t);
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.linearRampToValueAtTime(
        freq * (timbre === 'COUNTRY_FIDDLE' ? 0.0058 : 0.0044),
        t + 0.1
      );
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfo.start(t);
      lfo.stop(t + effectiveDur + 0.04);
    }

    // Filtrage spectral par instrument
    if (
      timbre === 'SPACE_PAD' ||
      timbre === 'PULSE_CHIP' ||
      timbre === 'HERO_BRASS' ||
      timbre === 'STEAM_BRASS' ||
      timbre === 'HONKY_BANJO' ||
      timbre === 'COUNTRY_FIDDLE' ||
      timbre === 'PRIMAL_HORN' ||
      timbre === 'STONE_MALLET' ||
      timbre === 'GOTHIC_ORGAN' ||
      timbre === 'CATHEDRAL_CHOIR'
    ) {
      const vf = ctx.createBiquadFilter();
      vf.type = 'lowpass';
      if (timbre === 'HONKY_BANJO') {
        vf.frequency.setValueAtTime(Math.min(5800, freq * 5.8), t);
        vf.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 1.75), t + effectiveDur);
        vf.Q.setValueAtTime(2.8, t);
      } else if (timbre === 'COUNTRY_FIDDLE') {
        vf.frequency.setValueAtTime(Math.min(4200, freq * 3.8), t);
        vf.Q.setValueAtTime(1.6, t);
      } else if (timbre === 'SPACE_PAD') {
        vf.frequency.setValueAtTime(Math.min(3400, freq * 2.4), t);
        vf.frequency.exponentialRampToValueAtTime(
          Math.min(4600, freq * 4.2),
          t + Math.min(0.14, effectiveDur * 0.5)
        );
        vf.frequency.exponentialRampToValueAtTime(Math.min(3000, freq * 2.6), t + effectiveDur);
        vf.Q.setValueAtTime(1.4, t);
      } else if (timbre === 'HERO_BRASS' || timbre === 'STEAM_BRASS') {
        vf.frequency.setValueAtTime(freq * 1.95, t);
        vf.frequency.exponentialRampToValueAtTime(
          Math.min(5200, freq * 5.0),
          t + Math.min(0.085, effectiveDur * 0.45)
        );
        vf.frequency.exponentialRampToValueAtTime(freq * 2.3, t + effectiveDur);
        vf.Q.setValueAtTime(1.45, t);
      } else if (timbre === 'PRIMAL_HORN' || timbre === 'STONE_MALLET') {
        vf.frequency.setValueAtTime(Math.min(2200, freq * 2.7), t);
        vf.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.45), t + effectiveDur);
        vf.Q.setValueAtTime(2.6, t);
      } else if (timbre === 'GOTHIC_ORGAN' || timbre === 'CATHEDRAL_CHOIR') {
        // Couleur sombre et caverneuse pour Halloween / Crypte
        vf.frequency.setValueAtTime(Math.min(1950, freq * 2.6), t);
        vf.Q.setValueAtTime(1.3, t);
      } else {
        vf.frequency.setValueAtTime(freq * 3.2, t);
      }
      osc1.connect(vf);
      vf.connect(env);
    } else {
      osc1.connect(env);
    }

    // Couches harmoniques caractéristiques selon le timbre
    if (timbre === 'SPACE_PAD') {
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.detune.setValueAtTime(8, t);
      osc2.frequency.setValueAtTime(freq, t);
      const subG = ctx.createGain();
      subG.gain.value = 0.65;
      osc2.connect(subG);
      subG.connect(env);
      osc2.start(t);
      osc2.stop(t + effectiveDur + 0.04);
    } else if (timbre === 'HERO_BRASS') {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.detune.setValueAtTime(-8, t);
      osc2.frequency.setValueAtTime(freq, t);
      const brassG = ctx.createGain();
      brassG.gain.value = 0.54;
      osc2.connect(brassG);
      brassG.connect(env);
      osc2.start(t);
      osc2.stop(t + effectiveDur + 0.04);
    } else if (timbre === 'PRIMAL_HORN' || timbre === 'STONE_MALLET') {
      // Sous-octave tellurique brute (cor d'os / maillet de pierre)
      const subOsc = ctx.createOscillator();
      subOsc.type = timbre === 'PRIMAL_HORN' ? 'square' : 'sine';
      subOsc.frequency.setValueAtTime(freq * 0.5, t);
      const subG = ctx.createGain();
      subG.gain.value = 0.56;
      subOsc.connect(subG);
      subG.connect(env);
      subOsc.start(t);
      subOsc.stop(t + effectiveDur + 0.04);
    } else if (timbre === 'HONKY_BANJO') {
      // Attaque métallique du médiator / corde de banjo country
      const pick = ctx.createOscillator();
      const pGain = ctx.createGain();
      pick.type = 'triangle';
      pick.frequency.setValueAtTime(freq * 2, t);
      pGain.gain.setValueAtTime(peakGain * 0.42, t);
      pGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
      pick.connect(pGain);
      pGain.connect(out);
      pick.start(t);
      pick.stop(t + 0.048);
    } else if (timbre === 'GOTHIC_ORGAN' || timbre === 'CATHEDRAL_CHOIR') {
      // Bourdon 16 pieds (sous-octave sombre) au lieu d'harmoniques aiguës
      const subPipe = ctx.createOscillator();
      const sGain = ctx.createGain();
      subPipe.type = timbre === 'GOTHIC_ORGAN' ? 'triangle' : 'sawtooth';
      subPipe.detune.setValueAtTime(timbre === 'CATHEDRAL_CHOIR' ? -7 : -4, t);
      subPipe.frequency.setValueAtTime(freq * 0.5, t);
      sGain.gain.value = 0.52;
      subPipe.connect(sGain);
      sGain.connect(env);
      subPipe.start(t);
      subPipe.stop(t + effectiveDur + 0.04);
    } else if (timbre === 'VINTAGE_ORGAN') {
      const drawbar = ctx.createOscillator();
      const dGain = ctx.createGain();
      drawbar.type = 'sine';
      drawbar.frequency.setValueAtTime(freq * 3, t);
      dGain.gain.value = 0.34;
      drawbar.connect(dGain);
      dGain.connect(env);
      drawbar.start(t);
      drawbar.stop(t + effectiveDur + 0.04);
    } else if (timbre === 'KAWAII_BELL' || timbre === 'CELESTA_BOX') {
      const tine = ctx.createOscillator();
      const tGain = ctx.createGain();
      tine.type = 'sine';
      tine.frequency.setValueAtTime(freq * (timbre === 'CELESTA_BOX' ? 3 : 2), t);
      tGain.gain.setValueAtTime(peakGain * 0.38, t);
      tGain.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.11, effectiveDur));
      tine.connect(tGain);
      tGain.connect(out);
      tine.start(t);
      tine.stop(t + Math.min(0.12, effectiveDur + 0.02));
    }

    if (
      (timbre === 'PAN_FLUTE' ||
        timbre === 'TRIBAL_FLUTE' ||
        timbre === 'PRIMAL_HORN' ||
        (timbre === 'STEAM_BRASS' && effectiveDur >= 0.24)) &&
      this.noiseBuffer
    ) {
      const breath = ctx.createBufferSource();
      breath.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(
        timbre === 'PRIMAL_HORN' ? freq * 1.4 : timbre === 'STEAM_BRASS' ? 1650 : freq * 2,
        t
      );
      bp.Q.setValueAtTime(2.6, t);
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(peakGain * 0.3, t);
      bGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      breath.connect(bp);
      bp.connect(bGain);
      bGain.connect(out);
      breath.start(t);
      breath.stop(t + 0.06);
    }

    if (isPad && timbre === 'CATHEDRAL_CHOIR') {
      // Légère quinte fantomatique très douce pour la crypte / Halloween
      const fifth = ctx.createOscillator();
      fifth.type = 'sine';
      fifth.frequency.setValueAtTime(freq * 1.498, t);
      const fGain = ctx.createGain();
      fGain.gain.value = 0.2;
      fifth.connect(fGain);
      fGain.connect(env);
      fifth.start(t);
      fifth.stop(t + effectiveDur + 0.04);
    }

    osc1.start(t);
    osc1.stop(t + effectiveDur + 0.04);
  }

  private triggerArpVoice(
    freq: number,
    t: number,
    dur: number,
    peakGain: number,
    groove: GrooveStyle
  ) {
    const ctx = this.ctx!;
    const resolved = resolveScoreTheme(this.themeId);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    if (groove === 'COSMIC') {
      // Nappe douce sans attaque percussive pour Odyssée Spatiale
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(peakGain, t + Math.min(0.045, dur * 0.35));
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      osc.connect(env);
      env.connect(this.masterGain!);
      if (this.echoSend) {
        env.connect(this.echoSend);
      }
      osc.start(t);
      osc.stop(t + dur + 0.06);
      return;
    }

    osc.type =
      groove === 'COUNTRY'
        ? 'sawtooth'
        : groove === 'PRIMAL'
          ? 'square'
          : resolved === 'solaire' || resolved === 'bonbons' || resolved === 'candy'
            ? 'sine'
            : 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    const effGain = groove === 'GOTHIC' ? peakGain * 0.78 : peakGain;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(effGain, t + (groove === 'COUNTRY' ? 0.005 : 0.007));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);

    if (
      groove === 'COUNTRY' ||
      groove === 'PRIMAL' ||
      groove === 'GOTHIC' ||
      groove === 'TRAIN_CHUG'
    ) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(
        groove === 'COUNTRY'
          ? 1950
          : groove === 'TRAIN_CHUG'
            ? 1450
            : groove === 'GOTHIC'
              ? 1050
              : 820,
        t
      );
      osc.connect(lp);
      lp.connect(env);
    } else {
      osc.connect(env);
    }

    env.connect(this.masterGain!);
    if (
      this.echoSend &&
      groove !== 'COUNTRY' &&
      groove !== 'PRIMAL' &&
      groove !== 'TRAIN_CHUG'
    ) {
      env.connect(this.echoSend);
    }
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private triggerBassVoice(
    freq: number,
    t: number,
    dur: number,
    peakGain: number,
    groove: GrooveStyle
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const env = ctx.createGain();

    const isHeavy = groove === 'PRIMAL' || groove === 'GOTHIC' || groove === 'TRAIN_CHUG';
    osc.type = isHeavy ? 'sawtooth' : groove === 'COSMIC' ? 'sine' : 'triangle';
    if (groove === 'COUNTRY') {
      // Attaque boisée de contrebasse country ("boom-chicka")
      osc.frequency.setValueAtTime(freq * 1.055, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }

    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, t);

    const attack = groove === 'COSMIC' ? 0.026 : 0.009;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peakGain, t + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * 0.44), t + dur * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.025);

    if (isHeavy || groove === 'COUNTRY') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(
        groove === 'GOTHIC' ? 280 : groove === 'PRIMAL' ? 350 : groove === 'TRAIN_CHUG' ? 430 : 540,
        t
      );
      if (groove === 'PRIMAL') {
        lp.Q.setValueAtTime(1.9, t);
      }
      osc.connect(lp);
      lp.connect(env);
    } else {
      osc.connect(env);
    }
    sub.connect(env);
    env.connect(this.masterGain!);

    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.03);
    sub.stop(t + dur + 0.03);
  }

  private triggerSoftKick(t: number, groove: GrooveStyle, stepInBar: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';

    if (groove === 'PRIMAL') {
      // Tambour de guerre / pas de mammouth lourd et brutal
      osc.frequency.setValueAtTime(158, t);
      osc.frequency.exponentialRampToValueAtTime(36, t + 0.11);
      env.gain.setValueAtTime(0.14, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

      const skin = ctx.createOscillator();
      const sEnv = ctx.createGain();
      skin.type = 'triangle';
      skin.frequency.setValueAtTime(220, t);
      skin.frequency.exponentialRampToValueAtTime(58, t + 0.055);
      sEnv.gain.setValueAtTime(0.065, t);
      sEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      skin.connect(sEnv);
      sEnv.connect(this.masterGain!);
      skin.start(t);
      skin.stop(t + 0.065);

      osc.connect(env);
      env.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.135);
      return;
    }

    if (groove === 'TRAIN_CHUG') {
      // Double choc des bogies sur les éclisses de rails ("TA-dam ... TA-dam")
      const isSecondAxle = stepInBar === 3 || stepInBar === 11;
      osc.frequency.setValueAtTime(isSecondAxle ? 96 : 118, t);
      osc.frequency.exponentialRampToValueAtTime(isSecondAxle ? 38 : 44, t + 0.075);
      env.gain.setValueAtTime(isSecondAxle ? 0.072 : 0.092, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.088);
    } else if (groove === 'GOTHIC') {
      // Timbale sourde de crypte
      osc.frequency.setValueAtTime(86, t);
      osc.frequency.exponentialRampToValueAtTime(33, t + 0.12);
      env.gain.setValueAtTime(0.088, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    } else if (groove === 'COUNTRY') {
      osc.frequency.setValueAtTime(122, t);
      osc.frequency.exponentialRampToValueAtTime(46, t + 0.075);
      env.gain.setValueAtTime(0.082, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    } else if (groove === 'COSMIC') {
      osc.frequency.setValueAtTime(88, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.036, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    } else {
      osc.frequency.setValueAtTime(108, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.075);
      env.gain.setValueAtTime(0.06, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    }

    osc.connect(env);
    env.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  private triggerSoftHat(t: number, gainVal: number, groove: GrooveStyle, stepInBar: number) {
    if (!this.noiseBuffer) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const flt = ctx.createBiquadFilter();
    const env = ctx.createGain();
    let decaySec = 0.038;

    if (groove === 'TRAIN_CHUG') {
      // Piston de locomotive à vapeur ("tchou-tchou-TCHOU-tcha") sous la fréquence du filtre maître
      const isAccentSteam = stepInBar % 4 === 2;
      flt.type = 'bandpass';
      if (isAccentSteam) {
        flt.frequency.setValueAtTime(1680, t);
        flt.frequency.exponentialRampToValueAtTime(940, t + 0.072);
        flt.Q.setValueAtTime(1.35, t);
        decaySec = 0.076;
      } else {
        flt.frequency.setValueAtTime(1180, t);
        flt.Q.setValueAtTime(1.8, t);
        decaySec = 0.046;
      }
    } else if (groove === 'COUNTRY') {
      // Caisse claire aux balais sur 2 & 4 + shuffle léger sur les contretemps
      const isSnareBackbeat = stepInBar === 4 || stepInBar === 12;
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(isSnareBackbeat ? 1820 : 3000, t);
      flt.Q.setValueAtTime(isSnareBackbeat ? 0.9 : 1.5, t);
      decaySec = isSnareBackbeat ? 0.068 : 0.034;
    } else if (groove === 'PRIMAL') {
      // Claquement sec d'os / silex (aucun charleston métallique)
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(920, t);
      flt.Q.setValueAtTime(3.2, t);
      decaySec = 0.028;
    } else if (groove === 'GOTHIC') {
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(1450, t);
      flt.Q.setValueAtTime(1.8, t);
      decaySec = 0.04;
    } else {
      flt.type = 'highpass';
      flt.frequency.setValueAtTime(4800, t);
      decaySec = 0.035;
    }

    env.gain.setValueAtTime(gainVal, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decaySec);

    src.connect(flt);
    flt.connect(env);
    env.connect(this.masterGain!);
    src.start(t);
    src.stop(t + decaySec + 0.01);
  }
}

export const musicEngine = new ProceduralMusicEngine();
