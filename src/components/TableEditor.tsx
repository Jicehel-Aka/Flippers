import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Music,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { MUSIC_THEME_META, musicEngine } from '../audio/musicEngine';
import { soundEngine } from '../audio/soundEngine';
import {
  BUILTIN_TABLES,
  PINBALL_TABLES,
  checkAkaFirmwareCompatibility,
  cloneTableDef,
  createNewCustomTable,
  deleteCustomTableDefinition,
  duplicateTableDefinition,
  importTablesJson,
  isBuiltinTableId,
  isTableModified,
  resetTableDefinition,
  saveTableDefinition,
  serializeCatalogToJson,
  serializeTableToJson,
} from '../data/tables';
import { PinballCanvasRenderer } from '../engine/renderer';
import {
  BUILTIN_THEME_IDS,
  BuiltinThemeId,
  BumperColorStyle,
  BumperDef,
  BumperIconStyle,
  FlipperDef,
  HuntDef,
  InteractiveToyDef,
  InteractiveToyKind,
  InteractiveToyVisual,
  MissionEventKind,
  PinballTableDef,
  RampDef,
  RolloverDef,
  SCREEN_WIDTH,
  ScoopVukDef,
  SpinnerDef,
  TableThemeId,
  TargetDef,
  UpperPlayfieldStyle,
  WORLD_HEIGHT,
  resolveDecorTheme,
  resolveMusicTheme,
} from '../types/pinball';

type EditorTool =
  | 'SELECT'
  | 'ADD_BUMPER'
  | 'ADD_TARGET'
  | 'ADD_TARGET_BANK'
  | 'ADD_RAMP'
  | 'ADD_FLIPPER'
  | 'ADD_TOY'
  | 'ADD_SPINNER'
  | 'ADD_SCOOP'
  | 'ADD_ROLLOVER'
  | 'ADD_WALL'
  | 'ADD_PEG';

type InspectorTab = 'element' | 'theme' | 'missions';

type SelectedEntity =
  | { kind: 'bumper'; index: number }
  | { kind: 'target'; index: number }
  | { kind: 'ramp'; index: number; pointIndex: number }
  | { kind: 'flipper'; index: number }
  | { kind: 'toy'; index: number }
  | { kind: 'upperDeck'; vertexIndex: number }
  | { kind: 'spinner'; index: number }
  | { kind: 'scoop'; index: number }
  | { kind: 'rollover'; index: number }
  | { kind: 'wall'; index: number }
  | { kind: 'peg'; index: number }
  | { kind: 'housing'; index: number; vertexIndex: number }
  | { kind: 'emblem' }
  | { kind: 'huntSlot'; slotIndex: number };

type DragHandle =
  | { kind: 'bumper'; index: number }
  | { kind: 'targetMid'; index: number; dx1: number; dy1: number; dx2: number; dy2: number }
  | { kind: 'targetP1'; index: number }
  | { kind: 'targetP2'; index: number }
  | { kind: 'rampPoint'; index: number; pointIndex: number }
  | { kind: 'flipper'; index: number }
  | { kind: 'toy'; index: number }
  | { kind: 'upperDeckVertex'; vertexIndex: number }
  | { kind: 'spinner'; index: number }
  | { kind: 'scoop'; index: number }
  | { kind: 'scoopEject'; index: number }
  | { kind: 'rollover'; index: number }
  | { kind: 'wallMid'; index: number; dx1: number; dy1: number; dx2: number; dy2: number }
  | { kind: 'wallP1'; index: number }
  | { kind: 'wallP2'; index: number }
  | { kind: 'peg'; index: number }
  | { kind: 'housingVertex'; index: number; vertexIndex: number }
  | { kind: 'emblem' }
  | { kind: 'huntSlot'; slotIndex: number };

const DECOR_THEME_LABELS: Record<BuiltinThemeId, string> = {
  aka_esp32: 'Gamebuino AKA · Cyber-Circuit ESP32',
  space_odyssey: 'Odyssée Spatiale · Apollo & Saturne',
  star_galaxy: 'Star Galaxy · Tranchée & Sabres',
  solaire: 'Temple Solaire · Jade & Quetzal',
  classique: 'Flipper Classique · Électromécanique 60s',
  prehistoire: 'Préhistoire · Volcan & Fossiles',
  farwest: 'Far West · Canyon, Saloon & Shérif',
  halloween: 'Halloween · Manoir & Citrouilles',
  candy: 'Candy Pop · Manga Pastel & Ruban',
  bonbons: 'Bonbons · Confiserie & Sucre d’orge',
  train: 'Train Express · Vapeur & Sémaphore',
  crypte: 'Crypte · Rosace Gothique & Givre',
};

const BUMPER_COLOR_OPTIONS: { id: BumperColorStyle; label: string; hex: string }[] = [
  { id: 'RED', label: 'Rouge Rubis', hex: '#DC2626' },
  { id: 'BLUE', label: 'Bleu Cobalt', hex: '#2563EB' },
  { id: 'GOLD', label: 'Or Ambré', hex: '#F59E0B' },
  { id: 'JADE', label: 'Jade Émeraude', hex: '#059669' },
  { id: 'PURPLE', label: 'Violet Mystique', hex: '#9333EA' },
  { id: 'ORANGE', label: 'Orange Lave', hex: '#EA580C' },
  { id: 'PINK', label: 'Rose Pop', hex: '#EC4899' },
  { id: 'ICE', label: 'Glace Polaire', hex: '#0284C7' },
];

const BUMPER_ICON_OPTIONS: { id: BumperIconStyle; label: string }[] = [
  { id: 'GEAR', label: 'Engrenage Cyber' },
  { id: 'CHIP', label: 'Puce ESP32' },
  { id: 'STAR', label: 'Étoile Arcade' },
  { id: 'PLANET', label: 'Planète Anneau' },
  { id: 'TURRET', label: 'Tourelle Laser' },
  { id: 'CREST', label: 'Emblème Galactique' },
  { id: 'SUN', label: 'Soleil Aztèque' },
  { id: 'TOTEM', label: 'Masque Totem' },
  { id: 'VINTAGE_CAP', label: 'Cabochon Rétro 60s' },
  { id: 'VOLCANO', label: 'Volcan en Éruption' },
  { id: 'DINO_EGG', label: 'Œuf Préhistorique' },
  { id: 'SKULL', label: 'Crâne Fossile' },
  { id: 'SHERIFF', label: 'Étoile de Shérif' },
  { id: 'BARREL', label: 'Tonneau de Saloon' },
  { id: 'WHEEL', label: 'Roue de Locomotive / Chariot' },
  { id: 'PUMPKIN', label: 'Citrouille Halloween' },
  { id: 'BAT', label: 'Chauve-Souris' },
  { id: 'HEART', label: 'Cœur Scintillant' },
  { id: 'RIBBON', label: 'Nœud de Ruban' },
  { id: 'SWIRL_CANDY', label: 'Sucette Spirale' },
  { id: 'PEPPERMINT', label: 'Bonbon Rayé Menthe' },
  { id: 'LANTERN', label: 'Lanterne du Chef de Gare' },
  { id: 'TOMBSTONE', label: 'Stèle Gothique RIP' },
  { id: 'RUNE', label: 'Rune Cristalline' },
];

const HUNT_KIND_OPTIONS: { id: HuntDef['kind']; label: string }[] = [
  { id: 'MAMMOTH', label: 'Mammouth (Préhistoire)' },
  { id: 'WANTED', label: 'Avis WANTED (Far West)' },
  { id: 'GHOST', label: 'Fantôme (Halloween)' },
  { id: 'LOLLIPOP', label: 'Sucette (Bonbons)' },
  { id: 'LOCOMOTIVE', label: 'Locomotive (Train — séquentiel)' },
  { id: 'ZOMBIE', label: 'Zombie (Crypte)' },
];

const TOY_KIND_OPTIONS: { id: InteractiveToyKind; label: string }[] = [
  { id: 'BASH_TOY', label: 'Cible physique à recul (Bash Toy)' },
  { id: 'TURNTABLE', label: 'Disque / Roue tournante (Turntable)' },
  { id: 'SWING_DOORS', label: 'Portes battantes traversables' },
  { id: 'GRAVITY_WELL', label: 'Anneau gravitationnel (Vortex)' },
  { id: 'SLIDING_CRYPT', label: 'Sarcophage / Dalle coulissante' },
  { id: 'ROTO_TARGET', label: 'Roto-cloche étoilée 60s' },
];

const TOY_VISUAL_OPTIONS: { id: InteractiveToyVisual; label: string }[] = [
  { id: 'ESP32_CHIP', label: 'Processeur ESP32-S3' },
  { id: 'SATURN_RING', label: 'Anneaux de Saturne' },
  { id: 'DEATH_STAR_CORE', label: 'Réacteur Étoile Noire' },
  { id: 'SUN_WHEEL', label: 'Disque Solaire Aztèque' },
  { id: 'EM_ROTO_BELL', label: 'Roto-Cloche Électromécanique' },
  { id: 'VOLCANO', label: 'Cratère de Volcan' },
  { id: 'SALOON_DOORS', label: 'Portes de Saloon' },
  { id: 'PUMPKIN_KING', label: 'Roi Citrouille Halloween' },
  { id: 'RIBBON_VORTEX', label: 'Bonbonnière Kawaii Vitrée' },
  { id: 'LOLLIPOP_WHEEL', label: 'Grande Roue Sucette' },
  { id: 'RAIL_TURNTABLE', label: 'Plaque Tournante Ferroviaire' },
  { id: 'SARCOPHAGUS', label: 'Sarcophage Runique' },
];

const UPPER_DECK_STYLE_OPTIONS: { id: UpperPlayfieldStyle; label: string }[] = [
  { id: 'CYBER_GLASS', label: 'Mezzanine PCB Vitrée (AKA)' },
  { id: 'STONE_TERRACE', label: 'Terrasse de Jade & Or (Solaire)' },
  { id: 'WOOD_BALCONY', label: 'Balcon en Bois Verni (Saloon)' },
  { id: 'GOTHIC_GALLERY', label: 'Galerie Gothique (Manoir)' },
  { id: 'SWEET_LOFT', label: 'Mezzanine Pâtissière Pastel' },
];

const TOOL_ITEMS: { id: EditorTool; label: string }[] = [
  { id: 'SELECT', label: 'Sélection / Déplacer' },
  { id: 'ADD_BUMPER', label: '+ Bumper' },
  { id: 'ADD_TARGET', label: '+ Cible' },
  { id: 'ADD_TARGET_BANK', label: '+ Banque ×3' },
  { id: 'ADD_RAMP', label: '+ Rampe 3D' },
  { id: 'ADD_FLIPPER', label: '+ Flipper sup.' },
  { id: 'ADD_TOY', label: '+ Décor interactif' },
  { id: 'ADD_SPINNER', label: '+ Spinner' },
  { id: 'ADD_SCOOP', label: '+ Puits / Lock' },
  { id: 'ADD_ROLLOVER', label: '+ Rollover' },
  { id: 'ADD_WALL', label: '+ Mur' },
  { id: 'ADD_PEG', label: '+ Plot' },
];

function recomputeRampEntryFromPath(ramp: RampDef): RampDef {
  if (ramp.path.length < 2) return ramp;
  const p0 = ramp.path[0];
  const p1 = ramp.path[1];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    ...ramp,
    entry: { x: Math.round(p0.x), y: Math.round(p0.y) },
    entryDir: {
      x: Number((dx / len).toFixed(3)),
      y: Number((dy / len).toFixed(3)),
    },
  };
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface TableEditorProps {
  initialTableId: TableThemeId;
  onPlayTable: (tableId: TableThemeId) => void;
  onCatalogChanged: (activeTableId: TableThemeId) => void;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  initialTableId,
  onPlayTable,
  onCatalogChanged,
}) => {
  const [selectedTableId, setSelectedTableId] = useState<string>(() => {
    const exists = PINBALL_TABLES.some((t) => t.id === initialTableId);
    return exists ? initialTableId : PINBALL_TABLES[0].id;
  });

  const [draft, setDraft] = useState<PinballTableDef>(() => {
    const found = PINBALL_TABLES.find((t) => t.id === initialTableId) ?? PINBALL_TABLES[0];
    return cloneTableDef(found);
  });

  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<EditorTool>('SELECT');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('element');
  const [selected, setSelected] = useState<SelectedEntity | null>({ kind: 'bumper', index: 0 });
  const [snapStep, setSnapStep] = useState<0 | 2 | 4>(2);
  const [showHandles, setShowHandles] = useState(true);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  // Modales / tiroirs inline sans window.prompt / window.confirm
  const [showNewDrawer, setShowNewDrawer] = useState(false);
  const [newTableName, setNewTableName] = useState('Mon Flipper Maison');
  const [newTableTheme, setNewTableTheme] = useState<BuiltinThemeId>('classique');
  const [showPasteDrawer, setShowPasteDrawer] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState('');
  const [confirmAction, setConfirmAction] = useState<'reset' | 'delete' | null>(null);
  const [previewingMusic, setPreviewingMusic] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rendererRef = useRef<PinballCanvasRenderer | null>(null);
  const dragRef = useRef<DragHandle | null>(null);

  if (!rendererRef.current) {
    rendererRef.current = new PinballCanvasRenderer();
  }

  const notifyStatus = useCallback((tone: 'ok' | 'err', text: string) => {
    setStatusMsg({ tone, text });
  }, []);

  // Coupe l'aperçu musical quand on quitte l'éditeur
  useEffect(() => {
    return () => {
      musicEngine.setEditorPreview(null, null);
    };
  }, []);

  // Synchronise le thème musical en écoute directe si l'aperçu audio est actif
  useEffect(() => {
    if (previewingMusic) {
      const mTheme = resolveMusicTheme(draft);
      musicEngine.setEditorPreview(mTheme, soundEngine.unlockAndGetContext());
    }
  }, [draft.musicTheme, draft.decorTheme, draft, previewingMusic]);

  const loadTableIntoEditor = useCallback((id: string) => {
    const found = PINBALL_TABLES.find((t) => t.id === id) ?? PINBALL_TABLES[0];
    setSelectedTableId(found.id);
    setDraft(cloneTableDef(found));
    setDirty(false);
    setConfirmAction(null);
    setSelected(found.bumpers.length > 0 ? { kind: 'bumper', index: 0 } : null);
  }, []);

  const updateDraft = useCallback(
    (mutator: (next: PinballTableDef) => void) => {
      setDraft((prev) => {
        const next = cloneTableDef(prev);
        mutator(next);
        return next;
      });
      setDirty(true);
      setConfirmAction(null);
    },
    []
  );

  const snapCoord = useCallback(
    (v: number) => (snapStep > 0 ? Math.round(v / snapStep) * snapStep : Math.round(v)),
    [snapStep]
  );

  // Rendu continu 240x520 (échelle x2 = 480x1040) avec poignées vectorielles interactives
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = canvas.width / SCREEN_WIDTH; // 2.0
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);

    try {
      renderer.renderDraftPlayfield(ctx, draft, 1.8);
    } catch (err) {
      console.error('Erreur de rendu brouillon dans TableEditor :', err);
      ctx.fillStyle = '#0B0E15';
      ctx.fillRect(0, 0, SCREEN_WIDTH, WORLD_HEIGHT);
    }

    // Grille d'aide au placement
    if (snapStep > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
      ctx.lineWidth = 0.35;
      const gridStep = snapStep === 2 ? 16 : 20;
      for (let x = gridStep; x < SCREEN_WIDTH; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
        ctx.stroke();
      }
      for (let y = gridStep; y < WORLD_HEIGHT; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(SCREEN_WIDTH, y);
        ctx.stroke();
      }
      // Couloir lanceur réservé (x >= 216)
      ctx.fillStyle = 'rgba(2, 6, 23, 0.16)';
      ctx.fillRect(216, 60, 24, WORLD_HEIGHT - 60);
      ctx.restore();
    }

    if (showHandles) {
      ctx.save();

      // 1. Murs supplémentaires
      draft.extraWalls.forEach((w, idx) => {
        const isSel = selected?.kind === 'wall' && selected.index === idx;
        ctx.strokeStyle = isSel ? '#FACC15' : '#38BDF8';
        ctx.lineWidth = isSel ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();
        for (const [px, py] of [
          [w.x1, w.y1],
          [w.x2, w.y2],
        ]) {
          ctx.fillStyle = isSel ? '#FACC15' : '#0EA5E9';
          ctx.fillRect(px - 2.3, py - 2.3, 4.6, 4.6);
        }
      });

      // 2. Îlots biseautés
      draft.beveledHousings.forEach((h, hIdx) => {
        const isSel = selected?.kind === 'housing' && selected.index === hIdx;
        if (h.points.length >= 3) {
          ctx.strokeStyle = isSel ? '#FACC15' : 'rgba(148, 163, 184, 0.55)';
          ctx.lineWidth = isSel ? 1.4 : 0.8;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.moveTo(h.points[0].x, h.points[0].y);
          for (let i = 1; i < h.points.length; i++) ctx.lineTo(h.points[i].x, h.points[i].y);
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (isSel) {
          h.points.forEach((pt, vIdx) => {
            const activeV = selected.vertexIndex === vIdx;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, activeV ? 3.5 : 2.6, 0, Math.PI * 2);
            ctx.fillStyle = activeV ? '#FACC15' : '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#090D16';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
      });

      // 3. Points de contrôle des rampes + vecteur d'entrée
      draft.ramps.forEach((r, rIdx) => {
        const isSel = selected?.kind === 'ramp' && selected.index === rIdx;
        ctx.strokeStyle = isSel ? '#FACC15' : 'rgba(250, 204, 21, 0.45)';
        ctx.lineWidth = isSel ? 1.2 : 0.75;
        ctx.setLineDash([2.5, 2.5]);
        ctx.beginPath();
        r.path.forEach((pt, pIdx) => {
          if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Flèche d'entrée
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(r.entry.x, r.entry.y);
        ctx.lineTo(r.entry.x + r.entryDir.x * 14, r.entry.y + r.entryDir.y * 14);
        ctx.stroke();

        r.path.forEach((pt, pIdx) => {
          const isPtSel = isSel && selected.pointIndex === pIdx;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isPtSel ? 4.2 : 3.0, 0, Math.PI * 2);
          ctx.fillStyle = pIdx === 0 ? '#22C55E' : isPtSel ? '#FACC15' : '#F8FAFC';
          ctx.fill();
          ctx.strokeStyle = '#090D16';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      });

      // 4. Puits / Verrous + cible d'éjection ejectTo
      draft.scoops.forEach((s, idx) => {
        const isSel = selected?.kind === 'scoop' && selected.index === idx;
        if (isSel) {
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 1;
          ctx.setLineDash([2.5, 2.5]);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.ejectTo.x, s.ejectTo.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.save();
          ctx.translate(s.ejectTo.x, s.ejectTo.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
          ctx.strokeStyle = '#090D16';
          ctx.lineWidth = 1;
          ctx.strokeRect(-3.2, -3.2, 6.4, 6.4);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = isSel ? '#FACC15' : 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = isSel ? 1.8 : 0.9;
        ctx.stroke();
      });

      // 5. Bumpers
      draft.bumpers.forEach((b, idx) => {
        if (selected?.kind === 'bumper' && selected.index === idx) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // 6. Cibles
      draft.targets.forEach((t, idx) => {
        const isSel = selected?.kind === 'target' && selected.index === idx;
        if (isSel) {
          const mx = (t.x1 + t.x2) * 0.5;
          const my = (t.y1 + t.y2) * 0.5;
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(
            Math.min(t.x1, t.x2) - 3,
            Math.min(t.y1, t.y2) - 3,
            Math.abs(t.x2 - t.x1) + 6,
            Math.abs(t.y2 - t.y1) + 6
          );
          ctx.fillStyle = '#FACC15';
          ctx.fillRect(t.x1 - 2.2, t.y1 - 2.2, 4.4, 4.4);
          ctx.fillRect(t.x2 - 2.2, t.y2 - 2.2, 4.4, 4.4);
          ctx.beginPath();
          ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        }
      });

      // 7. Flippers supplémentaires (angles en radians)
      draft.extraFlippers.forEach((f, idx) => {
        const isSel = selected?.kind === 'flipper' && selected.index === idx;
        const rad = Math.abs(f.restAngle) > 6.5 ? (f.restAngle * Math.PI) / 180 : f.restAngle;
        const tipX = f.pivot.x + Math.cos(rad) * f.length;
        const tipY = f.pivot.y + Math.sin(rad) * f.length;
        ctx.strokeStyle = isSel ? '#FACC15' : 'rgba(250, 204, 21, 0.7)';
        ctx.lineWidth = isSel ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.moveTo(f.pivot.x, f.pivot.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(f.pivot.x, f.pivot.y, isSel ? 4.2 : 3.0, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? '#FACC15' : '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // 7b. Étage supérieur (Upper Playfield) + sommets éditables
      if (draft.upperPlayfield && draft.upperPlayfield.bounds.length >= 3) {
        const up = draft.upperPlayfield;
        const isDeckSel = selected?.kind === 'upperDeck';
        ctx.strokeStyle = isDeckSel ? '#FACC15' : 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = isDeckSel ? 1.8 : 1.1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(up.bounds[0].x, up.bounds[0].y);
        for (let i = 1; i < up.bounds.length; i++) ctx.lineTo(up.bounds[i].x, up.bounds[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        up.bounds.forEach((pt, vIdx) => {
          const isVertSel = isDeckSel && selected.vertexIndex === vIdx;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isVertSel ? 4.2 : 3.0, 0, Math.PI * 2);
          ctx.fillStyle = isVertSel ? '#FACC15' : '#38BDF8';
          ctx.fill();
          ctx.strokeStyle = '#090D16';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      // 7c. Décors interactifs (Interactive Toys)
      (draft.interactiveToys ?? []).forEach((toy, idx) => {
        const isSel = selected?.kind === 'toy' && selected.index === idx;
        ctx.beginPath();
        ctx.arc(toy.x, toy.y, toy.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = isSel ? '#FACC15' : 'rgba(244, 114, 182, 0.75)';
        ctx.lineWidth = isSel ? 2 : 1.1;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 8. Spinners, Rollovers, Plots, Médaillon & Cibles mobiles
      draft.spinners.forEach((sp, idx) => {
        if (selected?.kind === 'spinner' && selected.index === idx) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.width * 0.6 + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      });

      draft.rollovers.forEach((ro, idx) => {
        if (selected?.kind === 'rollover' && selected.index === idx) {
          ctx.beginPath();
          ctx.arc(ro.x, ro.y, ro.radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      });

      draft.extraPegs.forEach((pg, idx) => {
        const isSel = selected?.kind === 'peg' && selected.index === idx;
        ctx.beginPath();
        ctx.arc(pg.x, pg.y, pg.radius + (isSel ? 3 : 1.2), 0, Math.PI * 2);
        ctx.strokeStyle = isSel ? '#FACC15' : 'rgba(248, 250, 252, 0.5)';
        ctx.lineWidth = isSel ? 1.8 : 0.8;
        ctx.stroke();
      });

      if (selected?.kind === 'emblem') {
        ctx.beginPath();
        ctx.arc(draft.missionEmblemPos.x, draft.missionEmblemPos.y, 17, 0, Math.PI * 2);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      if (draft.hunt) {
        draft.hunt.slots.forEach((sl, sIdx) => {
          const isSel = selected?.kind === 'huntSlot' && selected.slotIndex === sIdx;
          ctx.beginPath();
          ctx.arc(sl.x, sl.y, isSel ? 5.2 : 3.4, 0, Math.PI * 2);
          ctx.fillStyle = isSel ? '#FACC15' : draft.hunt!.color;
          ctx.fill();
          ctx.strokeStyle = '#090D16';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      ctx.restore();
    }

    ctx.restore();
  }, [draft, selected, showHandles, snapStep]);

  const clientToPlayfield = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SCREEN_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
    return {
      x: Math.max(8, Math.min(SCREEN_WIDTH - 8, x)),
      y: Math.max(12, Math.min(WORLD_HEIGHT - 12, y)),
    };
  };

  const findHitAt = (wx: number, wy: number): { sel: SelectedEntity; drag: DragHandle } | null => {
    // Priorité aux poignées fines de l'élément déjà sélectionné
    if (selected?.kind === 'scoop') {
      const s = draft.scoops[selected.index];
      if (s && Math.hypot(wx - s.ejectTo.x, wy - s.ejectTo.y) <= 7.5) {
        return { sel: selected, drag: { kind: 'scoopEject', index: selected.index } };
      }
    }
    if (selected?.kind === 'target') {
      const t = draft.targets[selected.index];
      if (t) {
        if (Math.hypot(wx - t.x1, wy - t.y1) <= 6) {
          return { sel: selected, drag: { kind: 'targetP1', index: selected.index } };
        }
        if (Math.hypot(wx - t.x2, wy - t.y2) <= 6) {
          return { sel: selected, drag: { kind: 'targetP2', index: selected.index } };
        }
      }
    }
    if (selected?.kind === 'wall') {
      const w = draft.extraWalls[selected.index];
      if (w) {
        if (Math.hypot(wx - w.x1, wy - w.y1) <= 6) {
          return { sel: selected, drag: { kind: 'wallP1', index: selected.index } };
        }
        if (Math.hypot(wx - w.x2, wy - w.y2) <= 6) {
          return { sel: selected, drag: { kind: 'wallP2', index: selected.index } };
        }
      }
    }

    // Points de rampe
    for (let rIdx = 0; rIdx < draft.ramps.length; rIdx++) {
      const r = draft.ramps[rIdx];
      for (let pIdx = 0; pIdx < r.path.length; pIdx++) {
        if (Math.hypot(wx - r.path[pIdx].x, wy - r.path[pIdx].y) <= 6.5) {
          return {
            sel: { kind: 'ramp', index: rIdx, pointIndex: pIdx },
            drag: { kind: 'rampPoint', index: rIdx, pointIndex: pIdx },
          };
        }
      }
    }

    // Emplacements cible mobile
    if (draft.hunt) {
      for (let i = 0; i < draft.hunt.slots.length; i++) {
        const sl = draft.hunt.slots[i];
        if (Math.hypot(wx - sl.x, wy - sl.y) <= 7) {
          return {
            sel: { kind: 'huntSlot', slotIndex: i },
            drag: { kind: 'huntSlot', slotIndex: i },
          };
        }
      }
    }

    // Sommets de l'étage supérieur
    if (draft.upperPlayfield) {
      for (let vIdx = 0; vIdx < draft.upperPlayfield.bounds.length; vIdx++) {
        const pt = draft.upperPlayfield.bounds[vIdx];
        if (Math.hypot(wx - pt.x, wy - pt.y) <= 7) {
          return {
            sel: { kind: 'upperDeck', vertexIndex: vIdx },
            drag: { kind: 'upperDeckVertex', vertexIndex: vIdx },
          };
        }
      }
    }

    // Décors interactifs
    const toys = draft.interactiveToys ?? [];
    for (let i = toys.length - 1; i >= 0; i--) {
      const toy = toys[i];
      if (Math.hypot(wx - toy.x, wy - toy.y) <= Math.min(18, toy.radius + 2)) {
        return { sel: { kind: 'toy', index: i }, drag: { kind: 'toy', index: i } };
      }
    }

    // Flippers supplémentaires
    for (let i = 0; i < draft.extraFlippers.length; i++) {
      const f = draft.extraFlippers[i];
      if (Math.hypot(wx - f.pivot.x, wy - f.pivot.y) <= 8) {
        return { sel: { kind: 'flipper', index: i }, drag: { kind: 'flipper', index: i } };
      }
    }

    // Bumpers
    for (let i = draft.bumpers.length - 1; i >= 0; i--) {
      const b = draft.bumpers[i];
      if (Math.hypot(wx - b.x, wy - b.y) <= b.radius + 3) {
        return { sel: { kind: 'bumper', index: i }, drag: { kind: 'bumper', index: i } };
      }
    }

    // Puits / Verrous
    for (let i = 0; i < draft.scoops.length; i++) {
      const s = draft.scoops[i];
      if (Math.hypot(wx - s.x, wy - s.y) <= s.radius + 3) {
        return { sel: { kind: 'scoop', index: i }, drag: { kind: 'scoop', index: i } };
      }
    }

    // Spinners
    for (let i = 0; i < draft.spinners.length; i++) {
      const sp = draft.spinners[i];
      if (Math.hypot(wx - sp.x, wy - sp.y) <= Math.max(9, sp.width * 0.55)) {
        return { sel: { kind: 'spinner', index: i }, drag: { kind: 'spinner', index: i } };
      }
    }

    // Rollovers
    for (let i = 0; i < draft.rollovers.length; i++) {
      const ro = draft.rollovers[i];
      if (Math.hypot(wx - ro.x, wy - ro.y) <= ro.radius + 3.5) {
        return { sel: { kind: 'rollover', index: i }, drag: { kind: 'rollover', index: i } };
      }
    }

    // Cibles (milieu ou segment)
    for (let i = 0; i < draft.targets.length; i++) {
      const t = draft.targets[i];
      const mx = (t.x1 + t.x2) * 0.5;
      const my = (t.y1 + t.y2) * 0.5;
      if (Math.hypot(wx - mx, wy - my) <= 9) {
        return {
          sel: { kind: 'target', index: i },
          drag: {
            kind: 'targetMid',
            index: i,
            dx1: t.x1 - wx,
            dy1: t.y1 - wy,
            dx2: t.x2 - wx,
            dy2: t.y2 - wy,
          },
        };
      }
    }

    // Plots
    for (let i = 0; i < draft.extraPegs.length; i++) {
      const pg = draft.extraPegs[i];
      if (Math.hypot(wx - pg.x, wy - pg.y) <= pg.radius + 4.5) {
        return { sel: { kind: 'peg', index: i }, drag: { kind: 'peg', index: i } };
      }
    }

    // Murs supplémentaires
    for (let i = 0; i < draft.extraWalls.length; i++) {
      const w = draft.extraWalls[i];
      const mx = (w.x1 + w.x2) * 0.5;
      const my = (w.y1 + w.y2) * 0.5;
      if (Math.hypot(wx - mx, wy - my) <= 10) {
        return {
          sel: { kind: 'wall', index: i },
          drag: {
            kind: 'wallMid',
            index: i,
            dx1: w.x1 - wx,
            dy1: w.y1 - wy,
            dx2: w.x2 - wx,
            dy2: w.y2 - wy,
          },
        };
      }
    }

    // Sommets d'îlots biseautés
    for (let hIdx = 0; hIdx < draft.beveledHousings.length; hIdx++) {
      const pts = draft.beveledHousings[hIdx].points;
      for (let vIdx = 0; vIdx < pts.length; vIdx++) {
        if (Math.hypot(wx - pts[vIdx].x, wy - pts[vIdx].y) <= 6.5) {
          return {
            sel: { kind: 'housing', index: hIdx, vertexIndex: vIdx },
            drag: { kind: 'housingVertex', index: hIdx, vertexIndex: vIdx },
          };
        }
      }
    }

    // Médaillon de mission central
    if (Math.hypot(wx - draft.missionEmblemPos.x, wy - draft.missionEmblemPos.y) <= 15) {
      return { sel: { kind: 'emblem' }, drag: { kind: 'emblem' } };
    }

    return null;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = clientToPlayfield(e);
    const sx = Math.min(208, snapCoord(pos.x));
    const sy = snapCoord(pos.y);

    if (tool !== 'SELECT') {
      const uid = Math.floor(100 + Math.random() * 900);
      updateDraft((next) => {
        switch (tool) {
          case 'ADD_BUMPER': {
            const newBmp: BumperDef = {
              id: `bmp_${uid}`,
              x: sx,
              y: sy,
              radius: 13,
              points: 1500,
              label: `B${next.bumpers.length + 1}`,
              colorStyle: 'GOLD',
              iconStyle: 'STAR',
            };
            next.bumpers.push(newBmp);
            setSelected({ kind: 'bumper', index: next.bumpers.length - 1 });
            break;
          }
          case 'ADD_TARGET': {
            const newTgt: TargetDef = {
              id: `tgt_${uid}`,
              bankId: 'CUSTOM_BANK',
              bankRole: 'MULTIPLIER',
              kind: 'STANDUP',
              x1: sx - 6,
              y1: sy,
              x2: sx + 6,
              y2: sy,
              letter: 'A',
              lampColor: next.palette.accentPrimary,
              points: 2000,
            };
            next.targets.push(newTgt);
            setSelected({ kind: 'target', index: next.targets.length - 1 });
            break;
          }
          case 'ADD_TARGET_BANK': {
            const bankId = `BANK_${uid}`;
            const letters = ['A', 'K', 'A'];
            letters.forEach((ltr, idx) => {
              const ox = sx - 16 + idx * 16;
              next.targets.push({
                id: `tgt_${uid}_${idx}`,
                bankId,
                bankRole: 'JACKPOT_BOOST',
                kind: 'DROP',
                x1: ox - 5,
                y1: sy,
                x2: ox + 5,
                y2: sy,
                letter: ltr,
                lampColor: next.palette.accentWarm,
                points: 2500,
              });
            });
            setSelected({ kind: 'target', index: next.targets.length - 1 });
            break;
          }
          case 'ADD_RAMP': {
            const rawRamp: RampDef = {
              id: `ramp_${uid}`,
              name: `RAMPE ${next.ramps.length + 1}`,
              style: next.ramps.length % 2 === 0 ? 'MOLDED_ACRYLIC' : 'WIREFORM_RAIL',
              entry: { x: sx, y: sy },
              entryRadius: 15,
              entryDir: { x: 0, y: -1 },
              allowSideEntry: true,
              path: [
                { x: sx, y: sy },
                { x: Math.max(24, sx - 12), y: Math.max(40, sy - 64) },
                { x: Math.min(198, sx + 22), y: Math.max(36, sy - 110) },
                { x: Math.min(200, sx + 36), y: Math.min(440, sy - 20) },
              ],
              points: 8000,
              chuteColor: next.palette.accentPrimary.slice(0, 7),
              railColor: next.palette.accentSecondary.slice(0, 7),
            };
            next.ramps.push(recomputeRampEntryFromPath(rawRamp));
            setSelected({ kind: 'ramp', index: next.ramps.length - 1, pointIndex: 0 });
            break;
          }
          case 'ADD_FLIPPER': {
            const isLeft = sx < 112;
            const newFlp: FlipperDef = {
              id: `flp_${uid}`,
              side: isLeft ? 'LEFT' : 'RIGHT',
              zone: sy < 215 ? 'UPPER' : 'MID',
              pivot: { x: sx, y: sy },
              length: 26,
              radius: 3.8,
              restAngle: isLeft ? 0.44 : 2.7016,
              activeAngle: isLeft ? -0.5 : 3.6416,
            };
            next.extraFlippers.push(newFlp);
            setSelected({ kind: 'flipper', index: next.extraFlippers.length - 1 });
            break;
          }
          case 'ADD_TOY': {
            const newToy: InteractiveToyDef = {
              id: `toy_${uid}`,
              name: 'MÉCANISME CENTRAL',
              kind: 'TURNTABLE',
              visual: 'RIBBON_VORTEX',
              x: sx,
              y: sy,
              radius: 16,
              points: 4000,
              hitsRequired: 4,
              rewardPoints: 25000,
              accentColor: next.palette.accentPrimary.slice(0, 7),
            };
            if (!next.interactiveToys) next.interactiveToys = [];
            next.interactiveToys.push(newToy);
            setSelected({ kind: 'toy', index: next.interactiveToys.length - 1 });
            break;
          }
          case 'ADD_SPINNER': {
            const newSp: SpinnerDef = {
              id: `spin_${uid}`,
              name: 'SPINNER',
              x: sx,
              y: sy,
              width: 18,
              angle: 0,
              pointsPerSpin: 750,
            };
            next.spinners.push(newSp);
            setSelected({ kind: 'spinner', index: next.spinners.length - 1 });
            break;
          }
          case 'ADD_SCOOP': {
            const newSc: ScoopVukDef = {
              id: `scoop_${uid}`,
              name: 'VUK BONUS',
              kind: next.scoops.some((s) => s.kind === 'UPPER_LOCK')
                ? 'MID_VUK_TELEPORT'
                : 'UPPER_LOCK',
              x: sx,
              y: sy,
              radius: 10,
              ejectTo: { x: Math.min(195, sx + 22), y: Math.min(430, sy + 44) },
              ejectVelocity: { x: 40, y: 155 },
              points: 7500,
              color: next.palette.accentPrimary,
            };
            next.scoops.push(newSc);
            setSelected({ kind: 'scoop', index: next.scoops.length - 1 });
            break;
          }
          case 'ADD_ROLLOVER': {
            const newRo: RolloverDef = {
              id: `roll_${uid}`,
              groupId: sy < 120 ? 'TOP_LANES' : sy > 400 ? 'INLANES' : 'MID_ORBITS',
              x: sx,
              y: sy,
              radius: 6,
              letter: String(next.rollovers.length + 1),
              points: 1500,
            };
            next.rollovers.push(newRo);
            setSelected({ kind: 'rollover', index: next.rollovers.length - 1 });
            break;
          }
          case 'ADD_WALL': {
            next.extraWalls.push({
              x1: sx - 14,
              y1: sy - 10,
              x2: sx + 14,
              y2: sy + 10,
              restitution: 0.72,
            });
            setSelected({ kind: 'wall', index: next.extraWalls.length - 1 });
            break;
          }
          case 'ADD_PEG': {
            next.extraPegs.push({
              x: sx,
              y: sy,
              radius: 3.5,
              restitution: 0.82,
            });
            setSelected({ kind: 'peg', index: next.extraPegs.length - 1 });
            break;
          }
        }
      });
      setTool('SELECT');
      setInspectorTab('element');
      return;
    }

    const hit = findHitAt(pos.x, pos.y);
    if (hit) {
      setSelected(hit.sel);
      dragRef.current = hit.drag;
      setInspectorTab('element');
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      dragRef.current = null;
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = clientToPlayfield(e);
    setCursorPos({ x: Math.round(pos.x), y: Math.round(pos.y) });
    const drag = dragRef.current;
    if (!drag) return;

    const sx = snapCoord(pos.x);
    const sy = snapCoord(pos.y);

    updateDraft((next) => {
      switch (drag.kind) {
        case 'bumper': {
          const b = next.bumpers[drag.index];
          if (b) {
            b.x = Math.min(206, sx);
            b.y = sy;
          }
          break;
        }
        case 'targetMid': {
          const t = next.targets[drag.index];
          if (t) {
            t.x1 = snapCoord(pos.x + drag.dx1);
            t.y1 = snapCoord(pos.y + drag.dy1);
            t.x2 = snapCoord(pos.x + drag.dx2);
            t.y2 = snapCoord(pos.y + drag.dy2);
          }
          break;
        }
        case 'targetP1': {
          const t = next.targets[drag.index];
          if (t) {
            t.x1 = sx;
            t.y1 = sy;
          }
          break;
        }
        case 'targetP2': {
          const t = next.targets[drag.index];
          if (t) {
            t.x2 = sx;
            t.y2 = sy;
          }
          break;
        }
        case 'rampPoint': {
          const r = next.ramps[drag.index];
          if (r && r.path[drag.pointIndex]) {
            r.path[drag.pointIndex] = { x: Math.min(210, sx), y: sy };
            next.ramps[drag.index] = recomputeRampEntryFromPath(r);
          }
          break;
        }
        case 'flipper': {
          const f = next.extraFlippers[drag.index];
          if (f) {
            f.pivot = { x: Math.min(208, sx), y: sy };
          }
          break;
        }
        case 'toy': {
          const toy = next.interactiveToys?.[drag.index];
          if (toy) {
            toy.x = Math.max(28, Math.min(198, sx));
            toy.y = Math.max(54, Math.min(430, sy));
          }
          break;
        }
        case 'upperDeckVertex': {
          if (next.upperPlayfield && next.upperPlayfield.bounds[drag.vertexIndex]) {
            next.upperPlayfield.bounds[drag.vertexIndex] = {
              x: Math.max(16, Math.min(210, sx)),
              y: Math.max(52, Math.min(340, sy)),
            };
          }
          break;
        }
        case 'spinner': {
          const sp = next.spinners[drag.index];
          if (sp) {
            sp.x = Math.min(208, sx);
            sp.y = sy;
          }
          break;
        }
        case 'scoop': {
          const s = next.scoops[drag.index];
          if (s) {
            s.x = Math.min(206, sx);
            s.y = sy;
          }
          break;
        }
        case 'scoopEject': {
          const s = next.scoops[drag.index];
          if (s) {
            s.ejectTo = { x: Math.min(206, sx), y: sy };
          }
          break;
        }
        case 'rollover': {
          const ro = next.rollovers[drag.index];
          if (ro) {
            ro.x = sx;
            ro.y = sy;
          }
          break;
        }
        case 'wallMid': {
          const w = next.extraWalls[drag.index];
          if (w) {
            w.x1 = snapCoord(pos.x + drag.dx1);
            w.y1 = snapCoord(pos.y + drag.dy1);
            w.x2 = snapCoord(pos.x + drag.dx2);
            w.y2 = snapCoord(pos.y + drag.dy2);
          }
          break;
        }
        case 'wallP1': {
          const w = next.extraWalls[drag.index];
          if (w) {
            w.x1 = sx;
            w.y1 = sy;
          }
          break;
        }
        case 'wallP2': {
          const w = next.extraWalls[drag.index];
          if (w) {
            w.x2 = sx;
            w.y2 = sy;
          }
          break;
        }
        case 'peg': {
          const pg = next.extraPegs[drag.index];
          if (pg) {
            pg.x = Math.min(210, sx);
            pg.y = sy;
          }
          break;
        }
        case 'housingVertex': {
          const h = next.beveledHousings[drag.index];
          if (h && h.points[drag.vertexIndex]) {
            h.points[drag.vertexIndex] = { x: Math.min(212, sx), y: sy };
          }
          break;
        }
        case 'emblem': {
          next.missionEmblemPos = {
            x: Math.max(30, Math.min(196, sx)),
            y: Math.max(80, Math.min(440, sy)),
          };
          break;
        }
        case 'huntSlot': {
          if (next.hunt && next.hunt.slots[drag.slotIndex]) {
            next.hunt.slots[drag.slotIndex] = { x: Math.min(206, sx), y: sy };
          }
          break;
        }
      }
    });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleSave = () => {
    const saved = saveTableDefinition(draft);
    rendererRef.current?.invalidateCache();
    setDraft(cloneTableDef(saved));
    setDirty(false);
    onCatalogChanged(saved.id);
    notifyStatus('ok', `Plateau « ${saved.name} » enregistré dans votre catalogue local.`);
  };

  const handlePlayNow = () => {
    const saved = saveTableDefinition(draft);
    rendererRef.current?.invalidateCache();
    setDirty(false);
    musicEngine.setEditorPreview(null, null);
    setPreviewingMusic(false);
    onPlayTable(saved.id);
  };

  const handleDuplicate = () => {
    const savedCurrent = dirty ? saveTableDefinition(draft) : draft;
    const copy = duplicateTableDefinition(savedCurrent.id);
    rendererRef.current?.invalidateCache();
    loadTableIntoEditor(copy.id);
    onCatalogChanged(copy.id);
    notifyStatus('ok', `Copie maison « ${copy.name} » créée et sélectionnée.`);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    const created = createNewCustomTable(newTableTheme, newTableName.trim() || 'Mon Flipper Maison');
    rendererRef.current?.invalidateCache();
    setShowNewDrawer(false);
    loadTableIntoEditor(created.id);
    onCatalogChanged(created.id);
    notifyStatus('ok', `Nouveau plateau maison « ${created.name} » créé.`);
  };

  const handleConfirmResetOrDelete = () => {
    if (confirmAction === 'reset' && isBuiltinTableId(draft.id)) {
      const restored = resetTableDefinition(draft.id);
      rendererRef.current?.invalidateCache();
      if (restored) {
        setDraft(cloneTableDef(restored));
      }
      setDirty(false);
      setConfirmAction(null);
      onCatalogChanged(draft.id);
      notifyStatus('ok', 'Plateau d’origine restauré à sa configuration usine.');
    } else if (confirmAction === 'delete' && !isBuiltinTableId(draft.id)) {
      deleteCustomTableDefinition(draft.id);
      rendererRef.current?.invalidateCache();
      const fallback = PINBALL_TABLES[0].id;
      loadTableIntoEditor(fallback);
      onCatalogChanged(fallback);
      notifyStatus('ok', 'Plateau maison supprimé.');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = importTablesJson(String(reader.result || ''));
        rendererRef.current?.invalidateCache();
        loadTableIntoEditor(res.firstId);
        onCatalogChanged(res.firstId);
        notifyStatus('ok', `${res.count} plateau(x) importé(s) avec succès.`);
      } catch (err) {
        notifyStatus('err', err instanceof Error ? err.message : 'Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  };

  const handleImportPastedJson = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = importTablesJson(pasteJsonText);
      rendererRef.current?.invalidateCache();
      setShowPasteDrawer(false);
      setPasteJsonText('');
      loadTableIntoEditor(res.firstId);
      onCatalogChanged(res.firstId);
      notifyStatus('ok', `${res.count} plateau(x) importé(s) depuis le presse-papiers.`);
    } catch (err) {
      notifyStatus('err', err instanceof Error ? err.message : 'Contenu JSON invalide.');
    }
  };

  const handleExportSingle = () => {
    const saved = dirty ? saveTableDefinition(draft) : draft;
    if (dirty) {
      setDirty(false);
      onCatalogChanged(saved.id);
    }
    downloadTextFile(`${saved.id}.table.json`, serializeTableToJson(saved.id));
    notifyStatus('ok', `Fichier ${saved.id}.table.json téléchargé.`);
  };

  const handleExportCatalog = () => {
    if (dirty) {
      const saved = saveTableDefinition(draft);
      setDirty(false);
      onCatalogChanged(saved.id);
    }
    downloadTextFile('tables.config.json', serializeCatalogToJson());
    notifyStatus('ok', 'Catalogue complet tables.config.json téléchargé.');
  };

  const handleCopyJson = () => {
    const saved = dirty ? saveTableDefinition(draft) : draft;
    navigator.clipboard?.writeText(serializeTableToJson(saved.id)).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    });
  };

  const deleteSelectedEntity = () => {
    if (!selected) return;
    updateDraft((next) => {
      switch (selected.kind) {
        case 'bumper':
          if (next.bumpers.length > 1) next.bumpers.splice(selected.index, 1);
          break;
        case 'target':
          next.targets.splice(selected.index, 1);
          break;
        case 'ramp':
          if (next.ramps.length > 1) next.ramps.splice(selected.index, 1);
          break;
        case 'flipper':
          next.extraFlippers.splice(selected.index, 1);
          break;
        case 'spinner':
          next.spinners.splice(selected.index, 1);
          break;
        case 'scoop':
          if (next.scoops.length > 1) next.scoops.splice(selected.index, 1);
          break;
        case 'rollover':
          if (next.rollovers.length > 1) next.rollovers.splice(selected.index, 1);
          break;
        case 'wall':
          next.extraWalls.splice(selected.index, 1);
          break;
        case 'peg':
          next.extraPegs.splice(selected.index, 1);
          break;
        case 'housing':
          next.beveledHousings.splice(selected.index, 1);
          break;
        case 'huntSlot':
          if (next.hunt && next.hunt.slots.length > 2) {
            next.hunt.slots.splice(selected.slotIndex, 1);
          }
          break;
        case 'toy':
          if (next.interactiveToys) {
            next.interactiveToys.splice(selected.index, 1);
          }
          break;
        case 'upperDeck':
          delete next.upperPlayfield;
          next.ramps.forEach((r) => {
            delete r.exitsToUpperDeck;
          });
          break;
      }
    });
    setSelected(null);
  };

  const akaIssues = useMemo(() => checkAkaFirmwareCompatibility(draft), [draft]);
  const activeDecor = resolveDecorTheme(draft);
  const activeMusic = resolveMusicTheme(draft);
  const musicMeta = MUSIC_THEME_META[activeMusic];
  const isBuiltin = isBuiltinTableId(draft.id);
  const isOverridden = isTableModified(draft.id);

  return (
    <div className="space-y-5">
      {/* Barre supérieure de l'atelier d'édition */}
      <section className="rounded-xl bg-[#12161F] border border-slate-800/90 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <label htmlFor="editor-table-select" className="text-xs font-medium text-slate-400">
              Plateau :
            </label>
            <select
              id="editor-table-select"
              value={selectedTableId}
              onChange={(e) => loadTableIntoEditor(e.target.value)}
              className="bg-[#0B0E15] border border-slate-700/90 rounded-lg px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:border-amber-400"
            >
              {PINBALL_TABLES.map((t) => {
                const tag = !isBuiltinTableId(t.id)
                  ? ' · Maison'
                  : isTableModified(t.id)
                    ? ' · Modifié'
                    : '';
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {tag}
                  </option>
                );
              })}
            </select>

            <span className="text-xs font-mono text-slate-400 tabular-nums">
              240×520 px · {isBuiltin ? 'Table officielle' : 'Création maison'}
              {dirty ? ' · Modifications non enregistrées' : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewDrawer((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1A202E] border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Nouvelle table</span>
            </button>

            <button
              type="button"
              onClick={handleDuplicate}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1A202E] border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
            >
              Dupliquer
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-amber-400/50 text-amber-300 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Enregistrer</span>
            </button>

            <button
              type="button"
              onClick={handlePlayNow}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tester sur la console AKA</span>
            </button>
          </div>
        </div>

        {/* Seconde rangée : Import / Export JSON & Réinitialisation sécurisée en 2 clics */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Importer fichier JSON</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPasteDrawer((v) => !v)}
              className="px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
            >
              Coller JSON
            </button>

            <button
              type="button"
              onClick={handleExportSingle}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exporter cette table (.json)</span>
            </button>

            <button
              type="button"
              onClick={handleExportCatalog}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Exporter tables.config.json</span>
            </button>

            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
            >
              {copiedJson ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{copiedJson ? 'JSON copié' : 'Copier JSON'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isBuiltin && (isOverridden || dirty) && (
              <>
                {confirmAction === 'reset' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleConfirmResetOrDelete}
                      className="px-2.5 py-1 rounded bg-red-500/20 border border-red-400 text-red-200 font-semibold cursor-pointer"
                    >
                      Confirmer la restauration usine
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction(null)}
                      className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('reset')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-slate-400 hover:text-amber-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurer l’original</span>
                  </button>
                )}
              </>
            )}

            {!isBuiltin && (
              <>
                {confirmAction === 'delete' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleConfirmResetOrDelete}
                      className="px-2.5 py-1 rounded bg-red-500/20 border border-red-400 text-red-200 font-semibold cursor-pointer"
                    >
                      Confirmer la suppression
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction(null)}
                      className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('delete')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#0E121A] border border-slate-800 text-red-400 hover:border-red-500/60 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer cette table</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tiroir création de nouvelle table */}
        {showNewDrawer && (
          <form
            onSubmit={handleCreateNew}
            className="p-3.5 rounded-lg bg-[#0B0E15] border border-slate-700/80 flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-slate-400 mb-1">Nom du nouveau flipper</label>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                maxLength={36}
                className="w-full bg-[#12161F] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div className="min-w-[220px]">
              <label className="block text-xs text-slate-400 mb-1">
                Modèle d’ambiance & base physique
              </label>
              <select
                value={newTableTheme}
                onChange={(e) => setNewTableTheme(e.target.value as BuiltinThemeId)}
                className="w-full bg-[#12161F] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              >
                {BUILTIN_THEME_IDS.map((th) => (
                  <option key={th} value={th}>
                    {DECOR_THEME_LABELS[th]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded bg-amber-400 text-slate-950 text-xs font-semibold hover:bg-amber-300 cursor-pointer"
            >
              Créer le plateau
            </button>
            <button
              type="button"
              onClick={() => setShowNewDrawer(false)}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Fermer
            </button>
          </form>
        )}

        {/* Tiroir collage JSON */}
        {showPasteDrawer && (
          <form
            onSubmit={handleImportPastedJson}
            className="p-3.5 rounded-lg bg-[#0B0E15] border border-slate-700/80 space-y-2.5"
          >
            <label className="block text-xs text-slate-300">
              Collez la définition JSON d’une table ou d’un fichier <span className="font-mono">tables.config.json</span> :
            </label>
            <textarea
              rows={5}
              value={pasteJsonText}
              onChange={(e) => setPasteJsonText(e.target.value)}
              placeholder='{ "id": "mon_flipper", "name": "Mon Flipper", ... }'
              className="w-full bg-[#12161F] border border-slate-700 rounded p-2.5 text-xs font-mono text-slate-200"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded bg-sky-400 text-slate-950 text-xs font-semibold hover:bg-sky-300 cursor-pointer"
              >
                Valider l’import JSON
              </button>
              <button
                type="button"
                onClick={() => setShowPasteDrawer(false)}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {statusMsg && (
          <div
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
              statusMsg.tone === 'ok'
                ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-200'
                : 'bg-red-500/10 border border-red-500/40 text-red-200'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button
              type="button"
              onClick={() => setStatusMsg(null)}
              className="text-slate-400 hover:text-white ml-4 cursor-pointer"
            >
              OK
            </button>
          </div>
        )}
      </section>

      {/* Grille principale : Plateau interactif 240x520 à gauche + Inspecteur 3 onglets à droite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Colonne gauche : Palette d'outils + Canevas 240x520 */}
        <div className="lg:col-span-6 rounded-xl bg-[#12161F] border border-slate-800/90 p-4 space-y-3.5">
          {/* Outils d'ajout rapide */}
          <div className="flex flex-wrap gap-1.5">
            {TOOL_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                  tool === item.id
                    ? 'bg-amber-400 border-amber-400 text-slate-950 font-semibold'
                    : 'bg-[#0C0F17] border-slate-800 text-slate-300 hover:text-white hover:border-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Options grille magnétique & poignées */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <div className="flex items-center gap-2">
              <span>Aimantation :</span>
              {([0, 2, 4] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSnapStep(st)}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    snapStep === st ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 0 ? 'Libre' : `${st}px`}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer select-none font-sans">
              <input
                type="checkbox"
                checked={showHandles}
                onChange={(e) => setShowHandles(e.target.checked)}
                className="accent-amber-400"
              />
              <span>Poignées & tracés</span>
            </label>
          </div>

          {/* Canevas 240x520 (rendu interne 480x1040) */}
          <div className="flex flex-col items-center">
            <div className="relative rounded-lg overflow-hidden border-2 border-slate-700/90 shadow-2xl bg-[#050811]">
              <canvas
                ref={canvasRef}
                width={480}
                height={1040}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={() => setCursorPos(null)}
                className={`w-[320px] sm:w-[348px] h-auto block touch-none ${
                  tool === 'SELECT' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
                }`}
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between w-full max-w-[348px] text-xs font-mono text-slate-400 tabular-nums">
              <span>
                {tool === 'SELECT'
                  ? 'Glisser un élément pour le déplacer'
                  : 'Cliquer sur le plateau pour poser l’élément'}
              </span>
              <span>
                {cursorPos ? `X ${cursorPos.x} · Y ${cursorPos.y}` : '240 × 520'}
              </span>
            </div>
          </div>
        </div>

        {/* Colonne droite : Inspecteur complet */}
        <div className="lg:col-span-6 rounded-xl bg-[#12161F] border border-slate-800/90 p-5 space-y-5">
          {/* Navigation 3 onglets de l'inspecteur */}
          <div className="flex items-center gap-5 border-b border-slate-800/90 pb-3 text-sm font-medium">
            {(
              [
                ['element', 'Élément sélectionné'],
                ['theme', 'Thème, Décor & Musique'],
                ['missions', 'Missions & Firmware AKA'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setInspectorTab(id)}
                className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                  inspectorTab === id
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ONGLET 1 : ÉLÉMENT SÉLECTIONNÉ + INVENTAIRE RAPIDE */}
          {inspectorTab === 'element' && (
            <div className="space-y-5">
              {/* Sélecteur rapide d'éléments du plateau */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Inventaire rapide du plateau (cliquer pour cibler)</span>
                  <span className="font-mono tabular-nums">
                    {draft.bumpers.length} bmp · {draft.ramps.length} rmp · {draft.targets.length} cbl ·{' '}
                    {2 + draft.extraFlippers.length + (draft.upperPlayfield?.flippers.length ?? 0)} flp
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-[116px] overflow-y-auto p-2 rounded-lg bg-[#0B0E15] border border-slate-800/90">
                  {draft.upperPlayfield && (
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: 'upperDeck', vertexIndex: 0 })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'upperDeck'
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-sky-500/20 border border-sky-400/40 text-sky-200 hover:text-white'
                      }`}
                    >
                      Étage: {draft.upperPlayfield.name}
                    </button>
                  )}
                  {(draft.interactiveToys ?? []).map((toy, i) => (
                    <button
                      key={toy.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'toy', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'toy' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-pink-500/20 border border-pink-400/40 text-pink-200 hover:text-white'
                      }`}
                    >
                      Décor: {toy.name}
                    </button>
                  ))}
                  {draft.bumpers.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'bumper', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'bumper' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-slate-300 hover:text-white'
                      }`}
                    >
                      Bmp {i + 1} ({b.iconStyle.slice(0, 5)})
                    </button>
                  ))}
                  {draft.ramps.map((r, i) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'ramp', index: i, pointIndex: 0 })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'ramp' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-sky-300 hover:text-white'
                      }`}
                    >
                      Rampe {i + 1}: {r.name}
                    </button>
                  ))}
                  {draft.scoops.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'scoop', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'scoop' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-emerald-300 hover:text-white'
                      }`}
                    >
                      {s.kind === 'UPPER_LOCK' ? 'Lock' : 'Conduit'}: {s.name}
                    </button>
                  ))}
                  {draft.upperPlayfield && (
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: 'upperDeck', vertexIndex: 0 })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'upperDeck'
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-cyan-300 hover:text-white'
                      }`}
                    >
                      Étage: {draft.upperPlayfield.name}
                    </button>
                  )}
                  {(draft.interactiveToys ?? []).map((toy, i) => (
                    <button
                      key={toy.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'toy', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'toy' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-pink-300 hover:text-white'
                      }`}
                    >
                      Décor {i + 1}: {toy.name}
                    </button>
                  ))}
                  {draft.extraFlippers.map((f, i) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'flipper', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'flipper' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-amber-200 hover:text-white'
                      }`}
                    >
                      Flipper sup. {i + 1} ({f.side})
                    </button>
                  ))}
                  {draft.spinners.map((sp, i) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'spinner', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'spinner' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-purple-300 hover:text-white'
                      }`}
                    >
                      Spinner {i + 1}
                    </button>
                  ))}
                  {draft.targets.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'target', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'target' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-slate-300 hover:text-white'
                      }`}
                    >
                      Cible {i + 1} ({t.letter})
                    </button>
                  ))}
                  {draft.rollovers.map((ro, i) => (
                    <button
                      key={ro.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'rollover', index: i })}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                        selected?.kind === 'rollover' && selected.index === i
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      Roll {ro.letter}
                    </button>
                  ))}
                </div>
              </div>

              {!selected && (
                <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-800 rounded-lg">
                  Cliquez sur un élément du plateau (bumper, rampe, cible, flipper, puits…) pour modifier ses propriétés.
                </p>
              )}

              {/* ÉDITEUR BUMPER */}
              {selected?.kind === 'bumper' && draft.bumpers[selected.index] && (() => {
                const bmp = draft.bumpers[selected.index];
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Bumper #{selected.index + 1} · {bmp.label}
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        disabled={draft.bumpers.length <= 1}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Libellé</label>
                        <input
                          type="text"
                          value={bmp.label}
                          maxLength={10}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.bumpers[selected.index].label = e.target.value;
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">X (px)</label>
                        <input
                          type="number"
                          value={Math.round(bmp.x)}
                          min={20}
                          max={206}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.bumpers[selected.index].x = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Y (px)</label>
                        <input
                          type="number"
                          value={Math.round(bmp.y)}
                          min={36}
                          max={460}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.bumpers[selected.index].y = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Rayon (px)</label>
                        <input
                          type="number"
                          value={bmp.radius}
                          min={9}
                          max={18}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.bumpers[selected.index].radius = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Points par rebond</label>
                        <input
                          type="number"
                          step={100}
                          value={bmp.points}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.bumpers[selected.index].points = Math.max(100, Number(e.target.value));
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Icône thématique (24 motifs)</label>
                        <select
                          value={bmp.iconStyle}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.bumpers[selected.index].iconStyle = e.target.value as BumperIconStyle;
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          {BUMPER_ICON_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Couleur du cabochon 3D</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BUMPER_COLOR_OPTIONS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              updateDraft((n) => {
                                n.bumpers[selected.index].colorStyle = c.id;
                              })
                            }
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer ${
                              bmp.colorStyle === c.id
                                ? 'border-amber-400 bg-slate-800 text-white font-semibold'
                                : 'border-slate-800 bg-[#0B0E15] text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span className="truncate">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ÉDITEUR RAMPE */}
              {selected?.kind === 'ramp' && draft.ramps[selected.index] && (() => {
                const ramp = draft.ramps[selected.index];
                const ptIdx = Math.min(selected.pointIndex, ramp.path.length - 1);
                return (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Rampe 3D #{selected.index + 1} · {ramp.name}
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        disabled={draft.ramps.length <= 1}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Nom de la rampe</label>
                        <input
                          type="text"
                          value={ramp.name}
                          maxLength={22}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.ramps[selected.index].name = e.target.value;
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Architecture visuelle</label>
                        <select
                          value={ramp.style}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.ramps[selected.index].style = e.target.value as RampDef['style'];
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          <option value="MOLDED_ACRYLIC">Goulotte acrylique moulée</option>
                          <option value="WIREFORM_RAIL">Rails tubulaires métalliques</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Points</label>
                        <input
                          type="number"
                          step={500}
                          value={ramp.points}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.ramps[selected.index].points = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Rayon d’entrée</label>
                        <input
                          type="number"
                          min={10}
                          max={22}
                          value={ramp.entryRadius}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.ramps[selected.index].entryRadius = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Couleur rail</label>
                        <input
                          type="color"
                          value={ramp.railColor.slice(0, 7)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.ramps[selected.index].railColor = e.target.value.slice(0, 7);
                              n.ramps[selected.index].chuteColor = e.target.value.slice(0, 7);
                            })
                          }
                          className="w-full h-[30px] bg-[#0B0E15] border border-slate-700 rounded p-0.5 cursor-pointer"
                        />
                      </div>
                    </div>

                    {draft.upperPlayfield && (
                      <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[#0B0E15] border border-slate-800 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          checked={Boolean(ramp.exitsToUpperDeck)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.ramps[selected.index].exitsToUpperDeck = e.target.checked;
                            })
                          }
                          className="accent-amber-400"
                        />
                        <span>
                          La sortie de cette rampe dépose la bille sur l’étage supérieur ({draft.upperPlayfield.name})
                        </span>
                      </label>
                    )}

                    {/* Points de passage Catmull-Rom */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-300 font-medium">
                          Points du tracé ({ramp.path.length} sommets — glissables sur le plateau)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((n) => {
                                const r = n.ramps[selected.index];
                                if (r.path.length < 10) {
                                  const last = r.path[r.path.length - 1];
                                  r.path.push({
                                    x: Math.min(200, last.x + 12),
                                    y: Math.min(450, last.y + 28),
                                  });
                                  n.ramps[selected.index] = recomputeRampEntryFromPath(r);
                                }
                              })
                            }
                            className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                          >
                            + Point
                          </button>
                          <button
                            type="button"
                            disabled={ramp.path.length <= 3}
                            onClick={() =>
                              updateDraft((n) => {
                                const r = n.ramps[selected.index];
                                if (r.path.length > 3) {
                                  r.path.splice(ptIdx, 1);
                                  n.ramps[selected.index] = recomputeRampEntryFromPath(r);
                                }
                              })
                            }
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                          >
                            − Point #{ptIdx + 1}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((n) => {
                                const r = n.ramps[selected.index];
                                r.path.reverse();
                                n.ramps[selected.index] = recomputeRampEntryFromPath(r);
                              })
                            }
                            className="px-2 py-1 rounded bg-slate-800 text-amber-300 hover:text-amber-200 cursor-pointer"
                          >
                            Inverser sens
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ramp.path.map((pt, idx) => (
                          <div
                            key={idx}
                            onClick={() =>
                              setSelected({ kind: 'ramp', index: selected.index, pointIndex: idx })
                            }
                            className={`p-2 rounded border font-mono tabular-nums cursor-pointer ${
                              ptIdx === idx
                                ? 'border-amber-400 bg-[#181F2E] text-white'
                                : 'border-slate-800 bg-[#0B0E15] text-slate-300'
                            }`}
                          >
                            <div className="text-[10px] text-slate-400 mb-1">
                              {idx === 0
                                ? '0 · Entrée'
                                : idx === ramp.path.length - 1
                                  ? `${idx} · Sortie`
                                  : `Sommet ${idx}`}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                value={Math.round(pt.x)}
                                onChange={(e) =>
                                  updateDraft((n) => {
                                    const r = n.ramps[selected.index];
                                    r.path[idx].x = Number(e.target.value);
                                    n.ramps[selected.index] = recomputeRampEntryFromPath(r);
                                  })
                                }
                                className="w-1/2 bg-[#090C12] border border-slate-700 rounded px-1 py-0.5 text-white"
                              />
                              <input
                                type="number"
                                value={Math.round(pt.y)}
                                onChange={(e) =>
                                  updateDraft((n) => {
                                    const r = n.ramps[selected.index];
                                    r.path[idx].y = Number(e.target.value);
                                    n.ramps[selected.index] = recomputeRampEntryFromPath(r);
                                  })
                                }
                                className="w-1/2 bg-[#090C12] border border-slate-700 rounded px-1 py-0.5 text-white"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ÉDITEUR CIBLE */}
              {selected?.kind === 'target' && draft.targets[selected.index] && (() => {
                const tgt = draft.targets[selected.index];
                const cx = Math.round((tgt.x1 + tgt.x2) * 0.5);
                const cy = Math.round((tgt.y1 + tgt.y2) * 0.5);
                const setOrientation = (dx: number, dy: number) =>
                  updateDraft((n) => {
                    const t = n.targets[selected.index];
                    t.x1 = cx - dx;
                    t.y1 = cy - dy;
                    t.x2 = cx + dx;
                    t.y2 = cy + dy;
                  });
                return (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Cible #{selected.index + 1} · Lettre « {tgt.letter} »
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Lettre</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={tgt.letter}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.targets[selected.index].letter = e.target.value.toUpperCase();
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Banque ID</label>
                        <input
                          type="text"
                          value={tgt.bankId}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.targets[selected.index].bankId = e.target.value;
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Type mécanique</label>
                        <select
                          value={tgt.kind}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.targets[selected.index].kind = e.target.value as TargetDef['kind'];
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          <option value="DROP">Tombante (DROP)</option>
                          <option value="STANDUP">Fixe (STANDUP)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Rôle banque</label>
                        <select
                          value={tgt.bankRole}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.targets[selected.index].bankRole =
                                e.target.value as TargetDef['bankRole'];
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          <option value="MULTIPLIER">Bonus × Multiplicateur</option>
                          <option value="MULTIBALL">Ouverture Verrou</option>
                          <option value="KICKBACK">Kickback Latéral</option>
                          <option value="JACKPOT_BOOST">Boost Jackpot</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-400">Orientation rapide :</span>
                      <button
                        type="button"
                        onClick={() => setOrientation(6, 0)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                      >
                        Horizontale —
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrientation(0, 6)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                      >
                        Verticale |
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrientation(5, -5)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                      >
                        Diagonale /
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrientation(5, 5)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                      >
                        Diagonale \
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ÉDITEUR FLIPPER SUPPLÉMENTAIRE */}
              {selected?.kind === 'flipper' && draft.extraFlippers[selected.index] && (() => {
                const flp = draft.extraFlippers[selected.index];
                return (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Flipper supplémentaire #{selected.index + 1}
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Bouton lié</label>
                        <select
                          value={flp.side}
                          onChange={(e) => {
                            const side = e.target.value as 'LEFT' | 'RIGHT';
                            updateDraft((n) => {
                              const f = n.extraFlippers[selected.index];
                              f.side = side;
                              f.restAngle = side === 'LEFT' ? 0.44 : 2.7016;
                              f.activeAngle = side === 'LEFT' ? -0.5 : 3.6416;
                            });
                          }}
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          <option value="LEFT">Gauche (Bouton A)</option>
                          <option value="RIGHT">Droit (Bouton D)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Pivot X</label>
                        <input
                          type="number"
                          value={Math.round(flp.pivot.x)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.extraFlippers[selected.index].pivot.x = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Pivot Y</label>
                        <input
                          type="number"
                          value={Math.round(flp.pivot.y)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.extraFlippers[selected.index].pivot.y = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Longueur</label>
                        <input
                          type="number"
                          min={20}
                          max={40}
                          value={flp.length}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.extraFlippers[selected.index].length = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ÉDITEUR PUITS / SCOOP */}
              {selected?.kind === 'scoop' && draft.scoops[selected.index] && (() => {
                const sc = draft.scoops[selected.index];
                return (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Puits / Verrou #{selected.index + 1} · {sc.name}
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        disabled={draft.scoops.length <= 1}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Nom affiché</label>
                        <input
                          type="text"
                          value={sc.name}
                          maxLength={18}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.scoops[selected.index].name = e.target.value;
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Fonction</label>
                        <select
                          value={sc.kind}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.scoops[selected.index].kind = e.target.value as ScoopVukDef['kind'];
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          <option value="UPPER_LOCK">Verrou Multibille (LOCK)</option>
                          <option value="MID_VUK_TELEPORT">Conduit aérien 3D (VUK continu)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Points</label>
                        <input
                          type="number"
                          step={500}
                          value={sc.points}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.scoops[selected.index].points = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono tabular-nums text-white"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Astuce : le losange bleu clair relié au puits sur le canevas permet de placer la sortie du conduit aérien continu.
                    </p>
                  </div>
                );
              })()}

              {/* ÉDITEUR DÉCOR INTERACTIF */}
              {selected?.kind === 'toy' && draft.interactiveToys?.[selected.index] && (() => {
                const toy = draft.interactiveToys[selected.index];
                return (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Décor interactif #{selected.index + 1} · {toy.name}
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Nom affiché</label>
                        <input
                          type="text"
                          maxLength={24}
                          value={toy.name}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].name = e.target.value;
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Comportement physique</label>
                        <select
                          value={toy.kind}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].kind = e.target.value as InteractiveToyKind;
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          {TOY_KIND_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Visuel thématique</label>
                        <select
                          value={toy.visual}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].visual = e.target.value as InteractiveToyVisual;
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          {TOY_VISUAL_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">X (px)</label>
                        <input
                          type="number"
                          min={28}
                          max={198}
                          value={Math.round(toy.x)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].x = Number(e.target.value);
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Y (px)</label>
                        <input
                          type="number"
                          min={54}
                          max={430}
                          value={Math.round(toy.y)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].y = Number(e.target.value);
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Rayon (px)</label>
                        <input
                          type="number"
                          min={11}
                          max={28}
                          value={toy.radius}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].radius = Number(e.target.value);
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Points</label>
                        <input
                          type="number"
                          step={500}
                          value={toy.points}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].points = Number(e.target.value);
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Coups avant prime</label>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={toy.hitsRequired ?? 4}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].hitsRequired = Number(e.target.value);
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Prime spéciale (pts)</label>
                        <input
                          type="number"
                          step={5000}
                          value={toy.rewardPoints ?? 25000}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].rewardPoints = Number(e.target.value);
                              }
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Couleur accent</label>
                        <input
                          type="color"
                          value={(toy.accentColor || '#38BDF8').slice(0, 7)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.interactiveToys?.[selected.index]) {
                                n.interactiveToys[selected.index].accentColor = e.target.value.slice(0, 7);
                              }
                            })
                          }
                          className="w-full h-[30px] bg-[#0B0E15] border border-slate-700 rounded p-0.5 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ÉDITEUR ÉTAGE SUPÉRIEUR */}
              {selected?.kind === 'upperDeck' && draft.upperPlayfield && (() => {
                const up = draft.upperPlayfield;
                return (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Étage supérieur · {up.name}
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Retirer l’étage</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-slate-400 mb-1">Nom de l’étage</label>
                        <input
                          type="text"
                          maxLength={24}
                          value={up.name}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.upperPlayfield) n.upperPlayfield.name = e.target.value;
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Plancher</label>
                        <input
                          type="color"
                          value={(up.fillColor || '#0F172A').slice(0, 7)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.upperPlayfield) n.upperPlayfield.fillColor = e.target.value.slice(0, 7);
                            })
                          }
                          className="w-full h-[30px] bg-[#0B0E15] border border-slate-700 rounded p-0.5 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Rambardes</label>
                        <input
                          type="color"
                          value={(up.borderColor || '#38BDF8').slice(0, 7)}
                          onChange={(e) =>
                            updateDraft((n) => {
                              if (n.upperPlayfield) n.upperPlayfield.borderColor = e.target.value.slice(0, 7);
                            })
                          }
                          className="w-full h-[30px] bg-[#0B0E15] border border-slate-700 rounded p-0.5 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Architecture visuelle</label>
                      <select
                        value={up.style}
                        onChange={(e) =>
                          updateDraft((n) => {
                            if (n.upperPlayfield) {
                              n.upperPlayfield.style = e.target.value as UpperPlayfieldStyle;
                            }
                          })
                        }
                        className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                      >
                        {UPPER_DECK_STYLE_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Déplacez les {up.bounds.length} sommets bleus directement sur le canevas pour ajuster le contour de la mezzanine. Cochez « Débouche sur l’étage supérieur » sur une rampe pour y envoyer la bille.
                    </p>
                  </div>
                );
              })()}

              {/* ÉDITEUR SPINNER / ROLLOVER / MUR / PLOT / MÉDAILLON / HUNT */}
              {selected?.kind === 'spinner' && draft.spinners[selected.index] && (() => {
                const sp = draft.spinners[selected.index];
                return (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Spinner #{selected.index + 1}</h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        className="text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        Supprimer
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Largeur</label>
                        <input
                          type="number"
                          min={12}
                          max={28}
                          value={sp.width}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.spinners[selected.index].width = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Angle (rad)</label>
                        <input
                          type="number"
                          step={0.1}
                          value={sp.angle}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.spinners[selected.index].angle = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Pts / tour</label>
                        <input
                          type="number"
                          step={100}
                          value={sp.pointsPerSpin}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.spinners[selected.index].pointsPerSpin = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {selected?.kind === 'rollover' && draft.rollovers[selected.index] && (() => {
                const ro = draft.rollovers[selected.index];
                return (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        Couloir Rollover « {ro.letter} »
                      </h3>
                      <button
                        type="button"
                        onClick={deleteSelectedEntity}
                        disabled={draft.rollovers.length <= 1}
                        className="text-red-400 hover:text-red-300 disabled:opacity-40 cursor-pointer"
                      >
                        Supprimer
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Symbole</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={ro.letter}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.rollovers[selected.index].letter = e.target.value.toUpperCase();
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Groupe</label>
                        <select
                          value={ro.groupId}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.rollovers[selected.index].groupId =
                                e.target.value as RolloverDef['groupId'];
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 text-white"
                        >
                          <option value="TOP_LANES">Couloirs du haut</option>
                          <option value="MID_ORBITS">Orbites centrales</option>
                          <option value="INLANES">Retours flippers</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Points</label>
                        <input
                          type="number"
                          step={250}
                          value={ro.points}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.rollovers[selected.index].points = Number(e.target.value);
                            })
                          }
                          className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(selected?.kind === 'wall' ||
                selected?.kind === 'peg' ||
                selected?.kind === 'housing' ||
                selected?.kind === 'emblem' ||
                selected?.kind === 'huntSlot') && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0E15] border border-slate-800 text-xs">
                  <span className="text-slate-300">
                    Élément géométrique sélectionné ({selected.kind}) — déplacez ses poignées directement sur le plateau.
                  </span>
                  {selected.kind !== 'emblem' && (
                    <button
                      type="button"
                      onClick={deleteSelectedEntity}
                      className="text-red-400 hover:text-red-300 font-medium cursor-pointer ml-3"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ONGLET 2 : THÈME, DÉCOR, MUSIQUE & PALETTE */}
          {inspectorTab === 'theme' && (
            <div className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Nom du plateau</label>
                  <input
                    type="text"
                    maxLength={36}
                    value={draft.name}
                    onChange={(e) =>
                      updateDraft((n) => {
                        n.name = e.target.value;
                      })
                    }
                    className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2.5 py-1.5 text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Sous-titre architecture</label>
                  <input
                    type="text"
                    maxLength={44}
                    value={draft.layoutBadge}
                    onChange={(e) =>
                      updateDraft((n) => {
                        n.layoutBadge = e.target.value;
                      })
                    }
                    className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description du plateau</label>
                <textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) =>
                    updateDraft((n) => {
                      n.description = e.target.value;
                    })
                  }
                  className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>

              {/* Sélection Décor spécialisé & Bande-son longue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Univers visuel & éléments spécialisés
                  </label>
                  <select
                    value={activeDecor}
                    onChange={(e) => {
                      const th = e.target.value as BuiltinThemeId;
                      updateDraft((n) => {
                        n.decorTheme = th;
                      });
                    }}
                    className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  >
                    {BUILTIN_THEME_IDS.map((th) => (
                      <option key={th} value={th}>
                        {DECOR_THEME_LABELS[th]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Composition musicale (32 mesures évolutives)
                  </label>
                  <select
                    value={activeMusic}
                    onChange={(e) => {
                      const th = e.target.value as BuiltinThemeId;
                      updateDraft((n) => {
                        n.musicTheme = th;
                      });
                    }}
                    className="w-full bg-[#0B0E15] border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  >
                    {BUILTIN_THEME_IDS.map((th) => (
                      <option key={th} value={th}>
                        {MUSIC_THEME_META[th].label} ({MUSIC_THEME_META[th].bpm} BPM)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barre de pré-écoute musicale & effets spécialisés */}
              <div className="p-3 rounded-lg bg-[#0B0E15] border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-amber-300 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5" />
                    <span>
                      {musicMeta.label} · {musicMeta.bpm} BPM
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{musicMeta.style}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !previewingMusic;
                      setPreviewingMusic(next);
                      musicEngine.setEditorPreview(
                        next ? activeMusic : null,
                        soundEngine.unlockAndGetContext()
                      );
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                      previewingMusic
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:text-white'
                    }`}
                  >
                    {previewingMusic ? (
                      <>
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stopper l’écoute</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Écouter la musique</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.unlockAndGetContext();
                      soundEngine.setTheme(activeDecor);
                      soundEngine.playBumperHit(1);
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"
                  >
                    SFX Bumper
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.unlockAndGetContext();
                      soundEngine.setTheme(activeDecor);
                      soundEngine.playRampClimb(2);
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"
                  >
                    SFX Rampe
                  </button>
                </div>
              </div>

              {/* Mécaniques spéciales : Gravité, Bumper doré x3, Cible mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                <div>
                  <label className="block text-slate-400 mb-1 font-mono tabular-nums">
                    Gravité du plateau : {draft.gravity} px/s²
                  </label>
                  <input
                    type="range"
                    min={270}
                    max={375}
                    value={draft.gravity}
                    onChange={(e) =>
                      updateDraft((n) => {
                        n.gravity = Number(e.target.value);
                      })
                    }
                    className="w-full accent-amber-400"
                  />
                </div>
                <div className="flex items-center pt-3">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.litBumperRotate)}
                      onChange={(e) =>
                        updateDraft((n) => {
                          n.litBumperRotate = e.target.checked;
                        })
                      }
                      className="accent-amber-400"
                    />
                    <span>Bumper doré ×3 tournant à chaque touche</span>
                  </label>
                </div>
              </div>

              {/* Cible mobile (Hunt) */}
              <div className="p-3 rounded-lg bg-[#0B0E15] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-medium text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.hunt)}
                      onChange={(e) =>
                        updateDraft((n) => {
                          if (e.target.checked) {
                            n.hunt = {
                              kind: 'WANTED',
                              name: 'CIBLE MOBILE',
                              slots: [
                                { x: 76, y: 260 },
                                { x: 148, y: 260 },
                                { x: 112, y: 210 },
                                { x: 112, y: 310 },
                              ],
                              radius: 8,
                              points: 4000,
                              goal: 4,
                              reward: 45000,
                              sequential: false,
                              color: n.palette.accentWarm,
                            };
                          } else {
                            delete n.hunt;
                          }
                        })
                      }
                      className="accent-amber-400"
                    />
                    <span>Activer une cible mobile thématique sur le plateau</span>
                  </label>

                  {draft.hunt && (
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft((n) => {
                          if (n.hunt && n.hunt.slots.length < 6) {
                            n.hunt.slots.push({ x: 112, y: 240 });
                          }
                        })
                      }
                      className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      + Emplacement ({draft.hunt.slots.length}/6)
                    </button>
                  )}
                </div>

                {draft.hunt && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-slate-400 mb-1">Apparence</label>
                      <select
                        value={draft.hunt.kind}
                        onChange={(e) =>
                          updateDraft((n) => {
                            if (!n.hunt) return;
                            n.hunt.kind = e.target.value as HuntDef['kind'];
                            n.hunt.sequential = n.hunt.kind === 'LOCOMOTIVE';
                          })
                        }
                        className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 text-white"
                      >
                        {HUNT_KIND_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Touches requises</label>
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={draft.hunt.goal}
                        onChange={(e) =>
                          updateDraft((n) => {
                            if (n.hunt) n.hunt.goal = Number(e.target.value);
                          })
                        }
                        className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Prime (pts)</label>
                      <input
                        type="number"
                        step={5000}
                        value={draft.hunt.reward}
                        onChange={(e) =>
                          updateDraft((n) => {
                            if (n.hunt) n.hunt.reward = Number(e.target.value);
                          })
                        }
                        className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 font-mono text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Étage supérieur optionnel (Mezzanine layer = 2) */}
              <div className="p-3 rounded-lg bg-[#0B0E15] border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-200">
                    Étage supérieur surélevé (Mezzanine / Balcon jouable)
                  </span>
                  {draft.upperPlayfield ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected({ kind: 'upperDeck', vertexIndex: 0 });
                          setInspectorTab('element');
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 text-sky-300 hover:text-white cursor-pointer"
                      >
                        Configurer « {draft.upperPlayfield.name} »
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((n) => {
                            delete n.upperPlayfield;
                            n.ramps.forEach((r) => {
                              delete r.exitsToUpperDeck;
                            });
                          })
                        }
                        className="px-2 py-1 rounded bg-slate-800 text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        Retirer
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((n) => {
                            n.upperPlayfield = {
                              id: `${n.id}_upper`,
                              name: 'MEZZANINE HAUTE',
                              style: 'CYBER_GLASS',
                              bounds: [
                                { x: 18, y: 90 },
                                { x: 104, y: 90 },
                                { x: 108, y: 172 },
                                { x: 84, y: 216 },
                                { x: 18, y: 216 },
                              ],
                              openEdgeIndices: [2],
                              borderColor: n.palette.accentPrimary.slice(0, 7),
                              fillColor: n.palette.bgSecondary.slice(0, 7),
                              flippers: [
                                {
                                  id: `${n.id}_up_flp`,
                                  side: 'LEFT',
                                  zone: 'UPPER',
                                  pivot: { x: 28, y: 180 },
                                  length: 25,
                                  radius: 3.8,
                                  restAngle: 0.44,
                                  activeAngle: -0.5,
                                },
                              ],
                              bumpers: [
                                {
                                  id: `${n.id}_up_bmp`,
                                  x: 58,
                                  y: 120,
                                  radius: 10,
                                  points: 3200,
                                  label: 'ÉTAGE',
                                  colorStyle: 'GOLD',
                                  iconStyle: 'STAR',
                                },
                              ],
                              targets: [],
                              rollovers: [],
                            };
                            if (n.ramps[0]) n.ramps[0].exitsToUpperDeck = true;
                          })
                        }
                        className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 hover:text-amber-200 cursor-pointer"
                      >
                        + Mezzanine Gauche
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft((n) => {
                            n.upperPlayfield = {
                              id: `${n.id}_upper`,
                              name: 'BALCON SURÉLEVÉ',
                              style: 'WOOD_BALCONY',
                              bounds: [
                                { x: 122, y: 92 },
                                { x: 206, y: 92 },
                                { x: 206, y: 218 },
                                { x: 140, y: 218 },
                                { x: 118, y: 176 },
                              ],
                              openEdgeIndices: [3],
                              borderColor: n.palette.accentSecondary.slice(0, 7),
                              fillColor: n.palette.bgSecondary.slice(0, 7),
                              flippers: [
                                {
                                  id: `${n.id}_up_flp`,
                                  side: 'RIGHT',
                                  zone: 'UPPER',
                                  pivot: { x: 196, y: 182 },
                                  length: 25,
                                  radius: 3.8,
                                  restAngle: 2.7016,
                                  activeAngle: 3.6416,
                                },
                              ],
                              bumpers: [
                                {
                                  id: `${n.id}_up_bmp`,
                                  x: 162,
                                  y: 122,
                                  radius: 10,
                                  points: 3200,
                                  label: 'BALCON',
                                  colorStyle: 'GOLD',
                                  iconStyle: 'STAR',
                                },
                              ],
                              targets: [],
                              rollovers: [],
                            };
                            if (n.ramps[0]) n.ramps[0].exitsToUpperDeck = true;
                          })
                        }
                        className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 hover:text-amber-200 cursor-pointer"
                      >
                        + Balcon Droit
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Palette rapide */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Palette lumineuse & caisse</span>
                  <button
                    type="button"
                    onClick={() => {
                      const refTbl = BUILTIN_TABLES.find((t) => t.id === activeDecor);
                      if (refTbl) {
                        updateDraft((n) => {
                          n.palette = cloneTableDef(refTbl).palette;
                        });
                      }
                    }}
                    className="text-amber-300 hover:underline cursor-pointer"
                  >
                    Appliquer la palette du décor « {activeDecor} »
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(
                    [
                      ['bgPrimary', 'Fond haut'],
                      ['bgSecondary', 'Fond bas'],
                      ['accentPrimary', ' Néon 1'],
                      ['accentSecondary', 'Néon 2'],
                      ['flipperTop', 'Flippers'],
                      ['hudDigits', 'Afficheur'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="block text-[11px] text-slate-400 truncate mb-1">{label}</span>
                      <input
                        type="color"
                        value={draft.palette[key].slice(0, 7)}
                        onChange={(e) =>
                          updateDraft((n) => {
                            n.palette[key] = e.target.value;
                          })
                        }
                        className="w-full h-7 bg-[#0B0E15] border border-slate-700 rounded p-0.5 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ONGLET 3 : 3 MISSIONS SCÉNARISÉES & DIAGNOSTIC FIRMWARE AKA */}
          {inspectorTab === 'missions' && (
            <div className="space-y-5 text-xs">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Les 3 missions du plateau (Finale Maître : +100 000 pts & Multibille ×3)
                </h3>

                {draft.missions.map((m, idx) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg bg-[#0B0E15] border border-slate-800 space-y-2.5"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-slate-400 mb-1">Mission 0{idx + 1} · Titre</label>
                        <input
                          type="text"
                          maxLength={24}
                          value={m.title}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.missions[idx].title = e.target.value;
                            })
                          }
                          className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 text-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Objectif mécanique</label>
                        <select
                          value={m.targetKind}
                          onChange={(e) =>
                            updateDraft((n) => {
                              n.missions[idx].targetKind = e.target.value as MissionEventKind;
                            })
                          }
                          className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 text-white"
                        >
                          <option value="RAMP">Franchir les Rampes</option>
                          <option value="BUMPER">Rebonds Bumpers</option>
                          <option value="TARGET">Abattre des Cibles</option>
                          <option value="SCOOP">Capturer dans un Puits</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-400 mb-1">Quota</label>
                          <input
                            type="number"
                            min={1}
                            max={25}
                            value={m.goal}
                            onChange={(e) =>
                              updateDraft((n) => {
                                n.missions[idx].goal = Number(e.target.value);
                              })
                            }
                            className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 font-mono tabular-nums text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">Prime</label>
                          <input
                            type="number"
                            step={5000}
                            value={m.rewardPoints}
                            onChange={(e) =>
                              updateDraft((n) => {
                                n.missions[idx].rewardPoints = Number(e.target.value);
                              })
                            }
                            className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 font-mono tabular-nums text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={m.description}
                      onChange={(e) =>
                        updateDraft((n) => {
                          n.missions[idx].description = e.target.value;
                        })
                      }
                      className="w-full bg-[#12161F] border border-slate-700 rounded px-2 py-1 text-slate-300"
                    />
                  </div>
                ))}
              </div>

              {/* Diagnostic matériel ESP32-S3 / Gamebuino AKA */}
              <div className="p-3.5 rounded-lg bg-[#0B0E15] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Compatibilité Firmware C++ Gamebuino AKA (ESP32-S3)
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      akaIssues.length === 0 ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {akaIssues.length === 0 ? '100 % Prêt AKA' : `${akaIssues.length} remarque(s)`}
                  </span>
                </div>

                {akaIssues.length === 0 ? (
                  <p className="text-slate-400 leading-relaxed">
                    Ce plateau respecte toutes les limites mémoire de <span className="font-mono text-slate-200">tables_data.inc</span>. Exportez <span className="font-mono text-slate-200">tables.config.json</span> dans <span className="font-mono text-slate-200">src/data/</span> puis exécutez <span className="font-mono text-slate-200">npm run aka:tables</span> et <span className="font-mono text-slate-200">npm run aka:art</span> pour l’embarquer sur la console.
                  </p>
                ) : (
                  <ul className="space-y-1 text-amber-200/90 font-mono text-[11px]">
                    {akaIssues.map((iss, idx) => (
                      <li key={idx}>• {iss}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
