import { PINBALL_TABLES } from '../data/tables';
import {
  BallEntity,
  BuiltinThemeId,
  BumperColorStyle,
  BumperDef,
  HuntDef,
  HUD_HEIGHT,
  InteractiveToyDef,
  PinballTableDef,
  RampDef,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  ScoopVukDef,
  UpperPlayfieldDef,
  VIEWPORT_HEIGHT,
  Vec2,
  WORLD_HEIGHT,
  resolveDecorTheme,
} from '../types/pinball';
import { PinballSimulation } from './physicsEngine';
import { SplineSample, buildRampSpline, buildVukTubeSpline } from './rampSpline';

const BUMPER_COLORS: Record<
  BumperColorStyle,
  { dark: string; main: string; light: string; glow: string }
> = {
  RED: { dark: '#7F1D1D', main: '#DC2626', light: '#FCA5A5', glow: '#EF4444' },
  BLUE: { dark: '#1E3A8A', main: '#2563EB', light: '#93C5FD', glow: '#3B82F6' },
  GOLD: { dark: '#92400E', main: '#F59E0B', light: '#FEF08A', glow: '#FACC15' },
  JADE: { dark: '#064E3B', main: '#059669', light: '#6EE7B7', glow: '#10B981' },
  PURPLE: { dark: '#3B0764', main: '#9333EA', light: '#E9D5FF', glow: '#C084FC' },
  ORANGE: { dark: '#7C2D12', main: '#EA580C', light: '#FED7AA', glow: '#FB923C' },
  PINK: { dark: '#831843', main: '#EC4899', light: '#FBCFE8', glow: '#F472B6' },
  ICE: { dark: '#0C4A6E', main: '#0284C7', light: '#E0F2FE', glow: '#38BDF8' },
};

const PLATE_DY: Record<string, number> = { candy: -186, crypte: -192 };

export class PinballCanvasRenderer {
  private artImages: Map<string, HTMLImageElement> = new Map();
  private splineCache: Map<string, SplineSample[]> = new Map();
  /** Vrai pendant le rendu du décor statique (firmware AKA) : ni flippers, ni billes, ni ressort. */
  private staticArt = false;

  constructor() {
    this.refreshArtworkImages();
  }

  public refreshArtworkImages() {
    if (typeof Image === 'undefined') return;
    for (const table of PINBALL_TABLES) {
      if (table.artworkUrl && !this.artImages.has(table.id)) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = table.artworkUrl;
        this.artImages.set(table.id, img);
        if (resolveDecorTheme(table) === 'solaire' && !this.artImages.has('solaire')) {
          this.artImages.set('solaire', img);
        }
      }
    }
  }

  public invalidateCache() {
    this.splineCache.clear();
    this.refreshArtworkImages();
  }

  private getRampSamples(ramp: RampDef): SplineSample[] {
    const sig = `${ramp.id}:${ramp.exitsToUpperDeck ? 1 : 0}:${ramp.path.map((p) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`).join(';')}`;
    let cached = this.splineCache.get(sig);
    if (!cached) {
      if (this.splineCache.size > 128) {
        this.splineCache.clear();
      }
      cached = buildRampSpline(ramp.path, 9, Boolean(ramp.exitsToUpperDeck)).samples;
      this.splineCache.set(sig, cached);
    }
    return cached;
  }

  private getTubeSamples(sc: ScoopVukDef): SplineSample[] {
    const sig = `tube:${sc.id}:${Math.round(sc.x)},${Math.round(sc.y)}->${Math.round(sc.ejectTo.x)},${Math.round(sc.ejectTo.y)}`;
    let cached = this.splineCache.get(sig);
    if (!cached) {
      cached = buildVukTubeSpline({ x: sc.x, y: sc.y }, sc.ejectTo).samples;
      this.splineCache.set(sig, cached);
    }
    return cached;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    scale: number,
    showLcdGrid: boolean
  ) {
    ctx.save();
    ctx.scale(scale, scale);

    if (sim.gameState === 'TABLE_SELECT') {
      this.renderTableSelectMenu(ctx, sim);
    } else {
      const zoom = sim.cameraZoom;
      const offsetX = SCREEN_WIDTH * (1 - zoom) * 0.5;
      const maxCamAtZoom = Math.max(0, WORLD_HEIGHT - VIEWPORT_HEIGHT / zoom);
      const effectiveCamY = Math.max(0, Math.min(maxCamAtZoom, sim.cameraY));

      // 1. Render Zoomed / Scrolled 240x520 World inside 240x274 Playfield Viewport
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HUD_HEIGHT, SCREEN_WIDTH, VIEWPORT_HEIGHT);
      ctx.clip();

      // Showcase dark cabinet backdrop visible around zoomed-out full-table arrival
      if (zoom < 0.998) {
        ctx.fillStyle = '#03060E';
        ctx.fillRect(0, HUD_HEIGHT, SCREEN_WIDTH, VIEWPORT_HEIGHT);

        const glow = ctx.createRadialGradient(
          SCREEN_WIDTH * 0.5,
          HUD_HEIGHT + VIEWPORT_HEIGHT * 0.5,
          20,
          SCREEN_WIDTH * 0.5,
          HUD_HEIGHT + VIEWPORT_HEIGHT * 0.5,
          150
        );
        glow.addColorStop(0, `${sim.currentTable.palette.accentPrimary}22`);
        glow.addColorStop(1, 'rgba(3, 6, 14, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, HUD_HEIGHT, SCREEN_WIDTH, VIEWPORT_HEIGHT);
      }

      ctx.save();
      ctx.translate(
        offsetX + sim.shakeOffset.x,
        HUD_HEIGHT - effectiveCamY * zoom + sim.shakeOffset.y
      );
      ctx.scale(zoom, zoom);
      this.renderWorldPlayfield(ctx, sim);

      // Subtle outer cabinet frame highlight during overview zoom
      if (zoom < 0.995) {
        ctx.strokeStyle = sim.currentTable.palette.hudBorder;
        ctx.lineWidth = 1.6 / zoom;
        ctx.strokeRect(0, 0, SCREEN_WIDTH, WORLD_HEIGHT);
      }
      ctx.restore();

      // Overview Arrival Pill-Free Caption (fades smoothly as zoom approaches 1.0)
      if (zoom < 0.92) {
        const alpha = Math.min(1, (0.92 - zoom) / 0.25);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(4, 8, 18, 0.82)';
        ctx.fillRect(0, SCREEN_HEIGHT - 22, SCREEN_WIDTH, 22);
        ctx.font = '700 7px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FACC15';
        ctx.fillText(
          `VUE D’ENSEMBLE · ${sim.currentTable.layoutBadge.toUpperCase()}`,
          SCREEN_WIDTH * 0.5,
          SCREEN_HEIGHT - 11
        );
        ctx.restore();
      }

      // Multiball Top-Edge Radar Indicators for balls currently above cameraY!
      if (zoom >= 0.95 && sim.balls.length > 1) {
        for (const b of sim.balls) {
          if (!b.inShooterLane && b.y < effectiveCamY - 3) {
            const indX = Math.max(14, Math.min(210, b.x));
            ctx.save();
            ctx.fillStyle = '#FACC15';
            ctx.beginPath();
            ctx.moveTo(indX, HUD_HEIGHT + 3);
            ctx.lineTo(indX - 4, HUD_HEIGHT + 9);
            ctx.lineTo(indX + 4, HUD_HEIGHT + 9);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      ctx.restore();

      // 2. Render Scroll & Lowest-Ball Mini-Radar on Right Bezel
      this.renderScrollRadar(ctx, sim, effectiveCamY, zoom);

      // 3. Render Pinned Top HUD (y: 0..46 — corresponds to left x: 0..46 unrotated!)
      this.renderTopHud(ctx, sim);

      if (sim.gameState === 'PAUSED') {
        this.renderPauseOverlay(ctx, sim);
      } else if (sim.gameState === 'GAME_OVER') {
        this.renderGameOverOverlay(ctx, sim);
      }
    }

    if (showLcdGrid) {
      this.renderLcdSubpixelOverlay(ctx);
    }

    ctx.restore();
  }

  /**
   * Renders a full-height panoramic miniature of any 240x520 table with its unique layout!
   */
  public renderTablePreview(
    ctx: CanvasRenderingContext2D,
    tableId: PinballTableDef['id'],
    width: number,
    height: number
  ) {
    const tempSim = new PinballSimulation();
    tempSim.selectTableById(tableId);
    tempSim.gameState = 'PLAYING';
    tempSim.balls = [];
    tempSim.clock = 1.8;
    const scaleX = width / SCREEN_WIDTH;
    const scaleY = height / WORLD_HEIGHT;
    ctx.save();
    ctx.scale(scaleX, scaleY);
    this.renderWorldPlayfield(ctx, tempSim);
    ctx.restore();
  }

  /**
   * Rendu haute fidélité 240x520 pour l'Éditeur de tables maison (avec plateau brouillon en direct).
   */
  public renderDraftPlayfield(
    ctx: CanvasRenderingContext2D,
    draftTable: PinballTableDef,
    clock: number = 1.8
  ) {
    const tempSim = new PinballSimulation();
    tempSim.setDraftTable(draftTable);
    tempSim.gameState = 'PLAYING';
    tempSim.balls = [];
    tempSim.clock = clock;
    ctx.save();
    this.renderWorldPlayfield(ctx, tempSim);
    ctx.restore();
  }

  /**
   * Décor statique d'une table (240x520, sans flippers, billes ni ressort) : sert à générer les images
   * du firmware AKA (scripts/gen-aka-art.mjs). Les éléments animés sont redessinés par la console.
   */
  public renderTableArtwork(ctx: CanvasRenderingContext2D, tableId: PinballTableDef['id']) {
    const tempSim = new PinballSimulation();
    tempSim.selectTableById(tableId);
    tempSim.gameState = 'PLAYING';
    tempSim.clock = 1.8;
    this.staticArt = true;
    try {
      this.renderWorldPlayfield(ctx, tempSim);
    } finally {
      this.staticArt = false;
    }
  }

  private renderScrollRadar(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    effectiveCamY: number,
    zoom: number
  ) {
    const trackX = 234.5;
    const trackY = HUD_HEIGHT + 6;
    const trackW = 4;
    const trackH = VIEWPORT_HEIGHT - 12;

    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
    ctx.fillRect(trackX, trackY, trackW, trackH);

    const visibleWorldH = Math.min(WORLD_HEIGHT, VIEWPORT_HEIGHT / zoom);
    const winY = trackY + (effectiveCamY / WORLD_HEIGHT) * trackH;
    const winH = (visibleWorldH / WORLD_HEIGHT) * trackH;

    ctx.fillStyle = 'rgba(250, 204, 21, 0.32)';
    ctx.fillRect(trackX, winY, trackW, winH);
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(trackX, winY, trackW, winH);

    // Highlight lowest playfield ball in bright gold, secondary balls in white
    const playfieldBalls = sim.balls.filter((b) => !b.inShooterLane);
    const lowestId =
      playfieldBalls.length > 0
        ? playfieldBalls.reduce((low, b) => (b.y > low.y ? b : low), playfieldBalls[0]).id
        : sim.balls[0]?.id;

    for (const b of sim.balls) {
      const by = trackY + Math.max(0, Math.min(1, b.y / WORLD_HEIGHT)) * trackH;
      ctx.fillStyle = b.id === lowestId ? '#FACC15' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(trackX + trackW * 0.5, by, b.id === lowestId ? 2.0 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================================
  // TOP ARCADE HUD (y: 0..46 — pinned at top of rotated 240x320 screen)
  // ============================================================================
  private renderTopHud(ctx: CanvasRenderingContext2D, sim: PinballSimulation) {
    const table = sim.currentTable;
    const pal = table.palette;
    const activePlayer = sim.players[sim.activePlayerIndex] ?? {
      playerIndex: 0,
      score: 0,
      displayScore: 0,
      ballsRemaining: 3,
      bonusPoints: 10000,
      bonusMultiplier: 1,
      maxCombo: 1,
      rampsCompleted: 0,
      activeMissionIndex: 0,
      missionStepProgress: 0,
      missionsCompleted: 0,
    };
    const activeMission =
      table.missions[activePlayer.activeMissionIndex % table.missions.length];

    ctx.fillStyle = pal.hudBg;
    ctx.fillRect(0, 0, SCREEN_WIDTH, HUD_HEIGHT);

    ctx.strokeStyle = pal.hudBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(2.5, 2.5, SCREEN_WIDTH - 5, HUD_HEIGHT - 5.5);

    const rivets = [
      [5, 5],
      [SCREEN_WIDTH - 5, 5],
      [5, HUD_HEIGHT - 6],
      [SCREEN_WIDTH - 5, HUD_HEIGHT - 6],
    ];
    ctx.fillStyle = pal.cabinetFrame;
    for (const [rx, ry] of rivets) {
      ctx.beginPath();
      ctx.arc(rx, ry, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    const hasRobotMascot = resolveDecorTheme(table) === 'aka_esp32';
    const rightMargin = hasRobotMascot ? SCREEN_WIDTH - 34 : SCREEN_WIDTH - 8;

    const paddedScore = String(activePlayer.displayScore).padStart(7, '0');
    if (pal.hudStyle === 'LED_7SEG') {
      ctx.fillStyle = '#180408';
      ctx.fillRect(7, 5, 86, 17);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(7, 5, 86, 17);

      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
      ctx.fillText('8888888', 10, 6.5);
      ctx.fillStyle = pal.hudDigits;
      ctx.fillText(paddedScore, 10, 6.5);
    } else {
      ctx.font = '700 13.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(250, 204, 21, 0.14)';
      ctx.fillText('8888888', 8, 5.5);
      ctx.fillStyle = pal.hudDigits;
      ctx.fillText(paddedScore, 8, 5.5);
    }

    // Active Player & Ball / Multiball / Lock Status
    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#F8FAFC';
    const pLabel = `${activePlayer.playerIndex + 1}UP · BILLE ${sim.currentBallNumber}/3`;
    ctx.fillText(pLabel, rightMargin, 6);

    if (sim.multiballActive) {
      ctx.fillStyle = Math.sin(sim.clock * 14) > 0 ? '#FACC15' : '#EF4444';
      ctx.fillText(`MULTIBILLE ×${sim.balls.length}`, rightMargin, 15.5);
    } else if (sim.lockedBallsCount > 0) {
      ctx.fillStyle = '#FACC15';
      ctx.fillText(`VERROU ${sim.lockedBallsCount}/2`, rightMargin, 15.5);
    } else if (sim.ballSaveTimer > 0) {
      const blink = sim.ballSaveTimer > 3 || Math.sin(sim.clock * 16) > 0;
      if (blink) {
        ctx.fillStyle = '#38BDF8';
        ctx.fillText('BALL SAVE', rightMargin, 15.5);
      }
    } else {
      ctx.fillStyle = activeMission.accentColor;
      ctx.fillText(
        `M${(activePlayer.activeMissionIndex % 3) + 1} ${activePlayer.missionStepProgress}/${activeMission.goal}`,
        rightMargin,
        15.5
      );
    }

    // Bottom HUD Row: Combos / Plunger Bar on Left, Callout / Mission on Right
    ctx.textAlign = 'left';
    ctx.font = '700 7.6px "JetBrains Mono", monospace';
    if (sim.comboCount > 1 && sim.comboTimer > 0) {
      ctx.fillStyle = '#FACC15';
      ctx.fillText(`COMBO ×${sim.comboCount}`, 8, 25);

      const ratio = Math.max(0, Math.min(1, sim.comboTimer / sim.maxComboTimer));
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(8, 35.5, 58, 3.5);
      ctx.fillStyle = pal.accentPrimary;
      ctx.fillRect(8, 35.5, 58 * ratio, 3.5);
    } else {
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText(`BONUS ×${activePlayer.bonusMultiplier}`, 8, 25);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(8, 35.5, 58, 3.5);
      if (sim.plungerTension > 0.01) {
        const sweet = sim.plungerTension >= 0.55 && sim.plungerTension <= 0.78;
        ctx.fillStyle = sweet ? '#22C55E' : '#FACC15';
        ctx.fillRect(8, 35.5, 58 * sim.plungerTension, 3.5);
      } else if (sim.tiltMeter > 0.05) {
        ctx.fillStyle = sim.isTilted ? '#EF4444' : '#F59E0B';
        ctx.fillRect(8, 35.5, 58 * Math.min(1, sim.tiltMeter / 2.85), 3.5);
      } else {
        const mRatio = Math.min(1, activePlayer.missionStepProgress / activeMission.goal);
        ctx.fillStyle = activeMission.accentColor;
        ctx.fillRect(8, 35.5, 58 * mRatio, 3.5);
      }
    }

    ctx.textAlign = 'right';
    if (sim.isTilted) {
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#EF4444';
      ctx.fillText('TILT ! BLOQUÉ', rightMargin, 28);
    } else if (sim.calloutTimer > 0) {
      ctx.font = '700 7px "JetBrains Mono", monospace';
      ctx.fillStyle = pal.accentPrimary;
      ctx.fillText(sim.lastCallout.slice(0, 22), rightMargin, 24.5);

      if (sim.lastPointsScored > 0) {
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.fillStyle = '#FDE047';
        ctx.fillText(`+${sim.lastPointsScored.toLocaleString('fr-FR')}`, rightMargin, 33.5);
      }
    } else {
      ctx.font = '700 7px "JetBrains Mono", monospace';
      ctx.fillStyle = '#E2E8F0';
      ctx.fillText(activeMission.title.slice(0, 20), rightMargin, 25);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(
        `OBJECTIF ${activePlayer.missionStepProgress}/${activeMission.goal}`,
        rightMargin,
        34
      );
    }

    if (hasRobotMascot) {
      this.drawMiniAkaRobot(
        ctx,
        SCREEN_WIDTH - 17,
        24,
        sim.comboCount > 1 || sim.calloutTimer > 0,
        sim.clock
      );
    }

    const barGrad = ctx.createLinearGradient(0, HUD_HEIGHT - 2, SCREEN_WIDTH, HUD_HEIGHT);
    barGrad.addColorStop(0, pal.cabinetFrame);
    barGrad.addColorStop(0.5, pal.cabinetHighlight);
    barGrad.addColorStop(1, pal.cabinetFrame);
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, HUD_HEIGHT - 2, SCREEN_WIDTH, 2);
  }

  private drawMiniAkaRobot(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    excited: boolean,
    clock: number
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    if (excited) {
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1;
      const pulse = (Math.floor(clock * 8) % 2) + 1;
      for (let i = 1; i <= pulse; i++) {
        ctx.beginPath();
        ctx.arc(0, -4, 9 + i * 2.5, -Math.PI * 0.78, -Math.PI * 0.22);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, -13);
    ctx.stroke();
    ctx.fillStyle = excited ? '#FACC15' : '#38BDF8';
    ctx.beginPath();
    ctx.arc(0, -13.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-8, -9, 16, 12, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(-5.8, -6.8, 11.6, 7.5, 2);
    ctx.fill();

    ctx.fillStyle = excited ? '#FACC15' : '#38BDF8';
    ctx.fillRect(-3.8, -4.2, 2.2, 2.6);
    ctx.fillRect(1.6, -4.2, 2.2, 2.6);

    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.roundRect(-6, 3.5, 12, 5.5, 2);
    ctx.fill();
    ctx.restore();
  }

  // ============================================================================
  // 240x520 WORLD PLAYFIELD RENDERER (UNIQUE PER TABLE!)
  // ============================================================================
  private renderWorldPlayfield(ctx: CanvasRenderingContext2D, sim: PinballSimulation) {
    const table = sim.currentTable;
    const pal = table.palette;

    // 1. Deep Multi-Stop Varnished Playfield Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    bgGrad.addColorStop(0, pal.bgPrimary);
    bgGrad.addColorStop(0.42, pal.bgSecondary);
    bgGrad.addColorStop(0.78, pal.bgPrimary);
    bgGrad.addColorStop(1, pal.bgSecondary);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, WORLD_HEIGHT);

    // Pro Cabinet Ambient Light Pools (Upper Bumpers, Center Medallion, Lower Flippers)
    for (const [lx, ly, lr, col, alpha] of [
      [113, 152, 88, pal.accentSecondary, '16'],
      [113, 290, 95, pal.accentPrimary, '14'],
      [113, 456, 84, pal.accentPrimary, '18'],
    ] as const) {
      const pool = ctx.createRadialGradient(lx, ly, 6, lx, ly, lr);
      pool.addColorStop(0, `${col}${alpha}`);
      pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = pool;
      ctx.fillRect(8, Math.max(0, ly - lr), 209, Math.min(WORLD_HEIGHT, lr * 2));
    }

    // Recessed Inner Cabinet Side-Wall Shadow Vignette (gives physical depth under glass)
    const leftEdgeShadow = ctx.createLinearGradient(8, 0, 22, 0);
    leftEdgeShadow.addColorStop(0, 'rgba(2, 6, 16, 0.42)');
    leftEdgeShadow.addColorStop(1, 'rgba(2, 6, 16, 0)');
    ctx.fillStyle = leftEdgeShadow;
    ctx.fillRect(8, 0, 14, WORLD_HEIGHT);

    const rightEdgeShadow = ctx.createLinearGradient(203, 0, 217, 0);
    rightEdgeShadow.addColorStop(0, 'rgba(2, 6, 16, 0)');
    rightEdgeShadow.addColorStop(1, 'rgba(2, 6, 16, 0.42)');
    ctx.fillStyle = rightEdgeShadow;
    ctx.fillRect(203, 0, 14, WORLD_HEIGHT);

    // Shooter Tunnel Animated Boost Chevrons (x = 225, y: 120..440)
    for (let y = 120; y <= 440; y += 45) {
      const lit = !this.staticArt && ((Math.floor(sim.clock * 10) + Math.floor(y / 45)) % 4 + 4) % 4 === 0;
      ctx.fillStyle = lit ? `${pal.accentPrimary}88` : 'rgba(148, 163, 184, 0.14)';
      ctx.beginPath();
      ctx.moveTo(225, y - 4);
      ctx.lineTo(220, y + 3);
      ctx.lineTo(230, y + 3);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Bespoke Per-Table Centerpiece Art & Architecture
    this.renderTableDecor(ctx, sim, table);

    // 3. 3-Gem Mission Medallion Panel on Playfield
    this.renderMissionPlayfieldCrest(ctx, sim, table);

    // 4. Scoops, Physical Locked Ball & VUK Pneumatic Tubes
    this.renderScoopsAndLockChamber(ctx, sim, table);

    // 5. Rollovers & Skill Shot Lanes
    for (const r of table.rollovers) {
      const isLit = !this.staticArt && sim.litRollovers.has(r.id);
      const isSkill =
        !this.staticArt &&
        sim.skillShotAvailable &&
        r.id === sim.skillShotRolloverId &&
        Math.sin(sim.clock * 14) > -0.2;

      this.drawArcadeBulb(
        ctx,
        r.x,
        r.y,
        r.radius,
        isSkill ? '#FACC15' : pal.accentPrimary,
        isSkill || isLit,
        r.letter
      );
    }

    // 6. Dual Outlane Kickback Shields (y = 434)
    const drawKickbackArrow = (x: number, lit: boolean, flash: number, color: string) => {
      if (!lit && flash <= 0) return;
      const pulse = 0.6 + 0.4 * Math.sin(sim.clock * 12);
      ctx.save();
      ctx.globalAlpha = flash > 0 ? 1 : pulse;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, 426);
      ctx.lineTo(x - 5.5, 438);
      ctx.lineTo(x + 5.5, 438);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawKickbackArrow(18, sim.kickbackLeftLit, sim.kickbackFlash.LEFT, '#FACC15');
    drawKickbackArrow(208, sim.kickbackRightLit, sim.kickbackFlash.RIGHT, pal.accentPrimary);

    // 7. Drain Save Emblem (y = 490)
    this.renderDrainSaveEmblem(ctx, sim, table);

    // 8. High-Speed Spinners
    this.renderSpinners(ctx, sim, table);

    // 9. Table-Specific Beveled Housings & Targets
    this.renderTableHousingsAndTargets(ctx, sim, table);

    // 10. Cabinet Rails, Slingshots & Lower Apron
    this.renderCabinetAndSlingshots(ctx, sim, table);

    // 11. 3D Chrome Helical Plunger (Bouton R1)
    this.renderPlunger(ctx, sim);

    // 12. Active 3D Cylindrical Pop Bumpers (with Mission Beacon if active!)
    const activePlayer = sim.players[sim.activePlayerIndex];
    const activeMission =
      table.missions[(activePlayer?.activeMissionIndex ?? 0) % table.missions.length];

    for (const bmp of table.bumpers) {
      this.render3DBumper(
        ctx,
        bmp,
        (sim.bumperFlashTimers[bmp.id] ?? 0) > 0,
        activeMission?.targetKind === 'BUMPER',
        sim.clock
      );
    }
    if (!this.staticArt && table.litBumperRotate && table.bumpers.length) {
      const gb = table.bumpers[sim.litBumperIdx % table.bumpers.length];
      ctx.save();
      ctx.beginPath();
      ctx.arc(gb.x, gb.y, gb.radius + 3 + Math.sin(sim.clock * 8) * 1.2, 0, Math.PI * 2);
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#FDE047';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('x3', gb.x, gb.y + 2.5);
      ctx.restore();
    }
    if (table.hunt) this.renderHunt(ctx, table.hunt, sim.huntSlot, sim.huntFlash, sim.clock);

    // 12B. Interactive Decor Toys (Volcan, Portes Saloon, Plaque Tournante, Sarcophage, Dôme Bonbons...)
    if (table.interactiveToys && table.interactiveToys.length > 0) {
      this.renderInteractiveToys(ctx, sim, table, table.interactiveToys);
    }

    // 13. Lower-Playfield Flippers (deckLayer === 0)
    this.render3DFlippers(ctx, sim, table, 0);

    // 14. Layer 0 Balls (on main playfield, passing UNDER upper decks & overhead ramps!)
    for (const b of sim.balls) {
      if (b.layer === 0 && !b.heldInScoopId) {
        this.renderBall(ctx, b, table, 0);
      }
    }

    // 15. Elevated Upper Playfield ("Étage Supérieur", Layer 2) + Upper Targets/Bumpers/Flippers
    if (table.upperPlayfield) {
      this.renderUpperPlayfield(ctx, sim, table, table.upperPlayfield, activeMission?.targetKind);
      this.render3DFlippers(ctx, sim, table, 2);
    }

    // 16. Upgraded 3D Molded Acrylic & Chrome Wireform Ramps + Overhead VUK Conduits (Layer 1)
    this.renderOverheadConduits(ctx, sim, table);
    this.render3DRamps(ctx, sim, table, activeMission?.targetKind === 'RAMP');

    // 17. Layer 2 Balls (riding on elevated upper playfield) & Layer 1 Balls (inside ramps/tubes)
    for (const b of sim.balls) {
      if (b.layer === 2 && !b.heldInScoopId) {
        this.renderBall(ctx, b, table, 0.85);
      } else if (b.layer === 1 && !b.heldInScoopId) {
        const elev =
          0.25 + 0.75 * Math.sin(Math.PI * Math.min(0.95, Math.max(0.05, b.rampProgress)));
        this.renderBall(ctx, b, table, elev);
      }
    }

    // 18. World-Space Sparks & Floating Score Popups
    for (const sp of sim.sparks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sp.life / sp.maxLife);
      ctx.fillStyle = sp.color;
      ctx.fillRect(sp.x - sp.size * 0.5, sp.y - sp.size * 0.5, sp.size, sp.size);
      ctx.restore();
    }

    for (const pop of sim.popups) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (pop.life / pop.maxLife) * 1.4);
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#020617';
      ctx.fillText(pop.text, pop.x + 1, pop.y + 1);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }

  // ============================================================================
  // 3-GEM MISSION PROGRESS CREST ON PLAYFIELD
  // ============================================================================
  // ============================================================================
  // Décors originaux des 6 tables thématiques (Préhistoire, Far West, Halloween, Candy Pop, Bonbons, Train)
  // ============================================================================
  private renderThemedDecor(
    ctx: CanvasRenderingContext2D,
    id: 'prehistoire' | 'farwest' | 'halloween' | 'candy' | 'bonbons' | 'train' | 'crypte',
    mult: number,
    clock: number
  ) {
    const plate = (title: string, bg: string, border: string, fg: string) => {
      ctx.save();
      ctx.translate(0, PLATE_DY[id] ?? 0);
      // Ombre portée sous le cartouche métallique
      ctx.fillStyle = 'rgba(2, 6, 16, 0.55)';
      ctx.beginPath();
      ctx.roundRect(74, 264.5, 78, 32, 5);
      ctx.fill();

      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(74, 262, 78, 32, 5);
      ctx.fill();
      ctx.stroke();

      // Double filet intérieur + 4 rivets d'angle façon plaque émaillée de flipper
      ctx.strokeStyle = `${border}66`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(76.5, 264.5, 73, 27, 3.5);
      ctx.stroke();
      ctx.fillStyle = border;
      for (const [rx, ry] of [[78, 266], [148, 266], [78, 290], [148, 290]]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fg;
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.fillText(title, 113, 273);
      ctx.font = '700 7.8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`BONUS ×${mult}`, 113, 285.5);
      ctx.restore();
    };
    const poly = (pts: number[][], fill: string, stroke?: string, lw = 1) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };
    const heart = (x: number, y: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.9);
      ctx.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
      ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };
    const circ = (x: number, y: number, r: number, fill: string, stroke?: string, lw = 1) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };

    ctx.save();
    if (id === 'prehistoire') {
      // Halo de magma volcanique en haut du plateau
      const lavaGlow = ctx.createRadialGradient(113, 74, 4, 113, 88, 66);
      lavaGlow.addColorStop(0, 'rgba(251, 146, 60, 0.36)');
      lavaGlow.addColorStop(0.55, 'rgba(220, 38, 38, 0.14)');
      lavaGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = lavaGlow;
      ctx.fillRect(36, 24, 154, 130);

      // Chaîne de basalte en arrière-plan + cône du volcan sculpté en facettes
      poly([[58, 128], [78, 92], [96, 128]], 'rgba(41, 27, 18, 0.65)', '#78716C', 0.9);
      poly([[130, 128], [150, 94], [168, 128]], 'rgba(41, 27, 18, 0.65)', '#78716C', 0.9);
      poly([[80, 128], [99, 68], [127, 68], [146, 128]], '#291811', '#A8A29E', 1.2);
      poly([[99, 68], [113, 68], [128, 128], [80, 128]], 'rgba(68, 40, 22, 0.72)');
      poly([[99, 68], [105, 62], [121, 62], [127, 68]], '#EA580C', '#FDE047', 1.1);

      // Rivières de lave incandescentes à double cœur lumineux
      for (const [sx, cx1, ex] of [[106, 98, 88], [113, 113, 115], [120, 129, 139]]) {
        ctx.strokeStyle = '#DC2626';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(sx, 67);
        ctx.quadraticCurveTo(cx1, 98, ex, 126);
        ctx.stroke();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const puff = this.staticArt ? 0 : Math.sin(clock * 2.2 + i) * 1.8;
        circ(102 + i * 8, 53 - i * 2.5 + puff, 4.5 + i * 0.8, 'rgba(231, 229, 228, 0.18)');
      }

      // Fossile d'ammonite spiralé & côtes préhistoriques gravées dans la roche
      ctx.strokeStyle = 'rgba(214, 211, 209, 0.26)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let a = 0; a < 11; a += 0.25) {
        const rr = 1.35 * a;
        const px = 172 + Math.cos(a) * rr;
        const py = 256 + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Piste d'empreintes tridactyles de T-Rex
      for (const [x, y, rot] of [[42, 244, -0.2], [54, 266, 0.15], [41, 288, -0.15]] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        poly([[-5, 4], [-6, -7], [-2, -2], [0, -9], [2, -2], [6, -7], [5, 4], [0, 7]], 'rgba(120, 53, 15, 0.72)', '#D6D3D1', 0.6);
        ctx.restore();
      }

      // Grands fémurs d'ivoire croisés + crâne stylisé au-dessus des flippers
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(83, 337);
      ctx.lineTo(143, 355);
      ctx.moveTo(143, 337);
      ctx.lineTo(83, 355);
      ctx.stroke();
      for (const [bx, by] of [[82, 336], [144, 356], [144, 336], [82, 356]]) {
        circ(bx, by, 2.6, '#F5F5F4', '#57534E', 0.7);
      }
      circ(113, 346, 7.5, '#F5F5F4', '#44403C', 1);
      circ(110, 345, 1.6, '#1C1917');
      circ(116, 345, 1.6, '#1C1917');
      plate('ÂGE DE PIERRE', '#261509', '#F97316', '#FDBA74');
    } else if (id === 'farwest') {
      // Coucher de soleil Monument Valley + silhouettes de mesas ocres
      const sunGrad = ctx.createRadialGradient(113, 84, 3, 113, 84, 38);
      sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.44)');
      sunGrad.addColorStop(0.55, 'rgba(245, 158, 11, 0.22)');
      sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(60, 42, 106, 84);

      poly([[64, 114], [74, 96], [90, 96], [97, 114]], 'rgba(124, 45, 18, 0.55)', '#F59E0B', 0.7);
      poly([[129, 114], [136, 94], [152, 94], [162, 114]], 'rgba(124, 45, 18, 0.55)', '#F59E0B', 0.7);

      // Grande étoile de Shérif en laiton ciselé (pointes bouletées)
      this.drawStarShape(ctx, 113, 84, 13, 5.8, '#FACC15', '#78350F');
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.5 + (i * Math.PI * 2) / 5;
        circ(113 + Math.cos(a) * 13.5, 84 + Math.sin(a) * 13.5, 1.5, '#FEF08A', '#78350F', 0.6);
      }
      circ(113, 84, 3.4, '#92400E', '#FEF08A', 0.7);

      // Portes battantes en bois de Saloon autour du centre + roue de diligence
      for (const side of [-1, 1] as const) {
        const dx = 113 + side * 46;
        ctx.fillStyle = 'rgba(120, 53, 15, 0.52)';
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(dx - 11, 198, 22, 28, 3);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(253, 230, 138, 0.35)';
        for (let slat = 0; slat < 3; slat++) {
          ctx.beginPath();
          ctx.moveTo(dx - 8, 205 + slat * 7);
          ctx.lineTo(dx + 8, 205 + slat * 7);
          ctx.stroke();
        }
      }

      // Cactus Saguaro nervurés à gauche et à droite
      for (const x of [36, 190]) {
        ctx.fillStyle = '#15803D';
        ctx.strokeStyle = '#86EFAC';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(x - 3.2, 230, 6.4, 38, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(x - 11, 242, 8, 4.2);
        ctx.fillRect(x - 11, 235, 4.2, 11);
        ctx.fillRect(x + 3, 248, 8, 4.2);
        ctx.fillRect(x + 7, 239, 4.2, 13);
      }

      // Fer à cheval forgé à 7 clous d'or au-dessus des flippers
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 4.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(113, 344, 13, Math.PI * 0.16, Math.PI * 0.84, true);
      ctx.stroke();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 1.1 + (i / 4) * Math.PI * 0.8;
        circ(113 + Math.cos(a) * 13, 344 + Math.sin(a) * 13, 1.1, '#FACC15');
      }
      plate('SALOON', '#361807', '#FACC15', '#FDE68A');
    } else if (id === 'halloween') {
      // Pleine lune blafarde cratérisée + silhouette de manoir gothique hanté
      const moonGlow = ctx.createRadialGradient(113, 134, 4, 113, 134, 44);
      moonGlow.addColorStop(0, 'rgba(254, 249, 195, 0.38)');
      moonGlow.addColorStop(0.5, 'rgba(168, 85, 247, 0.16)');
      moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = moonGlow;
      ctx.fillRect(60, 88, 106, 94);
      circ(113, 134, 19, 'rgba(254, 249, 195, 0.26)', 'rgba(254, 240, 138, 0.45)', 1);
      circ(107, 129, 3.2, 'rgba(202, 138, 4, 0.18)');
      circ(119, 138, 4.2, 'rgba(202, 138, 4, 0.15)');

      // Manoir hanté découpé devant la lune + fenêtres éclairées à la bougie
      poly(
        [[92, 154], [95, 132], [101, 122], [106, 132], [113, 114], [120, 132], [125, 122], [131, 132], [134, 154]],
        'rgba(18, 8, 31, 0.88)',
        '#7E22CE',
        0.9
      );
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(111, 129, 4, 6);
      ctx.fillRect(99, 137, 3.2, 5);
      ctx.fillRect(124, 137, 3.2, 5);

      // Grandes toiles d'araignée d'angle + chauves-souris
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.36)';
      ctx.lineWidth = 0.85;
      for (const [cx, cy, dir] of [[14, 74, 1], [212, 74, -1]] as [number, number, number][]) {
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + dir * 38 * Math.cos((i * Math.PI) / 8), cy + 38 * Math.sin((i * Math.PI) / 8));
          ctx.stroke();
        }
        for (const r of [12, 24, 35]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, dir > 0 ? 0 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#3B0764';
      for (const [x, y] of [[86, 66], [140, 70], [64, 198], [162, 198]]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 8, y - 8, x - 14, y);
        ctx.quadraticCurveTo(x - 8, y - 2, x, y + 4.5);
        ctx.quadraticCurveTo(x + 8, y - 2, x + 14, y);
        ctx.quadraticCurveTo(x + 8, y - 8, x, y);
        ctx.fill();
      }
      plate('MANOIR HANTÉ', '#160726', '#F97316', '#A3E635');
    } else if (id === 'candy') {
      // Halo pastel Harajuku + rayons sucrés bicolores façon papier de confiserie kawaii
      ctx.save();
      ctx.translate(113, 178);
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 9;
        ctx.strokeStyle =
          i % 3 === 0
            ? 'rgba(251, 207, 232, 0.18)'
            : i % 3 === 1
              ? 'rgba(186, 230, 253, 0.14)'
              : 'rgba(253, 224, 71, 0.13)';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
        ctx.lineTo(Math.cos(a) * 76, Math.sin(a) * 76);
        ctx.stroke();
      }
      ctx.restore();

      // Helper : Donut glacé aux vermicelles multicolores
      const drawGlazedDonut = (dx: number, dy: number, r: number, icing: string) => {
        ctx.save();
        ctx.translate(dx, dy);
        // Pâte briochée dorée
        circ(0, 1.2, r, '#D97706', '#92400E', 1);
        // Glaçage brillant festonné
        circ(0, 0, r * 0.88, icing, '#FFFFFF', 0.9);
        // Trou central du donut
        circ(0, 0.5, r * 0.34, '#4A0E38', '#92400E', 0.8);
        // Vermicelles de sucre colorés
        const sprinkles: [number, number, number, string][] = [
          [-r * 0.55, -r * 0.2, 0.4, '#FDE047'],
          [r * 0.48, -r * 0.28, -0.5, '#38BDF8'],
          [-r * 0.32, r * 0.52, -0.3, '#4ADE80'],
          [r * 0.42, r * 0.44, 0.6, '#FFFFFF'],
          [0, -r * 0.6, 0.1, '#FB7185'],
          [0, r * 0.62, -0.2, '#FDE047'],
        ];
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.4;
        for (const [sx, sy, rot, col] of sprinkles) {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(rot);
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.moveTo(-2.1, 0);
          ctx.lineTo(2.1, 0);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      };

      // Helper : Macaron fourré double coque + crème fouettée
      const drawMacaron = (mx: number, my: number, rot: number, shell: string, cream: string) => {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(rot);
        // Coque inférieure
        ctx.fillStyle = shell;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.ellipse(0, 3.2, 10.5, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Collerette de ganache / crème
        ctx.fillStyle = cream;
        for (let k = -3; k <= 3; k++) {
          circ(k * 2.7, 0.4, 2.2, cream);
        }
        // Coque supérieure bombée + reflet glacé
        ctx.fillStyle = shell;
        ctx.beginPath();
        ctx.ellipse(0, -2.4, 10.8, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
        ctx.beginPath();
        ctx.ellipse(-3.2, -3.6, 4.2, 1.4, -0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      // Helper : Sucre d'orge bicolore rayé (Candy Cane)
      const drawCandyCane = (cx: number, cy: number, flipX: 1 | -1, stripeCol: string) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(flipX, 1);
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.6;
        ctx.strokeStyle = '#FFF1F2';
        ctx.beginPath();
        ctx.moveTo(0, 18);
        ctx.lineTo(0, -6);
        ctx.arc(6.5, -6, 6.5, Math.PI, 0, false);
        ctx.stroke();

        ctx.lineWidth = 4.2;
        ctx.strokeStyle = stripeCol;
        ctx.setLineDash([3.2, 3.4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      };

      // Helper : Bonbon papillote acidulé
      const drawCandyDrop = (bx: number, by: number, rot: number, body: string, wrap: string) => {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rot);
        poly([[-7, 0], [-13, -4.5], [-11.5, 0], [-13, 4.5]], wrap, '#FFFFFF', 0.7);
        poly([[7, 0], [13, -4.5], [11.5, 0], [13, 4.5]], wrap, '#FFFFFF', 0.7);
        circ(0, 0, 6.8, body, '#FFFFFF', 0.9);
        // Spirale sucrée
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, 3.6, 0, Math.PI * 1.4);
        ctx.stroke();
        ctx.restore();
      };

      // 1. Donuts glacés fraise & menthe bleue
      drawGlazedDonut(46, 122, 12.5, '#F472B6');
      drawGlazedDonut(180, 122, 12.5, '#38BDF8');
      drawGlazedDonut(176, 306, 10.5, '#FACC15');

      // 2. Macarons pastel pistache, framboise & myrtille
      drawMacaron(48, 250, -0.24, '#F9A8D4', '#FFF1F2');
      drawMacaron(176, 238, 0.26, '#6EE7B7', '#FEF9C3');
      drawMacaron(50, 308, 0.18, '#C4B5FD', '#FCE7F3');

      // 3. Sucres d'orge rayés encadrant le bas du plateau
      drawCandyCane(34, 356, 1, '#EC4899');
      drawCandyCane(192, 356, -1, '#38BDF8');

      // 4. Bonbons papillotes, guimauves torsadées & dragées gélifiées (Jellybeans)
      drawCandyDrop(74, 128, 0.35, '#FB7185', '#FDE047');
      drawCandyDrop(152, 128, -0.35, '#34D399', '#FBCFE8');
      drawCandyDrop(80, 294, -0.25, '#FACC15', '#BAE6FD');
      drawCandyDrop(146, 294, 0.25, '#C084FC', '#FDE047');

      for (const [jx, jy, jcol] of [
        [64, 198, '#FDE047'],
        [162, 198, '#4ADE80'],
        [88, 236, '#38BDF8'],
        [138, 236, '#FB7185'],
        [72, 366, '#F472B6'],
        [154, 366, '#A7F3D0'],
        [92, 118, '#DDD6FE'],
        [134, 118, '#FDE047'],
      ] as [number, number, string][]) {
        circ(jx, jy, 3.6, jcol, '#FFFFFF', 0.7);
        circ(jx - 1.1, jy - 1.1, 1.0, 'rgba(255,255,255,0.75)');
      }

      // 5. Grand Cupcake Chantilly Fraise-Vanille & Cerise confite au-dessus des flippers (x=113, y=344)
      ctx.save();
      ctx.translate(113, 346);
      // Caissette plissée rayée
      poly([[-12, 2], [12, 2], [9.5, 15], [-9.5, 15]], '#F472B6', '#FFFFFF', 0.9);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 0.8;
      for (const sx of [-6, -2, 2, 6]) {
        ctx.beginPath();
        ctx.moveTo(sx * 1.15, 3);
        ctx.lineTo(sx * 0.95, 14.5);
        ctx.stroke();
      }
      // Gaufrette roulée plantée en biais
      poly([[5, -8], [13, -18], [16.5, -15.5], [8.5, -5]], '#FDE68A', '#D97706', 0.8);
      // Étages de crème fouettée bicolore
      ctx.fillStyle = '#FFF1F2';
      ctx.strokeStyle = '#F9A8D4';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FBCFE8';
      ctx.beginPath();
      ctx.ellipse(0, -5.5, 10.5, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFF1F2';
      ctx.beginPath();
      ctx.ellipse(0, -10.2, 6.8, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Cerise confite rouge brillant au sommet
      circ(0, -14.8, 4.0, '#E11D48', '#FFFFFF', 0.8);
      circ(-1.3, -16.0, 1.2, '#FFFFFF');
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0.5, -18.5);
      ctx.quadraticCurveTo(4, -22, 6.5, -20);
      ctx.stroke();
      ctx.restore();

      plate('CANDY POP', '#430B32', '#F9A8D4', '#FDE047');
    } else if (id === 'bonbons') {
      // Store festonné de confiserie parisienne sous l'arche supérieure
      for (let i = 0; i < 9; i++) {
        const ax = 45 + i * 16;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 113, 133, 0.34)' : 'rgba(255, 241, 242, 0.28)';
        ctx.fillRect(ax, 54, 16, 10);
        circ(ax + 8, 64, 8, ctx.fillStyle as string);
      }

      // Berlingots et papillotes glacées à reflets spéculaires
      const wrapped = (x: number, y: number, rot: number, c: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        poly([[-13, 0], [-22, -6.5], [-20, 0], [-22, 6.5]], '#FFF1F2', c, 0.9);
        poly([[13, 0], [22, -6.5], [20, 0], [22, 6.5]], '#FFF1F2', c, 0.9);
        ctx.beginPath();
        ctx.ellipse(0, 0, 13.5, 8.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-4, -2.5, 5, 2, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fill();
        ctx.restore();
      };
      wrapped(56, 104, -0.38, '#FB7185');
      wrapped(170, 104, 0.38, '#FACC15');

      // Grande sucette tourbillon bicolore sur bâtonnet d'ivoire + ruban
      ctx.strokeStyle = '#FEF3C7';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(113, 250);
      ctx.lineTo(113, 260);
      ctx.stroke();
      circ(113, 234, 17, '#FFF1F2', '#FB7185', 1.6);
      for (let k = 0; k < 6; k++) {
        const a0 = (k * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(113, 234);
        ctx.arc(113, 234, 15.8, a0, a0 + Math.PI / 6);
        ctx.closePath();
        ctx.fillStyle = k % 2 === 0 ? '#FB7185' : '#34D399';
        ctx.fill();
      }
      circ(113, 234, 5, '#FEF08A', '#FFFFFF', 1);

      // Comptoir rayé rose & crème + bocaux de dragées en bas du plateau
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 113, 133, 0.42)' : 'rgba(255, 255, 255, 0.32)';
        ctx.fillRect(40 + i * 16, 345, 16, 9);
      }
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 345, 144, 9);
      plate('CONFISERIE', '#063732', '#FB7185', '#FEF08A');
    } else if (id === 'train') {
      // Faisceau conique du phare de locomotive + porte de boîte à fumée rivetée N° 240
      const beam = ctx.createLinearGradient(113, 72, 113, 168);
      beam.addColorStop(0, 'rgba(254, 240, 138, 0.34)');
      beam.addColorStop(1, 'rgba(254, 240, 138, 0)');
      poly([[104, 78], [76, 162], [150, 162], [122, 78]], beam as unknown as string);

      circ(113, 82, 20, '#1E293B', '#F59E0B', 1.5);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        circ(113 + Math.cos(a) * 16.5, 82 + Math.sin(a) * 16.5, 1.1, '#CBD5E1');
      }
      circ(113, 82, 9.5, '#FEF08A', '#D97706', 1.2);
      for (const [x, y, r] of [[54, 96, 10], [67, 85, 7.5], [159, 86, 8], [173, 99, 10.5]]) {
        circ(x, y, r, 'rgba(226, 232, 240, 0.16)');
      }

      // Voie ferrée en perspective avec ballast, traverses chevillées et rails d'acier
      poly([[102, 300], [124, 300], [142, 374], [84, 374]], 'rgba(30, 41, 59, 0.55)');
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 2.6;
      for (let y = 304; y < 372; y += 10) {
        const w = 9 + ((y - 300) / 72) * 17;
        ctx.beginPath();
        ctx.moveTo(113 - w, y);
        ctx.lineTo(113 + w, y);
        ctx.stroke();
      }
      for (const side of [-1, 1] as const) {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(113 + side * 6.5, 300);
        ctx.lineTo(113 + side * 20, 374);
        ctx.stroke();
      }

      // Sémaphore mécanique à double feu + bielle en acier
      ctx.fillStyle = '#475569';
      ctx.fillRect(43.5, 232, 3.5, 30);
      poly([[46, 235], [58, 231], [58, 237], [46, 239]], '#DC2626', '#F8FAFC', 0.7);
      circ(45.2, 236, 4, '#EF4444', '#E2E8F0', 0.9);
      circ(45.2, 247, 4, '#22C55E', '#E2E8F0', 0.9);
      plate('EXPRESS 240', '#0B1220', '#F59E0B', '#FDE68A');
    } else {
      // Crypte : Rosace de cathédrale gothique givrée, arches d'ogives, brume polaire et runes
      const frostGlow = ctx.createRadialGradient(113, 210, 6, 113, 210, 74);
      frostGlow.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
      frostGlow.addColorStop(0.6, 'rgba(14, 116, 144, 0.08)');
      frostGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = frostGlow;
      ctx.fillRect(34, 134, 158, 154);

      circ(60, 86, 18, 'rgba(224, 242, 254, 0.14)');
      circ(60, 86, 11, 'rgba(224, 242, 254, 0.25)', 'rgba(186, 230, 253, 0.45)', 0.9);

      // Rosace gothique en pierre sculptée au centre (x=113, y=214)
      ctx.save();
      ctx.translate(113, 214);
      circ(0, 0, 24, 'rgba(8, 20, 38, 0.72)', 'rgba(125, 211, 252, 0.45)', 1.3);
      circ(0, 0, 16, 'rgba(14, 116, 144, 0.22)', 'rgba(186, 230, 253, 0.35)', 0.9);
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
        ctx.stroke();
      }
      circ(0, 0, 5, '#38BDF8', '#E0F2FE', 1);
      ctx.restore();

      // Silhouettes de stèles et croix gothiques dans la brume basse
      for (const [tx, ty] of [[68, 336], [158, 336]]) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx - 8, ty - 10, 16, 20, [8, 8, 1, 1]);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, ty - 6);
        ctx.lineTo(tx, ty + 5);
        ctx.moveTo(tx - 4, ty - 2);
        ctx.lineTo(tx + 4, ty - 2);
        ctx.stroke();
      }

      // Cristaux de givre étoilés et fissures de glace
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
      ctx.lineWidth = 0.95;
      for (const [cx, cy] of [[34, 200], [194, 186], [113, 342], [26, 330], [202, 346]]) {
        for (let a = 0; a < 3; a++) {
          const ang = (a * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(cx - 4.5 * Math.cos(ang), cy - 4.5 * Math.sin(ang));
          ctx.lineTo(cx + 4.5 * Math.cos(ang), cy + 4.5 * Math.sin(ang));
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.3)';
      ctx.beginPath();
      ctx.moveTo(176, 140);
      ctx.lineTo(160, 156);
      ctx.lineTo(166, 176);
      ctx.lineTo(152, 192);
      ctx.moveTo(60, 224);
      ctx.lineTo(74, 238);
      ctx.lineTo(66, 252);
      ctx.stroke();
      plate('NÉCROPOLE', '#06121F', '#38BDF8', '#BAE6FD');
    }
    ctx.restore();
  }

  private renderMissionPlayfieldCrest(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const p = sim.players[sim.activePlayerIndex];
    const activeIdx = (p?.activeMissionIndex ?? 0) % 3;
    const activeMission = table.missions[activeIdx];
    const cx = table.missionEmblemPos.x;
    const cy = table.missionEmblemPos.y;

    ctx.save();
    // Dark recessed mission plate
    ctx.fillStyle = 'rgba(7, 11, 20, 0.86)';
    ctx.strokeStyle = activeMission.accentColor;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(cx - 42, cy - 11, 84, 22, 5);
    ctx.fill();
    ctx.stroke();

    // 3 Mission Gems
    for (let i = 0; i < 3; i++) {
      const gx = cx - 26 + i * 26;
      const gy = cy - 3.5;
      const m = table.missions[i];
      const isDone = !this.staticArt && i < activeIdx;
      const isCurrent = !this.staticArt && i === activeIdx;
      const pulse = 0.55 + 0.45 * Math.sin(sim.clock * 10);

      ctx.beginPath();
      ctx.arc(gx, gy, 4.2, 0, Math.PI * 2);
      if (isDone) {
        ctx.fillStyle = m.accentColor;
      } else if (isCurrent) {
        ctx.fillStyle = `${m.accentColor}${Math.round(pulse * 220)
          .toString(16)
          .padStart(2, '0')}`;
      } else {
        ctx.fillStyle = '#1E293B';
      }
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = isDone || isCurrent ? '#FFFFFF' : '#475569';
      ctx.stroke();
    }

    if (!this.staticArt) {   // décor AKA : titre et progression sont dessinés par la console
      ctx.font = '700 5.6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(
        `${activeMission.title.slice(0, 14)} ${p?.missionStepProgress ?? 0}/${activeMission.goal}`,
        cx,
        cy + 6
      );
    }
    ctx.restore();
  }

  // ============================================================================
  // BESPOKE PER-TABLE PLAYFIELD ARTWORK (TAILORED TO EACH UNIQUE 240x520 LAYOUT!)
  // ============================================================================
  private renderTableDecor(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const mult = sim.players[sim.activePlayerIndex]?.bonusMultiplier ?? 1;
    const decor = resolveDecorTheme(table);

    if (decor === 'aka_esp32') {
      ctx.save();
      // PCB Copper Traces + Gold Via Pads
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
      ctx.lineWidth = 1.4;
      const traces: number[][][] = [
        [[113, 165], [75, 198], [75, 255]],
        [[113, 165], [151, 198], [151, 255]],
        [[89, 285], [56, 285], [56, 360]],
        [[137, 285], [170, 285], [170, 360]],
      ];
      for (const tr of traces) {
        ctx.beginPath();
        ctx.moveTo(tr[0][0], tr[0][1]);
        for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0], tr[i][1]);
        ctx.stroke();
        const end = tr[tr.length - 1];
        ctx.beginPath();
        ctx.arc(end[0], end[1], 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#0F172A';
        ctx.fill();
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
        ctx.lineWidth = 1.4;
      }

      // Upper Cyber-Deck Oscilloscope (between the two upper mini-flippers at y=150)
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(86, 142, 54, 22, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#04121C';
      ctx.fillRect(89, 145, 48, 16);
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= 44; x += 2) {
        const wy = 153 + Math.sin(x * 0.34 + sim.clock * 10) * 5;
        if (x === 0) ctx.moveTo(91 + x, wy);
        else ctx.lineTo(91 + x, wy);
      }
      ctx.stroke();

      // Central ESP32 QFN-28 Microchip (x=113, y=278)
      const chipX = 91;
      const chipY = 258;
      const chipS = 44;
      ctx.fillStyle = '#E2E8F0';
      for (let i = 0; i < 6; i++) {
        const off = 5 + i * 6.4;
        ctx.fillRect(chipX - 3.2, chipY + off, 3.5, 2.4);
        ctx.fillRect(chipX + chipS - 0.3, chipY + off, 3.5, 2.4);
        ctx.fillRect(chipX + off, chipY - 3.2, 2.4, 3.5);
        ctx.fillRect(chipX + off, chipY + chipS - 0.3, 2.4, 3.5);
      }
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = sim.multiballActive ? '#FACC15' : '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(chipX, chipY, chipS, chipS, 3);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.3;
      for (let r = 4; r <= 9; r += 2.5) {
        ctx.beginPath();
        ctx.arc(113, 275, r, -Math.PI * 0.78, -Math.PI * 0.22);
        ctx.stroke();
      }
      ctx.font = '700 7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText('ESP32', 113, 290);

      // Lower Molded D-Pad Bonus Cross (y=414)
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(107, 396);
      ctx.lineTo(119, 396);
      ctx.lineTo(119, 408);
      ctx.lineTo(131, 408);
      ctx.lineTo(131, 420);
      ctx.lineTo(119, 420);
      ctx.lineTo(119, 432);
      ctx.lineTo(107, 432);
      ctx.lineTo(107, 420);
      ctx.lineTo(95, 420);
      ctx.lineTo(95, 408);
      ctx.lineTo(107, 408);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FACC15';
      ctx.fillText(`×${mult}`, 113, 414.5);
      ctx.restore();
    } else if (decor === 'space_odyssey') {
      ctx.save();
      for (let i = 0; i < 48; i++) {
        const sx = 16 + ((i * 67) % 192);
        const sy = 28 + ((i * 97) % 450);
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(sim.clock * 2.4 + i));
        ctx.fillStyle = i % 5 === 0 ? `rgba(250, 204, 21, ${tw})` : `rgba(255, 255, 255, ${tw})`;
        ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1.3, i % 4 === 0 ? 2 : 1.3);
      }

      // Ringed Planet Saturn (x=113, y=206)
      ctx.save();
      ctx.translate(113, 206);
      ctx.rotate(-0.22);
      ctx.beginPath();
      ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      ctx.strokeStyle = '#FDE68A';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 25, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Retro Space Rocket (x=108, y=286)
      const rx = 108;
      const ry = 286;
      const flameH = 12 + Math.sin(sim.clock * 28) * 3.5;

      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.moveTo(rx - 5, ry + 20);
      ctx.lineTo(rx, ry + 20 + flameH);
      ctx.lineTo(rx + 5, ry + 20);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.moveTo(rx - 9, ry + 5);
      ctx.lineTo(rx - 17, ry + 21);
      ctx.lineTo(rx - 7, ry + 18);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(rx + 9, ry + 5);
      ctx.lineTo(rx + 17, ry + 21);
      ctx.lineTo(rx + 7, ry + 18);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 26);
      ctx.quadraticCurveTo(rx + 11, ry - 6, rx + 9, ry + 20);
      ctx.lineTo(rx - 9, ry + 20);
      ctx.quadraticCurveTo(rx - 11, ry - 6, rx, ry - 26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(rx, ry - 2, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Planet Earth Bonus Globe (x=113, y=416)
      const gx = 113;
      const gy = 416;
      const gr = 20;
      const earthGrad = ctx.createRadialGradient(gx - 5, gy - 5, 2, gx, gy, gr);
      earthGrad.addColorStop(0, '#38BDF8');
      earthGrad.addColorStop(0.65, '#1D4ED8');
      earthGrad.addColorStop(1, '#1E3A8A');
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.ellipse(gx - 7, gy - 4, 8, 5, 0.4, 0, Math.PI * 2);
      ctx.ellipse(gx + 7, gy + 5, 9, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.font = '700 7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FEF08A';
      ctx.fillText(`×${mult}`, gx, gy);
      ctx.restore();
    } else if (decor === 'star_galaxy') {
      ctx.save();
      for (let i = 0; i < 48; i++) {
        const sx = 16 + ((i * 73) % 192);
        const sy = 28 + ((i * 103) % 450);
        ctx.fillStyle = i % 6 === 0 ? '#93C5FD' : 'rgba(248, 250, 252, 0.52)';
        ctx.fillRect(sx, sy, 1.3, 1.3);
      }

      // Armored Spherical Battle Station right under Reactor Port (x=113, y=236)
      const bx = 113;
      const by = 236;
      const br = 24;
      // Targeting Computer Tactical Reticle Arcs
      ctx.strokeStyle = 'rgba(255, 232, 31, 0.22)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(bx, by, br + 6, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, br + 6, Math.PI - 0.6, Math.PI + 0.6);
      ctx.stroke();

      const stGrad = ctx.createRadialGradient(bx - 6, by - 6, 3, bx, by, br);
      stGrad.addColorStop(0, '#94A3B8');
      stGrad.addColorStop(0.6, '#475569');
      stGrad.addColorStop(1, '#1E293B');
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = stGrad;
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx - br + 1, by);
      ctx.lineTo(bx + br - 1, by);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx - 7, by - 8, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.strokeStyle = sim.multiballActive ? '#22C55E' : '#94A3B8';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // Deux sabres laser croisés au-dessus des flippers : lame rouge et bleue
      const fx = 113;
      const fy = 414;
      const blade = (x1: number, y1: number, x2: number, y2: number, glow: string, core: string) => {
        ctx.lineCap = 'round';
        ctx.strokeStyle = glow;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = core;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      blade(fx - 24, fy - 8, fx + 22, fy + 6, '#EF4444', '#F87171');
      blade(fx + 24, fy - 8, fx - 22, fy + 6, '#3B82F6', '#60A5FA');
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(fx - 29, fy - 12, 6, 3.4);
      ctx.fillRect(fx + 23, fy - 12, 6, 3.4);

      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFE81F';
      ctx.fillText(`×${mult}`, fx, fy + 18);
      ctx.restore();
    } else if (decor === 'classique') {
      const oval = (x: number, y: number, w: number, h: number, rot: number, fill: string, stroke: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        ctx.restore();
      };
      const pill = (x: number, y: number, w: number, h: number, bg: string, fg: string, l1: string, l2?: string) => {
        ctx.save();
        ctx.fillStyle = bg;
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2.4);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = fg;
        ctx.font = '700 7px "JetBrains Mono", monospace';
        ctx.fillText(l1, x, l2 ? y - 3.2 : y);
        if (l2) {
          ctx.font = '700 4.6px "JetBrains Mono", monospace';
          ctx.fillText(l2, x, y + 3.6);
        }
        ctx.restore();
      };

      ctx.save();
      ctx.translate(113, 150);
      for (let i = 0; i < 28; i++) {
        const a = (i * Math.PI) / 14;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
        ctx.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(254, 243, 199, 0.14)' : 'rgba(220, 38, 38, 0.11)';
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
      ctx.restore();

      for (let i = 0; i < 13; i++) {
        const a = Math.PI + 0.22 + (i / 12) * (Math.PI - 0.44);
        const x = 113 + Math.cos(a) * 88;
        const y = 150 + Math.sin(a) * 84;
        oval(x, y, 3.6, 7.4, a + Math.PI / 2, i % 2 === 0 ? '#FEF3C7' : '#DC2626', '#7C2D12');
      }
      ctx.save();
      ctx.font = '700 6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FEF3C7';
      ctx.fillText('AVANCE', 113, 80);
      ctx.restore();

      for (const bmp of table.bumpers.slice(0, 3)) {
        const col = BUMPER_COLORS[bmp.colorStyle]?.main ?? '#DC2626';
        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, bmp.radius + 5.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(254, 243, 199, 0.18)';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bmp.x, bmp.y, bmp.radius + 2.4, 0, Math.PI * 2);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#FEF3C7';
        ctx.stroke();
      }

      pill(54, 234, 40, 18, '#FEF3C7', '#7C2D12', '100', 'POINTS');
      pill(172, 234, 40, 18, '#FEF3C7', '#7C2D12', '100', 'POINTS');
      pill(113, 214, 36, 14, '#DC2626', '#FEF3C7', '300', 'SPÉCIAL');

      ctx.save();
      ctx.fillStyle = '#1A0709';
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(76, 262, 74, 32, 5);
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FDE047';
      ctx.fillText('FLIPPER', 113, 273);
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#FEF3C7';
      ctx.fillText(`BONUS ×${mult}`, 113, 285.5);
      ctx.restore();

      for (let k = 0; k < 5; k++) {
        const lit = k <= mult - 1;
        oval(81 + k * 16, 346, 4, 8, 0, lit ? '#FDE047' : '#FEF3C7', '#7C2D12');
      }
    } else if (
      decor === 'prehistoire' || decor === 'farwest' || decor === 'halloween' ||
      decor === 'candy' || decor === 'bonbons' || decor === 'train' || decor === 'crypte'
    ) {
      this.renderThemedDecor(ctx, decor, mult, sim.clock);
    } else {
      // Temple Solaire: Golden Sun Calendar + Stepped Pyramid
      ctx.save();
      const art = this.artImages.get(table.id) ?? this.artImages.get('solaire');
      if (art && art.complete && art.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.drawImage(art, 8, 120, 209, 260);
        ctx.restore();
      }

      // Rotating Golden Aztec Sun Stone (x=113, y=194)
      ctx.save();
      ctx.translate(113, 194);
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(23, 18, 14, 0.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#F59E0B';
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + sim.clock * 0.35;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
        ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Lower Stepped Golden Pyramid (y=418)
      for (let step = 0; step < 3; step++) {
        const w = 48 - step * 12;
        const h = 10;
        ctx.fillStyle = step === 2 ? '#F59E0B' : '#78350F';
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 1;
        ctx.fillRect(113 - w * 0.5, 424 - step * h, w, h);
        ctx.strokeRect(113 - w * 0.5, 424 - step * h, w, h);
      }
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FEF08A';
      ctx.fillText(`×${mult}`, 113, 412);
      ctx.restore();
    }
  }

  private renderScoopsAndLockChamber(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const decor = resolveDecorTheme(table);
    for (const sc of table.scoops) {
      const flash = (sim.scoopFlashTimers[sc.id] ?? 0) > 0;
      const hasHeldBall = sim.balls.some(
        (b) => b.heldInScoopId === sc.id || b.activeTubeId === sc.id
      );
      const showLockedBall = sc.kind === 'UPPER_LOCK' && sim.lockedBallsCount > 0;

      ctx.save();
      // Habillage architectural thématique autour du puits de capture (Scoop / Lock)
      const outerR = sc.radius + 3.2;
      if (decor === 'train') {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(
          sc.x - outerR - 1,
          sc.y - outerR - 1.5,
          (outerR + 1) * 2,
          (outerR + 1) * 2,
          [outerR, outerR, 2, 2]
        );
        ctx.fill();
        ctx.stroke();
      } else if (decor === 'solaire' || decor === 'crypte') {
        ctx.strokeStyle = sc.color;
        ctx.lineWidth = 1.1;
        ctx.strokeRect(sc.x - outerR, sc.y - outerR, outerR * 2, outerR * 2);
      } else if (decor === 'farwest') {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          ctx.fillStyle = '#D97706';
          ctx.beginPath();
          ctx.arc(
            sc.x + Math.cos(a) * (outerR + 0.8),
            sc.y + Math.sin(a) * (outerR + 0.8),
            1.4,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius + 2.8, 0, Math.PI * 2);
      ctx.fillStyle =
        flash || hasHeldBall || showLockedBall ? `${sc.color}55` : 'rgba(9, 13, 22, 0.9)';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = flash || showLockedBall ? '#FFFFFF' : sc.color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#020617';
      ctx.fill();

      // Render glowing captured ball inside Lock Chamber when Lock 1/2 is active!
      if (showLockedBall || sim.balls.some((b) => b.heldInScoopId === sc.id)) {
        const g = ctx.createRadialGradient(sc.x - 1.5, sc.y - 1.5, 0.5, sc.x, sc.y, 4.6);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.55, '#FDE047');
        g.addColorStop(1, '#CA8A04');
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      if (!this.staticArt) {
        ctx.font = '700 5.4px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = showLockedBall ? '#FEF08A' : sc.color;
        ctx.fillText(
          sc.kind === 'UPPER_LOCK'
            ? sim.multiballActive
              ? 'JACKPOT!'
              : `LOCK ${sim.lockedBallsCount}/2`
            : sc.name.slice(0, 10),
          sc.x,
          sc.y + sc.radius + 7
        );
      }
      ctx.restore();
    }
  }

  /**
   * Rendu des conduits pneumatiques / rails aériens continus reliant les puits VUK à leur sortie :
   * la bille y circule visiblement au lieu de se téléporter !
   */
  private renderOverheadConduits(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    for (const sc of table.scoops) {
      const dist = Math.hypot(sc.ejectTo.x - sc.x, sc.ejectTo.y - sc.y);
      if (dist <= 10) continue;
      const samples = this.getTubeSamples(sc);
      if (samples.length < 3) continue;

      const active = sim.balls.some((b) => b.layer === 1 && b.activeTubeId === sc.id);
      const halfW = 5.4;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Ombre portée du tube sur le plateau
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const sx = s.x + 2 + s.z * 3.5;
        const sy = s.y + 3 + s.z * 5.0;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = halfW * 2;
      ctx.strokeStyle = 'rgba(2, 6, 16, 0.36)';
      ctx.stroke();

      // Tube acrylique translucide
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.lineWidth = halfW * 1.9;
      ctx.strokeStyle = active ? `${sc.color}66` : `${sc.color}2A`;
      ctx.stroke();

      // Anneaux de cerclage métalliques le long du conduit
      for (let i = 3; i < samples.length - 2; i += 4) {
        const s = samples[i];
        ctx.strokeStyle = active ? '#FEF08A' : sc.color;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(s.x + s.nx * halfW, s.y + s.ny * halfW);
        ctx.lineTo(s.x - s.nx * halfW, s.y - s.ny * halfW);
        ctx.stroke();
      }

      // Deux rails latéraux chromés
      for (const side of [1, -1] as const) {
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          const px = s.x + s.nx * halfW * side;
          const py = s.y + s.ny * halfW * side;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = active ? '#FDE047' : sc.color;
        ctx.stroke();
      }

      // Bouche de sortie aérienne
      const endS = samples[samples.length - 1];
      ctx.beginPath();
      ctx.arc(endS.x, endS.y, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.55)';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = active ? '#FEF08A' : sc.color;
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Rendu 3D de l'Étage Supérieur (`layer = 2`) : ombre portée sur le plateau inférieur,
   * plancher thématique ajouré ou boisé, rambardes fermées, seuil ouvert de redescente,
   * cibles, rollovers et bumpers d'étage.
   */
  private renderUpperPlayfield(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    _table: PinballTableDef,
    up: UpperPlayfieldDef,
    activeMissionKind?: string
  ) {
    if (up.bounds.length < 3) return;
    const ballOnUpper = !this.staticArt && sim.balls.some((b) => b.layer === 2);
    const openSet = new Set(up.openEdgeIndices);
    const fillCol = up.fillColor || _table.palette.bgSecondary || '#0F172A';
    const borderCol = up.borderColor || _table.palette.accentPrimary || '#38BDF8';

    ctx.save();

    // 1. Ombre portée profonde projetée sur le niveau 0
    ctx.beginPath();
    ctx.moveTo(up.bounds[0].x + 4, up.bounds[0].y + 7);
    for (let i = 1; i < up.bounds.length; i++) {
      ctx.lineTo(up.bounds[i].x + 4, up.bounds[i].y + 7);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(2, 6, 16, 0.56)';
    ctx.fill();

    // 2. Surface du plateau supérieur avec motif architectural dédié
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(up.bounds[0].x, up.bounds[0].y);
    for (let i = 1; i < up.bounds.length; i++) {
      ctx.lineTo(up.bounds[i].x, up.bounds[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fillCol;
    ctx.fill();
    ctx.clip();

    // Motifs intérieurs selon l'architecture de l'étage
    let minX = 240, maxX = 0, minY = 520, maxY = 0;
    for (const p of up.bounds) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    if (up.style === 'WOOD_BALCONY') {
      // Lattes de plancher en chêne de saloon + clous forgés
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
      ctx.lineWidth = 0.9;
      for (let y = minY + 8; y < maxY; y += 9) {
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.stroke();
      }
    } else if (up.style === 'CYBER_GLASS') {
      // Grille PCB translucide + pistes cuivrées
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 0.75;
      for (let x = minX + 10; x < maxX; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, minY);
        ctx.lineTo(x, maxY);
        ctx.stroke();
      }
      for (let y = minY + 10; y < maxY; y += 12) {
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.stroke();
      }
    } else if (up.style === 'STONE_TERRACE') {
      // Dalles d'or et de jade gravées en quinconce
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.25)';
      ctx.lineWidth = 0.9;
      for (let y = minY + 10; y < maxY; y += 14) {
        ctx.beginPath();
        ctx.moveTo(minX + 4, y);
        ctx.lineTo(maxX - 4, y);
        ctx.stroke();
      }
    } else if (up.style === 'GOTHIC_GALLERY') {
      // Vitrail violet & ferronnerie gothique
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.26)';
      ctx.lineWidth = 0.9;
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * 60, cy + Math.sin(ang) * 60);
        ctx.stroke();
      }
    } else if (up.style === 'SWEET_LOFT') {
      // Gaufrette pâtissière rose & vanille en croisillons
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.28)';
      ctx.lineWidth = 0.85;
      for (let x = minX - 20; x < maxX + 20; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, minY);
        ctx.lineTo(x + 24, maxY);
        ctx.moveTo(x + 24, minY);
        ctx.lineTo(x, maxY);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
      ctx.lineWidth = 0.8;
      for (let x = minX; x < maxX; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, minY);
        ctx.lineTo(x + 16, maxY);
        ctx.stroke();
      }
    }

    // Étiquette discrète gravée sur le plancher de l'étage
    ctx.font = '700 5.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ballOnUpper ? '#FEF08A' : 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(up.name.toUpperCase(), (minX + maxX) * 0.5, minY + 11);
    ctx.restore();

    // 3. Rambardes fermées en relief vs rebord ouvert de redescente
    const n = up.bounds.length;
    for (let i = 0; i < n; i++) {
      const a = up.bounds[i];
      const b = up.bounds[(i + 1) % n];
      if (openSet.has(i)) {
        // Seuil ouvert : pointillés lumineux indiquant la chute vers le niveau 0
        ctx.save();
        ctx.strokeStyle = ballOnUpper ? '#FDE047' : `${borderCol.slice(0, 7)}88`;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        ctx.strokeStyle = ballOnUpper ? '#FACC15' : borderCol;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Poteaux d'angle rivetés
    for (const pt of up.bounds) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = '#090D16';
      ctx.stroke();
    }

    // 4. Rollovers d'étage
    for (const r of up.rollovers) {
      const lit = !this.staticArt && sim.litRollovers.has(r.id);
      this.drawArcadeBulb(ctx, r.x, r.y, r.radius, borderCol.slice(0, 7), lit, r.letter);
    }

    // 5. Cibles d'étage
    for (const t of up.targets) {
      const isHit = sim.hitTargets.has(t.id);
      if (t.kind === 'DROP' && isHit) {
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 1.4;
      } else {
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
        ctx.strokeStyle = isHit ? '#FEF08A' : t.lampColor;
        ctx.lineWidth = 2.5;
      }
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }

    // 6. Bumpers 3D d'étage
    for (const bmp of up.bumpers) {
      this.render3DBumper(
        ctx,
        bmp,
        (sim.bumperFlashTimers[bmp.id] ?? 0) > 0,
        activeMissionKind === 'BUMPER',
        sim.clock
      );
    }

    ctx.restore();
  }

  /**
   * Rendu animé des 12 mécanismes de décor interactifs ancrés dans l'illustration de chaque table.
   */
  private renderInteractiveToys(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    _table: PinballTableDef,
    toys: InteractiveToyDef[]
  ) {
    for (const toy of toys) {
      const st = sim.toyStates[toy.id] ?? {
        hits: 0,
        flash: 0,
        angle: 0,
        spinVel: 0,
        openRatio: 0,
        activeTimer: 0,
        cooldown: 0,
      };
      const flash = !this.staticArt && st.flash > 0;
      const recoil = this.staticArt ? 0 : st.openRatio;
      const ang = this.staticArt ? 0 : st.angle;
      const r = toy.radius;

      if (this.staticArt) {
        // Sur le décor fixe AKA, seule l'embase mécanique est gravée ; la pièce mobile est dessinée en direct par render.cpp !
        ctx.save();
        ctx.translate(toy.x, toy.y);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(9, 13, 22, 0.55)';
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = `${(toy.accentColor || '#38BDF8').slice(0, 7)}66`;
        ctx.stroke();
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.translate(toy.x, toy.y);

      if (flash || st.activeTimer > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = `${(toy.accentColor || '#38BDF8').slice(0, 7)}44`;
        ctx.fill();
      }

      switch (toy.visual) {
        case 'VOLCANO': {
          const lift = -recoil * 2.5;
          ctx.translate(0, lift);
          ctx.beginPath();
          ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
          ctx.fillStyle = '#291811';
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = flash || st.activeTimer > 0 ? '#FEF08A' : '#EA580C';
          ctx.stroke();
          // Cratère de lave incandescent
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
          ctx.fillStyle = flash || st.activeTimer > 0 ? '#FEF08A' : '#DC2626';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = '#FDE047';
          ctx.fill();
          break;
        }
        case 'SALOON_DOORS': {
          // Deux battants en bois western qui s'ouvrent physiquement au passage de la bille !
          const swing = recoil * 0.85;
          for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.translate(side * (r + 1.5), 0);
            ctx.rotate(side * swing);
            ctx.fillStyle = flash ? '#FDE68A' : '#92400E';
            ctx.strokeStyle = '#FACC15';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.roundRect(side < 0 ? 0 : -(r - 1), -3.5, r - 1, 7, 1.5);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            // Poteau de charnière en laiton
            ctx.beginPath();
            ctx.arc(side * (r + 2), 0, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = '#F59E0B';
            ctx.fill();
            ctx.strokeStyle = '#090D16';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
          break;
        }
        case 'PUMPKIN_KING': {
          // Grande citrouille Jack-o'-Lantern rebondissante aux yeux ardents
          const scale = 1 + recoil * 0.14;
          ctx.scale(scale, scale);
          ctx.fillStyle = flash ? '#FB923C' : '#EA580C';
          ctx.strokeStyle = '#7C2D12';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.12, r * 0.96, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.62, r * 0.94, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#15803D';
          ctx.fillRect(-1.8, -r - 2.5, 3.6, 4.5);
          ctx.fillStyle = flash || st.activeTimer > 0 ? '#FFFFFF' : '#FDE047';
          ctx.beginPath();
          ctx.moveTo(-r * 0.55, -2);
          ctx.lineTo(-r * 0.3, -r * 0.45);
          ctx.lineTo(-r * 0.1, -2);
          ctx.moveTo(r * 0.1, -2);
          ctx.lineTo(r * 0.3, -r * 0.45);
          ctx.lineTo(r * 0.55, -2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, r * 0.18, r * 0.5, 0.15, Math.PI - 0.15);
          ctx.fill();
          break;
        }
        case 'RIBBON_VORTEX': {
          // Dôme distributeur kawaii de chewing-gums & bonbons tourbillonnants (Candy Pop)
          ctx.rotate(ang * 0.5);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 241, 242, 0.28)';
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = flash ? '#FEF08A' : '#F472B6';
          ctx.stroke();
          // Billes de chewing-gum multicolores en rotation à l'intérieur du dôme
          const gumCols = ['#FB7185', '#FDE047', '#38BDF8', '#4ADE80', '#C084FC', '#F9A8D4'];
          for (let i = 0; i < 6; i++) {
            const ga = ang + (i * Math.PI) / 3;
            const gx = Math.cos(ga) * (r * 0.56);
            const gy = Math.sin(ga) * (r * 0.56);
            ctx.beginPath();
            ctx.arc(gx, gy, 3.3, 0, Math.PI * 2);
            ctx.fillStyle = gumCols[i];
            ctx.fill();
            ctx.lineWidth = 0.6;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();
          }
          // Cœur sucré central
          ctx.rotate(-ang * 0.5);
          ctx.beginPath();
          ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
          ctx.fillStyle = '#EC4899';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;
        }
        case 'LOLLIPOP_WHEEL': {
          // Grande roue sucette bicolore tournante (Bonbons)
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = '#FFF1F2';
          ctx.fill();
          for (let k = 0; k < 6; k++) {
            const a0 = (k * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r - 1, a0, a0 + Math.PI / 6);
            ctx.closePath();
            ctx.fillStyle = k % 2 === 0 ? '#FB7185' : '#34D399';
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = flash ? '#FEF08A' : '#FB7185';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#FEF08A';
          ctx.fill();
          break;
        }
        case 'RAIL_TURNTABLE': {
          // Plaque tournante ferroviaire en acier riveté (Train Express)
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = flash ? '#FEF08A' : '#94A3B8';
          ctx.stroke();

          ctx.rotate(ang);
          ctx.fillStyle = '#334155';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.1;
          ctx.fillRect(-r + 2, -4.5, (r - 2) * 2, 9);
          ctx.strokeRect(-r + 2, -4.5, (r - 2) * 2, 9);
          // Rails parallèles sur le pont tournant
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(-r + 2, -2.4);
          ctx.lineTo(r - 2, -2.4);
          ctx.moveTo(-r + 2, 2.4);
          ctx.lineTo(r - 2, 2.4);
          ctx.stroke();
          break;
        }
        case 'SARCOPHAGUS': {
          // Sarcophage gothique dont la dalle de pierre coulisse pour révéler la crypte
          ctx.fillStyle = '#020617';
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.roundRect(-r * 0.78, -r, r * 1.56, r * 2, 3);
          ctx.fill();
          ctx.stroke();
          // Lueur spectrale au fond du caveau ouvert
          if (recoil > 0.05 || st.activeTimer > 0) {
            ctx.fillStyle = st.activeTimer > 0 ? '#38BDF8' : 'rgba(56, 189, 248, 0.55)';
            ctx.fillRect(-r * 0.52, -r * 0.72, r * 1.04, r * 1.44);
          }
          // Couvercle sculpté qui coulisse sur le côté
          const slideX = (st.activeTimer > 0 ? 1 : recoil) * (r * 0.95);
          ctx.save();
          ctx.translate(slideX, 0);
          ctx.fillStyle = flash ? '#BAE6FD' : '#1E293B';
          ctx.strokeStyle = '#7DD3FC';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(-r * 0.76, -r * 0.96, r * 1.52, r * 1.92, 3);
          ctx.fill();
          ctx.stroke();
          // Croix gothique gravée sur la dalle
          ctx.strokeStyle = '#E0F2FE';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.55);
          ctx.lineTo(0, r * 0.55);
          ctx.moveTo(-r * 0.38, -r * 0.15);
          ctx.lineTo(r * 0.38, -r * 0.15);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'SUN_WHEEL': {
          // Disque solaire aztèque tournant en or et jade
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(24, 16, 8, 0.88)';
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = flash ? '#FFFFFF' : '#F59E0B';
          ctx.stroke();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            ctx.strokeStyle = i % 2 === 0 ? '#10B981' : '#FDE047';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (r * 0.38), Math.sin(a) * (r * 0.38));
            ctx.lineTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2));
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
          ctx.fillStyle = '#10B981';
          ctx.fill();
          break;
        }
        case 'SATURN_RING': {
          // Vortex orbital de Saturne
          ctx.rotate(ang);
          ctx.strokeStyle = flash ? '#FFFFFF' : 'rgba(253, 230, 138, 0.65)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
          ctx.fillStyle = flash ? '#FEF08A' : '#F59E0B';
          ctx.fill();
          break;
        }
        case 'DEATH_STAR_CORE': {
          // Réacteur blindé de la station orbitale
          const s = 1 - recoil * 0.12;
          ctx.scale(s, s);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = flash || st.activeTimer > 0 ? '#22C55E' : 'rgba(15, 23, 42, 0.85)';
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = flash ? '#FFFFFF' : '#4ADE80';
          ctx.stroke();
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2 + sim.clock * 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * (r - 1.5), Math.sin(a) * (r - 1.5));
            ctx.strokeStyle = '#86EFAC';
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
          break;
        }
        case 'ESP32_CHIP': {
          // Cœur silicium interactif QFN-28 avec ondes Wi-Fi réactives
          const pulse = 1 + recoil * 0.14;
          ctx.scale(pulse, pulse);
          ctx.fillStyle = flash || st.activeTimer > 0 ? '#0284C7' : '#0F172A';
          ctx.strokeStyle = flash ? '#FEF08A' : '#38BDF8';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(-r, -r, r * 2, r * 2, 3);
          ctx.fill();
          ctx.stroke();
          ctx.font = '700 5.6px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText('S3', 0, 0.5);
          break;
        }
        case 'EM_ROTO_BELL':
        default: {
          // Cible rotative électromécanique 1960s numérotée
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = flash ? '#FEF08A' : '#FEF3C7';
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = '#DC2626';
          ctx.stroke();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx.strokeStyle = i % 2 === 0 ? '#DC2626' : '#1D4ED8';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * (r - 1.5), Math.sin(a) * (r - 1.5));
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
          ctx.fillStyle = '#DC2626';
          ctx.fill();
          break;
        }
      }

      ctx.restore();
    }
  }

  private renderTableHousingsAndTargets(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const pal = table.palette;
    const activePlayer = sim.players[sim.activePlayerIndex];
    const activeMission =
      table.missions[(activePlayer?.activeMissionIndex ?? 0) % table.missions.length];
    const targetMissionActive = activeMission?.targetKind === 'TARGET';

    // Draw Table-Specific Beveled Housings & Flipper Feeder Islands
    for (const h of table.beveledHousings) {
      if (h.points.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(h.points[0].x, h.points[0].y);
      for (let i = 1; i < h.points.length; i++) {
        ctx.lineTo(h.points[i].x, h.points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = h.fillColor ?? '#1E293B';
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = pal.wallMetal;
      ctx.stroke();
    }

    // Draw Flush Targets + Lamp Inserts
    for (const t of table.targets) {
      const isHit = sim.hitTargets.has(t.id);
      const mx = (t.x1 + t.x2) * 0.5;
      const my = (t.y1 + t.y2) * 0.5;
      const tvx = t.x2 - t.x1;
      const tvy = t.y2 - t.y1;
      const vertical = Math.abs(tvx) < 0.01;
      const tl = Math.hypot(tvx, tvy) || 1;
      const lampX = vertical ? (mx < 113 ? mx + 8.5 : mx - 8.5) : mx + (tvy / tl) * 8.5;
      const lampY = vertical ? my : my - (Math.abs(tvx) / tl) * 8.5;

      const missionPulse =
        targetMissionActive && !isHit && Math.sin(sim.clock * 12 + my * 0.1) > 0.2;

      ctx.beginPath();
      ctx.arc(lampX, lampY, 2.9, 0, Math.PI * 2);
      ctx.fillStyle = isHit || missionPulse ? t.lampColor : 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = isHit || missionPulse ? '#FFFFFF' : t.lampColor;
      ctx.stroke();

      if (t.kind === 'DROP' && isHit) {
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 4.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();

        ctx.strokeStyle = isHit ? '#FACC15' : t.lampColor;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }

      const textX = vertical ? (mx < 113 ? mx + 15.5 : mx - 15.5) : mx + (tvy / tl) * 15.5;
      const textY = vertical ? my + 0.5 : my - (Math.abs(tvx) / tl) * 15.5;
      ctx.font = '700 5.6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isHit ? '#FEF08A' : '#CBD5E1';
      ctx.fillText(t.letter, textX, textY);
    }
  }

  private renderCabinetAndSlingshots(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const pal = table.palette;

    // 1. Beveled Steel Cabinet Side Rails along 520px height
    const leftRail = ctx.createLinearGradient(0, 0, 8, 0);
    leftRail.addColorStop(0, '#475569');
    leftRail.addColorStop(0.55, pal.cabinetHighlight);
    leftRail.addColorStop(1, '#334155');
    ctx.fillStyle = leftRail;
    ctx.fillRect(0, 0, 8, WORLD_HEIGHT);

    const rightRail = ctx.createLinearGradient(233, 0, 240, 0);
    rightRail.addColorStop(0, '#334155');
    rightRail.addColorStop(0.45, pal.cabinetHighlight);
    rightRail.addColorStop(1, '#475569');
    ctx.fillStyle = rightRail;
    ctx.fillRect(233, 0, 7, WORLD_HEIGHT);

    ctx.fillStyle = '#1E293B';
    for (let ry = 28; ry < WORLD_HEIGHT; ry += 55) {
      ctx.beginPath();
      ctx.arc(4, ry, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Raised 3D Triangular Arcade Slingshots (y: 376..431)
    const draw3DSlingshot = (
      p1: [number, number],
      p2: [number, number],
      p3: [number, number],
      flash: number
    ) => {
      ctx.fillStyle = '#090D16';
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1] + 2.8);
      ctx.lineTo(p2[0], p2[1] + 2.8);
      ctx.lineTo(p3[0], p3[1] + 2.8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = flash > 0 ? '#FACC15' : pal.slingshotMain;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.fill();

      ctx.lineWidth = 1.4;
      ctx.strokeStyle = flash > 0 ? '#FFFFFF' : pal.slingshotAccent;
      ctx.stroke();

      const cx = (p1[0] + p2[0] + p3[0]) / 3;
      const cy = (p1[1] + p2[1] + p3[1]) / 3;
      // biseau : triangle intérieur éclairci + arête haute brillante
      ctx.beginPath();
      ctx.moveTo(cx + (p1[0] - cx) * 0.62, cy + (p1[1] - cy) * 0.62);
      ctx.lineTo(cx + (p2[0] - cx) * 0.62, cy + (p2[1] - cy) * 0.62);
      ctx.lineTo(cx + (p3[0] - cx) * 0.62, cy + (p3[1] - cy) * 0.62);
      ctx.closePath();
      ctx.fillStyle = flash > 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.16)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.stroke();
      this.drawStarShape(ctx, cx, cy, 5.4, 2.4, '#FFFFFF');
    };

    draw3DSlingshot([45, 376], [45, 416], [70, 431], sim.slingshotFlash.LEFT);
    draw3DSlingshot([181, 376], [181, 416], [156, 431], sim.slingshotFlash.RIGHT);

    // 3. Structural Metallic Walls & Pegs
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const w of [...sim.baseWalls, ...table.extraWalls]) {
      if (w.oneWayNormal) {
        ctx.save();
        ctx.strokeStyle = pal.wallHighlight;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2.5, 2]);
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        if (sim.gateOpenTimer > 0) ctx.lineTo(w.x2 - 5, w.y2 - 4);
        else ctx.lineTo(w.x2, w.y2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (w.isKicker) {
        const fl = w.kickerSide ? sim.slingshotFlash[w.kickerSide] : 0;
        ctx.strokeStyle = fl > 0 ? '#FFFFFF' : '#FDE047';
        ctx.lineWidth = fl > 0 ? 3.0 : 2.2;
      } else {
        ctx.strokeStyle = pal.wallMetal;
        ctx.lineWidth = 2.0;
      }

      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }

    for (const p of [...sim.basePegs, ...sim.tableHousingPegs, ...table.extraPegs]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = pal.wallHighlight;
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#0F172A';
      ctx.stroke();
    }

    // 4. Lower Metallic Apron Housing (y: 452..520)
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(8, WORLD_HEIGHT);
    ctx.lineTo(8, 452);
    ctx.lineTo(89, 504);
    ctx.lineTo(89, WORLD_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.cabinetHighlight;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(217, WORLD_HEIGHT);
    ctx.lineTo(217, 452);
    ctx.lineTo(137, 504);
    ctx.lineTo(137, WORLD_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FACC15';
    ctx.fillRect(13, 488, 28, 15);
    ctx.fillRect(184, 488, 28, 15);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1;
    ctx.strokeRect(13, 488, 28, 15);
    ctx.strokeRect(184, 488, 28, 15);

    ctx.font = '700 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#090D16';
    ctx.fillText('BTN A', 27, 496);
    ctx.fillText('BTN D', 198, 496);
  }

  private drawArcadeBulb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    lit: boolean,
    label?: string
  ) {
    ctx.save();
    if (lit) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = `${color}44`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = lit ? color : 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = lit ? '#FFFFFF' : '#475569';
    ctx.stroke();

    if (label) {
      ctx.font = '700 6.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = lit ? '#090D16' : '#94A3B8';
      ctx.fillText(label, x, y + 0.5);
    }
    ctx.restore();
  }

  private renderDrainSaveEmblem(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const saveActive = sim.ballSaveTimer > 0 && !sim.isTilted;
    const blink = saveActive && (sim.ballSaveTimer > 3 || Math.sin(sim.clock * 16) > 0);
    const decor = resolveDecorTheme(table);

    if (decor === 'aka_esp32') {
      ctx.save();
      ctx.fillStyle = blink ? '#FACC15' : 'rgba(250, 204, 21, 0.25)';
      ctx.strokeStyle = blink ? '#FFFFFF' : '#FACC15';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(98, 484, 30, 13, 3);
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 7.2px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = blink ? '#090D16' : '#FEF08A';
      ctx.fillText('AKA', 113, 491);
      ctx.restore();
    } else if (decor === 'space_odyssey') {
      this.drawStarShape(
        ctx,
        113,
        490,
        9.5,
        4.4,
        blink ? '#FACC15' : 'rgba(250, 204, 21, 0.3)',
        '#FEF08A'
      );
    } else {
      ctx.beginPath();
      ctx.arc(113, 490, 8, 0, Math.PI * 2);
      ctx.fillStyle = blink ? table.palette.accentPrimary : `${table.palette.accentPrimary}2E`;
      ctx.fill();
      ctx.strokeStyle = blink ? '#FFFFFF' : '#475569';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.font = '700 4.8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = blink ? '#090D16' : '#CBD5E1';
      ctx.fillText('SAVE', 113, 490.5);
    }
  }

  private drawStarShape(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    fill: string,
    stroke?: string
  ) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI * 0.5 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderHunt(
    ctx: CanvasRenderingContext2D,
    h: HuntDef,
    slotIdx: number,
    flash: number,
    clock: number
  ) {
    const n = h.slots.length;
    ctx.save();
    // Repères discrets des emplacements possibles
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const sl of h.slots) {
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.staticArt) {
      ctx.restore();
      return;
    }
    const p = h.slots[slotIdx % n];
    const r = h.radius + (flash > 0 ? 2 : 0);
    const pulse = 1 + Math.sin(clock * 6) * 0.06;
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.arc(0, 0, r + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = flash > 0 ? '#FFFFFF' : `${h.color}55`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = h.color;
    ctx.fill();
    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#1C1917';
    ctx.strokeStyle = '#1C1917';
    switch (h.kind) {
      case 'WANTED': // affiche + étoile
        ctx.fillRect(-r * 0.55, -r * 0.6, r * 1.1, r * 1.2);
        ctx.fillStyle = h.color;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'GHOST':
        ctx.beginPath();
        ctx.arc(0, -r * 0.1, r * 0.55, Math.PI, 0);
        ctx.lineTo(r * 0.55, r * 0.55);
        ctx.lineTo(0, r * 0.3);
        ctx.lineTo(-r * 0.55, r * 0.55);
        ctx.closePath();
        ctx.fillStyle = '#F0FDF4';
        ctx.fill();
        ctx.fillStyle = '#1C1917';
        ctx.fillRect(-r * 0.3, -r * 0.2, 2, 2.4);
        ctx.fillRect(r * 0.15, -r * 0.2, 2, 2.4);
        break;
      case 'MAMMOTH':
        ctx.beginPath();
        ctx.arc(0, -r * 0.1, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.3, r * 0.2, r * 0.5, -0.4, 1.8);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'LOLLIPOP':
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#FFF1F2';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.3, 0, Math.PI * 4 * 0.75);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      case 'ZOMBIE':
        ctx.beginPath();
        ctx.arc(0, -r * 0.1, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#14532D';
        ctx.fill();
        ctx.fillStyle = '#F0FDF4';
        ctx.fillRect(-r * 0.32, -r * 0.25, 2, 2.4);
        ctx.fillRect(r * 0.12, -r * 0.25, 2, 2.4);
        ctx.fillStyle = '#14532D';
        ctx.fillRect(-r * 0.9, r * 0.15, r * 0.55, 2);
        break;
      case 'LOCOMOTIVE':
        ctx.fillRect(-r * 0.65, -r * 0.25, r * 1.3, r * 0.7);
        ctx.fillRect(-r * 0.15, -r * 0.65, r * 0.55, r * 0.5);
        ctx.beginPath();
        ctx.arc(-r * 0.35, r * 0.5, 1.6, 0, Math.PI * 2);
        ctx.arc(r * 0.35, r * 0.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  private render3DBumper(
    ctx: CanvasRenderingContext2D,
    bmp: BumperDef,
    flash: boolean,
    missionFocus: boolean,
    clock: number
  ) {
    const c = BUMPER_COLORS[bmp.colorStyle] ?? BUMPER_COLORS.RED;
    const r = bmp.radius + (flash ? 1.5 : 0);
    const liftY = flash ? -1.5 : 0;

    ctx.save();
    if (missionFocus && Math.sin(clock * 10 + bmp.x) > 0) {
      ctx.beginPath();
      ctx.arc(bmp.x, bmp.y, r + 4.2, 0, Math.PI * 2);
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    if (flash) {
      ctx.beginPath();
      ctx.arc(bmp.x, bmp.y, r + 6.2, 0, Math.PI * 2);
      ctx.fillStyle = `${c.glow}55`;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(bmp.x, bmp.y + 3.6, r * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = '#090D16';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bmp.x, bmp.y + 2.4, r * 0.88, 0, Math.PI * 2);
    ctx.fillStyle = c.dark;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#E2E8F0';
    ctx.stroke();

    const capY = bmp.y + liftY;
    ctx.beginPath();
    ctx.arc(bmp.x, capY, r + 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#CBD5E1';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bmp.x, capY, r, 0, Math.PI * 2);
    const capGrad = ctx.createRadialGradient(bmp.x - r * 0.35, capY - r * 0.4, r * 0.1, bmp.x, capY, r);
    capGrad.addColorStop(0, flash ? '#FFFFFF' : c.light);
    capGrad.addColorStop(0.55, flash ? '#FEF08A' : c.main);
    capGrad.addColorStop(1, flash ? '#FACC15' : c.dark);
    ctx.fillStyle = capGrad;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#090D16';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bmp.x, capY, r * 0.78, 0, Math.PI * 2);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = flash ? '#FFFFFF' : c.light;
    ctx.stroke();

    const iconColor = flash ? '#090D16' : '#FFFFFF';
    ctx.save();
    ctx.translate(bmp.x, capY);
    ctx.fillStyle = iconColor;
    ctx.strokeStyle = iconColor;
    ctx.lineWidth = 1.2;

    switch (bmp.iconStyle) {
      case 'GEAR':
        for (let i = 0; i < 8; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 4);
          ctx.fillRect(-1.2, -r * 0.56, 2.4, r * 1.12);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = flash ? '#FACC15' : c.main;
        ctx.fill();
        break;
      case 'CHIP':
        ctx.strokeRect(-r * 0.36, -r * 0.36, r * 0.72, r * 0.72);
        ctx.fillRect(-r * 0.18, -r * 0.18, r * 0.36, r * 0.36);
        for (const p of [-r * 0.22, 0, r * 0.22]) {
          ctx.fillRect(p - 0.6, -r * 0.54, 1.2, r * 0.16);
          ctx.fillRect(p - 0.6, r * 0.38, 1.2, r * 0.16);
          ctx.fillRect(-r * 0.54, p - 0.6, r * 0.16, 1.2);
          ctx.fillRect(r * 0.38, p - 0.6, r * 0.16, 1.2);
        }
        break;
      case 'STAR':
        ctx.restore();
        this.drawStarShape(ctx, bmp.x, capY, r * 0.56, r * 0.24, iconColor);
        ctx.save();
        ctx.translate(bmp.x, capY);
        break;
      case 'PLANET':
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(-0.35);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.58, r * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'TURRET':
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
          ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
          ctx.stroke();
        }
        break;
      case 'CREST':
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'SUN':
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34);
          ctx.lineTo(Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56);
          ctx.stroke();
        }
        break;
      case 'TOTEM':
        ctx.strokeRect(-r * 0.34, -r * 0.4, r * 0.68, r * 0.8);
        ctx.fillRect(-r * 0.22, -r * 0.22, r * 0.16, r * 0.16);
        ctx.fillRect(r * 0.06, -r * 0.22, r * 0.16, r * 0.16);
        ctx.fillRect(-r * 0.22, r * 0.1, r * 0.44, r * 0.14);
        break;
      case 'VINTAGE_CAP':
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32);
          ctx.lineTo(Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64);
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
        ctx.font = '700 5.2px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('100', 0, 0.5);
        break;
      case 'VOLCANO':
        ctx.beginPath();
        ctx.moveTo(-r * 0.48, r * 0.36);
        ctx.lineTo(-r * 0.18, -r * 0.22);
        ctx.lineTo(r * 0.18, -r * 0.22);
        ctx.lineTo(r * 0.48, r * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -r * 0.38, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'DINO_EGG':
        ctx.beginPath();
        ctx.ellipse(0, 0.5, r * 0.36, r * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-r * 0.12, -r * 0.1, 1.3, 0, Math.PI * 2);
        ctx.arc(r * 0.14, r * 0.12, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'SKULL':
        ctx.beginPath();
        ctx.arc(0, -r * 0.08, r * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-r * 0.2, r * 0.16, r * 0.4, r * 0.22);
        ctx.fillStyle = flash ? '#FACC15' : c.dark;
        ctx.fillRect(-r * 0.2, -r * 0.14, r * 0.13, r * 0.13);
        ctx.fillRect(r * 0.07, -r * 0.14, r * 0.13, r * 0.13);
        break;
      case 'SHERIFF':
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'BARREL':
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.38, r * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.35, -r * 0.18);
        ctx.lineTo(r * 0.35, -r * 0.18);
        ctx.moveTo(-r * 0.35, r * 0.18);
        ctx.lineTo(r * 0.35, r * 0.18);
        ctx.stroke();
        break;
      case 'WHEEL':
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48);
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'PUMPKIN':
        ctx.beginPath();
        ctx.ellipse(0, 1, r * 0.48, r * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(-1, -r * 0.48, 2, r * 0.16);
        ctx.beginPath();
        ctx.moveTo(-r * 0.24, -1);
        ctx.lineTo(-r * 0.12, -r * 0.18);
        ctx.lineTo(-r * 0.04, -1);
        ctx.moveTo(r * 0.04, -1);
        ctx.lineTo(r * 0.12, -r * 0.18);
        ctx.lineTo(r * 0.24, -1);
        ctx.fill();
        break;
      case 'BAT':
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.18);
        ctx.quadraticCurveTo(-r * 0.35, -r * 0.48, -r * 0.56, 0);
        ctx.quadraticCurveTo(-r * 0.28, r * 0.05, 0, r * 0.26);
        ctx.quadraticCurveTo(r * 0.28, r * 0.05, r * 0.56, 0);
        ctx.quadraticCurveTo(r * 0.35, -r * 0.48, 0, -r * 0.18);
        ctx.fill();
        break;
      case 'HEART': {
        const hr = r * 0.42;
        ctx.beginPath();
        ctx.moveTo(0, hr * 0.9);
        ctx.bezierCurveTo(-hr * 1.6, -hr * 0.1, -hr * 0.7, -hr * 1.2, 0, -hr * 0.35);
        ctx.bezierCurveTo(hr * 0.7, -hr * 1.2, hr * 1.6, -hr * 0.1, 0, hr * 0.9);
        ctx.fill();
        break;
      }
      case 'RIBBON':
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-r * 0.48, -r * 0.32);
        ctx.lineTo(-r * 0.48, r * 0.32);
        ctx.closePath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 0.48, -r * 0.32);
        ctx.lineTo(r * 0.48, r * 0.32);
        ctx.closePath();
        ctx.fill();
        break;
      case 'SWIRL_CANDY':
        ctx.beginPath();
        for (let a = 0; a < 9; a += 0.3) {
          const sr = a * r * 0.062;
          const sx = Math.cos(a) * sr;
          const sy = Math.sin(a) * sr;
          if (a === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        break;
      case 'PEPPERMINT':
        for (let i = 0; i < 6; i++) {
          const a0 = (i * Math.PI) / 3;
          if (i % 2 === 0) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r * 0.52, a0, a0 + Math.PI / 3);
            ctx.closePath();
            ctx.fill();
          }
        }
        break;
      case 'LANTERN':
        ctx.strokeRect(-r * 0.26, -r * 0.3, r * 0.52, r * 0.62);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-r * 0.34, -r * 0.38, r * 0.68, 1.5);
        ctx.fillRect(-r * 0.34, r * 0.3, r * 0.68, 1.5);
        break;
      case 'TOMBSTONE':
        ctx.beginPath();
        ctx.roundRect(-r * 0.32, -r * 0.42, r * 0.64, r * 0.82, [r * 0.3, r * 0.3, 1, 1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.22);
        ctx.lineTo(0, r * 0.22);
        ctx.moveTo(-r * 0.16, -r * 0.06);
        ctx.lineTo(r * 0.16, -r * 0.06);
        ctx.stroke();
        break;
      case 'RUNE':
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, r * 0.5);
        ctx.moveTo(-r * 0.32, -r * 0.24);
        ctx.lineTo(0, 0);
        ctx.lineTo(r * 0.32, -r * 0.24);
        ctx.moveTo(-r * 0.26, r * 0.26);
        ctx.lineTo(0, 0.04);
        ctx.lineTo(r * 0.26, r * 0.26);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();

    // Reflet spéculaire verni sur le dôme
    ctx.beginPath();
    ctx.ellipse(bmp.x - r * 0.38, capY - r * 0.46, r * 0.26, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.fill();
    ctx.restore();
  }

  private render3DFlippers(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef,
    targetDeckLayer: 0 | 2 = 0
  ) {
    if (this.staticArt) return;
    const pal = table.palette;
    const decor: BuiltinThemeId = resolveDecorTheme(table);

    const drawTaperedCapsule = (
      x1: number,
      y1: number,
      r1: number,
      x2: number,
      y2: number,
      r2: number
    ) => {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.arc(x1, y1, r1, angle + Math.PI * 0.5, angle + Math.PI * 1.5);
      ctx.arc(x2, y2, r2, angle - Math.PI * 0.5, angle + Math.PI * 0.5);
      ctx.closePath();
    };

    for (const f of sim.flippers) {
      if ((f.deckLayer ?? 0) !== targetDeckLayer) continue;
      const tipX = f.pivot.x + Math.cos(f.angle) * f.length;
      const tipY = f.pivot.y + Math.sin(f.angle) * f.length;
      const rPivot = f.radius * 1.15;
      const rTip = f.radius * 0.72;

      ctx.save();
      // Ombre portée sur le plateau
      drawTaperedCapsule(f.pivot.x + 0.8, f.pivot.y + 3.2, rPivot + 0.6, tipX + 0.8, tipY + 3.2, rTip + 0.6);
      ctx.fillStyle = 'rgba(2, 6, 16, 0.46)';
      ctx.fill();

      // Jupe 3D + bague caoutchouc périphérique
      drawTaperedCapsule(f.pivot.x, f.pivot.y + 2.2, rPivot + 0.5, tipX, tipY + 2.2, rTip + 0.5);
      ctx.fillStyle = sim.isTilted ? '#334155' : pal.flipperSkirt;
      ctx.fill();
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = '#090D16';
      ctx.stroke();

      drawTaperedCapsule(f.pivot.x, f.pivot.y, rPivot + 0.5, tipX, tipY, rTip + 0.5);
      ctx.fillStyle = sim.isTilted ? '#475569' : pal.flipperSkirt;
      ctx.fill();
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 1;
      ctx.stroke();

      drawTaperedCapsule(f.pivot.x, f.pivot.y, rPivot - 0.95, tipX, tipY, rTip - 0.8);
      ctx.fillStyle = sim.isTilted ? '#94A3B8' : pal.flipperTop;
      ctx.fill();

      // Nervure / incrustation thématique sur le batteur
      if (!sim.isTilted) {
        const ax = f.pivot.x + Math.cos(f.angle) * (rPivot + 2.2);
        const ay = f.pivot.y + Math.sin(f.angle) * (rPivot + 2.2);
        const bx = f.pivot.x + Math.cos(f.angle) * (f.length - rTip - 1.5);
        const by = f.pivot.y + Math.sin(f.angle) * (f.length - rTip - 1.5);
        ctx.strokeStyle =
          decor === 'star_galaxy'
            ? f.side === 'LEFT'
              ? '#3B82F6'
              : '#EF4444'
            : decor === 'classique'
              ? '#DC2626'
              : pal.accentPrimary;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1.25;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Axe métallique usiné du pivot
      ctx.beginPath();
      ctx.arc(f.pivot.x, f.pivot.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#E2E8F0';
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ============================================================================
  // HIGH-DETAIL 3D MOLDED ACRYLIC & CHROME WIREFORM RAMPS
  // ============================================================================
  private render3DRamps(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef,
    missionFocus: boolean
  ) {
    for (const ramp of table.ramps) {
      const samples = this.getRampSamples(ramp);
      if (samples.length < 4) continue;

      const active = sim.balls.some((b) => b.layer === 1 && b.activeRampId === ramp.id);
      const halfW = ramp.style === 'WIREFORM_RAIL' ? 6.0 : 6.8;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Elevation-Projected Drop Shadow on Playfield Floor
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const sx = s.x + 2.2 + s.z * 3.8;
        const sy = s.y + 3.2 + s.z * 5.6;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = halfW * 2.1;
      ctx.strokeStyle = 'rgba(2, 6, 16, 0.44)';
      ctx.stroke();

      // 2. Cylindrical Metallic Support Pillars under Elevated Bridge Spans
      const pillarIndices = [
        Math.floor(samples.length * 0.35),
        Math.floor(samples.length * 0.68),
      ];
      for (const idx of pillarIndices) {
        const s = samples[idx];
        if (!s || s.z < 0.45) continue;
        const baseX = s.x + 1.5;
        const baseY = s.y + 7.5 * s.z;
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(baseX, baseY, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();
      }

      if (ramp.style === 'MOLDED_ACRYLIC') {
        // 3A. Translucent Molded Polycarbonate Floor Ribbon
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          const lx = s.x + s.nx * halfW;
          const ly = s.y + s.ny * halfW;
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        for (let i = samples.length - 1; i >= 0; i--) {
          const s = samples[i];
          const rx = s.x - s.nx * halfW;
          const ry = s.y - s.ny * halfW;
          ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.fillStyle = active ? `${ramp.chuteColor}6E` : `${ramp.chuteColor}3E`;
        ctx.fill();

        // Cross-Ribbed Polycarbonate Sleepers
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 0.9;
        for (let i = 3; i < samples.length - 3; i += 4) {
          const s = samples[i];
          ctx.beginPath();
          ctx.moveTo(s.x + s.nx * (halfW - 1), s.y + s.ny * (halfW - 1));
          ctx.lineTo(s.x - s.nx * (halfW - 1), s.y - s.ny * (halfW - 1));
          ctx.stroke();
        }

        // Animated Flow Chevrons inside Chute!
        const phaseOffset = (sim.clock * 8) % 6;
        for (let i = 2; i < samples.length - 3; i += 6) {
          const idx = Math.min(samples.length - 2, Math.floor(i + phaseOffset));
          const s = samples[idx];
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(Math.atan2(s.ty, s.tx));
          ctx.strokeStyle =
            active || sim.jackpotLit || missionFocus ? '#FEF08A' : 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(-2.5, -2.8);
          ctx.lineTo(2.0, 0);
          ctx.lineTo(-2.5, 2.8);
          ctx.stroke();
          ctx.restore();
        }

        // True Parallel 3D Raised Side Curbs (Left & Right walls drawn separately!)
        for (const side of [1, -1] as const) {
          // Dark outer steel casing
          ctx.beginPath();
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            const px = s.x + s.nx * halfW * side;
            const py = s.y + s.ny * halfW * side;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 3.0;
          ctx.strokeStyle = '#090D16';
          ctx.stroke();

          // Colored / Chrome Top Rail
          ctx.lineWidth = 1.7;
          ctx.strokeStyle = active || sim.jackpotLit ? '#FACC15' : ramp.railColor;
          ctx.stroke();

          // Crisp Specular Highlight
          ctx.lineWidth = 0.65;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.stroke();
        }
      } else {
        // 3B. WIREFORM_RAIL: 3D Chrome Twin-Wire Habitrail Cage!
        // Welded C-Shaped Steel Rings every 4 samples
        for (let i = 2; i < samples.length - 2; i += 4) {
          const s = samples[i];
          const litRing =
            active || sim.jackpotLit || (((Math.floor(sim.clock * 12) - i) % 12 + 12) % 12 === 0);
          ctx.strokeStyle = litRing ? '#FEF08A' : '#64748B';
          ctx.lineWidth = litRing ? 1.8 : 1.3;
          ctx.beginPath();
          ctx.moveTo(s.x + s.nx * halfW, s.y + s.ny * halfW - 1.2);
          ctx.quadraticCurveTo(
            s.x,
            s.y + 1.6,
            s.x - s.nx * halfW,
            s.y - s.ny * halfW - 1.2
          );
          ctx.stroke();
        }

        // 2 Bottom Runner Wires (±2.3px)
        for (const side of [1, -1] as const) {
          ctx.beginPath();
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            const px = s.x + s.nx * 2.3 * side;
            const py = s.y + s.ny * 2.3 * side;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#0F172A';
          ctx.stroke();
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = '#CBD5E1';
          ctx.stroke();
        }

        // 2 Elevated Outer Guardrail Chrome Wires (±halfW, raised -1.4px in Y)
        for (const side of [1, -1] as const) {
          ctx.beginPath();
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            const px = s.x + s.nx * halfW * side;
            const py = s.y + s.ny * halfW * side - 1.4;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = '#090D16';
          ctx.stroke();

          ctx.lineWidth = 1.4;
          ctx.strokeStyle = active || sim.jackpotLit ? '#FDE047' : ramp.railColor;
          ctx.stroke();

          ctx.lineWidth = 0.55;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
        }
      }

      // 3C. Effet d'étages : la rampe s'élève par paliers (contremarches avec ombre portée et rivets)
      for (const [fi, frac] of [0.33, 0.66].entries()) {
        const idx = Math.floor(samples.length * frac);
        const s = samples[idx];
        if (!s) continue;
        ctx.save();
        ctx.lineCap = 'butt';
        // plateau supérieur légèrement éclairci
        ctx.beginPath();
        for (let i = idx; i < samples.length; i++) {
          if (i === idx) ctx.moveTo(samples[i].x, samples[i].y);
          else ctx.lineTo(samples[i].x, samples[i].y);
        }
        ctx.lineWidth = halfW * 2 - 2.4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.stroke();
        // contremarche : ombre, tranche sombre puis arête brillante
        const ax = s.x + s.nx * (halfW + 0.6);
        const ay = s.y + s.ny * (halfW + 0.6);
        const bx = s.x - s.nx * (halfW + 0.6);
        const by = s.y - s.ny * (halfW + 0.6);
        ctx.beginPath();
        ctx.moveTo(ax + 0.8, ay + 3.4 + fi);
        ctx.lineTo(bx + 0.8, by + 3.4 + fi);
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = 'rgba(2, 6, 16, 0.5)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax, ay + 1.4);
        ctx.lineTo(bx, by + 1.4);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#0F172A';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax, ay - 0.4);
        ctx.lineTo(bx, by - 0.4);
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = '#F8FAFC';
        ctx.stroke();
        for (const [rx, ry] of [[ax, ay - 0.4], [bx, by - 0.4]]) {
          ctx.beginPath();
          ctx.arc(rx, ry, 1.1, 0, Math.PI * 2);
          ctx.fillStyle = '#CBD5E1';
          ctx.fill();
        }
        ctx.restore();
      }

      // 4. Hinged Brushed-Steel Entrance Threshold Plate + Entry Beacons!
      const s0 = samples[0];
      ctx.save();
      ctx.translate(s0.x, s0.y);
      ctx.rotate(Math.atan2(s0.ty, s0.tx));
      ctx.fillStyle = '#CBD5E1';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 0.9;
      ctx.fillRect(-3.2, -halfW + 0.5, 6.4, (halfW - 0.5) * 2);
      ctx.strokeRect(-3.2, -halfW + 0.5, 6.4, (halfW - 0.5) * 2);

      // Twin Entry Post Lamps (flash brightly on Jackpot or Ramp Mission!)
      const lampOn =
        active ||
        sim.jackpotLit ||
        (missionFocus && Math.sin(sim.clock * 12) > -0.2);
      ctx.fillStyle = lampOn ? '#FACC15' : ramp.chuteColor;
      ctx.beginPath();
      ctx.arc(0, -halfW - 1.2, 2.1, 0, Math.PI * 2);
      ctx.arc(0, halfW + 1.2, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      //Pulsing Entrance Chevron Callout on Playfield Floor before Ramp Mouth
      const pulse = 0.45 + 0.55 * Math.sin(sim.clock * 9 + ramp.entry.x * 0.05);
      ctx.save();
      ctx.translate(
        ramp.entry.x - ramp.entryDir.x * 12,
        ramp.entry.y - ramp.entryDir.y * 12
      );
      ctx.rotate(Math.atan2(ramp.entryDir.y, ramp.entryDir.x) + Math.PI * 0.5);
      ctx.globalAlpha = sim.jackpotLit || missionFocus ? 0.98 : pulse * 0.85;
      ctx.fillStyle = sim.jackpotLit
        ? '#FDE047'
        : missionFocus
          ? '#38BDF8'
          : ramp.chuteColor;
      ctx.beginPath();
      ctx.moveTo(0, -4.5);
      ctx.lineTo(-5.5, 2.5);
      ctx.lineTo(-2, 2.5);
      ctx.lineTo(0, -0.8);
      ctx.lineTo(2, 2.5);
      ctx.lineTo(5.5, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 5. Elevated Chrome Exit Drop Ring
      const exitSample = samples[samples.length - 1];
      ctx.beginPath();
      ctx.arc(exitSample.x, exitSample.y, 5.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.55)';
      ctx.fill();
      ctx.strokeStyle = ramp.railColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.restore();
    }
  }

  private renderSpinners(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    const decor = resolveDecorTheme(table);
    for (const sp of table.spinners) {
      const ang = sim.spinnerAngles[sp.id] ?? 0;
      const vel = Math.abs(sim.spinnerVelocities[sp.id] ?? 0);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.angle);

      // Piliers de support chromés + axe transversal
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-sp.width * 0.5, 0);
      ctx.lineTo(sp.width * 0.5, 0);
      ctx.stroke();

      ctx.fillStyle = decor === 'solaire' || decor === 'farwest' || decor === 'train' ? '#F59E0B' : '#CBD5E1';
      ctx.fillRect(-sp.width * 0.5 - 1.6, -2.2, 3.2, 4.4);
      ctx.fillRect(sp.width * 0.5 - 1.6, -2.2, 3.2, 4.4);

      const phase = Math.cos(ang * 2);
      const h = Math.max(1.5, Math.abs(phase) * 6.2);
      const plateW = sp.width - 3.2;
      ctx.fillStyle =
        vel > 12
          ? '#FEF08A'
          : phase >= 0
            ? '#F8FAFC'
            : table.palette.accentSecondary;
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 0.7;
      ctx.fillRect(-plateW * 0.5, -h * 0.5, plateW, h);
      ctx.strokeRect(-plateW * 0.5, -h * 0.5, plateW, h);

      // Motif central sur la palette du tourniquet quand elle fait face
      if (h > 3.2) {
        ctx.fillStyle = phase >= 0 ? table.palette.accentPrimary : '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.35);
        ctx.lineTo(2.4, 0);
        ctx.lineTo(0, h * 0.35);
        ctx.lineTo(-2.4, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderPlunger(ctx: CanvasRenderingContext2D, sim: PinballSimulation) {
    if (this.staticArt) return;
    const xCenter = 225;
    const floorY = 513;
    const topY = 478 + sim.plungerTension * 22;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
    ctx.fillRect(218.5, 490, 13, 5);

    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(xCenter - 1.8, topY + 3, 3.6, Math.max(2, floorY - topY - 3));

    ctx.strokeStyle = sim.plungerTension > 0.55 ? '#FACC15' : '#E2E8F0';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    const coils = 7;
    const span = Math.max(6, floorY - topY - 4);
    for (let i = 0; i <= coils; i++) {
      const y = topY + 3.5 + (i / coils) * span;
      const x = xCenter + (i % 2 === 0 ? -4.8 : 4.8);
      if (i === 0) ctx.moveTo(xCenter, topY + 2);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#090D16';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(xCenter - 6, topY - 0.5, 12, 4.2, 1.5);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 5.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = sim.plungerTension > 0 ? '#FACC15' : '#E2E8F0';
    ctx.fillText('R1', xCenter, 518.5);
  }

  private renderBall(
    ctx: CanvasRenderingContext2D,
    b: BallEntity,
    table: PinballTableDef,
    elevation: number
  ) {
    if (this.staticArt) return;
    ctx.save();
    const r = b.radius * (1 + 0.16 * elevation);

    for (let i = 0; i < b.trail.length; i++) {
      const t = b.trail[i];
      const alpha = ((i + 1) / (b.trail.length + 1)) * 0.22;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * (0.45 + (i / b.trail.length) * 0.45), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(
      b.x + 1.3 + elevation * 2.5,
      b.y + 1.8 + elevation * 4.0,
      r,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = elevation > 0 ? 'rgba(0, 0, 0, 0.58)' : 'rgba(0, 0, 0, 0.42)';
    ctx.fill();

    const grad = ctx.createRadialGradient(
      b.x - r * 0.35,
      b.y - r * 0.35,
      r * 0.1,
      b.x,
      b.y,
      r
    );
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.45, table.palette.ballTint);
    grad.addColorStop(0.85, '#64748B');
    grad.addColorStop(1, '#1E293B');

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#090D16';
    ctx.stroke();
    ctx.restore();
  }

  // ============================================================================
  // IN-SCREEN TABLE SELECTION MENU (SHOWCASING EACH UNIQUE 240x520 LAYOUT!)
  // ============================================================================
  private renderTableSelectMenu(ctx: CanvasRenderingContext2D, sim: PinballSimulation) {
    const table = sim.currentTable;
    const pal = table.palette;

    ctx.fillStyle = '#050B18';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = pal.hudBg;
    ctx.fillRect(0, 0, SCREEN_WIDTH, 44);
    ctx.strokeStyle = pal.hudBorder;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(2.5, 2.5, SCREEN_WIDTH - 5, 39);

    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FACC15';
    ctx.fillText('GAMEBUINO AKA · ROTATION 90°', 8, 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`${sim.playerCount}J`, SCREEN_WIDTH - 9, 7);

    ctx.textAlign = 'left';
    ctx.font = '700 11px "Outfit", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('CHOIX DU FLIPPER', 8, 21);

    const count = PINBALL_TABLES.length;
    if (count <= 14) {
      const step = 4.2;
      const startX = SCREEN_WIDTH - 9 - count * step;
      PINBALL_TABLES.forEach((_t, idx) => {
        ctx.fillStyle = idx === sim.selectedTableIndex ? '#FACC15' : '#334155';
        ctx.fillRect(startX + idx * step, 26, 3.0, 3.5);
      });
    } else {
      ctx.textAlign = 'right';
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.fillStyle = '#FACC15';
      ctx.fillText(`${sim.selectedTableIndex + 1}/${count}`, SCREEN_WIDTH - 9, 24);
    }

    const cardX = 14;
    const cardY = 50;
    const cardW = SCREEN_WIDTH - 28;
    const cardH = 170;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    ctx.clip();

    // Smooth vertical pan across the 520px table so the unique layout is unmistakable!
    const panProgress = 0.5 + 0.5 * Math.sin(sim.clock * 0.8);
    const previewScale = cardW / SCREEN_WIDTH;
    const scaledWorldH = WORLD_HEIGHT * previewScale;
    const panOffsetY = -panProgress * Math.max(0, scaledWorldH - cardH);

    ctx.save();
    ctx.translate(cardX, cardY + panOffsetY);
    ctx.scale(previewScale, previewScale);
    const previewSim = new PinballSimulation();
    previewSim.selectTableById(table.id);
    previewSim.clock = sim.clock;
    this.renderWorldPlayfield(ctx, previewSim);
    ctx.restore();

    const scrim = ctx.createLinearGradient(cardX, cardY + 55, cardX, cardY + cardH);
    scrim.addColorStop(0, 'rgba(4, 8, 18, 0.05)');
    scrim.addColorStop(0.55, 'rgba(4, 8, 18, 0.86)');
    scrim.addColorStop(1, 'rgba(4, 8, 18, 0.98)');
    ctx.fillStyle = scrim;
    ctx.fillRect(cardX, cardY, cardW, cardH);

    ctx.textAlign = 'left';
    ctx.font = '700 13.5px "Outfit", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(table.name, cardX + 10, cardY + 110);

    ctx.font = '500 7.8px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(table.subtitle, cardX + 10, cardY + 129);

    ctx.font = '700 7px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FACC15';
    ctx.fillText(
      `${table.layoutBadge.toUpperCase()} · 3 MISSIONS`,
      cardX + 10,
      cardY + 148
    );
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = pal.hudBorder;
    ctx.stroke();

    ctx.font = '700 7.8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('◄ A : PRÉC.', 14, 228);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#38BDF8';
    const record = sim.highScores[table.id] ?? 0;
    ctx.fillText(`HI ${record.toLocaleString('fr-FR')}`, SCREEN_WIDTH * 0.5, 228);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('SUIV. : D ►', SCREEN_WIDTH - 14, 228);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(14, 244, SCREEN_WIDTH - 28, 38, 6);
    ctx.fill();

    ctx.font = '700 7.2px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FACC15';
    ctx.fillText('A: FLIP GAUCHES · D: FLIP DROITS', SCREEN_WIDTH * 0.5, 251);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText('R1: RESSORT · B: SECOUSSE · MULTIBILLE ×3', SCREEN_WIDTH * 0.5, 265);

    const pulse = 0.78 + 0.22 * Math.sin(sim.clock * 6);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.roundRect(22, 290, SCREEN_WIDTH - 44, 21, 5);
    ctx.fill();

    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#090D16';
    ctx.fillText('APPUYEZ SUR R1 POUR JOUER', SCREEN_WIDTH * 0.5, 300.5);
    ctx.restore();
  }

  private renderPauseOverlay(ctx: CanvasRenderingContext2D, sim: PinballSimulation) {
    ctx.fillStyle = 'rgba(5, 8, 16, 0.85)';
    ctx.fillRect(0, HUD_HEIGHT, SCREEN_WIDTH, VIEWPORT_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 16px "Outfit", sans-serif';
    ctx.fillStyle = '#FACC15';
    ctx.fillText('PAUSE', SCREEN_WIDTH * 0.5, 138);

    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('R1 / C : REPRENDRE LA PARTIE', SCREEN_WIDTH * 0.5, 172);
    const armed = sim.confirmTimer > 0 ? sim.pendingConfirm : null;
    ctx.fillStyle = armed === 'RESTART' ? '#F87171' : '#CBD5E1';
    ctx.fillText(
      armed === 'RESTART' ? 'B : CONFIRMER ? RECOMMENCER' : 'B : RECOMMENCER LE PLATEAU',
      SCREEN_WIDTH * 0.5,
      194
    );
    ctx.fillStyle = armed === 'MENU' ? '#F87171' : '#CBD5E1';
    ctx.fillText(
      armed === 'MENU' ? 'A : CONFIRMER ? QUITTER AU MENU' : 'A : MENU CHOIX DE FLIPPER',
      SCREEN_WIDTH * 0.5,
      216
    );
  }

  private renderGameOverOverlay(ctx: CanvasRenderingContext2D, sim: PinballSimulation) {
    ctx.fillStyle = 'rgba(5, 8, 16, 0.9)';
    ctx.fillRect(0, HUD_HEIGHT, SCREEN_WIDTH, VIEWPORT_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '700 16px "Outfit", sans-serif';
    ctx.fillStyle = '#EF4444';
    ctx.fillText('GAME OVER', SCREEN_WIDTH * 0.5, 66);

    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(sim.currentTable.name.toUpperCase(), SCREEN_WIDTH * 0.5, 88);

    const sorted = [...sim.players].sort((a, b) => b.score - a.score);
    sorted.forEach((p, idx) => {
      const y = 110 + idx * 24;
      ctx.fillStyle = idx === 0 ? 'rgba(250, 204, 21, 0.16)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(20, y, SCREEN_WIDTH - 40, 20, 4);
      ctx.fill();

      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = idx === 0 ? '#FACC15' : '#CBD5E1';
      ctx.fillText(`${p.playerIndex + 1}UP · ${p.missionsCompleted} MISSIONS`, 28, y + 5.5);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(p.score.toLocaleString('fr-FR'), SCREEN_WIDTH - 28, y + 5.5);
    });

    const record = sim.highScores[sim.currentTable.id] ?? 0;
    ctx.textAlign = 'center';
    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FACC15';
    ctx.fillText(`HIGH SCORE : ${record.toLocaleString('fr-FR')}`, SCREEN_WIDTH * 0.5, 220);

    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.roundRect(24, 246, SCREEN_WIDTH - 48, 22, 5);
    ctx.fill();

    ctx.fillStyle = '#090D16';
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.fillText('R1 : REJOUER', SCREEN_WIDTH * 0.5, 253);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 7.5px "JetBrains Mono", monospace';
    ctx.fillText('A / D : CHANGER DE TABLE · B : MENU', SCREEN_WIDTH * 0.5, 280);
  }

  private renderLcdSubpixelOverlay(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.lineWidth = 0.25;
    for (let y = 0; y <= SCREEN_HEIGHT; y += 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SCREEN_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
