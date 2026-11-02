import React from 'react';
import {
  ConsoleViewMode,
  InputControlsState,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from '../types/pinball';

interface GamebuinoConsoleProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewMode: ConsoleViewMode;
  activeInputs: InputControlsState;
  onButtonStateChange: (key: keyof InputControlsState, pressed: boolean) => void;
  onCanvasClick: (logicalX: number, logicalY: number) => void;
}

const INTERNAL_SCALE = 3; // 720x960 crisp internal backing buffer for 240x320 logical screen

export const GamebuinoConsole: React.FC<GamebuinoConsoleProps> = ({
  canvasRef,
  viewMode,
  activeInputs,
  onButtonStateChange,
  onCanvasClick,
}) => {
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let lx = ((e.clientX - rect.left) / rect.width) * SCREEN_WIDTH;
    let ly = ((e.clientY - rect.top) / rect.height) * SCREEN_HEIGHT;

    if (viewMode === 'NATIVE_0') {
      // When rotated -90deg visually, map click coordinates back to 240x320 logical canvas
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;
      lx = (1 - normY) * SCREEN_WIDTH;
      ly = normX * SCREEN_HEIGHT;
    }

    onCanvasClick(lx, ly);
  };

  const bindBtn = (key: keyof InputControlsState) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onButtonStateChange(key, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      onButtonStateChange(key, false);
    },
    onPointerCancel: () => onButtonStateChange(key, false),
  });

  // Pure Zoomed Screen Mode (Maximized 240x320 Playfield)
  if (viewMode === 'SCREEN_ZOOM') {
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="relative p-3 rounded-2xl bg-[#161B24] border border-slate-800 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={SCREEN_WIDTH * INTERNAL_SCALE}
            height={SCREEN_HEIGHT * INTERNAL_SCALE}
            onPointerDown={handleCanvasPointerDown}
            className="w-[336px] h-[448px] sm:w-[420px] sm:h-[560px] rounded-lg bg-[#050B18] cursor-pointer select-none touch-none block"
          />
        </div>
      </div>
    );
  }

  // Console Shell Mode: Rotated 90° Clockwise (Portrait 240x320) or Native 0° Inspection (320x240)
  const isNativeUnrotated = viewMode === 'NATIVE_0';

  return (
    <div
      className={`relative flex items-center justify-center transition-all duration-300 ${
        isNativeUnrotated ? 'py-16 sm:py-20' : 'py-1'
      }`}
    >
      <div
        className={`relative select-none transition-transform duration-300 ease-out ${
          isNativeUnrotated ? '-rotate-90 scale-[0.84] sm:scale-[0.92]' : 'rotate-0'
        }`}
      >
        {/* Top-Left Shoulder L1 (was left-top shoulder before 90° CW rotation) */}
        <button
          type="button"
          aria-label="Bouton L1 Menu"
          {...bindBtn('pauseBtn')}
          className={`absolute -left-3.5 top-8 z-0 w-4 h-14 rounded-l-lg border border-slate-900 bg-slate-700 text-[9px] font-mono font-bold text-slate-300 flex items-center justify-center transition-transform duration-100 ${
            activeInputs.pauseBtn ? 'translate-x-1 bg-slate-600' : 'hover:bg-slate-600'
          }`}
        >
          <span className="-rotate-90 whitespace-nowrap">L1</span>
        </button>

        {/* Top-Right Expansion PCB Module (authentic green/gold Gamebuino AKA header from reference!) */}
        <div
          aria-hidden="true"
          className="absolute -right-2.5 top-10 z-0 w-3 h-12 rounded-r-md bg-emerald-800 border border-slate-950 flex flex-col justify-evenly items-end pr-0.5"
        >
          <span className="w-1.5 h-1 bg-amber-300 rounded-xs" />
          <span className="w-1.5 h-1 bg-amber-300 rounded-xs" />
          <span className="w-1.5 h-1 bg-amber-300 rounded-xs" />
          <span className="w-1.5 h-1 bg-amber-300 rounded-xs" />
        </div>

        {/* Bottom-Right Shoulder R1 — PLUNGER SPRING TRIGGER! (was top-right shoulder before 90° CW rotation) */}
        <button
          type="button"
          aria-label="Bouton R1 Tendre le ressort"
          {...bindBtn('plunger')}
          className={`absolute -right-4 bottom-10 z-0 w-5 h-20 rounded-r-xl border-2 border-slate-950 font-mono font-bold text-[10px] flex flex-col items-center justify-center gap-1 shadow-lg cursor-pointer touch-none transition-transform duration-100 ${
            activeInputs.plunger
              ? 'translate-x-[-3px] bg-amber-400 text-slate-950'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
        >
          <span className="rotate-90 whitespace-nowrap tracking-tight">R1 · LANCER</span>
        </button>

        {/* Iconic Yellow Gamebuino AKA Handheld Body (held vertically 90° CW) */}
        <div className="relative z-10 w-[348px] sm:w-[372px] rounded-[34px] bg-[#EAB308] p-3.5 sm:p-4 border-2 border-[#FEF08A]/50 shadow-[0_20px_50px_rgba(0,0,0,0.65),inset_0_-6px_0_#A16207]">
          {/* 4 Corner Hex Screws */}
          <span className="absolute top-3.5 left-3.5 w-2.5 h-2.5 rounded-full bg-amber-900/60 border border-amber-950/60" />
          <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 rounded-full bg-amber-900/60 border border-amber-950/60" />
          <span className="absolute bottom-3.5 left-3.5 w-2.5 h-2.5 rounded-full bg-amber-900/60 border border-amber-950/60" />
          <span className="absolute bottom-3.5 right-3.5 w-2.5 h-2.5 rounded-full bg-amber-900/60 border border-amber-950/60" />

          {/* TOP CHIN (Was Left Grip before 90° CW Rotation): D-Pad + Speaker Slots + Menu C */}
          <div className="flex items-center justify-between px-4 pt-0.5 pb-2.5">
            {/* Speaker Grill Slots */}
            <div className="flex flex-col gap-1" aria-hidden="true">
              <div className="w-7 h-1 rounded-full bg-amber-950/55" />
              <div className="w-7 h-1 rounded-full bg-amber-950/55" />
              <div className="w-7 h-1 rounded-full bg-amber-950/55" />
            </div>

            {/* Interactive Cross D-Pad */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute w-5 h-16 bg-slate-900 rounded-md shadow-inner border border-slate-950" />
              <div className="absolute w-16 h-5 bg-slate-900 rounded-md shadow-inner border border-slate-950" />
              <button
                type="button"
                aria-label="Haut"
                {...bindBtn('dpadUp')}
                className={`absolute top-0 w-5 h-6 rounded-t-md cursor-pointer touch-none ${
                  activeInputs.dpadUp ? 'bg-slate-700' : 'hover:bg-slate-800'
                }`}
              />
              <button
                type="button"
                aria-label="Bas"
                {...bindBtn('dpadDown')}
                className={`absolute bottom-0 w-5 h-6 rounded-b-md cursor-pointer touch-none ${
                  activeInputs.dpadDown ? 'bg-slate-700' : 'hover:bg-slate-800'
                }`}
              />
              <button
                type="button"
                aria-label="Gauche"
                {...bindBtn('dpadLeft')}
                className={`absolute left-0 w-6 h-5 rounded-l-md cursor-pointer touch-none ${
                  activeInputs.dpadLeft ? 'bg-slate-700' : 'hover:bg-slate-800'
                }`}
              />
              <button
                type="button"
                aria-label="Droite"
                {...bindBtn('dpadRight')}
                className={`absolute right-0 w-6 h-5 rounded-r-md cursor-pointer touch-none ${
                  activeInputs.dpadRight ? 'bg-slate-700' : 'hover:bg-slate-800'
                }`}
              />
              <div className="w-3 h-3 rounded-full bg-slate-800 pointer-events-none z-10" />
            </div>

            {/* Orientation Engraving */}
            <div className="text-right font-mono text-[10px] font-bold text-amber-950/80 leading-tight">
              <div>AKA 90°</div>
              <div>240×320</div>
            </div>
          </div>

          {/* CENTER BEZEL & ROTATED 240x320 TFT DISPLAY */}
          <div className="rounded-2xl bg-[#161B24] p-2.5 border-2 border-slate-900 shadow-inner">
            <div className="flex items-center justify-between px-1 pb-1.5 text-[9px] font-mono font-bold text-slate-400">
              <span>HUD HAUT (GAUCHE 0°)</span>
              <span className="text-amber-400">GAMEBUINO AKA</span>
            </div>

            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                width={SCREEN_WIDTH * INTERNAL_SCALE}
                height={SCREEN_HEIGHT * INTERNAL_SCALE}
                onPointerDown={handleCanvasPointerDown}
                className="w-[294px] h-[392px] sm:w-[318px] sm:h-[424px] rounded-md bg-[#050B18] cursor-pointer touch-none block border border-slate-950"
              />
            </div>
          </div>

          {/* BOTTOM CHIN (Was Right Grip before 90° CW Rotation): A (Left Flip), D (Right Flip), B (Nudge), C (Pause) */}
          <div className="pt-3 pb-1 px-2 flex items-center justify-between gap-2">
            {/* LEFT FLIPPER: BUTTON A */}
            <button
              type="button"
              aria-label="Bouton A Flipper Gauche"
              {...bindBtn('leftFlipper')}
              className={`group flex flex-col items-center justify-center w-20 h-16 rounded-2xl border-2 border-slate-950 font-mono transition-transform duration-75 cursor-pointer touch-none shadow-md ${
                activeInputs.leftFlipper
                  ? 'translate-y-0.5 bg-amber-300 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <span className="text-base font-bold leading-none">A</span>
              <span
                className={`text-[9px] mt-1 font-semibold ${
                  activeInputs.leftFlipper ? 'text-slate-900' : 'text-amber-400'
                }`}
              >
                FLIP GAUCHE
              </span>
            </button>

            {/* CENTER STACK: C (Top = Pause/Menu) & B (Bottom = Secousse/Nudge) */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                aria-label="Bouton C Pause ou Menu"
                {...bindBtn('pauseBtn')}
                className={`px-3.5 py-1 rounded-lg border border-slate-950 font-mono text-[10px] font-bold transition-transform duration-75 cursor-pointer touch-none ${
                  activeInputs.pauseBtn
                    ? 'translate-y-0.5 bg-slate-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                C · MENU
              </button>

              <button
                type="button"
                aria-label="Bouton B Secousse Nudge"
                {...bindBtn('nudge')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-slate-950 font-mono text-xs font-bold transition-transform duration-75 cursor-pointer touch-none shadow ${
                  activeInputs.nudge
                    ? 'translate-y-0.5 bg-red-500 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-red-400'
                }`}
              >
                <span>B</span>
                <span className="text-[10px] text-slate-200">SECOUSSE</span>
              </button>
            </div>

            {/* RIGHT FLIPPER: BUTTON D */}
            <button
              type="button"
              aria-label="Bouton D Flipper Droit"
              {...bindBtn('rightFlipper')}
              className={`group flex flex-col items-center justify-center w-20 h-16 rounded-2xl border-2 border-slate-950 font-mono transition-transform duration-75 cursor-pointer touch-none shadow-md ${
                activeInputs.rightFlipper
                  ? 'translate-y-0.5 bg-amber-300 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <span className="text-base font-bold leading-none">D</span>
              <span
                className={`text-[9px] mt-1 font-semibold ${
                  activeInputs.rightFlipper ? 'text-slate-900' : 'text-amber-400'
                }`}
              >
                FLIP DROIT
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
