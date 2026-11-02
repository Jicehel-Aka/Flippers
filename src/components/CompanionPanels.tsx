import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, RotateCw } from 'lucide-react';
import { PINBALL_TABLES } from '../data/tables';
import { PinballCanvasRenderer } from '../engine/renderer';
import {
  InputControlsState,
  LiveGameSnapshot,
  PinballTableDef,
  TableThemeId,
  VIEWPORT_HEIGHT,
  WORLD_HEIGHT,
} from '../types/pinball';

export type ActivePanelTab = 'tables' | 'rules' | 'controls' | 'cpp';

interface CompanionPanelsProps {
  activeTab: ActivePanelTab;
  snapshot: LiveGameSnapshot;
  activeInputs: InputControlsState;
  onSelectTable: (id: TableThemeId) => void;
  onStartGame: () => void;
  onOpenInScreenMenu: () => void;
}

interface TablePreviewThumbProps {
  tableId: TableThemeId;
  showCameraWindow: boolean;
  cameraY: number;
  cameraZoom: number;
}

const TablePreviewThumb: React.FC<TablePreviewThumbProps> = ({
  tableId,
  showCameraWindow,
  cameraY,
  cameraZoom,
}) => {
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = staticRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const renderer = new PinballCanvasRenderer();
    renderer.renderTablePreview(ctx, tableId, canvas.width, canvas.height);
  }, [tableId]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!showCameraWindow) return;

    const visibleWorldH = Math.min(WORLD_HEIGHT, VIEWPORT_HEIGHT / Math.max(0.4, cameraZoom));
    const maxCamAtZoom = Math.max(0, WORLD_HEIGHT - visibleWorldH);
    const effectiveCamY = Math.max(0, Math.min(maxCamAtZoom, cameraY));

    const winY = (effectiveCamY / WORLD_HEIGHT) * overlay.height;
    const winH = (visibleWorldH / WORLD_HEIGHT) * overlay.height;

    ctx.fillStyle = 'rgba(4, 8, 16, 0.42)';
    if (winY > 0) {
      ctx.fillRect(0, 0, overlay.width, winY);
    }
    if (winY + winH < overlay.height) {
      ctx.fillRect(0, winY + winH, overlay.width, overlay.height - (winY + winH));
    }

    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(
      1.5,
      Math.max(1.5, winY),
      overlay.width - 3,
      Math.min(overlay.height - 3, winH)
    );
  }, [showCameraWindow, cameraY, cameraZoom]);

  return (
    <div className="relative w-[68px] h-[147px] rounded-md overflow-hidden bg-[#050B18] shrink-0">
      <canvas ref={staticRef} width={144} height={312} className="w-full h-full block" />
      <canvas
        ref={overlayRef}
        width={136}
        height={294}
        className="absolute inset-0 w-full h-full pointer-events-none block"
      />
    </div>
  );
};

const AKA_CPP_SKETCH = `#include <Gamebuino-AKA.h>

// Rotation 90° vers la droite : l'écran 320x240 devient 240 (large) x 320 (haut)
// Le bandeau gauche sans rotation (x: 0..46) devient le HUD supérieur fixe (y: 0..46)
constexpr int SCREEN_W = 240;
constexpr int SCREEN_H = 320;
constexpr int HUD_H    = 46;
constexpr int VIEW_H   = SCREEN_H - HUD_H; // Fenêtre de jeu : 274 px
constexpr int WORLD_H  = 520;              // Plateau équilibré ~1.9 écrans (240x520)
constexpr float MAX_CAM_Y = (float)(WORLD_H - VIEW_H);
constexpr float OVERVIEW_ZOOM = (float)VIEW_H / (float)WORLD_H;

struct Ball {
  float x = 225.0f, y = 473.0f, vx = 0.0f, vy = 0.0f;
  bool active = false, inShooter = true;
};

Ball balls[3];
uint32_t score = 0;
uint8_t missionIdx = 0, missionProg = 0;
float cameraY = MAX_CAM_Y;
float cameraZoom = OVERVIEW_ZOOM; // Arrivée en vue d'ensemble complète !
float introTimer = 2.35f;

void setup() {
  gb.begin();
  gb.display.setRotation(1); // 90° sens horaire -> 240x320 portrait
  balls[0].active = true;
}

void updateCameraLowestBall(float dt) {
  if (introTimer > 0.0f) {
    introTimer = max(0.0f, introTimer - dt);
    float u = constrain((1.0f - introTimer / 2.35f - 0.34f) / 0.66f, 0.0f, 1.0f);
    cameraZoom = OVERVIEW_ZOOM + (1.0f - OVERVIEW_ZOOM) * (u * u * (3.0f - 2.0f * u));
  } else {
    cameraZoom = 1.0f;
  }

  // Toujours suivre la bille active la plus basse (plus grand Y) en Multibille !
  int lowestIdx = -1;
  for (int i = 0; i < 3; i++) {
    if (!balls[i].active) continue;
    if (lowestIdx < 0 || (!balls[i].inShooter && balls[i].y > balls[lowestIdx].y)) {
      lowestIdx = i;
    }
  }
  if (lowestIdx < 0) return;

  float targetCam = constrain(balls[lowestIdx].y - VIEW_H * 0.56f, 0.0f, MAX_CAM_Y);
  cameraY += (targetCam - cameraY) * min(1.0f, dt * 16.0f);
  cameraY = max(cameraY, min(MAX_CAM_Y, balls[lowestIdx].y - (VIEW_H - 44.0f)));
}

void loop() {
  if (!gb.update()) return;
  bool flipLeft  = gb.buttons.repeat(BUTTON_A, 0);
  bool flipRight = gb.buttons.repeat(BUTTON_D, 0);
  updateCameraLowestBall(1.0f / 60.0f);

  gb.display.clear();
  // Rendu zoomé à l'arrivée puis scrolling fluide sur la bille la plus basse
}`;

export const CompanionPanels: React.FC<CompanionPanelsProps> = ({
  activeTab,
  snapshot,
  activeInputs,
  onSelectTable,
  onStartGame,
  onOpenInScreenMenu,
}) => {
  const [copied, setCopied] = useState(false);
  const currentTable: PinballTableDef =
    PINBALL_TABLES.find((t) => t.id === snapshot.selectedTableId) ?? PINBALL_TABLES[0];
  const activePlayer = snapshot.players[snapshot.activePlayerIndex];

  const multiballReadout = snapshot.multiballActive
    ? `MULTIBILLE ×${snapshot.activeBallsCount} ACTIF`
    : `Verrous Multibille : ${snapshot.lockedBallsCount}/2`;

  const handleCopyCpp = () => {
    navigator.clipboard?.writeText(AKA_CPP_SKETCH).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Live Scoreboard + Active Mission + Multiball Tracker */}
      <section className="rounded-xl bg-[#12161F] border border-slate-800/90 p-5">
        <div className="flex items-baseline justify-between gap-4 pb-3.5 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-white">
              Tableau des scores & Mission active
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
               Plateau 240×520 px · Bille {snapshot.currentBallNumber}/{snapshot.totalBallsPerGame}{' '}
              · {currentTable.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenInScreenMenu}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Menu sur écran AKA
          </button>
        </div>

        {/* 4-Player Tabular Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 sm:gap-y-0 sm:divide-x divide-slate-800/80 py-4">
          {snapshot.players.map((p, idx) => {
            const isActive =
              snapshot.gameState === 'PLAYING' && p.playerIndex === snapshot.activePlayerIndex;
            return (
              <div
                key={p.playerIndex}
                className={`${idx === 0 ? 'sm:pr-4' : idx === 3 ? 'sm:pl-4' : 'sm:px-4'} ${
                  idx % 2 === 1
                    ? 'pl-3 sm:pl-4 border-l border-slate-800/80 sm:border-l-0'
                    : 'pr-3 sm:pr-4'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className={isActive ? 'font-semibold text-amber-400' : ''}>
                    Joueur {p.playerIndex + 1}
                  </span>
                  <span className="font-mono tabular-nums">{p.ballsRemaining}b</span>
                </div>
                <div
                  className={`font-mono text-lg font-bold tabular-nums mt-1 ${
                    isActive ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  {p.displayScore.toLocaleString('fr-FR')}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                  Bonus ×{p.bonusMultiplier} · {p.missionsCompleted} miss.
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Mission Strip */}
        <div className="py-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <span className="font-mono font-semibold text-amber-300">
              Mission {(activePlayer?.activeMissionIndex ?? 0) + 1}/3 : {snapshot.activeMissionTitle}
            </span>
            <span className="text-slate-400 ml-2">{snapshot.activeMissionDesc}</span>
          </div>
          <span className="font-mono font-bold text-white tabular-nums shrink-0">
            {snapshot.activeMissionProgress}/{snapshot.activeMissionGoal}
          </span>
        </div>

        {/* Multiball / Combo / Plunger / Nudge Readout */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 font-mono tabular-nums">
          <div className="flex items-center gap-2">
            <span className={snapshot.multiballActive ? 'text-amber-400 font-bold' : 'text-slate-300'}>
              {multiballReadout}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span>
              Combo{' '}
              <strong className="text-amber-400">
                ×{Math.max(1, snapshot.comboCount)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span>Ressort R1 : {Math.round(snapshot.plungerTension * 100)}%</span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className={snapshot.isTilted ? 'text-red-400 font-bold' : ''}>
              {snapshot.isTilted
                ? 'TILT ACTIF'
                : `Secousse B : ${Math.min(100, Math.round((snapshot.tiltWarning / 2.85) * 100))}%`}
            </span>
          </div>
        </div>
      </section>

      {/* Contextual Panel Body */}
      {activeTab === 'tables' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              4 architectures de plateaux uniques (240×520 px)
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Chaque flipper possède sa propre disposition de flippers, rampes moulées ou en rails
              chromés, formations de bumpers et 3 missions dédiées.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {PINBALL_TABLES.map((table) => {
              const selected = table.id === snapshot.selectedTableId;
              const hi = snapshot.highScores[table.id] ?? 0;
              const totalFlippers = 2 + table.extraFlippers.length;
              return (
                <div
                  key={table.id}
                  onClick={() => onSelectTable(table.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTable(table.id);
                    }
                  }}
                  className={`group flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#161C28] border-amber-400/70'
                      : 'bg-[#12161F] border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <TablePreviewThumb
                    tableId={table.id}
                    showCameraWindow={selected && snapshot.gameState === 'PLAYING'}
                    cameraY={snapshot.cameraY}
                    cameraZoom={snapshot.cameraZoom}
                  />

                  <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[147px]">
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-base font-semibold text-white truncate">
                          {table.name}
                        </h3>
                        <span className="font-mono text-xs text-amber-400 tabular-nums shrink-0">
                          Record {hi.toLocaleString('fr-FR')}
                        </span>
                      </div>

                      <p className="text-xs text-amber-300/90 mt-0.5">{table.layoutBadge}</p>
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                        {table.description}
                      </p>
                    </div>

                    <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
                      <span>
                        {totalFlippers} flippers · {table.ramps.length} rampes ·{' '}
                        {table.bumpers.length} bumpers · 3 missions
                      </span>
                      {selected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartGame();
                          }}
                          className="text-amber-300 font-sans font-semibold hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {snapshot.gameState === 'PLAYING'
                            ? 'Voir l’aperçu & relancer →'
                            : 'Jouer sur ce plateau →'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'rules' && (
        <section className="rounded-xl bg-[#12161F] border border-slate-800/90 p-5 space-y-5">
          <div>
            <p className="text-xs text-amber-400 font-medium">{currentTable.layoutBadge}</p>
            <h2 className="text-xl font-semibold text-white mt-0.5">{currentTable.name}</h2>
            <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
              {currentTable.description}
            </p>
          </div>

          {/* 3 Table-Specific Missions */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2.5">
              Missions du plateau (Finale Maître : +100 000 pts & Multibille ×3)
            </h3>
            <div className="divide-y divide-slate-800/80 border-t border-b border-slate-800/80">
              {currentTable.missions.map((m, idx) => {
                const activeIdx = (activePlayer?.activeMissionIndex ?? 0) % 3;
                const isCurrent = idx === activeIdx;
                const isDone = idx < activeIdx;
                return (
                  <div key={m.id} className="py-3 flex items-baseline justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        0{idx + 1}. {m.title}{' '}
                        <span className="font-mono text-amber-400 font-normal ml-1">
                          +{m.rewardPoints.toLocaleString('fr-FR')} pts
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{m.description}</p>
                    </div>
                    <span
                      className={`font-mono text-xs tabular-nums shrink-0 ${
                        isDone
                          ? 'text-emerald-400 font-semibold'
                          : isCurrent
                            ? 'text-amber-300 font-semibold'
                            : 'text-slate-500'
                      }`}
                    >
                      {isDone
                        ? 'Complétée'
                        : isCurrent
                          ? `${activePlayer?.missionStepProgress ?? 0}/${m.goal}`
                          : `0/${m.goal}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table Specific Mechanics */}
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <p>
              <strong className="text-white">Rampes 3D :</strong> {currentTable.rulesSummary.rampsRule}
            </p>
            <p>
              <strong className="text-white">Multibille ×3 & Caméra :</strong>{' '}
              {currentTable.rulesSummary.multiballRule} En Multibille, la caméra suit toujours
              prioritairement la bille la plus basse pour garantir la défense aux flippers.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'controls' && (
        <section className="rounded-xl bg-[#12161F] border border-slate-800/90 p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Ergonomie Gamebuino AKA tournée à 90° vers la droite
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                À l’arrivée sur un flipper, la caméra dézoome pour dévoiler l’intégralité du
                plateau 240×520 px avant de zoomer progressivement sur le lanceur et les flippers,
                puis suit toujours la bille la plus basse.
              </p>
            </div>
            <RotateCw className="w-5 h-5 text-amber-400 shrink-0 mt-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:gap-px bg-slate-800/80 border border-slate-800/80 rounded-lg overflow-hidden">
            <div
              className={`p-4 transition-colors ${
                activeInputs.leftFlipper ? 'bg-[#1C222E]' : 'bg-[#0E1219]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-white">Bouton A</span>
                <span className="text-xs text-amber-400 font-medium">Flippers Gauches</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Clavier : <span className="font-mono text-slate-200">A, Q, Flèche Gauche, Shift G</span>
              </p>
            </div>

            <div
              className={`p-4 transition-colors ${
                activeInputs.rightFlipper ? 'bg-[#1C222E]' : 'bg-[#0E1219]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-white">Bouton D</span>
                <span className="text-xs text-amber-400 font-medium">Flippers Droits</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Clavier : <span className="font-mono text-slate-200">D, Flèche Droite, Shift D</span>
              </p>
            </div>

            <div
              className={`p-4 sm:border-t sm:border-slate-800/80 transition-colors ${
                activeInputs.plunger ? 'bg-[#25161B]' : 'bg-[#0E1219]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-white">Gâchette R1</span>
                <span className="text-xs text-red-400 font-medium">Tendre le Ressort</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Clavier : <span className="font-mono text-slate-200">Maintenir Espace, Entrée ou R</span>
              </p>
            </div>

            <div
              className={`p-4 sm:border-t sm:border-slate-800/80 transition-colors ${
                activeInputs.nudge ? 'bg-[#14202E]' : 'bg-[#0E1219]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-white">Bouton B</span>
                <span className="text-xs text-sky-400 font-medium">Secousse (Nudge)</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Clavier : <span className="font-mono text-slate-200">B, Z, W, Flèche Haut</span> (attention au TILT)
              </p>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'cpp' && (
        <section className="rounded-xl bg-[#12161F] border border-slate-800/90 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Firmware C++ Gamebuino AKA (firmware/gamebuino_aka)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Aperçu du moteur C++17 ESP32 (240×520, zoom d’arrivée, Multibille ×3 & caméra bille
                la plus basse). Le projet PlatformIO complet et le workflow GitHub Actions associé
                se trouvent dans <span className="font-mono text-slate-200">firmware/gamebuino_aka/</span>.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyCpp}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copié' : 'Copier le code'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-lg bg-[#090C12] border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-[380px] leading-relaxed">
            <code>{AKA_CPP_SKETCH}</code>
          </pre>
        </section>
      )}
    </div>
  );
};
