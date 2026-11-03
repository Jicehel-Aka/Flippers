/*
  extraTables.ts — six tables thématiques supplémentaires, entièrement originales (aucun personnage, logo ni
  œuvre protégée) : Préhistoire, Far West, Halloween, Candy Pop (shōjo pastel), Bonbons et Train.
  Elles partagent la même architecture que les autres plateaux (2 rampes, verrou central, 4 banques de cibles,
  6 rollovers) et ne diffèrent que par la disposition des bumpers, les couleurs, les noms et le décor.
*/
import { PinballTableDef, TargetDef, BumperDef, MissionDef, TablePalette, HuntDef } from '../types/pinball';

type BumperSpec = [number, number, number, string, BumperDef['colorStyle'], BumperDef['iconStyle']]; // x, y, points, label, color, icon

interface BankSpec {
  name: string;
  role: TargetDef['bankRole'];
  kind: TargetDef['kind'];
  letters: string[];
  colors: string[];
}

interface Spec {
  id: PinballTableDef['id'];
  prefix: string;
  name: string;
  subtitle: string;
  badge: string;
  env: string;
  desc: string;
  multiball: string;
  jackpot: string;
  skill: string;
  gravity: number;
  palette: TablePalette;
  bumpers: BumperSpec[];
  rampNames: [string, string];
  rampColors: [string, string, string, string]; // chute G, rail G, chute D, rail D
  rampStyles: ['MOLDED_ACRYLIC' | 'WIREFORM_RAIL', 'MOLDED_ACRYLIC' | 'WIREFORM_RAIL'];
  /** Milieux des rampes : 2 points intermédiaires + sortie (l'entrée est fixe : (48,334) à gauche, (178,334) à droite). */
  rampPaths: [number[][], number[][]];
  rollovers: string[]; // 4 lettres du haut puis 2 retours
  banks: [BankSpec, BankSpec, BankSpec, BankSpec];
  lockName: string;
  lockSide: 'LEFT' | 'RIGHT';
  hunt?: HuntDef;
  litBumperRotate?: boolean;
  missionDescs: [string, string, string];
  lockColor: string;
  vukName: string;
  vukExitRight: boolean;
  spinners: [string, string];
  missions: [string, string, string]; // titres courts (<= 11 caractères)
  missionColors: [string, string, string];
  rules: [string, string, string, string];
}

function bank(prefix: string, spec: BankSpec, idx: number, x: number, startY: number, stepY: number, points: number): TargetDef[] {
  return spec.letters.map((letter, i) => ({
    id: `${prefix}_${spec.name}_${i}`,
    bankId: `${prefix}_${spec.name}`,
    bankRole: spec.role,
    kind: spec.kind,
    x1: x,
    y1: startY + i * stepY,
    x2: x,
    y2: startY + i * stepY + 10.5,
    letter,
    lampColor: spec.colors[(i + idx) % spec.colors.length],
    points,
  }));
}

function build(s: Spec): PinballTableDef {
  const p = s.prefix;
  const rollover = (id: string, group: 'TOP_LANES' | 'INLANES', x: number, y: number, r: number, letter: string, pts: number) => ({
    id: `${p}_${id}`, groupId: group, x, y, radius: r, letter, points: pts,
  });
  const missionDefs: MissionDef[] = [
    { id: `${p}_m1`, title: s.missions[0], description: s.missionDescs[0], targetKind: 'RAMP', goal: 2, rewardPoints: 45000, accentColor: s.missionColors[0] },
    { id: `${p}_m2`, title: s.missions[1], description: s.missionDescs[1], targetKind: 'BUMPER', goal: 5, rewardPoints: 55000, accentColor: s.missionColors[1] },
    { id: `${p}_m3`, title: s.missions[2], description: s.missionDescs[2], targetKind: 'TARGET', goal: 4, rewardPoints: 75000, accentColor: s.missionColors[2] },
  ];
  return {
    id: s.id,
    name: s.name,
    subtitle: s.subtitle,
    layoutBadge: s.badge,
    environmentTag: s.env,
    description: s.desc,
    multiballName: s.multiball,
    jackpotName: s.jackpot,
    skillShotLabel: s.skill,
    gravity: s.gravity,
    palette: s.palette,
    extraFlippers: [],
    beveledHousings: [
      { points: [{ x: 9, y: 210 }, { x: 19, y: 220 }, { x: 19, y: 280 }, { x: 9, y: 290 }] },
      { points: [{ x: 217, y: 210 }, { x: 207, y: 220 }, { x: 207, y: 280 }, { x: 217, y: 290 }] },
      { points: [{ x: 9, y: 314 }, { x: 18.5, y: 323.5 }, { x: 18.5, y: 360.5 }, { x: 9, y: 370 }] },
      { points: [{ x: 217, y: 314 }, { x: 207.5, y: 323.5 }, { x: 207.5, y: 360.5 }, { x: 217, y: 370 }] },
    ],
    bumpers: s.bumpers.map((b, i) => ({
      id: `${p}_b${i + 1}`, x: b[0], y: b[1], radius: i === s.bumpers.length - 1 ? 11 : 10.5, points: b[2], label: b[3], colorStyle: b[4], iconStyle: b[5],
    })),
    targets: [
      ...bank(p, s.banks[0], 0, 19.5, 222, 14, 3500),
      ...bank(p, s.banks[1], 1, 206.5, 222, 14, 4500),
      ...bank(p, s.banks[2], 2, 19, 325, 12.5, 3200),
      ...bank(p, s.banks[3], 3, 207, 325, 12.5, 3500),
    ],
    ramps: [
      {
        id: `${p}_ramp_l`, name: s.rampNames[0], style: s.rampStyles[0],
        entry: { x: 48, y: 334 }, entryRadius: 15, entryDir: { x: -0.32, y: -0.95 },
        path: [{ x: 48, y: 334 }, ...s.rampPaths[0].map(([x, y]) => ({ x, y }))],
        points: 18000, chuteColor: s.rampColors[0], railColor: s.rampColors[1],
      },
      {
        id: `${p}_ramp_r`, name: s.rampNames[1], style: s.rampStyles[1],
        entry: { x: 178, y: 334 }, entryRadius: 15, entryDir: { x: 0.32, y: -0.95 },
        path: [{ x: 178, y: 334 }, ...s.rampPaths[1].map(([x, y]) => ({ x, y }))],
        points: 18000, chuteColor: s.rampColors[2], railColor: s.rampColors[3],
      },
    ],
    rollovers: [
      rollover('r1', 'TOP_LANES', 68, 52, 6, s.rollovers[0], 3500),
      rollover('r2', 'TOP_LANES', 98, 49, 6, s.rollovers[1], 3500),
      rollover('r3', 'TOP_LANES', 128, 49, 6, s.rollovers[2], 3500),
      rollover('r4', 'TOP_LANES', 158, 52, 6, s.rollovers[3], 3500),
      rollover('in_l', 'INLANES', 36, 414, 5.5, s.rollovers[4], 2500),
      rollover('in_r', 'INLANES', 190, 414, 5.5, s.rollovers[5], 2500),
    ],
    spinners: [
      { id: `${p}_sp1`, name: s.spinners[0], x: 56, y: 204, width: 15, angle: -0.2, pointsPerSpin: 900 },
      { id: `${p}_sp2`, name: s.spinners[1], x: 170, y: 204, width: 15, angle: 0.2, pointsPerSpin: 900 },
    ],
    scoops: [
      {
        id: `${p}_lock`, name: s.lockName, kind: 'UPPER_LOCK',
        x: s.lockSide === 'LEFT' ? 52 : 174, y: 100, radius: 9,
        ejectTo: { x: s.lockSide === 'LEFT' ? 52 : 174, y: 116 },
        ejectVelocity: { x: s.lockSide === 'LEFT' ? 45 : -45, y: 150 },
        points: 22000, color: s.lockColor,
      },
      {
        id: `${p}_vuk`, name: s.vukName, kind: 'MID_VUK_TELEPORT', x: 113, y: 316, radius: 9,
        ejectTo: s.vukExitRight ? { x: 192, y: 134 } : { x: 34, y: 134 },
        ejectVelocity: s.vukExitRight ? { x: -48, y: 135 } : { x: 48, y: 135 },
        points: 16000, color: s.lockColor,
      },
    ],
    missions: missionDefs as PinballTableDef['missions'],
    extraWalls: [],
    extraPegs: [],
    missionEmblemPos: { x: 113, y: 364 },
    hunt: s.hunt,
    litBumperRotate: s.litBumperRotate,
    rulesSummary: { rampsRule: s.rules[0], bumpersRule: s.rules[1], targetsRule: s.rules[2], multiballRule: s.rules[3] },
  };
}

const C4 = (a: string, b: string, c: string, d: string) => [a, b, c, d];

export const EXTRA_TABLES: PinballTableDef[] = [
  build({
    id: 'prehistoire', prefix: 'pre',
    name: 'Préhistoire', subtitle: 'Volcan en Éruption & Chasse au Mammouth',
    badge: '2 Flippers · Âge de Pierre', env: 'Âge de Pierre · Volcan & Dinosaures',
    desc: 'Au pied d’un volcan fumant, quatre bumpers de roche fument sous le verrou de la grotte ; deux rampes de lave et des cibles gravées dans la pierre ouvrent la chasse au Mammouth.',
    multiball: 'MULTIBILLE ÉRUPTION', jackpot: 'SUPER MAMMOUTH', skill: 'TIR DE SILEX', gravity: 322,
    palette: {
      bgPrimary: '#2A1A0E', bgSecondary: '#5A3A1C', cabinetFrame: '#9A6B3A', cabinetHighlight: '#FDE68A',
      wallMetal: '#A8A29E', wallHighlight: '#F5F5F4', accentPrimary: '#F97316', accentSecondary: '#FACC15', accentWarm: '#DC2626',
      flipperTop: '#FEF3C7', flipperSkirt: '#92400E', slingshotMain: '#B45309', slingshotAccent: '#FACC15',
      hudBg: '#1C1209', hudBorder: '#F97316', hudDigits: '#FDBA74', hudStyle: 'LED_7SEG', ballTint: '#E7E5E4',
    },
    bumpers: [
      [84, 128, 2000, 'ROCHE LAVE', 'RED', 'SUN'], [142, 128, 2000, 'ROCHE OCRE', 'GOLD', 'SUN'],
      [113, 160, 2200, 'ŒUF DE DINO', 'JADE', 'SUN'], [113, 214, 2600, 'CRÂNE', 'GOLD', 'CREST'],
    ],
    rampNames: ['RIVIÈRE DE LAVE', 'PONT DE LIANES'], rampColors: ['#F97316', '#FDE68A', '#16A34A', '#FDE68A'],
    rampStyles: ['MOLDED_ACRYLIC', 'WIREFORM_RAIL'], rollovers: ['R', 'O', 'C', 'K', '◆', '◆'],
    rampPaths: [[[26, 290], [44, 226], [30, 142]], [[204, 262], [176, 200], [190, 138]]],
    banks: [
      { name: 'PIERRE', role: 'MULTIPLIER', kind: 'DROP', letters: ['P', 'I', 'E', 'R'], colors: C4('#F97316', '#FACC15', '#16A34A', '#DC2626') },
      { name: 'MAMMOUTH', role: 'MULTIBALL', kind: 'STANDUP', letters: ['M', 'A', 'M', 'O'], colors: C4('#FACC15', '#F97316', '#DC2626', '#16A34A') },
      { name: 'FEU', role: 'KICKBACK', kind: 'DROP', letters: ['F', 'E', 'U'], colors: C4('#DC2626', '#F97316', '#FACC15', '#16A34A') },
      { name: 'OS', role: 'JACKPOT_BOOST', kind: 'STANDUP', letters: ['O', 'S', '!'], colors: C4('#E7E5E4', '#FACC15', '#F97316', '#DC2626') },
    ],
    lockName: 'GROTTE DU CLAN', lockColor: '#F97316', vukName: 'PUITS DE GOUDRON', vukExitRight: false,
    lockSide: 'LEFT',
    hunt: {
      kind: 'MAMMOTH', name: 'MAMMOUTH', radius: 9, points: 3000, goal: 4, reward: 40000, sequential: false, color: '#F97316',
      slots: [{ x: 84, y: 236 }, { x: 142, y: 236 }, { x: 66, y: 296 }, { x: 160, y: 296 }, { x: 113, y: 268 }],
    },
    missionDescs: ['Franchir 2 rampes de lave et de lianes', 'Frapper 5 fois les roches du volcan', 'Abattre 4 mammouths qui changent de piste'],
    spinners: ['ROUE DE PIERRE', 'ROUE DE SILEX'],
    missions: ['LAVE', 'ÉRUPTION', 'CHASSE'], missionColors: ['#F97316', '#DC2626', '#FACC15'],
    rules: [
      'Une rivière de lave ambrée à gauche et un pont de lianes à droite ramènent la bille en haut des couloirs.',
      'Quatre roches : deux de lave et d’ocre, un œuf de dinosaure et le crâne central.',
      'P-I-E-R monte le Bonus, M-A-M-O lance le Multibille, F-E-U rallume les Kickbacks.',
      'Verrouillez 2 billes dans la Grotte du Clan ou complétez M-A-M-O pour libérer 3 billes !',
    ],
  }),
  build({
    id: 'farwest', prefix: 'far',
    name: 'Far West', subtitle: 'Saloon, Shérif & Train de l’Or',
    badge: '2 Flippers · Ville du Désert', env: 'Désert · Saloon & Diligence',
    desc: 'Rue principale d’une ville de l’Ouest : trois bumpers alignés devant le saloon, une étoile de shérif au centre et deux rampes de bois pour rejoindre la mine.',
    multiball: 'MULTIBILLE DUEL', jackpot: 'JACKPOT DU SHÉRIF', skill: 'TIR AU COLT', gravity: 320,
    palette: {
      bgPrimary: '#3B1D0A', bgSecondary: '#7C4A1E', cabinetFrame: '#B45309', cabinetHighlight: '#FDE68A',
      wallMetal: '#D6A35C', wallHighlight: '#FFF7ED', accentPrimary: '#F59E0B', accentSecondary: '#FDE68A', accentWarm: '#B91C1C',
      flipperTop: '#FFF7ED', flipperSkirt: '#7C2D12', slingshotMain: '#9A3412', slingshotAccent: '#FACC15',
      hudBg: '#1F1006', hudBorder: '#D97706', hudDigits: '#FCD34D', hudStyle: 'LED_7SEG', ballTint: '#F5F5F4',
    },
    bumpers: [
      [70, 152, 2000, 'TONNEAU', 'GOLD', 'STAR'], [113, 132, 2200, 'ÉTOILE SHÉRIF', 'RED', 'STAR'],
      [156, 152, 2000, 'FER À CHEVAL', 'BLUE', 'STAR'], [113, 204, 2600, 'SALOON', 'GOLD', 'STAR'],
    ],
    rampNames: ['RAIL DE LA MINE', 'DILIGENCE'], rampColors: ['#B45309', '#FDE68A', '#F59E0B', '#E2E8F0'],
    rampStyles: ['MOLDED_ACRYLIC', 'MOLDED_ACRYLIC'], rollovers: ['C', 'O', 'L', 'T', '★', '★'],
    rampPaths: [[[24, 262], [26, 192], [46, 140]], [[204, 300], [204, 214], [184, 146]]],
    banks: [
      { name: 'SALOON', role: 'MULTIPLIER', kind: 'DROP', letters: ['S', 'A', 'L', 'O'], colors: C4('#F59E0B', '#DC2626', '#FDE68A', '#16A34A') },
      { name: 'DUEL', role: 'MULTIBALL', kind: 'STANDUP', letters: ['D', 'U', 'E', 'L'], colors: C4('#DC2626', '#FDE68A', '#F59E0B', '#2563EB') },
      { name: 'OR', role: 'KICKBACK', kind: 'DROP', letters: ['O', 'R', '!'], colors: C4('#FACC15', '#F59E0B', '#FDE68A', '#DC2626') },
      { name: 'BOX', role: 'JACKPOT_BOOST', kind: 'STANDUP', letters: ['B', 'O', 'X'], colors: C4('#FDE68A', '#DC2626', '#F59E0B', '#16A34A') },
    ],
    lockName: 'COFFRE DE LA BANQUE', lockColor: '#FACC15', vukName: 'PUITS DE LA MINE', vukExitRight: true,
    lockSide: 'RIGHT',
    hunt: {
      kind: 'WANTED', name: 'WANTED', radius: 8.5, points: 3000, goal: 5, reward: 50000, sequential: false, color: '#FDE68A',
      slots: [{ x: 84, y: 232 }, { x: 142, y: 232 }, { x: 60, y: 262 }, { x: 166, y: 262 }, { x: 84, y: 300 }, { x: 142, y: 300 }],
    },
    missionDescs: ['Franchir 2 rampes pour rejoindre la mine', 'Frapper 5 fois les bumpers du saloon', 'Abattre 4 bandits WANTED qui changent de place'],
    spinners: ['ROUE DU MOULIN', 'ROUE DE CHARIOT'],
    missions: ['MINE D’OR', 'COUPS DE FEU', 'BRIGADE'], missionColors: ['#FACC15', '#DC2626', '#F59E0B'],
    rules: [
      'Le rail de la mine à gauche et la diligence à droite montent aux couloirs du haut.',
      'Trois bumpers alignés devant le saloon : tonneau, étoile du shérif et fer à cheval, plus l’enseigne centrale.',
      'S-A-L-O monte le Bonus, D-U-E-L lance le Multibille, O-R rallume les Kickbacks.',
      'Verrouillez 2 billes dans le Coffre de la Banque ou complétez D-U-E-L pour libérer 3 billes !',
    ],
  }),
  build({
    id: 'halloween', prefix: 'hal',
    name: 'Halloween', subtitle: 'Manoir Hanté & Nuit des Citrouilles',
    badge: '2 Flippers · Manoir Hanté', env: 'Nuit d’Halloween · Citrouilles & Toiles',
    desc: 'Cinq citrouilles bumpers en étoile sous une pleine lune, des toiles d’araignée dans les coins et deux rampes de brume violette qui mènent au caveau du manoir.',
    multiball: 'MULTIBILLE NUIT NOIRE', jackpot: 'SUPER CITROUILLE', skill: 'TIR SORCIÈRE', gravity: 318,
    palette: {
      bgPrimary: '#12081F', bgSecondary: '#2D1248', cabinetFrame: '#7C3AED', cabinetHighlight: '#E9D5FF',
      wallMetal: '#A78BFA', wallHighlight: '#F5F3FF', accentPrimary: '#F97316', accentSecondary: '#A3E635', accentWarm: '#DC2626',
      flipperTop: '#FFEDD5', flipperSkirt: '#6D28D9', slingshotMain: '#EA580C', slingshotAccent: '#A3E635',
      hudBg: '#0C0614', hudBorder: '#F97316', hudDigits: '#A3E635', hudStyle: 'CYBER_AKA', ballTint: '#EDE9FE',
    },
    bumpers: [
      [113, 124, 2200, 'CITROUILLE REINE', 'GOLD', 'STAR'], [80, 162, 2000, 'CITROUILLE ROUGE', 'RED', 'STAR'],
      [146, 162, 2000, 'CITROUILLE VERTE', 'JADE', 'STAR'], [92, 206, 2000, 'FANTÔME', 'BLUE', 'CREST'],
      [134, 206, 2400, 'CHAUVE-SOURIS', 'RED', 'CREST'],
    ],
    rampNames: ['BRUME VIOLETTE', 'ESCALIER DU CAVEAU'], rampColors: ['#8B5CF6', '#E9D5FF', '#F97316', '#FED7AA'],
    rampStyles: ['MOLDED_ACRYLIC', 'WIREFORM_RAIL'], rollovers: ['B', 'O', 'O', '!', '☠', '☠'],
    rampPaths: [[[30, 276], [52, 220], [32, 150]], [[196, 270], [172, 216], [194, 142]]],
    banks: [
      { name: 'SORT', role: 'MULTIPLIER', kind: 'DROP', letters: ['S', 'O', 'R', 'T'], colors: C4('#F97316', '#A3E635', '#8B5CF6', '#DC2626') },
      { name: 'HANTÉ', role: 'MULTIBALL', kind: 'STANDUP', letters: ['H', 'A', 'N', 'T'], colors: C4('#A3E635', '#F97316', '#8B5CF6', '#DC2626') },
      { name: 'BOO', role: 'KICKBACK', kind: 'DROP', letters: ['B', 'O', 'O'], colors: C4('#F97316', '#A3E635', '#8B5CF6', '#DC2626') },
      { name: 'RIP', role: 'JACKPOT_BOOST', kind: 'STANDUP', letters: ['R', 'I', 'P'], colors: C4('#E9D5FF', '#F97316', '#A3E635', '#DC2626') },
    ],
    lockName: 'CAVEAU DU MANOIR', lockColor: '#A3E635', vukName: 'PUITS DU CHAUDRON', vukExitRight: false,
    lockSide: 'LEFT',
    hunt: {
      kind: 'GHOST', name: 'FANTÔME', radius: 9, points: 3000, goal: 4, reward: 45000, sequential: false, color: '#A3E635',
      slots: [{ x: 62, y: 230 }, { x: 164, y: 230 }, { x: 113, y: 240 }, { x: 84, y: 298 }, { x: 142, y: 298 }],
    },
    missionDescs: ['Franchir 2 rampes dans la brume', 'Frapper 5 fois les citrouilles', 'Chasser 4 fantômes qui hantent le manoir'],
    spinners: ['ROUE DE LA TOILE', 'ROUE DU CORBEAU'],
    missions: ['BRUME', 'CITROUILLES', 'MANOIR'], missionColors: ['#8B5CF6', '#F97316', '#A3E635'],
    rules: [
      'La brume violette à gauche et l’escalier du caveau en rail orange à droite ramènent la bille en haut.',
      'Cinq bumpers en étoile : citrouille reine au sommet, deux citrouilles, un fantôme et une chauve-souris.',
      'S-O-R-T monte le Bonus, H-A-N-T lance le Multibille, B-O-O rallume les Kickbacks.',
      'Verrouillez 2 billes dans le Caveau du Manoir ou complétez H-A-N-T pour libérer 3 billes !',
    ],
  }),
  build({
    id: 'candy', prefix: 'can',
    name: 'Candy Pop', subtitle: 'Cœurs, Rubans & Étoiles Pastel',
    badge: '2 Flippers · Univers Shōjo', env: 'Manga Girly · Cœurs & Rubans',
    desc: 'Un plateau pastel façon manga pour filles : quatre bumpers en losange entourés de cœurs, des rubans roses sur les rampes et des étoiles filantes sur les cibles.',
    multiball: 'MULTIBILLE CŒUR', jackpot: 'SUPER ÉTOILE', skill: 'TIR RUBAN', gravity: 316,
    palette: {
      bgPrimary: '#9D3D8B', bgSecondary: '#F472B6', cabinetFrame: '#F9A8D4', cabinetHighlight: '#FFFFFF',
      wallMetal: '#FBCFE8', wallHighlight: '#FFFFFF', accentPrimary: '#F472B6', accentSecondary: '#FDE047', accentWarm: '#EF4444',
      flipperTop: '#FFFFFF', flipperSkirt: '#DB2777', slingshotMain: '#EC4899', slingshotAccent: '#FDE047',
      hudBg: '#3B0A2C', hudBorder: '#F9A8D4', hudDigits: '#FDE047', hudStyle: 'CYBER_AKA', ballTint: '#FFF1F2',
    },
    bumpers: [
      [113, 128, 2000, 'CŒUR ROSE', 'RED', 'STAR'], [82, 168, 2000, 'ÉTOILE OR', 'GOLD', 'STAR'],
      [144, 168, 2000, 'CŒUR BLEU', 'BLUE', 'STAR'], [113, 208, 2600, 'GRAND CŒUR', 'RED', 'STAR'],
    ],
    rampNames: ['RUBAN ROSE', 'ARC-EN-CIEL'], rampColors: ['#F472B6', '#FFFFFF', '#A78BFA', '#FDE047'],
    rampStyles: ['MOLDED_ACRYLIC', 'MOLDED_ACRYLIC'], rollovers: ['L', 'O', 'V', 'E', '♥', '♥'],
    rampPaths: [[[24, 284], [46, 214], [28, 136]], [[206, 276], [184, 206], [200, 134]]],
    banks: [
      { name: 'CANDY', role: 'MULTIPLIER', kind: 'DROP', letters: ['C', 'A', 'N', 'D'], colors: C4('#F472B6', '#FDE047', '#A78BFA', '#38BDF8') },
      { name: 'STAR', role: 'MULTIBALL', kind: 'STANDUP', letters: ['S', 'T', 'A', 'R'], colors: C4('#FDE047', '#F472B6', '#38BDF8', '#A78BFA') },
      { name: 'POP', role: 'KICKBACK', kind: 'DROP', letters: ['P', 'O', 'P'], colors: C4('#F472B6', '#FDE047', '#A78BFA', '#38BDF8') },
      { name: 'KISS', role: 'JACKPOT_BOOST', kind: 'STANDUP', letters: ['K', 'I', 'S'], colors: C4('#FFFFFF', '#F472B6', '#FDE047', '#A78BFA') },
    ],
    lockName: 'BOÎTE À BIJOUX', lockColor: '#FDE047', vukName: 'PUITS DE RUBAN', vukExitRight: true,
    lockSide: 'RIGHT',
    litBumperRotate: true,
    missionDescs: ['Franchir 2 rampes ornées de rubans', 'Frapper 5 fois le bumper doré (×3, il change à chaque touche)', 'Toucher 4 cibles ou puits pour le bonus final'],
    spinners: ['ROUE PAPILLON', 'ROUE ÉTOILE'],
    missions: ['RUBANS', 'CŒURS', 'ÉTOILES'], missionColors: ['#F472B6', '#EF4444', '#FDE047'],
    rules: [
      'Le ruban rose à gauche et l’arc-en-ciel à droite ramènent la bille en haut des couloirs.',
      'Quatre bumpers en losange : deux cœurs, une étoile et le grand cœur central.',
      'C-A-N-D monte le Bonus, S-T-A-R lance le Multibille, P-O-P rallume les Kickbacks.',
      'Verrouillez 2 billes dans la Boîte à Bijoux ou complétez S-T-A-R pour libérer 3 billes !',
    ],
  }),
  build({
    id: 'bonbons', prefix: 'bon',
    name: 'Bonbons', subtitle: 'Confiserie, Sucettes & Réglisse',
    badge: '2 Flippers · Boutique de Bonbons', env: 'Confiserie · Sucettes & Caramels',
    desc: 'Six bumpers gourmands en deux rangées au-dessus du comptoir, des rampes en sucre d’orge et un grand bocal central qui garde les billes.',
    multiball: 'MULTIBILLE BOCAL', jackpot: 'SUPER CARAMEL', skill: 'TIR SUCETTE', gravity: 318,
    palette: {
      bgPrimary: '#134E4A', bgSecondary: '#2DD4BF', cabinetFrame: '#FB7185', cabinetHighlight: '#FFF1F2',
      wallMetal: '#FDA4AF', wallHighlight: '#FFFFFF', accentPrimary: '#FB7185', accentSecondary: '#FACC15', accentWarm: '#E11D48',
      flipperTop: '#FFF1F2', flipperSkirt: '#BE123C', slingshotMain: '#E11D48', slingshotAccent: '#FACC15',
      hudBg: '#052E2B', hudBorder: '#FB7185', hudDigits: '#FEF08A', hudStyle: 'CYBER_AKA', ballTint: '#FFF7ED',
    },
    bumpers: [
      [84, 130, 2000, 'CARAMEL', 'GOLD', 'SUN'], [142, 130, 2000, 'FRAISE', 'RED', 'SUN'],
      [66, 172, 2000, 'MENTHE', 'JADE', 'SUN'], [160, 172, 2000, 'MYRTILLE', 'BLUE', 'SUN'],
      [113, 160, 2200, 'GUIMAUVE', 'RED', 'SUN'], [113, 210, 2600, 'RÉGLISSE', 'GOLD', 'SUN'],
    ],
    rampNames: ['SUCRE D’ORGE', 'TOBOGGAN CARAMEL'], rampColors: ['#FB7185', '#FFFFFF', '#FACC15', '#FFFFFF'],
    rampStyles: ['MOLDED_ACRYLIC', 'MOLDED_ACRYLIC'], rollovers: ['Y', 'U', 'M', '!', '●', '●'],
    rampPaths: [[[30, 270], [30, 200], [54, 140]], [[196, 262], [198, 196], [172, 142]]],
    banks: [
      { name: 'SUCRE', role: 'MULTIPLIER', kind: 'DROP', letters: ['S', 'U', 'C', 'R'], colors: C4('#FB7185', '#FACC15', '#2DD4BF', '#A78BFA') },
      { name: 'BOCAL', role: 'MULTIBALL', kind: 'STANDUP', letters: ['B', 'O', 'C', 'A'], colors: C4('#FACC15', '#FB7185', '#A78BFA', '#2DD4BF') },
      { name: 'MIEL', role: 'KICKBACK', kind: 'DROP', letters: ['M', 'I', 'L'], colors: C4('#FB7185', '#FACC15', '#2DD4BF', '#A78BFA') },
      { name: 'POP', role: 'JACKPOT_BOOST', kind: 'STANDUP', letters: ['P', 'O', 'P'], colors: C4('#FFFFFF', '#FB7185', '#FACC15', '#2DD4BF') },
    ],
    lockName: 'GRAND BOCAL', lockColor: '#FACC15', vukName: 'PUITS DU COMPTOIR', vukExitRight: false,
    lockSide: 'LEFT',
    hunt: {
      kind: 'LOLLIPOP', name: 'SUCETTE', radius: 8, points: 3000, goal: 4, reward: 40000, sequential: false, color: '#FB7185',
      slots: [{ x: 76, y: 236 }, { x: 150, y: 236 }, { x: 113, y: 252 }, { x: 70, y: 300 }, { x: 156, y: 300 }],
    },
    missionDescs: ['Franchir 2 rampes de sucre', 'Frapper 5 fois les bumpers gourmands', 'Croquer 4 sucettes qui sautent de place'],
    spinners: ['ROUE SUCETTE', 'ROUE CARAMEL'],
    missions: ['SUCRES', 'GOURMAND', 'BOCAL'], missionColors: ['#FB7185', '#FACC15', '#2DD4BF'],
    rules: [
      'Le sucre d’orge à gauche et le toboggan de caramel à droite ramènent la bille en haut.',
      'Six bumpers gourmands : deux rangées de trois autour de la guimauve, plus la réglisse centrale.',
      'S-U-C-R monte le Bonus, B-O-C-A lance le Multibille, M-I-L rallume les Kickbacks.',
      'Verrouillez 2 billes dans le Grand Bocal ou complétez B-O-C-A pour libérer 3 billes !',
    ],
  }),
  build({
    id: 'train', prefix: 'tra',
    name: 'Train', subtitle: 'Rails, Vapeur & Express de Nuit',
    badge: '2 Flippers · Gare Ferroviaire', env: 'Chemins de Fer · Vapeur & Signaux',
    desc: 'La grande gare : trois bumpers sur la diagonale de la locomotive, un aiguillage central, des rails qui montent à gauche et à droite et un puits d’eau pour les chaudières.',
    multiball: 'MULTIBILLE EXPRESS', jackpot: 'SUPER LOCOMOTIVE', skill: 'DÉPART DE QUAI', gravity: 322,
    palette: {
      bgPrimary: '#0F172A', bgSecondary: '#1E3A5F', cabinetFrame: '#A16207', cabinetHighlight: '#FEF3C7',
      wallMetal: '#94A3B8', wallHighlight: '#F1F5F9', accentPrimary: '#F59E0B', accentSecondary: '#E2E8F0', accentWarm: '#DC2626',
      flipperTop: '#F1F5F9', flipperSkirt: '#334155', slingshotMain: '#B91C1C', slingshotAccent: '#E2E8F0',
      hudBg: '#0B1220', hudBorder: '#F59E0B', hudDigits: '#FDE68A', hudStyle: 'LED_7SEG', ballTint: '#E2E8F0',
    },
    bumpers: [
      [78, 124, 2000, 'LANTERNE', 'GOLD', 'GEAR'], [113, 154, 2200, 'PISTON', 'RED', 'GEAR'],
      [148, 184, 2000, 'SIGNAL', 'BLUE', 'GEAR'], [84, 204, 2600, 'CHAUDIÈRE', 'GOLD', 'GEAR'],
    ],
    rampNames: ['VOIE 1', 'VOIE 2'], rampColors: ['#94A3B8', '#F59E0B', '#94A3B8', '#E2E8F0'],
    rampStyles: ['WIREFORM_RAIL', 'WIREFORM_RAIL'], rollovers: ['G', 'A', 'R', 'E', '►', '◄'],
    rampPaths: [[[36, 260], [36, 200], [36, 138]], [[190, 260], [190, 200], [190, 138]]],
    banks: [
      { name: 'RAIL', role: 'MULTIPLIER', kind: 'DROP', letters: ['R', 'A', 'I', 'L'], colors: C4('#F59E0B', '#DC2626', '#E2E8F0', '#16A34A') },
      { name: 'TRAIN', role: 'MULTIBALL', kind: 'STANDUP', letters: ['T', 'R', 'A', 'I'], colors: C4('#DC2626', '#F59E0B', '#16A34A', '#E2E8F0') },
      { name: 'VAP', role: 'KICKBACK', kind: 'DROP', letters: ['V', 'A', 'P'], colors: C4('#E2E8F0', '#F59E0B', '#DC2626', '#16A34A') },
      { name: 'EXP', role: 'JACKPOT_BOOST', kind: 'STANDUP', letters: ['E', 'X', 'P'], colors: C4('#F59E0B', '#E2E8F0', '#DC2626', '#16A34A') },
    ],
    lockName: 'DÉPÔT DES LOCOS', lockColor: '#F59E0B', vukName: 'PUITS D’EAU', vukExitRight: true,
    lockSide: 'RIGHT',
    hunt: {
      kind: 'LOCOMOTIVE', name: 'LOCOMOTIVE', radius: 9, points: 3000, goal: 4, reward: 45000, sequential: true, color: '#F59E0B',
      slots: [{ x: 84, y: 244 }, { x: 113, y: 252 }, { x: 142, y: 244 }, { x: 142, y: 296 }, { x: 113, y: 288 }, { x: 84, y: 296 }],
    },
    missionDescs: ['Franchir 2 voies pour monter en gare', 'Frapper 5 fois les bumpers de la locomotive', 'Arrêter 4 fois la locomotive : elle avance d’un cran à chaque arrêt'],
    spinners: ['ROUE MOTRICE', 'ROUE D’AIGUILLAGE'],
    missions: ['VOIES', 'VAPEUR', 'EXPRESS'], missionColors: ['#94A3B8', '#E2E8F0', '#F59E0B'],
    rules: [
      'La voie 1 à gauche et la voie 2 à droite sont deux rails chromés qui montent aux couloirs du haut.',
      'Quatre bumpers : lanterne, piston et signal sur la diagonale de la locomotive, plus la chaudière.',
      'R-A-I-L monte le Bonus, T-R-A-I lance le Multibille, V-A-P rallume les Kickbacks.',
      'Verrouillez 2 billes dans le Dépôt des Locos ou complétez T-R-A-I pour libérer 3 billes !',
    ],
  }),
];
