import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import { musicEngine } from './audio/musicEngine';
import { soundEngine } from './audio/soundEngine';
import { ActivePanelTab, CompanionPanels } from './components/CompanionPanels';
import { GamebuinoConsole } from './components/GamebuinoConsole';
import { PinballSimulation } from './engine/physicsEngine';
import { PinballCanvasRenderer } from './engine/renderer';
import {
  ConsoleViewMode,
  InputControlsState,
  LiveGameSnapshot,
  TableThemeId,
} from './types/pinball';

const INITIAL_INPUTS: InputControlsState = {
  leftFlipper: false,
  rightFlipper: false,
  plunger: false,
  nudge: false,
  pauseBtn: false,
  dpadLeft: false,
  dpadRight: false,
  dpadUp: false,
  dpadDown: false,
};

export default function App() {
  // Lazy init: `useRef(new X())` would build (and discard) a new instance on every render.
  const [initialSim] = useState(() => new PinballSimulation());
  const [initialRenderer] = useState(() => new PinballCanvasRenderer());
  const simRef = useRef<PinballSimulation>(initialSim);
  const rendererRef = useRef<PinballCanvasRenderer>(initialRenderer);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const keyboardInputsRef = useRef<InputControlsState>({ ...INITIAL_INPUTS });
  const pointerInputsRef = useRef<InputControlsState>({ ...INITIAL_INPUTS });

  const [activeInputs, setActiveInputs] = useState<InputControlsState>({ ...INITIAL_INPUTS });
  const [snapshot, setSnapshot] = useState<LiveGameSnapshot>(() => simRef.current.getSnapshot());
  const [activeTab, setActiveTab] = useState<ActivePanelTab>('tables');
  const [viewMode, setViewMode] = useState<ConsoleViewMode>('CONSOLE_90');
  const [muted, setMuted] = useState<boolean>(false);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [windowFocused, setWindowFocused] = useState<boolean>(true);
  const [showLcdGrid, setShowLcdGrid] = useState<boolean>(false);

  const mergeInputs = useCallback((): InputControlsState => {
    const k = keyboardInputsRef.current;
    const p = pointerInputsRef.current;

    // Optional HTML5 Gamepad polling
    let gpLeft = false;
    let gpRight = false;
    let gpPlunger = false;
    let gpNudge = false;
    let gpPause = false;

    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const pad = pads?.[0];
      if (pad) {
        gpLeft = Boolean(pad.buttons[0]?.pressed || pad.buttons[4]?.pressed || pad.buttons[14]?.pressed);
        gpRight = Boolean(pad.buttons[3]?.pressed || pad.buttons[15]?.pressed);
        gpPlunger = Boolean(pad.buttons[5]?.pressed || pad.buttons[7]?.pressed);
        gpNudge = Boolean(pad.buttons[1]?.pressed || pad.buttons[12]?.pressed);
        gpPause = Boolean(pad.buttons[9]?.pressed || pad.buttons[2]?.pressed);
      }
    }

    return {
      leftFlipper: k.leftFlipper || p.leftFlipper || gpLeft,
      rightFlipper: k.rightFlipper || p.rightFlipper || gpRight,
      plunger: k.plunger || p.plunger || gpPlunger,
      nudge: k.nudge || p.nudge || gpNudge,
      pauseBtn: k.pauseBtn || p.pauseBtn || gpPause,
      dpadLeft: k.dpadLeft || p.dpadLeft,
      dpadRight: k.dpadRight || p.dpadRight,
      dpadUp: k.dpadUp || p.dpadUp,
      dpadDown: k.dpadDown || p.dpadDown,
    };
  }, []);

  const syncActiveInputsUI = useCallback(() => {
    setActiveInputs(mergeInputs());
  }, [mergeInputs]);

  const handlePointerButtonChange = useCallback(
    (key: keyof InputControlsState, pressed: boolean) => {
      if (pressed) {
        soundEngine.unlockAndGetContext();
      }
      pointerInputsRef.current[key] = pressed;
      syncActiveInputsUI();
    },
    [syncActiveInputsUI]
  );

  // Synchronise le thème musical, le mode (Menu / Jeu / Pause) et l'intensité Multibille
  useEffect(() => {
    musicEngine.updateGameContext(
      snapshot.selectedTableId,
      snapshot.gameState,
      snapshot.multiballActive,
      windowFocused
    );
  }, [snapshot.selectedTableId, snapshot.gameState, snapshot.multiballActive, windowFocused]);

  // Keyboard bindings (AZERTY & QWERTY friendly: A/Q/Left = Bouton A, D/Right = Bouton D, Space/Enter/R = R1, B/Z/W/Up = Bouton B)
  useEffect(() => {
    const mapCodeToControl = (code: string): keyof InputControlsState | null => {
      switch (code) {
        case 'KeyA':
        case 'KeyQ':
        case 'ArrowLeft':
        case 'ShiftLeft':
          return 'leftFlipper';
        case 'KeyD':
        case 'ArrowRight':
        case 'ShiftRight':
          return 'rightFlipper';
        case 'Space':
        case 'Enter':
        case 'KeyR':
          return 'plunger';
        case 'KeyB':
        case 'KeyW':
        case 'KeyZ':
        case 'ArrowUp':
          return 'nudge';
        case 'Escape':
        case 'KeyC':
        case 'KeyP':
          return 'pauseBtn';
        case 'KeyN':
          return 'dpadUp'; // N : nombre de joueurs (+1)
        case 'ArrowDown':
          return 'dpadDown';
        default:
          return null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      soundEngine.unlockAndGetContext();
      if (e.code === 'KeyM' && !e.repeat) {
        e.preventDefault();
        setMusicEnabled((prev) => {
          const next = !prev;
          musicEngine.setEnabled(next, soundEngine.unlockAndGetContext());
          return next;
        });
        return;
      }
      const ctrl = mapCodeToControl(e.code);
      if (!ctrl) return;
      e.preventDefault();
      if (!keyboardInputsRef.current[ctrl]) {
        keyboardInputsRef.current[ctrl] = true;
        syncActiveInputsUI();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const ctrl = mapCodeToControl(e.code);
      if (!ctrl) return;
      e.preventDefault();
      if (keyboardInputsRef.current[ctrl]) {
        keyboardInputsRef.current[ctrl] = false;
        syncActiveInputsUI();
      }
    };

    const onPointerUnlock = () => {
      soundEngine.unlockAndGetContext();
    };

    const onFocus = () => {
      setWindowFocused(true);
    };

    const onBlur = () => {
      setWindowFocused(false);
      keyboardInputsRef.current = { ...INITIAL_INPUTS };
      pointerInputsRef.current = { ...INITIAL_INPUTS };
      // Never lose a ball in the background: pause as soon as the window loses focus
      simRef.current.pauseIfPlaying();
      syncActiveInputsUI();
      setSnapshot(simRef.current.getSnapshot());
    };

    const onVisibilityChange = () => {
      if (document.hidden) onBlur();
      else setWindowFocused(true);
    };

    const onPageHide = () => simRef.current.flushHighScores();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerUnlock, { passive: true });
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerUnlock);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [syncActiveInputsUI]);

  // 60fps Main Simulation & Render Loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let uiSyncAccumulator = 0;

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const combined = mergeInputs();
      simRef.current.step(dt, combined);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          rendererRef.current.render(ctx, simRef.current, 3, showLcdGrid);
        }
      }

      uiSyncAccumulator += dt;
      if (uiSyncAccumulator >= 0.08) {
        uiSyncAccumulator = 0;
        setSnapshot(simRef.current.getSnapshot());
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [mergeInputs, showLcdGrid]);

  // Direct Canvas Clicks for In-Screen Menu & Overlays
  const handleCanvasClick = useCallback((lx: number, ly: number) => {
    const sim = simRef.current;
    if (sim.gameState === 'TABLE_SELECT') {
      if (ly >= 218 && ly <= 242) {
        if (lx < 95) sim.cycleTable(-1);
        else if (lx > 145) sim.cycleTable(1);
      } else if (ly < 44 && lx > 180) {
        sim.setPlayerCount((sim.playerCount % 4) + 1);
      } else if (ly >= 50 && ly <= 220) {
        sim.startNewGame(sim.playerCount);
      } else if (ly >= 285) {
        sim.startNewGame(sim.playerCount);
      }
      setSnapshot(sim.getSnapshot());
    } else if (sim.gameState === 'PAUSED') {
      if (ly >= 160 && ly < 185) {
        sim.gameState = 'PLAYING';
      } else if (ly >= 185 && ly < 206) {
        sim.requestRestart();
      } else if (ly >= 206 && ly < 230) {
        sim.requestMenu();
      }
      setSnapshot(sim.getSnapshot());
    } else if (sim.gameState === 'GAME_OVER') {
      if (ly >= 240 && ly <= 272) {
        sim.startNewGame(sim.playerCount);
      } else if (ly > 272) {
        sim.openTableMenu();
      }
      setSnapshot(sim.getSnapshot());
    }
  }, []);

  const handleSelectTable = (tableId: TableThemeId) => {
    simRef.current.selectTableById(tableId);
    setSnapshot(simRef.current.getSnapshot());
  };

  const handleStartNewGame = () => {
    simRef.current.startNewGame(simRef.current.playerCount);
    setSnapshot(simRef.current.getSnapshot());
  };

  const handlePlayerCountChange = (count: number) => {
    simRef.current.setPlayerCount(count);
    if (simRef.current.gameState === 'PLAYING') {
      simRef.current.startNewGame(count);
    }
    setSnapshot(simRef.current.getSnapshot());
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
    if (!next) {
      soundEngine.unlockAndGetContext();
    }
  };

  const toggleMusic = () => {
    const next = !musicEnabled;
    setMusicEnabled(next);
    musicEngine.setEnabled(next, soundEngine.unlockAndGetContext());
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0E12] text-slate-100">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800/90 bg-[#0E1117]">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            simRef.current.openTableMenu();
            setSnapshot(simRef.current.getSnapshot());
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Gamebuino AKA Pinball
        </a>

        {/* Zone 2: 4 Clean Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {(
            [
              ['tables', 'Plateaux'],
              ['rules', 'Règles & Missions'],
              ['controls', 'Contrôles 90°'],
              ['cpp', 'Code C++ AKA'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === id
                  ? 'text-amber-400 border-amber-400'
                  : 'text-slate-400 border-transparent hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary CTA Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleStartNewGame}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {snapshot.gameState === 'PLAYING' ? 'Recommencer la partie' : 'Lancer une partie'}
          </button>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main className="flex-1 w-full max-w-[1260px] mx-auto px-4 sm:px-6 py-5">
        {/* Workspace Toolbar (View Orientation, Players 1-4, LCD Grid, Audio) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-5 border-b border-slate-800/70">
          {/* Console Orientation Switcher */}
          <div className="flex items-center gap-1 p-1 bg-[#141923] rounded-lg border border-slate-800/80">
            {(
              [
                ['CONSOLE_90', 'Console 90° (240×320)'],
                ['SCREEN_ZOOM', 'Écran Zoom'],
                ['NATIVE_0', 'Vue 0° Native (320×240)'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === mode
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mobile Tab Bar */}
          <div className="flex md:hidden items-center gap-1 p-1 bg-[#141923] rounded-lg border border-slate-800/80 overflow-x-auto">
            {(
              [
                ['tables', 'Plateaux'],
                ['rules', 'Règles'],
                ['controls', 'Contrôles'],
                ['cpp', 'C++'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === id ? 'bg-slate-700 text-white' : 'text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Players + LCD + Sound Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-[#141923] rounded-lg border border-slate-800/80">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handlePlayerCountChange(n)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    snapshot.playerCount === n
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {n}J
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowLcdGrid((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showLcdGrid
                  ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                  : 'bg-[#141923] border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Trame LCD
            </button>

            <button
              type="button"
              onClick={toggleMusic}
              aria-label={musicEnabled ? 'Couper la musique de fond' : 'Activer la musique de fond'}
              title="Raccourci clavier : M"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                musicEnabled
                  ? 'bg-[#141923] border-amber-400/50 text-amber-300 hover:text-amber-200'
                  : 'bg-[#141923] border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Music className={`w-3.5 h-3.5 ${musicEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>{musicEnabled ? 'Musique' : 'Musique off'}</span>
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Activer les effets sonores' : 'Couper les effets sonores'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#141923] border border-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
              <span>{muted ? 'Effets off' : 'Effets'}</span>
            </button>
          </div>
        </div>

        {/* Balanced 2-Column Stage: Left = Rotated Gamebuino AKA Console, Right = Companion Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 flex flex-col items-center">
            <GamebuinoConsole
              canvasRef={canvasRef}
              viewMode={viewMode}
              activeInputs={activeInputs}
              onButtonStateChange={handlePointerButtonChange}
              onCanvasClick={handleCanvasClick}
            />

            <p className="mt-3 text-center text-xs text-slate-400 font-mono">
              A / Q / ← : Flipper Gauche · D / → : Flipper Droit · Espace / R1 : Ressort · B / ↑ : Secousse
            </p>
          </div>

          <div className="lg:col-span-6">
            <CompanionPanels
              activeTab={activeTab}
              snapshot={snapshot}
              activeInputs={activeInputs}
              onSelectTable={handleSelectTable}
              onStartGame={handleStartNewGame}
              onOpenInScreenMenu={() => {
                simRef.current.openTableMenu();
                setSnapshot(simRef.current.getSnapshot());
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
