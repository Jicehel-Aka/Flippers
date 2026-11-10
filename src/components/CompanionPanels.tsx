import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, RotateCw, Sliders, Wrench } from 'lucide-react';
import { MUSIC_THEME_META } from '../audio/musicEngine';
import { PINBALL_TABLES, isBuiltinTableId, isTableModified } from '../data/tables';
import { PinballCanvasRenderer } from '../engine/renderer';
import {
  InputControlsState,
  LiveGameSnapshot,
  PinballTableDef,
  TableThemeId,
  VIEWPORT_HEIGHT,
  WORLD_HEIGHT,
  resolveDecorTheme,
  resolveMusicTheme,
} from '../types/pinball';

export type ActivePanelTab = 'tables' | 'editor' | 'rules' | 'controls' | 'cpp';

type CategoryFilter = 'all' | 'scifi' | 'adventure' | 'fantasy' | 'custom';

const SCIFI_THEMES = new Set(['aka_esp32', 'space_odyssey', 'star_galaxy', 'classique']);
const ADVENTURE_THEMES = new Set(['solaire', 'prehistoire', 'farwest', 'train']);
const FANTASY_THEMES = new Set(['halloween', 'candy', 'bonbons', 'crypte']);

interface CompanionPanelsProps {
  activeTab: ActivePanelTab;
  snapshot: LiveGameSnapshot;
  activeInputs: InputControlsState;
  catalogVersion: number;
  onSelectTable: (id: TableThemeId) => void;
  onStartGame: () => void;
  onEditTable: (id: TableThemeId) => void;
  onOpenInScreenMenu: () => void;
}

interface TablePreviewThumbProps {
  tableId: TableThemeId;
  catalogVersion: number;
  showCameraWindow: boolean;
  cameraY: number;
  cameraZoom: number;
}

const TablePreviewThumb: React.FC<TablePreviewThumbProps> = ({
  tableId,
  catalogVersion,
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const renderer = new PinballCanvasRenderer();
    renderer.renderTablePreview(ctx, tableId, canvas.width, canvas.height);
  }, [tableId, catalogVersion]);

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

const AKA_CPP_SKETCH = `// firmware/aka_idf/main/app_main.cpp — ESP-IDF 5.5.1 (ESP32-S3 · Gamebuino AKA)
#include "gb_core.h"
#include "gb_graphics.h"
#include "gb_ll_lcd.h"
#include "core/input.h"
#include "aka_runtime/aka_runtime.h"
#include "game/pinball_core.h"    // Physique portable 360 Hz + tables_data.inc généré
#include "platform/platform.h"
#include "ui/render.h"

gb_core g_core;
extern gb_graphics gfx;
static pinball::Game g_game;

extern "C" void app_main(void) {
  g_core.init();
  gfx.set_backlight_percent(80);
  gfx.set_refresh_rate(60);

  input_init();
  akaRuntime.begin("pinball");
  akaRuntime.setCredits("AKA Pinball", "jeancharleslebeau", "MIT", "Gamebuino AKA");
  akaRuntime.setBeforeExitCallback([] { platform::audio_silence(); });

  platform::audio_init();
  g_game.begin(platform::store()); // Records persistés dans /sdcard/pinball/records.bin

  uint32_t last = (uint32_t)(esp_timer_get_time() / 1000);
  while (true) {
    input_poll(g_keys);
    if (!akaRuntime.update(g_keys)) { // Menu système AKA (langues, crédits, capture, loader)
      platform::audio_silence();
      vTaskDelay(pdMS_TO_TICKS(16));
      continue;
    }

    while (!lcd_refresh_completed()) {}
    const uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
    g_game.update((now - last) * 0.001f, platform::input_from_keys(g_keys), now);
    last = now;

    pinball::SfxEvent ev;
    while (g_game.popSfx(ev)) platform::audio_play(g_game.tbl().decor, ev.id, ev.arg);

    render::draw(g_game); // Portrait 240x320 (HUD 240x46 + plateau 240x520)
    vid::present();
    vTaskDelay(1);
  }
}`;

export const CompanionPanels: React.FC<CompanionPanelsProps> = ({
  activeTab,
  snapshot,
  activeInputs,
  catalogVersion,
  onSelectTable,
  onStartGame,
  onEditTable,
  onOpenInScreenMenu,
}) => {
  const [copied, setCopied] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const currentTable: PinballTableDef =
    PINBALL_TABLES.find((t) => t.id === snapshot.selectedTableId) ?? PINBALL_TABLES[0];
  const activePlayer = snapshot.players[snapshot.activePlayerIndex];

  const multiballReadout = snapshot.multiballActive
    ? `MULTIBILLE ×${snapshot.activeBallsCount} ACTIF`
    : `Verrous Multibille : ${snapshot.lockedBallsCount}/2`;

  const hasCustomOrModified = useMemo(
    () => PINBALL_TABLES.some((t) => !isBuiltinTableId(t.id) || isTableModified(t.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogVersion]
  );

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PINBALL_TABLES.filter((t) => {
      const decor = resolveDecorTheme(t);
      if (category === 'scifi' && !SCIFI_THEMES.has(decor)) return false;
      if (category === 'adventure' && !ADVENTURE_THEMES.has(decor)) return false;
      if (category === 'fantasy' && !FANTASY_THEMES.has(decor)) return false;
      if (category === 'custom' && isBuiltinTableId(t.id) && !isTableModified(t.id)) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.layoutBadge.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, catalogVersion]);

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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {PINBALL_TABLES.length} plateaux thématiques aux architectures uniques (240×520 px)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Décors illustrés sur mesure, éléments mécaniques spécialisés, bandes-son longues de
                32 mesures et configuration ouverte <span className="font-mono">tables.config.json</span>.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onEditTable(currentTable.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A202E] border border-slate-700 text-xs font-medium text-amber-300 hover:text-amber-200 hover:border-amber-400/50 transition-colors cursor-pointer shrink-0"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Éditeur de tables maison</span>
            </button>
          </div>

          {/* Barre de recherche & filtres d'univers */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  ['all', `Tous (${PINBALL_TABLES.length})`],
                  ['scifi', 'Sci-Fi & Rétro'],
                  ['adventure', 'Aventure & Rail'],
                  ['fantasy', 'Fantaisie & Gothique'],
                  ...(hasCustomOrModified ? ([['custom', 'Maison / Modifiés']] as const) : []),
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    category === id
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-[#12161F] border border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer un plateau…"
              className="bg-[#12161F] border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 w-full sm:w-[180px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 max-h-[640px] overflow-y-auto pr-1">
            {filteredTables.map((table) => {
              const selected = table.id === snapshot.selectedTableId;
              const hi = snapshot.highScores[table.id] ?? 0;
              const topEntry = snapshot.scoreBoards?.[table.id]?.[0];
              const totalFlippers =
                2 + table.extraFlippers.length + (table.upperPlayfield?.flippers.length ?? 0);
              const musicInfo = MUSIC_THEME_META[resolveMusicTheme(table)];
              const statusNote = !isBuiltinTableId(table.id)
                ? ' · Maison'
                : isTableModified(table.id)
                  ? ' · Modifié'
                  : '';

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
                    catalogVersion={catalogVersion}
                    showCameraWindow={selected && snapshot.gameState === 'PLAYING'}
                    cameraY={snapshot.cameraY}
                    cameraZoom={snapshot.cameraZoom}
                  />

                  <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[147px]">
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-base font-semibold text-white truncate">
                          {table.name}
                          {statusNote && (
                            <span className="text-xs font-normal text-amber-300">{statusNote}</span>
                          )}
                        </h3>
                        <span className="font-mono text-xs text-amber-400 tabular-nums shrink-0">
                          Record {hi.toLocaleString('fr-FR')}
                          {topEntry && topEntry.score >= hi ? ` · ${topEntry.tri}` : ''}
                        </span>
                      </div>

                      <p className="text-xs text-amber-300/90 mt-0.5">
                        {table.layoutBadge} · {musicInfo.bpm} BPM
                      </p>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                        {table.description}
                      </p>
                    </div>

                    <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
                      <span>
                        {totalFlippers} flippers · {table.ramps.length} rampes ·{' '}
                        {table.bumpers.length + (table.upperPlayfield?.bumpers.length ?? 0)} bumpers
                        {table.upperPlayfield ? ' · Étage sup.' : ''}
                      </span>

                      <div className="flex items-center gap-3 font-sans">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTable(table.id);
                          }}
                          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>Personnaliser</span>
                        </button>

                        {selected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartGame();
                            }}
                            className="text-amber-300 font-semibold hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {snapshot.gameState === 'PLAYING'
                              ? 'Relancer ici →'
                              : 'Jouer sur ce plateau →'}
                          </button>
                        )}
                      </div>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-amber-400 font-medium">{currentTable.layoutBadge}</p>
              <h2 className="text-xl font-semibold text-white mt-0.5">{currentTable.name}</h2>
              <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                {currentTable.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEditTable(currentTable.id)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 shrink-0 cursor-pointer"
            >
              Éditer ce plateau
            </button>
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
              <strong className="text-white">Ambiance musicale :</strong>{' '}
              {MUSIC_THEME_META[resolveMusicTheme(currentTable)].style} (
              {MUSIC_THEME_META[resolveMusicTheme(currentTable)].bpm} BPM, cycle de 32 mesures avec
              variations continues).
            </p>
            <p>
              <strong className="text-white">Rampes 3D continues :</strong>{' '}
              {currentTable.rulesSummary.rampsRule}
            </p>
            {currentTable.upperPlayfield && (
              <p>
                <strong className="text-sky-300">
                  Étage supérieur ({currentTable.upperPlayfield.name}) :
                </strong>{' '}
                Niveau surélevé indépendant équipé de son propre mini-flipper et de cibles dédiées ; la bille survole les obstacles du plateau bas avant de redescendre par le rebord ouvert.
              </p>
            )}
            {currentTable.rulesSummary.specialRule && (
              <p>
                <strong className="text-amber-300">Décor interactif & spécialité :</strong>{' '}
                {currentTable.rulesSummary.specialRule}
              </p>
            )}
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
                <span className="font-mono text-sm font-bold text-white">A / L1 / Gauche</span>
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
                <span className="font-mono text-sm font-bold text-white">D / Droite</span>
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
                <span className="font-mono text-sm font-bold text-white">R1 / Bas</span>
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
                <span className="font-mono text-sm font-bold text-white">B / Haut</span>
                <span className="text-xs text-sky-400 font-medium">Secousse (Nudge)</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Clavier : <span className="font-mono text-slate-200">B, Z, W, Flèche Haut</span> (attention au TILT)
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800/80 pt-3">
            <strong className="text-slate-200">Menu, Musique & Système :</strong>{' '}
            <span className="font-mono text-slate-200">M</span> active/coupe la musique thématique ·{' '}
            <span className="font-mono text-slate-200">C / P / Échap</span> met en pause (double
            appui requis pour recommencer ou quitter) ·{' '}
            <span className="font-mono text-slate-200">N</span> /{' '}
            <span className="font-mono text-slate-200">Flèche Bas</span> règle le nombre de joueurs
            au menu · Sur console AKA, <span className="font-mono text-slate-200">MENU</span> ouvre
            le menu système (langues, capture d’écran, retour au loader).
          </p>
        </section>
      )}

      {activeTab === 'cpp' && (
        <section className="rounded-xl bg-[#12161F] border border-slate-800/90 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Firmware ESP-IDF 5.5.1 Gamebuino AKA (firmware/aka_idf)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Cœur C++ portable à 360 Hz sur <span className="font-mono text-slate-200">gamebuino</span> &{' '}
                <span className="font-mono text-slate-200">aka_runtime</span> (ESP32-S3), avec les{' '}
                {PINBALL_TABLES.length} plateaux générés depuis{' '}
                <span className="font-mono text-slate-200">src/data/tables.config.json</span> et
                paquet carte SD <span className="font-mono text-slate-200">AKA-Pinball-sdcard.zip</span>.
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
