import { PINBALL_TABLES } from '../data/tables';
import {
  BallEntity,
  BumperColorStyle,
  BumperDef,
  HUD_HEIGHT,
  PinballTableDef,
  RampDef,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  VIEWPORT_HEIGHT,
  Vec2,
  WORLD_HEIGHT,
} from '../types/pinball';
import { PinballSimulation } from './physicsEngine';

const BUMPER_COLORS: Record<
  BumperColorStyle,
  { dark: string; main: string; light: string; glow: string }
> = {
  RED: { dark: '#7F1D1D', main: '#DC2626', light: '#FCA5A5', glow: '#EF4444' },
  BLUE: { dark: '#1E3A8A', main: '#2563EB', light: '#93C5FD', glow: '#3B82F6' },
  GOLD: { dark: '#92400E', main: '#F59E0B', light: '#FEF08A', glow: '#FACC15' },
  JADE: { dark: '#064E3B', main: '#059669', light: '#6EE7B7', glow: '#10B981' },
};

interface SplineSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  t: number;
  z: number;
}

function sampleSmoothRampSpline(pts: Vec2[], subdivisionsPerSeg: number = 7): SplineSample[] {
  if (pts.length < 2) return [];
  const raw: Vec2[] = [];
  const n = pts.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];

    const steps = i === n - 2 ? subdivisionsPerSeg : subdivisionsPerSeg;
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const u2 = u * u;
      const u3 = u2 * u;
      // Catmull-Rom spline interpolation
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);
      raw.push({ x, y });
    }
  }
  raw.push({ x: pts[n - 1].x, y: pts[n - 1].y });

  const total = raw.length;
  const samples: SplineSample[] = [];
  for (let i = 0; i < total; i++) {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(total - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const t = total > 1 ? i / (total - 1) : 0;
    const z = Math.sin(Math.PI * Math.min(0.96, Math.max(0.04, t)));
    samples.push({
      x: raw[i].x,
      y: raw[i].y,
      tx: dx,
      ty: dy,
      nx: -dy,
      ny: dx,
      t,
      z,
    });
  }
  return samples;
}

export class PinballCanvasRenderer {
  private artImages: Map<string, HTMLImageElement> = new Map();
  private splineCache: Map<string, SplineSample[]> = new Map();
  /** Vrai pendant le rendu du décor statique (firmware AKA) : ni flippers, ni billes, ni ressort. */
  private staticArt = false;

  constructor() {
    if (typeof window !== 'undefined') {
      for (const table of PINBALL_TABLES) {
        if (table.artworkUrl) {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          img.src = table.artworkUrl;
          this.artImages.set(table.id, img);
        }
      }
    }
  }

  private getRampSamples(ramp: RampDef): SplineSample[] {
    let cached = this.splineCache.get(ramp.id);
    if (!cached) {
      cached = sampleSmoothRampSpline(ramp.path, 7);
      this.splineCache.set(ramp.id, cached);
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
    tempSim.clock = 1.8;
    const scaleX = width / SCREEN_WIDTH;
    const scaleY = height / WORLD_HEIGHT;
    ctx.save();
    ctx.scale(scaleX, scaleY);
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

    const hasRobotMascot = table.id === 'aka_esp32';
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

    // 1. Deep Multi-Stop Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    bgGrad.addColorStop(0, pal.bgPrimary);
    bgGrad.addColorStop(0.42, pal.bgSecondary);
    bgGrad.addColorStop(0.78, pal.bgPrimary);
    bgGrad.addColorStop(1, pal.bgSecondary);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, WORLD_HEIGHT);

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

    // 13. All Table Flippers (Main + Unique Mid/Upper Flippers!)
    this.render3DFlippers(ctx, sim, table);

    // 14. Layer 0 Balls (on main playfield)
    for (const b of sim.balls) {
      if (b.layer === 0 && !b.heldInScoopId) {
        this.renderBall(ctx, b, table, 0);
      }
    }

    // 15. Upgraded 3D Molded Acrylic & Chrome Wireform Ramps (Layer 1)
    this.render3DRamps(ctx, sim, table, activeMission?.targetKind === 'RAMP');

    // 16. Layer 1 Balls (riding elevated ramps with dynamic height!)
    for (const b of sim.balls) {
      if (b.layer === 1 && !b.heldInScoopId) {
        const elev = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(0.95, Math.max(0.05, b.rampProgress)));
        this.renderBall(ctx, b, table, elev);
      }
    }

    // 17. World-Space Sparks & Floating Score Popups
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
    id: 'prehistoire' | 'farwest' | 'halloween' | 'candy' | 'bonbons' | 'train',
    mult: number,
    _clock: number
  ) {
    const plate = (title: string, bg: string, border: string, fg: string) => {
      ctx.save();
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(74, 262, 78, 32, 5);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fg;
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText(title, 113, 273);
      ctx.font = '700 8px "JetBrains Mono", monospace';
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
    const heart = (x: number, y: number, r: number, fill: string) => {
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.9);
      ctx.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
      ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const circ = (x: number, y: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };

    ctx.save();
    if (id === 'prehistoire') {
      // Volcan fumant et coulées de lave
      poly([[48, 232], [96, 112], [130, 112], [178, 232]], 'rgba(69, 39, 16, 0.75)', '#A8A29E', 1.2);
      poly([[96, 112], [104, 104], [122, 104], [130, 112]], '#F97316', '#FDE68A', 1);
      ctx.strokeStyle = '#F97316';
      ctx.lineWidth = 2.2;
      for (const x of [104, 113, 122]) {
        ctx.beginPath();
        ctx.moveTo(x, 108);
        ctx.quadraticCurveTo(x + (x - 113) * 1.6, 160, x + (x - 113) * 3, 226);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) circ(100 + i * 9, 92 - i * 6 + (i % 2) * 4, 5 + i, 'rgba(231, 229, 228, 0.18)');
      // Empreintes de dinosaure
      for (const [x, y] of [[44, 248], [54, 262], [40, 276]]) {
        poly([[x, y], [x + 4, y - 7], [x + 8, y]], '#78350F');
        poly([[x + 2, y + 1], [x + 6, y + 8], [x + 10, y + 1]], '#78350F');
      }
      // Os croisés au pied du plateau
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(84, 338);
      ctx.lineTo(142, 354);
      ctx.moveTo(142, 338);
      ctx.lineTo(84, 354);
      ctx.stroke();
      plate('ÂGE DE PIERRE', '#2A1A0E', '#F97316', '#FDBA74');
    } else if (id === 'farwest') {
      // Soleil couchant, cactus et étoile de shérif
      circ(113, 238, 30, 'rgba(245, 158, 11, 0.22)');
      circ(113, 238, 20, 'rgba(253, 230, 138, 0.25)');
      for (const x of [46, 180]) {
        ctx.fillStyle = '#15803D';
        ctx.fillRect(x - 3, 232, 6, 36);
        ctx.fillRect(x - 11, 242, 6, 4);
        ctx.fillRect(x - 11, 236, 4, 10);
        ctx.fillRect(x + 5, 248, 6, 4);
        ctx.fillRect(x + 8, 240, 4, 12);
      }
      this.drawStarShape(ctx, 113, 220, 16, 7, '#FACC15');
      ctx.strokeStyle = '#7C2D12';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Fer à cheval
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(113, 344, 11, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.stroke();
      plate('SALOON', '#3B1D0A', '#FDE68A', '#FDE68A');
    } else if (id === 'halloween') {
      // Pleine lune, toiles d'araignée, chauves-souris et citrouille
      circ(113, 150, 30, 'rgba(254, 249, 195, 0.2)');
      circ(113, 150, 22, 'rgba(254, 249, 195, 0.2)');
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.35)';
      ctx.lineWidth = 0.8;
      for (const [cx, cy, dir] of [[14, 74, 1], [212, 74, -1]] as [number, number, number][]) {
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + dir * 36 * Math.cos((i * Math.PI) / 8), cy + 36 * Math.sin((i * Math.PI) / 8));
          ctx.stroke();
        }
        for (const r of [12, 24, 34]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, dir > 0 ? 0 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#1E1B4B';
      for (const [x, y] of [[62, 104], [166, 108]]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - 8, y - 8, x - 14, y);
        ctx.quadraticCurveTo(x - 8, y - 2, x, y + 5);
        ctx.quadraticCurveTo(x + 8, y - 2, x + 14, y);
        ctx.quadraticCurveTo(x + 8, y - 8, x, y);
        ctx.fill();
      }
      circ(113, 332, 15, '#F97316', '#7C2D12');
      poly([[104, 326], [108, 321], [112, 326]], '#1C1917');
      poly([[114, 326], [118, 321], [122, 326]], '#1C1917');
      poly([[104, 336], [109, 340], [113, 336], [117, 340], [122, 336], [113, 345]], '#1C1917');
      plate('SORCIÈRE', '#12081F', '#F97316', '#A3E635');
    } else if (id === 'candy') {
      // Cœurs, étoiles et nœud de ruban
      for (const [x, y, r, c] of [[44, 120, 7, '#FBCFE8'], [182, 120, 7, '#FBCFE8'], [60, 240, 5, '#FDE047'], [166, 240, 5, '#FFFFFF'], [44, 360, 5, '#FBCFE8'], [182, 356, 6, '#FDE047']] as [number, number, number, string][]) {
        heart(x, y, r, c);
      }
      this.drawStarShape(ctx, 113, 98, 7, 3, '#FDE047');
      this.drawStarShape(ctx, 50, 176, 5, 2.2, '#FFFFFF');
      this.drawStarShape(ctx, 176, 176, 5, 2.2, '#FFFFFF');
      // Nœud de ruban
      poly([[113, 236], [90, 222], [90, 250]], '#FBCFE8', '#DB2777', 1);
      poly([[113, 236], [136, 222], [136, 250]], '#FBCFE8', '#DB2777', 1);
      circ(113, 236, 5, '#EC4899', '#FFFFFF');
      plate('CANDY POP', '#3B0A2C', '#F9A8D4', '#FDE047');
    } else if (id === 'bonbons') {
      // Bonbons emballés, sucette et rayures de comptoir
      const wrapped = (x: number, y: number, rot: number, c: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        poly([[-14, 0], [-22, -6], [-22, 6]], '#FFF1F2', c, 0.8);
        poly([[14, 0], [22, -6], [22, 6]], '#FFF1F2', c, 0.8);
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      };
      wrapped(56, 104, -0.4, '#FB7185');
      wrapped(170, 104, 0.4, '#FACC15');
      wrapped(60, 250, 0.3, '#A78BFA');
      wrapped(166, 250, -0.3, '#FB7185');
      // Sucette spirale
      circ(113, 236, 15, '#FFF1F2', '#E11D48');
      ctx.strokeStyle = '#E11D48';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let a = 0; a < 12; a += 0.2) {
        const rr = 1.2 * a;
        const px = 113 + Math.cos(a) * rr;
        const py = 236 + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // Rayures du comptoir
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 113, 133, 0.35)' : 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(40 + i * 16, 346, 16, 8);
      }
      plate('BONBONS', '#052E2B', '#FB7185', '#FEF08A');
    } else {
      // Train : rails avec traverses, phare de locomotive et nuages de vapeur
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.6;
      for (const dx of [-8, 8]) {
        ctx.beginPath();
        ctx.moveTo(113 + dx * 0.35, 232);
        ctx.lineTo(113 + dx * 2.2, 372);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(161, 98, 7, 0.55)';
      ctx.lineWidth = 2;
      for (let y = 240; y < 372; y += 14) {
        const w = 8 + ((y - 232) / 140) * 14;
        ctx.beginPath();
        ctx.moveTo(113 - w, y);
        ctx.lineTo(113 + w, y);
        ctx.stroke();
      }
      circ(113, 112, 20, 'rgba(253, 230, 138, 0.16)');
      circ(113, 112, 12, 'rgba(253, 230, 138, 0.2)');
      for (const [x, y, r] of [[56, 100, 9], [68, 90, 7], [160, 92, 8], [172, 104, 10]]) circ(x, y, r, 'rgba(226, 232, 240, 0.14)');
      // Signal ferroviaire
      ctx.fillStyle = '#334155';
      ctx.fillRect(44, 236, 3, 26);
      circ(45.5, 236, 4, '#DC2626', '#E2E8F0');
      circ(45.5, 246, 4, '#16A34A', '#E2E8F0');
      plate('EXPRESS', '#0B1220', '#F59E0B', '#FDE68A');
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

    if (table.id === 'aka_esp32') {
      ctx.save();
      // PCB Copper Traces
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
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
    } else if (table.id === 'space_odyssey') {
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
    } else if (table.id === 'star_galaxy') {
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

      // Deux sabres laser croisés au-dessus des flippers : lame rouge (Sith) et bleue (Jedi)
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
    } else if (table.id === 'classique') {
      // Table mécanique des années 50 : champ turquoise, voyants ovales en arc, jupes de bumpers champignons,
      // cartouches de points et rangée de voyants blancs (décor original, sans personnage ni marque)
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
        ctx.lineWidth = 1;
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

      // Nuages et rayons doux
      ctx.save();
      ctx.translate(113, 150);
      for (let i = 0; i < 28; i++) {
        const a = (i * Math.PI) / 14;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
        ctx.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(254, 243, 199, 0.13)' : 'rgba(220, 38, 38, 0.1)';
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
      ctx.restore();

      // Arc de voyants ovales sous la voûte (alternance crème / rouge)
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

      // Jupes de bumpers champignons autour du triangle
      for (const [bx, by, col] of [[78, 138, '#DC2626'], [148, 138, '#2563EB'], [113, 178, '#EAB308']] as [number, number, string][]) {
        ctx.beginPath();
        ctx.arc(bx, by, 16.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(254, 243, 199, 0.18)';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx, by, 13.4, 0, Math.PI * 2);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#FEF3C7';
        ctx.stroke();
      }

      // Cartouches de points
      pill(54, 234, 40, 18, '#FEF3C7', '#7C2D12', '100', 'POINTS');
      pill(172, 234, 40, 18, '#FEF3C7', '#7C2D12', '100', 'POINTS');
      pill(113, 214, 36, 14, '#DC2626', '#FEF3C7', '300', 'SPÉCIAL');

      // Cartouche central avec le multiplicateur de bonus
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

      // Rangée de voyants ovales blancs (bonus) au-dessus des slingshots
      for (let k = 0; k < 5; k++) {
        const lit = k <= mult - 1;
        oval(81 + k * 16, 346, 4, 8, 0, lit ? '#FDE047' : '#FEF3C7', '#7C2D12');
      }
    } else if (
      table.id === 'prehistoire' || table.id === 'farwest' || table.id === 'halloween' ||
      table.id === 'candy' || table.id === 'bonbons' || table.id === 'train'
    ) {
      this.renderThemedDecor(ctx, table.id, mult, sim.clock);
    } else {
      // Temple Solaire: Golden Sun Calendar + Stepped Pyramid
      ctx.save();
      const art = this.artImages.get(table.id);
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
    for (const sc of table.scoops) {
      const flash = (sim.scoopFlashTimers[sc.id] ?? 0) > 0;
      const hasHeldBall = sim.balls.some((b) => b.heldInScoopId === sc.id);
      const showLockedBall = sc.kind === 'UPPER_LOCK' && sim.lockedBallsCount > 0;

      // Subtle dashed pneumatic teleport conduit for MID_VUK_TELEPORT
      if (sc.kind === 'MID_VUK_TELEPORT') {
        ctx.save();
        ctx.strokeStyle = flash || hasHeldBall ? sc.color : `${sc.color}38`;
        ctx.lineWidth = flash || hasHeldBall ? 2.6 : 1.3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sc.x, sc.y);
        ctx.quadraticCurveTo(113, (sc.y + sc.ejectTo.y) * 0.5, sc.ejectTo.x, sc.ejectTo.y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius + 2.8, 0, Math.PI * 2);
      ctx.fillStyle = flash || hasHeldBall || showLockedBall ? `${sc.color}55` : 'rgba(9, 13, 22, 0.9)';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = flash || showLockedBall ? '#FFFFFF' : sc.color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.radius - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#020617';
      ctx.fill();

      // Render glowing captured ball inside Lock Chamber when Lock 1/2 is active!
      if (showLockedBall || hasHeldBall) {
        const g = ctx.createRadialGradient(sc.x - 1.5, sc.y - 1.5, 0.5, sc.x, sc.y, 4.6);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.55, '#FDE047');
        g.addColorStop(1, '#CA8A04');
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      ctx.font = '700 5.4px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = showLockedBall ? '#FEF08A' : sc.color;
      ctx.fillText(
        sc.kind === 'UPPER_LOCK'
          ? sim.multiballActive
            ? 'JACKPOT!'
            : `LOCK ${sim.lockedBallsCount}/2`
          : 'TÉLÉPORT',
        sc.x,
        sc.y + sc.radius + 7
      );
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
      const lampX = mx < 113 ? mx + 8.5 : mx - 8.5;

      const missionPulse =
        targetMissionActive && !isHit && Math.sin(sim.clock * 12 + my * 0.1) > 0.2;

      ctx.beginPath();
      ctx.arc(lampX, my, 2.9, 0, Math.PI * 2);
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

      const textX = mx < 113 ? mx + 15.5 : mx - 15.5;
      ctx.font = '700 5.6px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isHit ? '#FEF08A' : '#CBD5E1';
      ctx.fillText(t.letter, textX, my + 0.5);
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

    if (table.id === 'aka_esp32') {
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
    } else if (table.id === 'space_odyssey') {
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
      ctx.fillStyle = blink ? '#38BDF8' : 'rgba(56, 189, 248, 0.18)';
      ctx.fill();
      ctx.strokeStyle = blink ? '#FFFFFF' : '#475569';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.font = '700 4.8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = blink ? '#090D16' : '#94A3B8';
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

  private render3DBumper(
    ctx: CanvasRenderingContext2D,
    bmp: BumperDef,
    flash: boolean,
    missionFocus: boolean,
    clock: number
  ) {
    const c = BUMPER_COLORS[bmp.colorStyle];
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
      ctx.arc(bmp.x, bmp.y, r + 5.5, 0, Math.PI * 2);
      ctx.fillStyle = `${c.glow}55`;
      ctx.fill();
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
    // anneau chromé autour du chapeau (relief façon sprite pixel-art)
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
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = flash ? '#FFFFFF' : c.light;
    ctx.stroke();

    const iconColor = flash ? '#090D16' : '#FFFFFF';
    if (bmp.iconStyle === 'GEAR') {
      ctx.save();
      ctx.translate(bmp.x, capY);
      ctx.fillStyle = iconColor;
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4);
        ctx.fillRect(-1.3, -r * 0.58, 2.6, r * 1.16);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#FACC15' : c.main;
      ctx.fill();
      ctx.restore();
    } else if (bmp.iconStyle === 'STAR') {
      this.drawStarShape(ctx, bmp.x, capY, r * 0.58, r * 0.25, iconColor);
    } else if (bmp.iconStyle === 'CREST') {
      ctx.save();
      ctx.translate(bmp.x, capY);
      ctx.strokeStyle = iconColor;
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = iconColor;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(bmp.x, capY, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = iconColor;
      ctx.fill();
    }
    // reflet spéculaire
    ctx.beginPath();
    ctx.ellipse(bmp.x - r * 0.38, capY - r * 0.46, r * 0.26, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
    ctx.restore();
  }

  private render3DFlippers(
    ctx: CanvasRenderingContext2D,
    sim: PinballSimulation,
    table: PinballTableDef
  ) {
    if (this.staticArt) return;
    const pal = table.palette;

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
      const tipX = f.pivot.x + Math.cos(f.angle) * f.length;
      const tipY = f.pivot.y + Math.sin(f.angle) * f.length;
      const rPivot = f.radius * 1.15;
      const rTip = f.radius * 0.72;

      ctx.save();
      drawTaperedCapsule(f.pivot.x, f.pivot.y + 2.8, rPivot + 0.5, tipX, tipY + 2.8, rTip + 0.5);
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

      drawTaperedCapsule(f.pivot.x, f.pivot.y, rPivot - 1.0, tipX, tipY, rTip - 0.85);
      ctx.fillStyle = sim.isTilted ? '#94A3B8' : pal.flipperTop;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(f.pivot.x, f.pivot.y, 2.0, 0, Math.PI * 2);
      ctx.fillStyle = '#94A3B8';
      ctx.fill();
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
    for (const sp of table.spinners) {
      const ang = sim.spinnerAngles[sp.id] ?? 0;
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.angle);

      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(-sp.width * 0.5 - 1.5, -2, 3, 4);
      ctx.fillRect(sp.width * 0.5 - 1.5, -2, 3, 4);

      const phase = Math.cos(ang * 2);
      const h = Math.max(1.4, Math.abs(phase) * 5.5);
      ctx.fillStyle = phase >= 0 ? '#FFFFFF' : table.palette.accentSecondary;
      ctx.fillRect(-sp.width * 0.5 + 1.5, -h * 0.5, sp.width - 3, h);
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

    PINBALL_TABLES.forEach((_t, idx) => {
      ctx.fillStyle = idx === sim.selectedTableIndex ? '#FACC15' : '#334155';
      ctx.fillRect(SCREEN_WIDTH - 52 + idx * 4.4, 26, 3.4, 3.5);
    });

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
