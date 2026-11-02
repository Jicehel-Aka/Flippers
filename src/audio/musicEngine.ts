import { GameState, TableThemeId } from '../types/pinball';

/**
 * Moteur musical procédural multi-sections pour Gamebuino AKA Pinball.
 *
 * Conception anti-monotonie :
 * - 4 compositions 100 % originales dédiées aux 4 plateaux (AKA ESP32, Odyssée Spatiale,
 *   Star Wars · Yavin, Temple Solaire).
 * - Forme longue de 32 mesures par cycle (8 sections × 4 mesures × 16 doubles-croches = 512 pas,
 *   soit ~58 à 68 secondes avant de boucler la structure).
 * - Variations évolutives d'un cycle et d'une section à l'autre :
 *   1. Rotation des motifs d'arpèges (montant, Alberti, pendulaire, cristallin, aéré).
 *   2. Évolution du timbre et du registre solo (voix principale, octave flûtée/carillon, duo chorus).
 *   3. Broderies mélodiques, notes de passage et traits de liaison (fills) en fin de 4e/8e mesure.
 *   4. Respirations dynamiques (« breakdown » basse + arpège sans mélodie sur certains passages).
 *   5. Adaptation temps réel au jeu : version feutrée au menu, groove complet en jeu,
 *      accélération et ouverture du filtre pendant le Multibille ×3, pause propre hors focus.
 */

const R = -1; // Silence
const H = -2; // Tenue de la note précédente

export type LeadTimbre = 'WARM_TRI' | 'PULSE_CHIP' | 'SPACE_PAD' | 'HERO_BRASS' | 'PAN_FLUTE' | 'BELL_OCT';

export interface EvaluatedMusicStep {
  stepDurationSec: number;
  sectionIndex: number; // 0..7 dans le cycle de 32 mesures
  cycleIndex: number;   // numéro de tour complet de 32 mesures
  variantId: number;    // 0..4 : signature de variation courante
  leadMidi: number | null;
  leadSteps: number;    // durée en doubles-croches (1..16)
  leadGain: number;
  leadTimbre: LeadTimbre;
  harmonyMidi: number | null; // contre-chant occasionnel à la tierce/sixte
  arpMidi: number | null;
  arpGain: number;
  bassMidi: number | null;
  bassSteps: number;
  bassGain: number;
  kick: boolean;
  hatGain: number; // 0 = pas de charleston/shaker
}

interface ThemeScoreDef {
  id: TableThemeId;
  bpm: number;
  defaultTimbre: LeadTimbre;
  altTimbre: LeadTimbre;
  /** 8 sections de 4 mesures = 32 accords de 4 notes MIDI [fondamentale, 3ce, 5te, 7e/9e] */
  sectionsChords: readonly (readonly (readonly [number, number, number, number])[])[];
  /** Gamme mélodique sur 2 octaves (14 degrés, base C4..D6) permettant des phrases chantantes */
  scale: readonly number[];
  /** 8 phrases mélodiques de 64 pas (indices dans `scale`, R = silence, H = tenue) */
  melodies: readonly (readonly number[])[];
  bassPattern: readonly number[]; // 16 pas : 0=silence, 1=tonique grave, 2=octave, 3=quinte
}

// ============================================================================
// Phrases mélodiques expressives (64 doubles-croches = 4 mesures par phrase)
// Les degrés indexent la gamme propre à chaque thème pour épouser sa couleur.
// ============================================================================

// Phrase 0 : Ouverture aérée (laisse respirer les 2 premières mesures puis lance un motif d'appel)
const PHRASE_INTRO: readonly number[] = [
  R, R, R, R,  R, R, R, R,  R, R, R, R,  R, R, R, R,
  R, R, R, R,  R, R, R, R,  4, H, H, R,  6, H, 7, H,
  8, H, H, H,  H, H, 7, H,  6, H, 4, H,  H, R, R, R,
  5, H, 6, H,  7, H, H, R,  4, H, H, H,  H, R, R, R,
];

// Phrase 1 : Exposition du thème A1 (question chantante + relance syncopée)
const PHRASE_THEME_A1: readonly number[] = [
  4, H, H, 6,  7, H, 8, H,  H, H, 7, H,  6, H, R, R,
  5, H, H, 6,  7, H, 4, H,  H, H, H, H,  3, H, R, R,
  4, H, 6, H,  8, H, H, 9,  10, H, 9, H, 8, H, 6, H,
  7, H, H, H,  H, H, 6, H,  4, H, H, H,  H, R, R, R,
];

// Phrase 2 : Réponse du thème A2 (montée lyrique vers l'aigu + cadence ouverte)
const PHRASE_THEME_A2: readonly number[] = [
  6, H, H, 7,  8, H, 9, H,  11, H, H, 10, 9, H, 8, R,
  7, H, H, 8,  9, H, 7, H,  6, H, H, H,  H, R, 4, H,
  5, H, 6, H,  7, H, 8, H,  9, H, 11, H, 10, H, 8, H,
  9, H, H, H,  8, H, 7, H,  H, H, H, H,  H, R, R, R,
];

// Phrase 3 : Refrain B (ample, lumineux, valeurs longues suivies d'élans mélodiques)
const PHRASE_CHORUS_B: readonly number[] = [
  8, H, H, H,  H, H, 9, H,  11, H, H, H, 9, H, 8, H,
  7, H, H, 8,  9, H, H, 7,  6, H, H, H,  H, R, 6, 7,
  8, H, H, H,  11, H, H, 10, 9, H, 8, H, 6, H, 8, H,
  7, H, H, H,  H, H, H, R,  R, R, 8, H,  7, H, 6, R,
];

// Phrase 4 : Pont C — Respiration atmosphérique (notes suspendues et silences contemplatifs)
const PHRASE_BRIDGE_C: readonly number[] = [
  11, H, H, H, H, H, H, H,  9, H, H, H,  H, R, R, R,
  R, R, R, R,  8, H, H, H,  7, H, H, H,  H, H, R, R,
  9, H, H, H,  H, H, 8, H,  6, H, H, H,  H, R, R, R,
  R, R, 4, H,  6, H, 7, H,  8, H, H, H,  7, H, R, R,
];

// Phrase 5 : Thème A3 varié (rythmique plus rebondissante et syncopée)
const PHRASE_THEME_A3: readonly number[] = [
  4, H, 7, R,  6, H, 8, H,  H, 7, 6, H,  4, H, R, R,
  5, H, 8, R,  7, H, 9, H,  8, H, 6, H,  7, H, R, 6,
  8, H, 9, H,  11, H, R, 10, 9, H, 8, H, 7, H, 6, H,
  8, H, H, 7,  6, H, 4, H,  H, H, H, R,  R, R, R, R,
];

// Phrase 6 : Développement D — Marche harmonique ascendante (tension progressive)
const PHRASE_BUILD_D: readonly number[] = [
  3, H, 4, H,  6, H, H, R,  4, H, 5, H,  7, H, H, R,
  5, H, 6, H,  8, H, H, R,  6, H, 7, H,  9, H, 8, H,
  7, H, 8, H,  9, H, 10, H, 11, H, H, 9, 8, H, 7, H,
  8, H, 9, H,  11, H, H, H, 10, H, 9, H, 8, H, 7, R,
];

// Phrase 7 : Apogée B' & Coda résolutive (conclusion apaisée vers la tonique)
const PHRASE_CODA: readonly number[] = [
  11, H, H, 10, 9, H, 8, H, 7, H, 8, H,  9, H, R, R,
  8, H, H, 7,  6, H, 7, H,  8, H, H, H,  6, H, R, R,
  4, H, 6, H,  7, H, 8, H,  6, H, 4, H,  3, H, 4, H,
  4, H, H, H,  H, H, H, H,  H, R, R, R,  R, R, R, R,
];

// Variante héroïque spécifique pour Star Wars · Yavin (quintes et quartes nobles, rythmes de marche spatiale)
const SW_THEME_A1: readonly number[] = [
  4, H, H, 4,  8, H, H, H,  7, H, 6, 5,  8, H, 4, R,
  4, H, H, 4,  9, H, H, H,  8, H, 7, 6,  7, H, R, R,
  6, H, 7, H,  8, H, H, 9,  11, H, H, 9, 8, H, 7, H,
  8, H, H, H,  5, H, 6, H,  4, H, H, H,  H, R, R, R,
];

const SW_CHORUS_B: readonly number[] = [
  6, H, H, 8,  10, H, H, H, 9, H, 8, H,  11, H, H, R,
  10, H, H, 9, 8, H, 6, H,  7, H, H, H,  H, R, 6, 7,
  8, H, H, 9,  10, H, 12, H, 11, H, 9, H, 8, H, 6, H,
  7, H, H, 8,  9, H, H, H,  8, H, H, H,  H, R, R, R,
];

// Variante mystique syncopée spécifique pour Temple Solaire
const SOL_THEME_A1: readonly number[] = [
  4, H, 6, R,  8, H, 7, H,  6, H, 4, R,  3, H, 4, H,
  R, R, 6, H,  7, H, 8, H,  9, H, 8, 6,  7, H, R, R,
  8, H, 10, R, 9, H, 8, H,  6, H, 8, R,  7, H, 6, H,
  4, H, H, 3,  4, H, H, H,  H, R, R, R,  R, R, R, R,
];

const THEME_SCORES: Record<TableThemeId, ThemeScoreDef> = {
  // 1. Gamebuino AKA · ESP32 : Electro-Chiptune / Synthwave en La Dorien (122 BPM)
  aka_esp32: {
    id: 'aka_esp32',
    bpm: 122,
    defaultTimbre: 'PULSE_CHIP',
    altTimbre: 'BELL_OCT',
    scale: [64, 66, 67, 69, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84], // E4..C6 (A dorien centré sur A4=index 4)
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
    melodies: [
      PHRASE_INTRO,
      PHRASE_THEME_A1,
      PHRASE_THEME_A2,
      PHRASE_CHORUS_B,
      PHRASE_BRIDGE_C,
      PHRASE_THEME_A3,
      PHRASE_BUILD_D,
      PHRASE_CODA,
    ],
    bassPattern: [1, 0, 2, 0,  1, 0, 2, 1,  1, 0, 2, 0,  3, 0, 2, 0],
  },

  // 2. Odyssée Spatiale : Space-Synth Kosmische en Ré Lydien / Si Mineur (108 BPM)
  space_odyssey: {
    id: 'space_odyssey',
    bpm: 108,
    defaultTimbre: 'SPACE_PAD',
    altTimbre: 'WARM_TRI',
    scale: [59, 61, 62, 64, 66, 68, 69, 71, 73, 74, 76, 78, 80, 81], // Ré Lydien (F#4=index 4, G# lydien !)
    sectionsChords: [
      [[50, 57, 61, 66], [50, 56, 59, 64], [50, 57, 61, 66], [45, 52, 57, 62]],
      [[50, 57, 61, 66], [47, 54, 57, 61], [43, 50, 55, 59], [45, 52, 57, 61]],
      [[50, 57, 61, 66], [54, 57, 61, 64], [43, 50, 55, 59], [52, 57, 59, 64]],
      [[47, 54, 57, 62], [43, 50, 55, 59], [50, 57, 61, 66], [45, 52, 57, 61]],
      [[43, 50, 54, 59], [43, 50, 55, 58], [50, 57, 61, 66], [47, 54, 57, 62]],
      [[50, 57, 61, 66], [50, 56, 59, 64], [43, 50, 55, 59], [45, 52, 55, 62]],
      [[52, 55, 59, 66], [54, 57, 61, 64], [43, 50, 55, 59], [45, 52, 57, 61]],
      [[43, 50, 55, 59], [45, 52, 57, 61], [50, 57, 61, 64], [50, 57, 61, 66]],
    ],
    melodies: [
      PHRASE_INTRO,
      PHRASE_THEME_A2,
      PHRASE_THEME_A1,
      PHRASE_CHORUS_B,
      PHRASE_BRIDGE_C,
      PHRASE_THEME_A3,
      PHRASE_BUILD_D,
      PHRASE_CODA,
    ],
    bassPattern: [1, 0, 0, 0,  0, 0, 3, 0,  1, 0, 0, 0,  2, 0, 0, 0],
  },

  // 3. Star Wars · Yavin : Marche Héroïque Space-Opera Originale en Sol Mineur / Si♭ (118 BPM)
  star_galaxy: {
    id: 'star_galaxy',
    bpm: 118,
    defaultTimbre: 'HERO_BRASS',
    altTimbre: 'WARM_TRI',
    scale: [62, 63, 65, 67, 67, 69, 70, 72, 74, 75, 77, 79, 81, 82], // Sol mineur / Si♭ majeur (G4=index 4)
    sectionsChords: [
      [[43, 50, 55, 58], [43, 51, 55, 58], [43, 50, 52, 58], [50, 55, 57, 60]],
      [[43, 50, 55, 58], [51, 55, 58, 62], [48, 55, 58, 63], [50, 54, 57, 62]],
      [[43, 50, 55, 58], [50, 53, 57, 60], [51, 55, 58, 62], [53, 57, 60, 65]],
      [[46, 53, 58, 62], [45, 53, 57, 60], [43, 50, 55, 58], [51, 55, 58, 62]],
      [[48, 55, 58, 62], [46, 50, 55, 58], [44, 51, 55, 60], [50, 54, 57, 62]],
      [[43, 50, 55, 58], [48, 55, 58, 63], [53, 57, 60, 63], [46, 53, 58, 62]],
      [[51, 55, 58, 62], [48, 55, 58, 63], [45, 51, 54, 60], [50, 54, 57, 62]],
      [[51, 55, 58, 62], [53, 57, 60, 65], [43, 50, 55, 57], [43, 50, 55, 58]],
    ],
    melodies: [
      PHRASE_INTRO,
      SW_THEME_A1,
      PHRASE_THEME_A2,
      SW_CHORUS_B,
      PHRASE_BRIDGE_C,
      PHRASE_THEME_A3,
      PHRASE_BUILD_D,
      PHRASE_CODA,
    ],
    bassPattern: [1, 0, 1, 1,  3, 0, 1, 0,  1, 0, 1, 1,  2, 0, 3, 0],
  },

  // 4. Temple Solaire : Flûte de Jade & Marimba d'Or en Ré Mineur Harmonique / Dorien (116 BPM)
  solaire: {
    id: 'solaire',
    bpm: 116,
    defaultTimbre: 'PAN_FLUTE',
    altTimbre: 'BELL_OCT',
    scale: [60, 62, 64, 65, 62, 64, 65, 67, 69, 70, 73, 74, 76, 77], // Couleur Ré mineur dorien / harmonique (C#5 sensible !)
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
    melodies: [
      PHRASE_INTRO,
      SOL_THEME_A1,
      PHRASE_THEME_A2,
      PHRASE_CHORUS_B,
      PHRASE_BRIDGE_C,
      PHRASE_THEME_A3,
      PHRASE_BUILD_D,
      PHRASE_CODA,
    ],
    bassPattern: [1, 0, 0, 3,  0, 0, 1, 0,  0, 0, 2, 0,  3, 0, 0, 0],
  },
};

const ARP_PATTERNS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 2, 1, 2, 3], // Pendulaire fluide
  [0, 2, 1, 3, 0, 3, 1, 2], // Alberti ouvert
  [3, 2, 1, 0, 1, 2, 3, 1], // Cascade descendante
  [0, 1, 3, 2, 4, 3, 2, 1], // Scintillant à l'octave (4 = fondam + 12)
];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Calcule de façon pure et déterministe les événements musicaux du pas `globalStep`.
 * Un cycle structurel complet compte 512 pas (32 mesures), enrichi de variations cycliques.
 */
export function evaluateMusicStep(
  themeId: TableThemeId,
  globalStep: number,
  isMenu: boolean = false,
  isMultiball: boolean = false
): EvaluatedMusicStep {
  const score = THEME_SCORES[themeId] ?? THEME_SCORES.aka_esp32;
  const tempoScale = isMultiball ? 1.12 : isMenu ? 0.91 : 1.0;
  const effectiveBpm = score.bpm * tempoScale;
  const stepDurationSec = 60 / effectiveBpm / 4; // 1 double-croche

  const stepInCycle = ((globalStep % 512) + 512) % 512;
  const cycleIndex = Math.max(0, Math.floor(globalStep / 512));
  const sectionIndex = Math.floor(stepInCycle / 64); // 0..7
  const stepInSection = stepInCycle % 64;            // 0..63
  const barInSection = Math.floor(stepInSection / 16); // 0..3
  const stepInBar = stepInSection % 16;              // 0..15

  const chord = score.sectionsChords[sectionIndex][barInSection];
  // Signature de variation qui évolue selon le tour (cycleIndex) et la section
  const variantId = (cycleIndex * 3 + sectionIndex) % 5;
  const isBridge = sectionIndex === 4;
  const isIntro = sectionIndex === 0;

  // --- 1. MÉLODIE PRINCIPALE & VARIATIONS ---
  const phrase = score.melodies[sectionIndex];
  const rawDeg = phrase[stepInSection];

  // Respiration périodique : une fois sur les cycles pairs, les 2 premières mesures du pont ou de l'intro
  // laissent la basse et l'arpège jouer seuls pour aérer l'écoute.
  const sparseBreath =
    cycleIndex > 0 && cycleIndex % 2 === 1 && (isIntro || isBridge) && barInSection < 2;

  let leadMidi: number | null = null;
  let leadSteps = 1;
  let harmonyMidi: number | null = null;
  let leadTimbre: LeadTimbre =
    cycleIndex % 3 === 1 && (sectionIndex === 3 || sectionIndex === 5)
      ? score.altTimbre
      : score.defaultTimbre;

  if (!sparseBreath) {
    if (rawDeg >= 0) {
      const clampedDeg = Math.min(score.scale.length - 1, rawDeg);
      leadMidi = score.scale[clampedDeg];

      // Compte combien de pas 'H' prolongent cette note
      let look = stepInSection + 1;
      while (look < 64 && phrase[look] === H) {
        leadSteps++;
        look++;
      }

      // Variation 1 : transposition cristalline d'une octave sur certains refrains/ponts des tours suivants
      if (cycleIndex % 3 === 2 && (sectionIndex === 2 || sectionIndex === 4) && leadMidi < 78) {
        leadMidi += 12;
        leadTimbre = 'BELL_OCT';
      }

      // Variation 2 : doublure harmonique douce à la tierce inférieure sur le refrain des cycles impairs
      if (cycleIndex % 2 === 1 && (sectionIndex === 3 || sectionIndex === 7) && clampedDeg >= 2) {
        harmonyMidi = score.scale[clampedDeg - 2];
      }

      // Variation 3 : sur une note longue (>= 6 pas), raccourcir légèrement pour laisser place à une broderie
      if (variantId === 2 && leadSteps >= 6) {
        leadSteps = 4;
      }
    } else if (
      // Broderie mélodique occasionnelle (note de passage sur la fin d'une tenue longue)
      rawDeg === H &&
      variantId === 2 &&
      stepInSection >= 4 &&
      phrase[stepInSection - 4] >= 0 &&
      phrase[stepInSection - 3] === H &&
      phrase[stepInSection - 2] === H &&
      phrase[stepInSection - 1] === H
    ) {
      const baseDeg = phrase[stepInSection - 4];
      const ornamentShift = (barInSection + cycleIndex) % 2 === 0 ? 1 : -1;
      const ornDeg = Math.max(0, Math.min(score.scale.length - 1, baseDeg + ornamentShift));
      leadMidi = score.scale[ornDeg];
      leadSteps = 2;
    } else if (
      // Variation 4 : petit trait de liaison (turnaround fill) en fin de 4e mesure (pas 58..63)
      rawDeg === R &&
      cycleIndex > 0 &&
      stepInSection >= 58 &&
      stepInSection % 2 === 0 &&
      (sectionIndex + cycleIndex) % 2 === 1
    ) {
      const fillIdx = Math.floor((stepInSection - 58) / 2); // 0, 1, 2
      leadMidi = chord[(fillIdx + 1) % 4] + 12;
      leadSteps = 2;
    }
  }

  // En mode Menu, on allège la mélodie (1 note sur 2 hors refrains) et on adoucit le timbre
  if (isMenu && leadMidi !== null) {
    leadTimbre = themeId === 'solaire' ? 'PAN_FLUTE' : 'WARM_TRI';
    if (sectionIndex % 2 === 1 && barInSection === 3) {
      leadMidi = null;
    }
  }

  // --- 2. ARPÈGE ÉVOLUTIF D'ACCOMPAGNEMENT ---
  const arpPattern = ARP_PATTERNS[(sectionIndex + cycleIndex) % ARP_PATTERNS.length];
  let arpMidi: number | null = null;
  const playArpOnStep = isBridge
    ? stepInBar % 2 === 0 // Arpège deux fois plus posé pendant le pont
    : isMenu
      ? stepInBar % 2 === 0
      : true;

  if (playArpOnStep) {
    const arpChoice = arpPattern[stepInBar % arpPattern.length];
    if (arpChoice === 4) {
      arpMidi = chord[0] + 12;
    } else {
      arpMidi = chord[arpChoice % 4] + (themeId === 'space_odyssey' ? 12 : 0);
    }
    // Évite que l'arpège ne percute pile la même hauteur que l'attaque du lead
    if (leadMidi !== null && arpMidi === leadMidi) {
      arpMidi -= 12;
    }
  }

  // --- 3. LIGNE DE BASSE CHALEUREUSE ---
  let bassMidi: number | null = null;
  let bassSteps = 2;
  const rootGrave = chord[0] - 12; // Registre C2..F3

  if (isBridge) {
    // Pont : ronde profonde sur le 1er temps de la mesure
    if (stepInBar === 0) {
      bassMidi = rootGrave;
      bassSteps = 12;
    } else if (stepInBar === 12 && cycleIndex % 2 === 1) {
      bassMidi = chord[2] - 12;
      bassSteps = 4;
    }
  } else if (isMenu) {
    if (stepInBar === 0 || stepInBar === 8) {
      bassMidi = stepInBar === 0 ? rootGrave : chord[2] - 12;
      bassSteps = 6;
    }
  } else {
    const bp = isMultiball
      ? stepInBar % 2 === 0
        ? (stepInBar % 4 === 0 ? 1 : 2)
        : 0
      : score.bassPattern[stepInBar];

    if (bp === 1) {
      bassMidi = rootGrave;
      bassSteps = 2;
    } else if (bp === 2) {
      bassMidi = rootGrave + 12;
      bassSteps = 2;
    } else if (bp === 3) {
      bassMidi = chord[2] - 12;
      bassSteps = 2;
    }
  }

  // --- 4. PULSATION RYTHMIQUE FEUTRÉE (Uniquement en jeu hors pont) ---
  let kick = false;
  let hatGain = 0;
  if (!isMenu && !isBridge) {
    kick = stepInBar === 0 || stepInBar === 8 || (stepInSection >= 60 && stepInBar === 14 && cycleIndex % 2 === 1);
    if (stepInBar % 4 === 2) {
      hatGain = 0.026; // Contretemps doux
    } else if (stepInBar % 2 === 1 && (isMultiball || variantId === 4)) {
      hatGain = 0.014;
    }
    // Petit roulement léger de fin de phrase (mesure 4, pas 61..63)
    if (stepInSection >= 61) {
      hatGain = 0.022;
    }
  }

  return {
    stepDurationSec,
    sectionIndex,
    cycleIndex,
    variantId,
    leadMidi,
    leadSteps,
    leadGain: isMenu ? 0.065 : 0.095,
    leadTimbre,
    harmonyMidi,
    arpMidi,
    arpGain: isMenu ? 0.032 : isBridge ? 0.042 : 0.038,
    bassMidi,
    bassSteps,
    bassGain: isMenu ? 0.075 : 0.105,
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

    // Chaîne de mixage douce : Master -> Filtre passe-bas chaleureux -> Destination
    const master = ctx.createGain();
    master.gain.value = 0.0001;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;

    // Écho stéréo/ruban discret pour donner de la profondeur sans brouiller les bruitages
    const echoIn = ctx.createGain();
    echoIn.gain.value = 0.2;
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.27;
    const echoFb = ctx.createGain();
    echoFb.gain.value = 0.24;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 1450;

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
    const themeChanged = this.themeId !== themeId;
    this.themeId = themeId;
    this.gameState = gameState;
    this.multiball = multiball;
    this.windowFocused = focused;

    if (themeChanged) {
      // Démarre directement sur l'exposition mélodique (section 1) en jeu, ou sur l'ouverture douce au menu
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
    if (!this.enabled || this.sfxMasterMuted || !this.windowFocused) return false;
    if (!this.ctx) return false;
    return this.gameState === 'PLAYING' || this.gameState === 'TABLE_SELECT';
  }

  private targetMasterVolume(): number {
    if (!this.shouldPlay()) return 0.0001;
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
        this.gameState === 'TABLE_SELECT'
          ? 1250
          : this.multiball
            ? 3100
            : 2150;
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
      const isMenu = this.gameState === 'TABLE_SELECT';
      const step = evaluateMusicStep(this.themeId, this.globalStep, isMenu, this.multiball);
      this.scheduleStepVoices(step, this.nextNoteTime);
      this.nextNoteTime += step.stepDurationSec;
      this.globalStep++;
    }
  }

  private scheduleStepVoices(step: EvaluatedMusicStep, t: number) {
    if (!this.ctx || !this.masterGain) return;

    if (step.leadMidi !== null) {
      const dur = Math.max(0.08, step.leadSteps * step.stepDurationSec * 0.92);
      this.triggerLeadVoice(midiToHz(step.leadMidi), t, dur, step.leadGain, step.leadTimbre);
      if (step.harmonyMidi !== null) {
        this.triggerLeadVoice(
          midiToHz(step.harmonyMidi),
          t,
          dur,
          step.leadGain * 0.45,
          'WARM_TRI'
        );
      }
    }

    if (step.arpMidi !== null) {
      this.triggerArpVoice(midiToHz(step.arpMidi), t, step.stepDurationSec * 0.85, step.arpGain);
    }

    if (step.bassMidi !== null) {
      const bDur = Math.max(0.09, step.bassSteps * step.stepDurationSec * 0.88);
      this.triggerBassVoice(midiToHz(step.bassMidi), t, bDur, step.bassGain);
    }

    if (step.kick) {
      this.triggerSoftKick(t);
    }
    if (step.hatGain > 0) {
      this.triggerSoftHat(t, step.hatGain);
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

    const env = ctx.createGain();
    const attack = timbre === 'SPACE_PAD' ? 0.035 : timbre === 'HERO_BRASS' ? 0.024 : 0.012;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peakGain, t + Math.min(attack, dur * 0.4));
    env.gain.exponentialRampToValueAtTime(Math.max(0.0008, peakGain * 0.45), t + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);

    env.connect(out);
    if (this.echoSend) {
      env.connect(this.echoSend);
    }

    const osc1 = ctx.createOscillator();
    osc1.type =
      timbre === 'PULSE_CHIP'
        ? 'square'
        : timbre === 'HERO_BRASS'
          ? 'sawtooth'
          : timbre === 'BELL_OCT'
            ? 'sine'
            : 'triangle';
    osc1.frequency.setValueAtTime(freq, t);

    // Léger vibrato expressif sur les notes tenues
    if (dur >= 0.34) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(5.2, t);
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.linearRampToValueAtTime(freq * 0.0045, t + 0.16);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.04);
    }

    // Adoucissement spectral dédié pour éviter toute dureté sur les timbres riches (carré / cuivre)
    if (timbre === 'PULSE_CHIP' || timbre === 'HERO_BRASS') {
      const voiceFilter = ctx.createBiquadFilter();
      voiceFilter.type = 'lowpass';
      voiceFilter.frequency.setValueAtTime(timbre === 'HERO_BRASS' ? freq * 2.2 : freq * 3.4, t);
      if (timbre === 'HERO_BRASS') {
        voiceFilter.frequency.exponentialRampToValueAtTime(freq * 4.2, t + Math.min(0.09, dur * 0.5));
        voiceFilter.frequency.exponentialRampToValueAtTime(freq * 2.0, t + dur);
      }
      osc1.connect(voiceFilter);
      voiceFilter.connect(env);
    } else {
      osc1.connect(env);
    }

    // Doublure chorus légère pour Space Pad ou souffle flûté pour Pan Flute
    if (timbre === 'SPACE_PAD') {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.detune.setValueAtTime(7, t);
      osc2.frequency.setValueAtTime(freq, t);
      osc2.connect(env);
      osc2.start(t);
      osc2.stop(t + dur + 0.04);
    } else if (timbre === 'PAN_FLUTE' && this.noiseBuffer) {
      // Petit souffle d'attaque caractéristique d'une flûte de Pan
      const breath = ctx.createBufferSource();
      breath.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq * 2, t);
      bp.Q.setValueAtTime(3.5, t);
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(peakGain * 0.32, t);
      bGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      breath.connect(bp);
      bp.connect(bGain);
      bGain.connect(out);
      breath.start(t);
      breath.stop(t + 0.05);
    }

    osc1.start(t);
    osc1.stop(t + dur + 0.04);
  }

  private triggerArpVoice(freq: number, t: number, dur: number, peakGain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = this.themeId === 'solaire' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peakGain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);

    osc.connect(env);
    env.connect(this.masterGain!);
    if (this.echoSend) {
      env.connect(this.echoSend);
    }
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private triggerBassVoice(freq: number, t: number, dur: number, peakGain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, t);

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peakGain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * 0.4), t + dur * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);

    osc.connect(env);
    sub.connect(env);
    env.connect(this.masterGain!);

    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.03);
    sub.stop(t + dur + 0.03);
  }

  private triggerSoftKick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(108, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.075);

    env.gain.setValueAtTime(0.06, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);

    osc.connect(env);
    env.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  private triggerSoftHat(t: number, gainVal: number) {
    if (!this.noiseBuffer) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5200, t);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gainVal, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    src.connect(hp);
    hp.connect(env);
    env.connect(this.masterGain!);
    src.start(t);
    src.stop(t + 0.04);
  }
}

export const musicEngine = new ProceduralMusicEngine();
