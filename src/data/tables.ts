import solaireArt from '../assets/images/pinball_solaire_art_1793554422501.jpg';
import { PinballTableDef, TableThemeId, TargetDef } from '../types/pinball';
import { EXTRA_TABLES } from './extraTables';

const HIGH_SCORE_STORAGE_KEY = 'gamebuino_aka_pinball_highscores_v4';

const DEFAULT_HIGH_SCORES: Record<TableThemeId, number> = {
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
};

export function loadHighScores(): Record<TableThemeId, number> {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HIGH_SCORES };
    const parsed = JSON.parse(raw);
    return {
      aka_esp32:
        typeof parsed.aka_esp32 === 'number' ? parsed.aka_esp32 : DEFAULT_HIGH_SCORES.aka_esp32,
      space_odyssey:
        typeof parsed.space_odyssey === 'number'
          ? parsed.space_odyssey
          : DEFAULT_HIGH_SCORES.space_odyssey,
      star_galaxy:
        typeof parsed.star_galaxy === 'number'
          ? parsed.star_galaxy
          : DEFAULT_HIGH_SCORES.star_galaxy,
      solaire: typeof parsed.solaire === 'number' ? parsed.solaire : DEFAULT_HIGH_SCORES.solaire,
      classique:
        typeof parsed.classique === 'number' ? parsed.classique : DEFAULT_HIGH_SCORES.classique,
      ...(Object.fromEntries(
        (['prehistoire', 'farwest', 'halloween', 'candy', 'bonbons', 'train'] as TableThemeId[]).map((id) => [
          id,
          typeof parsed[id] === 'number' ? parsed[id] : DEFAULT_HIGH_SCORES[id],
        ])
      ) as Record<'prehistoire' | 'farwest' | 'halloween' | 'candy' | 'bonbons' | 'train', number>),
    };
  } catch {
    return { ...DEFAULT_HIGH_SCORES };
  }
}

export function saveHighScores(scores: Record<TableThemeId, number>) {
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Ignore storage quota errors
  }
}

function makeVerticalBank(
  prefix: string,
  bankId: string,
  bankRole: TargetDef['bankRole'],
  kind: TargetDef['kind'],
  x: number,
  startY: number,
  stepY: number,
  letters: string[],
  colors: string[],
  points: number
): TargetDef[] {
  return letters.map((letter, idx) => ({
    id: `${prefix}_${bankId}_${idx}`,
    bankId: `${prefix}_${bankId}`,
    bankRole,
    kind,
    x1: x,
    y1: startY + idx * stepY,
    x2: x,
    y2: startY + idx * stepY + 10.5,
    letter,
    lampColor: colors[idx % colors.length],
    points,
  }));
}

export const PINBALL_TABLES: PinballTableDef[] = [
  // ==========================================================================
  // 1. GAMEBUINO AKA · ESP32
  // Layout unique : Double Mini-Flippers Hauts symétriques (y=174),
  // Grappe d'engrenages asymétrique en haut-gauche + Cœur Wi-Fi central,
  // Rampe Bus SPI moulée + Viaduc métallique croisé Wi-Fi.
  // ==========================================================================
  {
    id: 'aka_esp32',
    name: 'Gamebuino AKA · ESP32',
    subtitle: 'Double-Pont Cybernétique & Puce Wi-Fi',
    layoutBadge: '4 Flippers · Double Arène Haute',
    environmentTag: 'Électronique Open-Source · 4 Flippers',
    description:
      'Architecture double-pont : deux mini-flippers symétriques en haut encadrent l’oscilloscope, une grappe d’engrenages asymétrique à gauche et un viaduc métallique croisant au-dessus du processeur ESP32.',
    multiballName: 'MULTIBILLE OVERCLOCK',
    jackpotName: 'SUPER FLASH 240MHz',
    skillShotLabel: 'BOOTLOADER PARFAIT',
    gravity: 322,
    palette: {
      bgPrimary: '#06142E',
      bgSecondary: '#0C2552',
      cabinetFrame: '#94A3B8',
      cabinetHighlight: '#E2E8F0',
      wallMetal: '#94A3B8',
      wallHighlight: '#F8FAFC',
      accentPrimary: '#38BDF8',
      accentSecondary: '#FACC15',
      accentWarm: '#EF4444',
      flipperTop: '#F8FAFC',
      flipperSkirt: '#DC2626',
      slingshotMain: '#DC2626',
      slingshotAccent: '#FACC15',
      hudBg: '#050E21',
      hudBorder: '#38BDF8',
      hudDigits: '#FACC15',
      hudStyle: 'CYBER_AKA',
      ballTint: '#E2E8F0',
    },
    extraFlippers: [
      {
        id: 'aka_upper_left',
        side: 'LEFT',
        zone: 'UPPER',
        pivot: { x: 56, y: 174 },
        length: 23,
        radius: 3.7,
        restAngle: 0.44,
        activeAngle: -0.5,
      },
      {
        id: 'aka_upper_right',
        side: 'RIGHT',
        zone: 'UPPER',
        pivot: { x: 170, y: 174 },
        length: 23,
        radius: 3.7,
        restAngle: Math.PI - 0.44,
        activeAngle: Math.PI + 0.5,
      },
    ],
    beveledHousings: [
      { points: [{ x: 9, y: 144 }, { x: 56, y: 174 }, { x: 9, y: 162 }], fillColor: '#334155' },
      { points: [{ x: 217, y: 144 }, { x: 170, y: 174 }, { x: 217, y: 162 }], fillColor: '#334155' },
      { points: [{ x: 9, y: 210 }, { x: 19, y: 220 }, { x: 19, y: 280 }, { x: 9, y: 290 }] },
      { points: [{ x: 217, y: 210 }, { x: 207, y: 220 }, { x: 207, y: 280 }, { x: 217, y: 290 }] },
      { points: [{ x: 9, y: 314 }, { x: 18.5, y: 323.5 }, { x: 18.5, y: 360.5 }, { x: 9, y: 370 }] },
      { points: [{ x: 217, y: 314 }, { x: 207.5, y: 323.5 }, { x: 207.5, y: 360.5 }, { x: 217, y: 370 }] },
    ],
    bumpers: [
      { id: 'aka_b1', x: 66, y: 94, radius: 10.5, points: 2000, label: 'GEAR ROUGE', colorStyle: 'RED', iconStyle: 'GEAR' },
      { id: 'aka_b2', x: 108, y: 90, radius: 10.5, points: 2000, label: 'GEAR OR', colorStyle: 'GOLD', iconStyle: 'GEAR' },
      { id: 'aka_b3', x: 85, y: 124, radius: 10.5, points: 2200, label: 'CLOCK BUS', colorStyle: 'BLUE', iconStyle: 'GEAR' },
      { id: 'aka_b4', x: 113, y: 238, radius: 11, points: 2600, label: 'CŒUR WIFI', colorStyle: 'GOLD', iconStyle: 'GEAR' },
    ],
    targets: [
      ...makeVerticalBank('aka', 'CODE', 'MULTIPLIER', 'DROP', 19.5, 222, 14, ['<', '/', '>', '∞'], ['#EF4444', '#22C55E', '#38BDF8', '#FACC15'], 3500),
      ...makeVerticalBank('aka', 'ESP', 'MULTIBALL', 'STANDUP', 206.5, 222, 14, ['E', 'S', 'P', '3'], ['#38BDF8', '#FACC15', '#EF4444', '#22C55E'], 4500),
      ...makeVerticalBank('aka', 'PWM', 'KICKBACK', 'DROP', 19, 325, 12.5, ['P', 'W', 'M'], ['#22C55E', '#38BDF8', '#FACC15'], 3200),
      ...makeVerticalBank('aka', 'USB', 'JACKPOT_BOOST', 'STANDUP', 207, 325, 12.5, ['U', 'S', 'B'], ['#FACC15', '#EF4444', '#38BDF8'], 3500),
    ],
    ramps: [
      {
        id: 'aka_ramp_spi',
        name: 'BUS SPI GAUCHE',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 48, y: 334 },
        entryRadius: 15,
        entryDir: { x: -0.32, y: -0.95 },
        path: [
          { x: 48, y: 334 },
          { x: 28, y: 278 },
          { x: 26, y: 202 },
          { x: 34, y: 134 },
        ],
        points: 18000,
        chuteColor: '#38BDF8',
        railColor: '#E2E8F0',
      },
      {
        id: 'aka_ramp_wifi',
        name: 'VIADUC WI-FI 2.4G',
        style: 'WIREFORM_RAIL',
        entry: { x: 174, y: 334 },
        entryRadius: 15,
        entryDir: { x: 0.32, y: -0.95 },
        path: [
          { x: 174, y: 334 },
          { x: 194, y: 274 },
          { x: 166, y: 210 },
          { x: 82, y: 248 },
          { x: 36, y: 338 },
          { x: 36, y: 404 },
        ],
        points: 21000,
        chuteColor: '#60A5FA',
        railColor: '#FACC15',
      },
      {
        id: 'aka_ramp_overclock',
        name: 'ARCHE OVERCLOCK',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 150, y: 132 },
        entryRadius: 14,
        entryDir: { x: 0.55, y: -0.83 },
        allowSideEntry: true,
        path: [
          { x: 150, y: 132 },
          { x: 188, y: 88 },
          { x: 142, y: 36 },
          { x: 74, y: 40 },
          { x: 188, y: 132 },
        ],
        points: 28000,
        chuteColor: '#22C55E',
        railColor: '#FFFFFF',
      },
    ],
    rollovers: [
      { id: 'aka_r1', groupId: 'TOP_LANES', x: 68, y: 52, radius: 6, letter: 'A', points: 3500 },
      { id: 'aka_r2', groupId: 'TOP_LANES', x: 98, y: 49, radius: 6, letter: 'K', points: 3500 },
      { id: 'aka_r3', groupId: 'TOP_LANES', x: 128, y: 49, radius: 6, letter: 'A', points: 3500 },
      { id: 'aka_r4', groupId: 'TOP_LANES', x: 158, y: 52, radius: 6, letter: '!', points: 3500 },
      { id: 'aka_in_l', groupId: 'INLANES', x: 36, y: 414, radius: 5.5, letter: '0', points: 2500 },
      { id: 'aka_in_r', groupId: 'INLANES', x: 190, y: 414, radius: 5.5, letter: '1', points: 2500 },
    ],
    spinners: [
      { id: 'aka_sp1', name: 'CLOCK 240MHz', x: 46, y: 204, width: 15, angle: -0.2, pointsPerSpin: 900 },
      { id: 'aka_sp2', name: 'BUS I2C', x: 180, y: 198, width: 15, angle: 0.2, pointsPerSpin: 900 },
    ],
    scoops: [
      {
        id: 'aka_lock_boot',
        name: 'VERROU BOOTLOADER',
        kind: 'UPPER_LOCK',
        x: 156,
        y: 96,
        radius: 9,
        ejectTo: { x: 156, y: 112 },
        ejectVelocity: { x: 35, y: 165 },
        points: 22000,
        color: '#FACC15',
      },
      {
        id: 'aka_vuk_uart',
        name: 'CANON UART',
        kind: 'MID_VUK_TELEPORT',
        x: 113,
        y: 316,
        radius: 9,
        ejectTo: { x: 36, y: 134 },
        ejectVelocity: { x: 48, y: 135 },
        points: 16000,
        color: '#38BDF8',
      },
    ],
    missions: [
      {
        id: 'aka_m1',
        title: 'BUS SPI RAPIDE',
        description: 'Franchir 2 rampes pour synchroniser le bus écran',
        targetKind: 'RAMP',
        goal: 2,
        rewardPoints: 45000,
        accentColor: '#38BDF8',
      },
      {
        id: 'aka_m2',
        title: 'TEST OSCILLOSCOPE',
        description: 'Activer 5 engrenages bumpers ou spinners',
        targetKind: 'BUMPER',
        goal: 5,
        rewardPoints: 55000,
        accentColor: '#22C55E',
      },
      {
        id: 'aka_m3',
        title: 'FLASH FIRMWARE',
        description: 'Toucher 4 cibles ou puits pour graver la ROM',
        targetKind: 'TARGET',
        goal: 4,
        rewardPoints: 75000,
        accentColor: '#FACC15',
      },
    ],
    extraWalls: [],
    extraPegs: [],
    missionEmblemPos: { x: 113, y: 364 },
    rulesSummary: {
      rampsRule:
        'Le Bus SPI moulé translucide monte directement au mini-flipper gauche, tandis que le Viaduc Wi-Fi en rails chromés traverse la carte mère.',
      bumpersRule:
        'Grappe asymétrique de 3 engrenages en haut-gauche + Cœur Wi-Fi central au-dessus de la puce ESP32.',
      targetsRule:
        'Abattez < / > ∞ pour augmenter le Bonus, E-S-P-3 pour déclencher le Multibille et P-W-M pour rallumer les 2 Kickbacks.',
      multiballRule:
        'Verrouillez 2 billes dans le Verrou Bootloader (haut-droite) ou complétez E-S-P-3 pour libérer 3 billes simultanées !',
    },
  },

  // ==========================================================================
  // 2. ODYSSÉE SPATIALE
  // Layout unique : 3 Flippers avec Fronde Orbitale à mi-hauteur GAUCHE (y=256),
  // Constellation centrale de 5 Bumpers Étoiles en diamant,
  // Grande Arche Apollo faisant tout le tour droit -> gauche vers le 3e flipper !
  // ==========================================================================
  {
    id: 'space_odyssey',
    name: 'Odyssée Spatiale',
    subtitle: 'Fronde Orbitale Gauche & Constellation 5 Étoiles',
    layoutBadge: '3 Flippers · Fronde Latérale Gauche',
    environmentTag: 'Conquête Spatiale · Constellation 5 Bumpers',
    description:
      'Disposition orbitale : une constellation centrale en diamant de 5 étoiles bumpers, une grande arche vitrée Apollo qui livre la bille sur un 3e flipper latéral gauche pour viser l’Anneau de Saturne.',
    multiballName: 'MULTIBILLE APOLLO',
    jackpotName: 'HYPER-ORBITE SOLAIRE',
    skillShotLabel: 'INSERTION ORBITALE',
    gravity: 318,
    palette: {
      bgPrimary: '#081642',
      bgSecondary: '#132B70',
      cabinetFrame: '#94A3B8',
      cabinetHighlight: '#F1F5F9',
      wallMetal: '#CBD5E1',
      wallHighlight: '#FFFFFF',
      accentPrimary: '#38BDF8',
      accentSecondary: '#FACC15',
      accentWarm: '#EF4444',
      flipperTop: '#FFFFFF',
      flipperSkirt: '#DC2626',
      slingshotMain: '#DC2626',
      slingshotAccent: '#FACC15',
      hudBg: '#091128',
      hudBorder: '#3B82F6',
      hudDigits: '#EF4444',
      hudStyle: 'LED_7SEG',
      ballTint: '#F1F5F9',
    },
    extraFlippers: [
      {
        id: 'spc_mid_left',
        side: 'LEFT',
        zone: 'MID',
        pivot: { x: 48, y: 256 },
        length: 25,
        radius: 3.8,
        restAngle: 0.42,
        activeAngle: -0.52,
      },
    ],
    beveledHousings: [
      // Seamless NASA target guide rail feeding straight onto the Mid-Left Orbital Flipper!
      {
        points: [
          { x: 9, y: 136 },
          { x: 19, y: 146 },
          { x: 19, y: 222 },
          { x: 48, y: 256 },
          { x: 9, y: 240 },
        ],
        fillColor: '#1E293B',
      },
      // Opposite MARS target bank sniped by the Mid-Left Flipper
      { points: [{ x: 217, y: 196 }, { x: 206.5, y: 206.5 }, { x: 206.5, y: 268.5 }, { x: 217, y: 279 }] },
      { points: [{ x: 9, y: 294 }, { x: 18.5, y: 303.5 }, { x: 18.5, y: 345.5 }, { x: 9, y: 355 }] },
      { points: [{ x: 217, y: 306 }, { x: 207.5, y: 315.5 }, { x: 207.5, y: 357.5 }, { x: 217, y: 367 }] },
    ],
    bumpers: [
      { id: 'spc_b1', x: 78, y: 98, radius: 10, points: 2000, label: 'STAR ALPHA', colorStyle: 'RED', iconStyle: 'STAR' },
      { id: 'spc_b2', x: 148, y: 98, radius: 10, points: 2000, label: 'STAR BETA', colorStyle: 'GOLD', iconStyle: 'STAR' },
      { id: 'spc_b3', x: 113, y: 128, radius: 11.5, points: 2800, label: 'SUPERNOVA', colorStyle: 'BLUE', iconStyle: 'STAR' },
      { id: 'spc_b4', x: 82, y: 158, radius: 10, points: 2000, label: 'PULSAR G', colorStyle: 'GOLD', iconStyle: 'STAR' },
      { id: 'spc_b5', x: 144, y: 158, radius: 10, points: 2000, label: 'PULSAR D', colorStyle: 'RED', iconStyle: 'STAR' },
    ],
    targets: [
      ...makeVerticalBank('spc', 'NASA', 'MULTIPLIER', 'DROP', 19.5, 150, 14, ['N', 'A', 'S', 'A'], ['#EF4444', '#FACC15', '#38BDF8', '#22C55E'], 3500),
      ...makeVerticalBank('spc', 'MARS', 'MULTIBALL', 'STANDUP', 206, 209, 14, ['M', 'A', 'R', 'S'], ['#FACC15', '#EF4444', '#38BDF8', '#22C55E'], 4500),
      ...makeVerticalBank('spc', 'ORB', 'KICKBACK', 'DROP', 19, 306, 13, ['O', 'R', 'B'], ['#38BDF8', '#FACC15', '#EF4444'], 3200),
      ...makeVerticalBank('spc', 'EVA', 'JACKPOT_BOOST', 'STANDUP', 207, 318, 13, ['E', 'V', 'A'], ['#22C55E', '#38BDF8', '#FACC15'], 3500),
    ],
    ramps: [
      {
        id: 'spc_ramp_apollo',
        name: 'GRANDE ARCHE APOLLO',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 170, y: 342 },
        entryRadius: 15.5,
        entryDir: { x: 0.34, y: -0.94 },
        path: [
          { x: 170, y: 342 },
          { x: 194, y: 284 },
          { x: 192, y: 172 },
          { x: 154, y: 68 },
          { x: 64, y: 74 },
          { x: 32, y: 168 },
          { x: 32, y: 222 },
        ],
        points: 22000,
        chuteColor: '#38BDF8',
        railColor: '#FFFFFF',
      },
      {
        id: 'spc_ramp_saturn',
        name: 'ANNEAU DE SATURNE',
        style: 'WIREFORM_RAIL',
        entry: { x: 162, y: 184 },
        entryRadius: 15,
        entryDir: { x: 0.72, y: -0.69 },
        allowSideEntry: true,
        path: [
          { x: 162, y: 184 },
          { x: 196, y: 152 },
          { x: 196, y: 282 },
          { x: 190, y: 404 },
        ],
        points: 26000,
        chuteColor: '#FACC15',
        railColor: '#FDE047',
      },
      {
        id: 'spc_ramp_booster',
        name: 'BOOSTER ROUGE',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 66, y: 328 },
        entryRadius: 14.5,
        entryDir: { x: -0.25, y: -0.97 },
        path: [
          { x: 66, y: 328 },
          { x: 48, y: 262 },
          { x: 68, y: 196 },
          { x: 36, y: 402 },
        ],
        points: 18500,
        chuteColor: '#EF4444',
        railColor: '#FDE047',
      },
    ],
    rollovers: [
      { id: 'spc_r1', groupId: 'TOP_LANES', x: 68, y: 50, radius: 6, letter: '1', points: 3500 },
      { id: 'spc_r2', groupId: 'TOP_LANES', x: 98, y: 47, radius: 6, letter: 'U', points: 3500 },
      { id: 'spc_r3', groupId: 'TOP_LANES', x: 128, y: 47, radius: 6, letter: 'P', points: 3500 },
      { id: 'spc_r4', groupId: 'TOP_LANES', x: 158, y: 50, radius: 6, letter: '★', points: 3500 },
      { id: 'spc_in_l', groupId: 'INLANES', x: 36, y: 414, radius: 5.5, letter: '★', points: 2500 },
      { id: 'spc_in_r', groupId: 'INLANES', x: 190, y: 414, radius: 5.5, letter: '★', points: 2500 },
    ],
    spinners: [
      { id: 'spc_sp1', name: 'SONDE VOYAGER', x: 44, y: 112, width: 15, angle: -0.25, pointsPerSpin: 950 },
      { id: 'spc_sp2', name: 'TURBINE LOX', x: 184, y: 294, width: 15, angle: 0.2, pointsPerSpin: 950 },
    ],
    scoops: [
      {
        id: 'spc_lock_mir',
        name: 'SAS STATION MIR',
        kind: 'UPPER_LOCK',
        x: 182,
        y: 126,
        radius: 9,
        ejectTo: { x: 168, y: 138 },
        ejectVelocity: { x: -85, y: 155 },
        points: 24000,
        color: '#FACC15',
      },
      {
        id: 'spc_vuk_lunar',
        name: 'MODULE LUNAIRE',
        kind: 'MID_VUK_TELEPORT',
        x: 154,
        y: 298,
        radius: 9,
        ejectTo: { x: 32, y: 222 },
        ejectVelocity: { x: 38, y: 120 },
        points: 17000,
        color: '#EF4444',
      },
    ],
    missions: [
      {
        id: 'spc_m1',
        title: 'MISE EN ORBITE',
        description: 'Emprunter 2 rampes orbitales avec la fusée',
        targetKind: 'RAMP',
        goal: 2,
        rewardPoints: 45000,
        accentColor: '#38BDF8',
      },
      {
        id: 'spc_m2',
        title: 'PLUIE DE MÉTÉORES',
        description: 'Percuter 6 étoiles dans la constellation centrale',
        targetKind: 'BUMPER',
        goal: 6,
        rewardPoints: 60000,
        accentColor: '#FACC15',
      },
      {
        id: 'spc_m3',
        title: 'ARRIMAGE STATION MIR',
        description: 'Valider 4 cibles spatiales ou sas d’amarrage',
        targetKind: 'TARGET',
        goal: 4,
        rewardPoints: 80000,
        accentColor: '#EF4444',
      },
    ],
    extraWalls: [],
    extraPegs: [],
    missionEmblemPos: { x: 113, y: 364 },
    rulesSummary: {
      rampsRule:
        'La Grande Arche Apollo fait tout le tour du dôme pour livrer la bille sur le 3e flipper gauche, idéal pour tirer l’Anneau de Saturne en travers !',
      bumpersRule:
        'Constellation centrale de 5 Bumpers Étoiles disposés en diamant autour de la Supernova bleue.',
      targetsRule:
        'Visez M-A-R-S depuis le flipper latéral gauche pour déclencher le Multibille Apollo et N-A-S-A pour monter le Bonus.',
      multiballRule:
        '2 verrous au Sas Station Mir ou la banque M-A-R-S libèrent immédiatement 3 billes simultanées !',
    },
  },

  // ==========================================================================
  // 3. STAR WARS · YAVIN (id technique : star_galaxy)
  // Layout unique : Double Flipper Droit d'Assaut (y=154 et y=282),
  // Rampes Sabre Sith (rouge) & Sabre Jedi (bleu) croisées en X au centre du plateau,
  // Conduit Thermique de l'Étoile Noire gardé par les turbolasers !
  // ==========================================================================
  {
    id: 'star_galaxy',
    name: 'Star Wars · Yavin',
    subtitle: 'Bataille de Yavin · Sabres en X & Assaut Droit',
    layoutBadge: '4 Flippers · Sabres Jedi & Sith',
    environmentTag: 'Il y a bien longtemps · Une galaxie très lointaine',
    description:
      'Bataille de Yavin : un sabre Sith rouge et un sabre Jedi bleu se croisent en X au-dessus de l’Étoile Noire. Vos X-Wings attaquent par le flanc droit, il faut placer la torpille à protons dans le conduit thermique !',
    multiballName: 'ESCADRON ROUGE',
    jackpotName: 'TORPILLE À PROTONS',
    skillShotLabel: 'SAUT HYPERESPACE',
    gravity: 328,
    palette: {
      bgPrimary: '#050711',
      bgSecondary: '#0D142B',
      cabinetFrame: '#64748B',
      cabinetHighlight: '#CBD5E1',
      wallMetal: '#94A3B8',
      wallHighlight: '#F8FAFC',
      accentPrimary: '#3B82F6',
      accentSecondary: '#EF4444',
      accentWarm: '#FFE81F',
      flipperTop: '#F8FAFC',
      flipperSkirt: '#DC2626',
      slingshotMain: '#DC2626',
      slingshotAccent: '#3B82F6',
      hudBg: '#070912',
      hudBorder: '#FFE81F',
      hudDigits: '#FFE81F',
      hudStyle: 'LED_7SEG',
      ballTint: '#E2E8F0',
    },
    extraFlippers: [
      {
        id: 'gal_upper_right',
        side: 'RIGHT',
        zone: 'UPPER',
        pivot: { x: 172, y: 154 },
        length: 22,
        radius: 3.6,
        restAngle: Math.PI - 0.44,
        activeAngle: Math.PI + 0.5,
      },
      {
        id: 'gal_mid_right',
        side: 'RIGHT',
        zone: 'MID',
        pivot: { x: 176, y: 282 },
        length: 24,
        radius: 3.8,
        restAngle: Math.PI - 0.44,
        activeAngle: Math.PI + 0.5,
      },
    ],
    beveledHousings: [
      { points: [{ x: 217, y: 126 }, { x: 172, y: 154 }, { x: 217, y: 142 }], fillColor: '#334155' },
      // Seamless XWNG wall feeding directly onto Mid-Right Assault Flipper
      {
        points: [
          { x: 217, y: 172 },
          { x: 207, y: 182 },
          { x: 207, y: 250 },
          { x: 176, y: 282 },
          { x: 217, y: 268 },
        ],
        fillColor: '#1E293B',
      },
      { points: [{ x: 9, y: 142 }, { x: 19, y: 152 }, { x: 19, y: 214 }, { x: 9, y: 224 }] },
      { points: [{ x: 9, y: 282 }, { x: 18.5, y: 291.5 }, { x: 18.5, y: 335.5 }, { x: 9, y: 345 }] },
      { points: [{ x: 217, y: 304 }, { x: 207.5, y: 313.5 }, { x: 207.5, y: 355.5 }, { x: 217, y: 365 }] },
    ],
    bumpers: [
      { id: 'gal_b1', x: 62, y: 100, radius: 10, points: 2100, label: 'X-WING ROUGE 2', colorStyle: 'RED', iconStyle: 'CREST' },
      { id: 'gal_b2', x: 113, y: 86, radius: 10.5, points: 2400, label: 'FAUCON MILLENIUM', colorStyle: 'GOLD', iconStyle: 'CREST' },
      { id: 'gal_b3', x: 150, y: 102, radius: 10, points: 2100, label: 'Y-WING OR', colorStyle: 'BLUE', iconStyle: 'CREST' },
      { id: 'gal_b4', x: 70, y: 214, radius: 10.5, points: 2300, label: 'TURBOLASER G', colorStyle: 'RED', iconStyle: 'CREST' },
      { id: 'gal_b5', x: 156, y: 214, radius: 10.5, points: 2300, label: 'TURBOLASER D', colorStyle: 'BLUE', iconStyle: 'CREST' },
    ],
    targets: [
      ...makeVerticalBank('gal', 'SITH', 'MULTIPLIER', 'DROP', 19.5, 154, 14, ['S', 'I', 'T', 'H'], ['#EF4444', '#B91C1C', '#EF4444', '#B91C1C'], 3500),
      ...makeVerticalBank('gal', 'XWNG', 'MULTIBALL', 'STANDUP', 206.5, 185, 14.5, ['X', 'W', 'N', 'G'], ['#3B82F6', '#EF4444', '#FACC15', '#22C55E'], 4500),
      ...makeVerticalBank('gal', 'R2D', 'KICKBACK', 'DROP', 19, 294, 13, ['R', '2', 'D'], ['#38BDF8', '#FFFFFF', '#FACC15'], 3200),
      ...makeVerticalBank('gal', 'ION', 'JACKPOT_BOOST', 'STANDUP', 207, 316, 13, ['I', 'O', 'N'], ['#EF4444', '#3B82F6', '#FACC15'], 3500),
    ],
    ramps: [
      {
        id: 'gal_ramp_red_saber',
        name: 'SABRE SITH',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 52, y: 344 },
        entryRadius: 15.5,
        entryDir: { x: 0.42, y: -0.91 },
        path: [
          { x: 52, y: 344 },
          { x: 92, y: 280 },
          { x: 146, y: 222 },
          { x: 192, y: 182 },
          { x: 194, y: 244 },
        ],
        points: 22000,
        chuteColor: '#EF4444',
        railColor: '#FCA5A5',
      },
      {
        id: 'gal_ramp_blue_saber',
        name: 'SABRE JEDI',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 166, y: 344 },
        entryRadius: 15.5,
        entryDir: { x: -0.42, y: -0.91 },
        path: [
          { x: 166, y: 344 },
          { x: 126, y: 280 },
          { x: 72, y: 222 },
          { x: 34, y: 182 },
          { x: 36, y: 404 },
        ],
        points: 22000,
        chuteColor: '#3B82F6',
        railColor: '#93C5FD',
      },
      {
        id: 'gal_ramp_hyper',
        name: 'SAUT HYPERESPACE',
        style: 'WIREFORM_RAIL',
        entry: { x: 54, y: 242 },
        entryRadius: 15,
        entryDir: { x: -0.68, y: -0.73 },
        allowSideEntry: true,
        path: [
          { x: 54, y: 242 },
          { x: 30, y: 186 },
          { x: 48, y: 118 },
          { x: 190, y: 118 },
        ],
        points: 28000,
        chuteColor: '#FACC15',
        railColor: '#FDE047',
      },
    ],
    rollovers: [
      { id: 'gal_r1', groupId: 'TOP_LANES', x: 68, y: 50, radius: 6, letter: 'J', points: 3500 },
      { id: 'gal_r2', groupId: 'TOP_LANES', x: 98, y: 47, radius: 6, letter: 'E', points: 3500 },
      { id: 'gal_r3', groupId: 'TOP_LANES', x: 128, y: 47, radius: 6, letter: 'D', points: 3500 },
      { id: 'gal_r4', groupId: 'TOP_LANES', x: 158, y: 50, radius: 6, letter: 'I', points: 3500 },
      { id: 'gal_in_l', groupId: 'INLANES', x: 36, y: 414, radius: 5.5, letter: '◄', points: 2500 },
      { id: 'gal_in_r', groupId: 'INLANES', x: 190, y: 414, radius: 5.5, letter: '►', points: 2500 },
    ],
    spinners: [
      { id: 'gal_sp1', name: 'CHASSEURS TIE', x: 38, y: 254, width: 15, angle: -0.2, pointsPerSpin: 950 },
      { id: 'gal_sp2', name: 'HYPERPROPULSEUR', x: 190, y: 110, width: 15, angle: 0.25, pointsPerSpin: 950 },
    ],
    scoops: [
      {
        id: 'gal_lock_reactor',
        name: 'CONDUIT THERMIQUE',
        kind: 'UPPER_LOCK',
        x: 113,
        y: 174,
        radius: 9,
        ejectTo: { x: 113, y: 190 },
        ejectVelocity: { x: -75, y: 155 },
        points: 25000,
        color: '#EF4444',
      },
      {
        id: 'gal_vuk_hyper',
        name: 'TUNNEL DE KESSEL',
        kind: 'MID_VUK_TELEPORT',
        x: 113,
        y: 298,
        radius: 9,
        ejectTo: { x: 192, y: 120 },
        ejectVelocity: { x: -35, y: 120 },
        points: 18000,
        color: '#3B82F6',
      },
    ],
    missions: [
      {
        id: 'gal_m1',
        title: 'DUEL DE SABRES',
        description: 'Franchir 2 fois les rampes du Sabre Sith et du Sabre Jedi',
        targetKind: 'RAMP',
        goal: 2,
        rewardPoints: 50000,
        accentColor: '#EF4444',
      },
      {
        id: 'gal_m2',
        title: 'DÉFENSE DES TURBOLASERS',
        description: 'Neutraliser 5 X-Wings, Faucon ou turbolasers (bumpers ou spinners)',
        targetKind: 'BUMPER',
        goal: 5,
        rewardPoints: 60000,
        accentColor: '#3B82F6',
      },
      {
        id: 'gal_m3',
        title: 'TRANCHÉE DE L’ÉTOILE NOIRE',
        description: 'Toucher 4 cibles ou le Conduit Thermique : « Utilise la Force ! »',
        targetKind: 'TARGET',
        goal: 4,
        rewardPoints: 85000,
        accentColor: '#FACC15',
      },
    ],
    extraWalls: [],
    extraPegs: [],
    missionEmblemPos: { x: 113, y: 364 },
    rulesSummary: {
      rampsRule:
        'Le Sabre Sith (rouge) et le Sabre Jedi (bleu) forment un X lumineux : le Sabre Sith livre la bille sur le flipper d’assaut médian droit pour enchaîner le Saut Hyperespace.',
      bumpersRule:
        'X-Wing, Faucon Millenium et Y-Wing en formation d’attaque + 2 turbolasers protégeant le Conduit Thermique.',
      targetsRule:
        'Abattez les S-I-T-H à gauche pour le multiplicateur, X-W-N-G à droite pour l’Escadron Rouge (multibille) et R-2-D pour les 2 Kickbacks. J-E-D-I en haut allume les couloirs.',
      multiballRule:
        '2 tirs dans le Conduit Thermique central ou la banque X-W-N-G lancent l’Escadron Rouge à 3 billes !',
    },
  },

  // ==========================================================================
  // 4. TEMPLE SOLAIRE
  // Layout unique : Terrasses Maya décalées en diagonale (Flipper Jade Haut-Gauche
  // y=204 + Flipper Or Bas-Droit y=298), deux sanctuaires de bumpers opposés,
  // et Rampe Serpent Quetzal sinueuse au cœur du temple !
  // ==========================================================================
  {
    id: 'solaire',
    name: 'Temple Solaire',
    subtitle: 'Terrasses Décalées & Serpent Quetzal',
    layoutBadge: '4 Flippers · Terrasses en Diagonale',
    environmentTag: 'Cité d’Or & Jade · Sanctuaires Croisés',
    description:
      'Géométrie en terrasses asymétriques : un flipper de Jade haut perché à gauche, un flipper d’Or plus bas à droite, deux sanctuaires de totems opposés et une rampe Serpent sinueuse au centre.',
    artworkUrl: solaireArt,
    multiballName: 'ÉCLIPSE MULTIBILLE',
    jackpotName: 'ZÉNITH IMPÉRIAL D’OR',
    skillShotLabel: 'ALIGNEMENT SOLAIRE',
    gravity: 318,
    palette: {
      bgPrimary: '#17120E',
      bgSecondary: '#261D16',
      cabinetFrame: '#B45309',
      cabinetHighlight: '#FDE68A',
      wallMetal: '#D97706',
      wallHighlight: '#FDE68A',
      accentPrimary: '#10B981',
      accentSecondary: '#F59E0B',
      accentWarm: '#EF4444',
      flipperTop: '#FEF3C7',
      flipperSkirt: '#059669',
      slingshotMain: '#B45309',
      slingshotAccent: '#10B981',
      hudBg: '#100C09',
      hudBorder: '#D97706',
      hudDigits: '#FBBF24',
      hudStyle: 'CYBER_AKA',
      ballTint: '#FDE68A',
    },
    extraFlippers: [
      {
        id: 'sol_high_left',
        side: 'LEFT',
        zone: 'UPPER',
        pivot: { x: 52, y: 204 },
        length: 24,
        radius: 3.7,
        restAngle: 0.44,
        activeAngle: -0.5,
      },
      {
        id: 'sol_low_right',
        side: 'RIGHT',
        zone: 'MID',
        pivot: { x: 176, y: 298 },
        length: 24,
        radius: 3.7,
        restAngle: Math.PI - 0.44,
        activeAngle: Math.PI + 0.5,
      },
    ],
    beveledHousings: [
      // Seamless JADE wall feeding High-Left Terrace Flipper
      {
        points: [
          { x: 9, y: 102 },
          { x: 19, y: 112 },
          { x: 19, y: 170 },
          { x: 52, y: 204 },
          { x: 9, y: 190 },
        ],
        fillColor: '#292018',
      },
      // Seamless MAYA wall feeding Low-Right Terrace Flipper
      {
        points: [
          { x: 217, y: 188 },
          { x: 207, y: 198 },
          { x: 207, y: 264 },
          { x: 176, y: 298 },
          { x: 217, y: 284 },
        ],
        fillColor: '#292018',
      },
      { points: [{ x: 9, y: 298 }, { x: 18.5, y: 307.5 }, { x: 18.5, y: 349.5 }, { x: 9, y: 359 }] },
      { points: [{ x: 217, y: 316 }, { x: 207.5, y: 325.5 }, { x: 207.5, y: 363.5 }, { x: 217, y: 373 }] },
    ],
    bumpers: [
      // Sanctuary 1: Upper-Right Emerald Totems
      { id: 'sol_b1', x: 132, y: 92, radius: 10, points: 2000, label: 'TOTEM JADE 1', colorStyle: 'JADE', iconStyle: 'SUN' },
      { id: 'sol_b2', x: 174, y: 102, radius: 10, points: 2000, label: 'TOTEM JADE 2', colorStyle: 'JADE', iconStyle: 'SUN' },
      { id: 'sol_b3', x: 152, y: 132, radius: 10.5, points: 2400, label: 'ORACLE ÉMERAUDE', colorStyle: 'GOLD', iconStyle: 'SUN' },
      // Sanctuary 2: Mid-Left Golden Sun Idols
      { id: 'sol_b4', x: 60, y: 260, radius: 10, points: 2000, label: 'IDOLE JAGUAR', colorStyle: 'GOLD', iconStyle: 'SUN' },
      { id: 'sol_b5', x: 98, y: 252, radius: 10, points: 2000, label: 'IDOLE AIGLE', colorStyle: 'RED', iconStyle: 'SUN' },
      { id: 'sol_b6', x: 78, y: 288, radius: 10.5, points: 2500, label: 'ASTRE D’OR', colorStyle: 'GOLD', iconStyle: 'SUN' },
    ],
    targets: [
      ...makeVerticalBank('sol', 'JADE', 'MULTIPLIER', 'DROP', 19.5, 114, 13.5, ['J', 'A', 'D', 'E'], ['#10B981', '#F59E0B', '#FDE047', '#10B981'], 3500),
      ...makeVerticalBank('sol', 'MAYA', 'MULTIBALL', 'STANDUP', 206.5, 202, 14.5, ['M', 'A', 'Y', 'A'], ['#F59E0B', '#10B981', '#EF4444', '#FDE047'], 4500),
      ...makeVerticalBank('sol', 'SOL', 'KICKBACK', 'DROP', 19, 309, 13, ['S', 'O', 'L'], ['#FACC15', '#10B981', '#F59E0B'], 3200),
      ...makeVerticalBank('sol', 'ORB', 'JACKPOT_BOOST', 'STANDUP', 207, 327, 12, ['O', 'R', 'B'], ['#F59E0B', '#EF4444', '#10B981'], 3500),
    ],
    ramps: [
      {
        id: 'sol_ramp_quetzal',
        name: 'SERPENT QUETZAL',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 124, y: 342 },
        entryRadius: 15.5,
        entryDir: { x: 0.1, y: -0.99 },
        path: [
          { x: 124, y: 342 },
          { x: 138, y: 278 },
          { x: 92, y: 214 },
          { x: 48, y: 148 },
          { x: 34, y: 168 },
        ],
        points: 21000,
        chuteColor: '#10B981',
        railColor: '#FDE68A',
      },
      {
        id: 'sol_ramp_aqueduct',
        name: 'AQUEDUC D’OR',
        style: 'WIREFORM_RAIL',
        entry: { x: 156, y: 162 },
        entryRadius: 15,
        entryDir: { x: 0.72, y: -0.69 },
        allowSideEntry: true,
        path: [
          { x: 156, y: 162 },
          { x: 194, y: 122 },
          { x: 196, y: 216 },
          { x: 194, y: 262 },
        ],
        points: 25000,
        chuteColor: '#F59E0B',
        railColor: '#FDE68A',
      },
      {
        id: 'sol_ramp_eclipse',
        name: 'PONT DE L’ÉCLIPSE',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 48, y: 238 },
        entryRadius: 14.5,
        entryDir: { x: -0.58, y: -0.81 },
        allowSideEntry: true,
        path: [
          { x: 48, y: 238 },
          { x: 28, y: 198 },
          { x: 36, y: 404 },
        ],
        points: 20000,
        chuteColor: '#FACC15',
        railColor: '#10B981',
      },
    ],
    rollovers: [
      { id: 'sol_r1', groupId: 'TOP_LANES', x: 68, y: 50, radius: 6, letter: 'S', points: 3500 },
      { id: 'sol_r2', groupId: 'TOP_LANES', x: 98, y: 47, radius: 6, letter: 'O', points: 3500 },
      { id: 'sol_r3', groupId: 'TOP_LANES', x: 128, y: 47, radius: 6, letter: 'L', points: 3500 },
      { id: 'sol_r4', groupId: 'TOP_LANES', x: 158, y: 50, radius: 6, letter: '☀', points: 3500 },
      { id: 'sol_in_l', groupId: 'INLANES', x: 36, y: 414, radius: 5.5, letter: '◆', points: 2500 },
      { id: 'sol_in_r', groupId: 'INLANES', x: 190, y: 414, radius: 5.5, letter: '◆', points: 2500 },
    ],
    spinners: [
      { id: 'sol_sp1', name: 'ROUE DU TEMPS', x: 112, y: 148, width: 15, angle: 0.0, pointsPerSpin: 900 },
      { id: 'sol_sp2', name: 'SOUFFLE D’OR', x: 168, y: 344, width: 15, angle: 0.2, pointsPerSpin: 900 },
    ],
    scoops: [
      {
        id: 'sol_lock_crypt',
        name: 'CRYPTE DE L’ÉCLIPSE',
        kind: 'UPPER_LOCK',
        x: 78,
        y: 106,
        radius: 9,
        ejectTo: { x: 86, y: 124 },
        ejectVelocity: { x: 75, y: 145 },
        points: 23000,
        color: '#10B981',
      },
      {
        id: 'sol_vuk_cenote',
        name: 'CÉNOTÉ SACRÉ',
        kind: 'MID_VUK_TELEPORT',
        x: 148,
        y: 226,
        radius: 9,
        ejectTo: { x: 34, y: 166 },
        ejectVelocity: { x: 42, y: 125 },
        points: 17000,
        color: '#F59E0B',
      },
    ],
    missions: [
      {
        id: 'sol_m1',
        title: 'VOIE DE QUETZAL',
        description: 'Gravir 2 rampes sacrées à travers les terrasses',
        targetKind: 'RAMP',
        goal: 2,
        rewardPoints: 45000,
        accentColor: '#10B981',
      },
      {
        id: 'sol_m2',
        title: 'OFFRANDE DES TOTEMS',
        description: 'Réveiller 6 idoles bumpers de Jade et d’Or',
        targetKind: 'BUMPER',
        goal: 6,
        rewardPoints: 60000,
        accentColor: '#F59E0B',
      },
      {
        id: 'sol_m3',
        title: 'RITUEL DU ZÉNITH',
        description: 'Activer 4 autels cibles ou plonger au Cénoté',
        targetKind: 'TARGET',
        goal: 4,
        rewardPoints: 80000,
        accentColor: '#FACC15',
      },
    ],
    extraWalls: [],
    extraPegs: [],
    missionEmblemPos: { x: 113, y: 374 },
    rulesSummary: {
      rampsRule:
        'Le Serpent Quetzal ondule au centre jusqu’à la terrasse haute gauche, d’où l’Aqueduc d’Or en rails métalliques rejoint la terrasse droite.',
      bumpersRule:
        'Deux sanctuaires opposés : 3 Totems d’Émeraude en haut-droite et 3 Idoles d’Or à mi-hauteur gauche.',
      targetsRule:
        'J-A-D-E alimente la terrasse gauche et monte le Bonus ; M-A-Y-A lance l’Éclipse Multibille ; S-O-L allume les 2 boucliers sacrés.',
      multiballRule:
        'Verrouillez 2 billes dans la Crypte de l’Éclipse (haut-gauche) ou complétez M-A-Y-A pour libérer 3 billes d’or !',
    },
  },
  // ==========================================================================
  // 5. FLIPPER CLASSIQUE (table originale)
  // Esprit des machines mécaniques à lampes : 2 flippers seulement, 3 bumpers en triangle
  // sous un verrou central, deux rampes miroir, voyants à points et bonus de fin de bille.
  // ==========================================================================
  {
    id: 'classique',
    name: 'Flipper Classique',
    subtitle: 'Triangle de Bumpers & Voyants Lumineux',
    layoutBadge: '2 Flippers · Table Mécanique',
    environmentTag: 'Salle d’Arcade · Années 70-80',
    description:
      'La table des salles d’arcade d’autrefois : trois bumpers en triangle sous le verrou central, deux rampes symétriques, des cibles latérales et des voyants dorés à allumer pour faire grimper le bonus.',
    multiballName: 'MULTIBILLE JACKPOT',
    jackpotName: 'SUPER JACKPOT',
    skillShotLabel: 'TIR PARFAIT',
    gravity: 320,
    palette: {
      bgPrimary: '#0B5563',
      bgSecondary: '#1A8A8F',
      cabinetFrame: '#B7791F',
      cabinetHighlight: '#FEF3C7',
      wallMetal: '#CBD5E1',
      wallHighlight: '#FFFFFF',
      accentPrimary: '#F59E0B',
      accentSecondary: '#FDE047',
      accentWarm: '#DC2626',
      flipperTop: '#FFF7ED',
      flipperSkirt: '#B91C1C',
      slingshotMain: '#DC2626',
      slingshotAccent: '#FDE047',
      hudBg: '#1A0709',
      hudBorder: '#F59E0B',
      hudDigits: '#FDE047',
      hudStyle: 'LED_7SEG',
      ballTint: '#F1F5F9',
    },
    extraFlippers: [],
    beveledHousings: [
      { points: [{ x: 9, y: 210 }, { x: 19, y: 220 }, { x: 19, y: 280 }, { x: 9, y: 290 }] },
      { points: [{ x: 217, y: 210 }, { x: 207, y: 220 }, { x: 207, y: 280 }, { x: 217, y: 290 }] },
      { points: [{ x: 9, y: 314 }, { x: 18.5, y: 323.5 }, { x: 18.5, y: 360.5 }, { x: 9, y: 370 }] },
      { points: [{ x: 217, y: 314 }, { x: 207.5, y: 323.5 }, { x: 207.5, y: 360.5 }, { x: 217, y: 370 }] },
    ],
    bumpers: [
      { id: 'cla_b1', x: 78, y: 138, radius: 10.5, points: 2000, label: 'BUMPER ROUGE', colorStyle: 'RED', iconStyle: 'SUN' },
      { id: 'cla_b2', x: 148, y: 138, radius: 10.5, points: 2000, label: 'BUMPER BLEU', colorStyle: 'BLUE', iconStyle: 'SUN' },
      { id: 'cla_b3', x: 113, y: 178, radius: 11, points: 2400, label: 'BUMPER OR', colorStyle: 'GOLD', iconStyle: 'SUN' },
    ],
    targets: [
      ...makeVerticalBank('cla', 'BONUS', 'MULTIPLIER', 'DROP', 19.5, 222, 14, ['B', 'O', 'N', 'S'], ['#EF4444', '#FACC15', '#22C55E', '#38BDF8'], 3500),
      ...makeVerticalBank('cla', 'JACK', 'MULTIBALL', 'STANDUP', 206.5, 222, 14, ['J', 'A', 'C', 'K'], ['#FACC15', '#EF4444', '#38BDF8', '#22C55E'], 4500),
      ...makeVerticalBank('cla', 'KICK', 'KICKBACK', 'DROP', 19, 325, 12.5, ['K', 'I', 'C'], ['#22C55E', '#38BDF8', '#FACC15'], 3200),
      ...makeVerticalBank('cla', 'GOLD', 'JACKPOT_BOOST', 'STANDUP', 207, 325, 12.5, ['G', 'O', 'D'], ['#FACC15', '#EF4444', '#38BDF8'], 3500),
    ],
    ramps: [
      {
        id: 'cla_ramp_l',
        name: 'RAMPE GAUCHE',
        style: 'MOLDED_ACRYLIC',
        entry: { x: 48, y: 334 },
        entryRadius: 15,
        entryDir: { x: -0.32, y: -0.95 },
        path: [
          { x: 48, y: 334 },
          { x: 28, y: 278 },
          { x: 26, y: 202 },
          { x: 34, y: 134 },
        ],
        points: 18000,
        chuteColor: '#F59E0B',
        railColor: '#E2E8F0',
      },
      {
        id: 'cla_ramp_r',
        name: 'RAMPE DROITE',
        style: 'WIREFORM_RAIL',
        entry: { x: 178, y: 334 },
        entryRadius: 15,
        entryDir: { x: 0.32, y: -0.95 },
        path: [
          { x: 178, y: 334 },
          { x: 198, y: 278 },
          { x: 200, y: 202 },
          { x: 192, y: 134 },
        ],
        points: 18000,
        chuteColor: '#DC2626',
        railColor: '#FDE047',
      },
    ],
    rollovers: [
      { id: 'cla_r1', groupId: 'TOP_LANES', x: 68, y: 52, radius: 6, letter: 'F', points: 3500 },
      { id: 'cla_r2', groupId: 'TOP_LANES', x: 98, y: 49, radius: 6, letter: 'L', points: 3500 },
      { id: 'cla_r3', groupId: 'TOP_LANES', x: 128, y: 49, radius: 6, letter: 'I', points: 3500 },
      { id: 'cla_r4', groupId: 'TOP_LANES', x: 158, y: 52, radius: 6, letter: 'P', points: 3500 },
      { id: 'cla_in_l', groupId: 'INLANES', x: 36, y: 414, radius: 5.5, letter: '★', points: 2500 },
      { id: 'cla_in_r', groupId: 'INLANES', x: 190, y: 414, radius: 5.5, letter: '★', points: 2500 },
    ],
    spinners: [
      { id: 'cla_sp1', name: 'TOURNIQUET GAUCHE', x: 56, y: 204, width: 15, angle: -0.2, pointsPerSpin: 900 },
      { id: 'cla_sp2', name: 'TOURNIQUET DROIT', x: 170, y: 204, width: 15, angle: 0.2, pointsPerSpin: 900 },
    ],
    scoops: [
      {
        id: 'cla_lock',
        name: 'VERROU CENTRAL',
        kind: 'UPPER_LOCK',
        x: 113,
        y: 96,
        radius: 9,
        ejectTo: { x: 113, y: 112 },
        ejectVelocity: { x: 0, y: 165 },
        points: 22000,
        color: '#FDE047',
      },
      {
        id: 'cla_vuk',
        name: 'PUITS DU BONUS',
        kind: 'MID_VUK_TELEPORT',
        x: 113,
        y: 316,
        radius: 9,
        ejectTo: { x: 34, y: 134 },
        ejectVelocity: { x: 48, y: 135 },
        points: 16000,
        color: '#F59E0B',
      },
    ],
    missions: [
      {
        id: 'cla_m1',
        title: 'RAMPES X2',
        description: 'Franchir 2 rampes pour allumer les voyants',
        targetKind: 'RAMP',
        goal: 2,
        rewardPoints: 45000,
        accentColor: '#F59E0B',
      },
      {
        id: 'cla_m2',
        title: 'TRIANGLE OR',
        description: 'Frapper 5 fois les bumpers du triangle',
        targetKind: 'BUMPER',
        goal: 5,
        rewardPoints: 55000,
        accentColor: '#DC2626',
      },
      {
        id: 'cla_m3',
        title: 'CIBLES',
        description: 'Toucher 4 cibles ou puits pour le bonus final',
        targetKind: 'TARGET',
        goal: 4,
        rewardPoints: 75000,
        accentColor: '#FDE047',
      },
    ],
    extraWalls: [],
    extraPegs: [],
    missionEmblemPos: { x: 113, y: 364 },
    rulesSummary: {
      rampsRule:
        'Deux rampes miroir : la gauche en acrylique ambré, la droite en rail doré, qui ramènent la bille en haut des couloirs latéraux.',
      bumpersRule:
        'Triangle de 3 bumpers rouge, bleu et or sous le verrou central : chaque coup fait grimper le bonus.',
      targetsRule:
        'B-O-N-S augmente le Bonus, J-A-C-K déclenche le Multibille et K-I-C rallume les 2 Kickbacks.',
      multiballRule:
        'Verrouillez 2 billes dans le Verrou Central (en haut) ou complétez J-A-C-K pour libérer 3 billes !',
    },
  },
  ...EXTRA_TABLES,
];
