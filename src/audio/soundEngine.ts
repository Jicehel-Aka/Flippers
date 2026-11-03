import { BuiltinThemeId, BUILTIN_THEME_IDS } from '../types/pinball';
import { musicEngine } from './musicEngine';

type SoundThemeArg = BuiltinThemeId | 'default' | 'starwars';

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private lastSpinnerTime: number = 0;
  private theme: BuiltinThemeId = 'aka_esp32';

  /** Définit l'ambiance sonore spécialisée selon l'univers du plateau actif. */
  public setTheme(theme: SoundThemeArg) {
    if (theme === 'starwars') {
      this.theme = 'star_galaxy';
      return;
    }
    if (theme === 'default') {
      this.theme = 'aka_esp32';
      return;
    }
    if ((BUILTIN_THEME_IDS as readonly string[]).includes(theme)) {
      this.theme = theme;
    } else {
      this.theme = 'aka_esp32';
    }
  }

  public getTheme(): BuiltinThemeId {
    return this.theme;
  }

  /** Tir de blaster : balayage descendant de dent de scie + claquage bref (Star Wars · Yavin). */
  private playBlaster(comboIndex: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const click = ctx.createOscillator();
    const gain = ctx.createGain();
    const top = 1520 + Math.min(comboIndex, 8) * 65;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(top, now);
    osc.frequency.exponentialRampToValueAtTime(135, now + 0.155);
    click.type = 'square';
    click.frequency.setValueAtTime(95, now);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    click.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    click.start(now);
    osc.stop(now + 0.18);
    click.stop(now + 0.04);
  }

  /** Sabre laser : deux dents de scie légèrement désaccordées qui montent puis retombent. */
  private playSaberSwing(combo: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    gain.connect(ctx.destination);
    const base = 110 * Math.pow(1.05, Math.min(combo, 10));
    for (const detune of [-9, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 2.6, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(base * 1.4, now + 0.42);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.43);
    }
  }

  /** Crée ou réveille l'AudioContext partagé (effets + musique de fond) sur une action utilisateur. */
  public unlockAndGetContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      musicEngine.attachContext(this.ctx);
    }
    return this.ctx;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    return this.unlockAndGetContext();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playMenuTick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.045);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playFlipperUp(side: 'LEFT' | 'RIGHT') {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const isHeavy = this.theme === 'train' || this.theme === 'prehistoire' || this.theme === 'crypte';
    const isLight = this.theme === 'candy' || this.theme === 'bonbons';
    osc.type = this.theme === 'classique' ? 'square' : 'triangle';
    const base = (side === 'LEFT' ? 145 : 160) * (isHeavy ? 0.8 : isLight ? 1.25 : 1);
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * (this.theme === 'classique' ? 1.9 : 2.4), now + 0.038);
    gain.gain.setValueAtTime(this.theme === 'classique' ? 0.09 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playPlungerLaunch(tension: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type =
      this.theme === 'candy' || this.theme === 'bonbons'
        ? 'triangle'
        : this.theme === 'solaire' || this.theme === 'crypte'
          ? 'sine'
          : 'sawtooth';
    const startFreq =
      (this.theme === 'train' ? 75 : this.theme === 'candy' ? 140 : 95) + tension * 60;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 3.4, now + 0.14);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playBumperHit(comboIndex: number = 0) {
    if (this.theme === 'star_galaxy') {
      this.playBlaster(comboIndex);
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const step = Math.min(comboIndex, 8);

    switch (this.theme) {
      case 'classique': {
        // Cloche électromécanique années 60 : fondamentale + partiel inharmonique x2.76 + clac relais
        const f0 = 784 + step * 48;
        const bell1 = ctx.createOscillator();
        const bell2 = ctx.createOscillator();
        const relay = ctx.createOscillator();
        const g1 = ctx.createGain();
        const g2 = ctx.createGain();
        bell1.type = 'sine';
        bell1.frequency.setValueAtTime(f0, now);
        bell2.type = 'sine';
        bell2.frequency.setValueAtTime(f0 * 2.756, now);
        relay.type = 'square';
        relay.frequency.setValueAtTime(140, now);
        relay.frequency.exponentialRampToValueAtTime(65, now + 0.025);
        g1.gain.setValueAtTime(0.15, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        g2.gain.setValueAtTime(0.06, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
        bell1.connect(g1);
        relay.connect(g2);
        bell2.connect(g2);
        g1.connect(ctx.destination);
        g2.connect(ctx.destination);
        bell1.start(now);
        bell2.start(now);
        relay.start(now);
        bell1.stop(now + 0.2);
        bell2.stop(now + 0.09);
        relay.stop(now + 0.03);
        return;
      }
      case 'farwest': {
        // Ricochet western métallique : inflexion vive vers l'aigu puis chute nerveuse
        const osc = ctx.createOscillator();
        const twang = ctx.createOscillator();
        const gain = ctx.createGain();
        const base = 520 + step * 45;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.exponentialRampToValueAtTime(base * 2.35, now + 0.028);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.13);
        twang.type = 'triangle';
        twang.frequency.setValueAtTime(base * 1.5, now);
        twang.frequency.exponentialRampToValueAtTime(180, now + 0.09);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        twang.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        twang.start(now);
        osc.stop(now + 0.145);
        twang.stop(now + 0.095);
        return;
      }
      case 'prehistoire': {
        // Tambour de basalte + bloc de bois tribal
        const drum = ctx.createOscillator();
        const wood = ctx.createOscillator();
        const gain = ctx.createGain();
        drum.type = 'triangle';
        drum.frequency.setValueAtTime(235 + step * 18, now);
        drum.frequency.exponentialRampToValueAtTime(62, now + 0.11);
        wood.type = 'sine';
        wood.frequency.setValueAtTime(610 + step * 35, now);
        wood.frequency.exponentialRampToValueAtTime(290, now + 0.04);
        gain.gain.setValueAtTime(0.17, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        drum.connect(gain);
        wood.connect(gain);
        gain.connect(ctx.destination);
        drum.start(now);
        wood.start(now);
        drum.stop(now + 0.125);
        wood.stop(now + 0.045);
        return;
      }
      case 'halloween': {
        // Accord diminué d'orgue fantomatique
        const f0 = 392 + step * 28;
        const ratios = [1, 1.189, 1.414]; // Tierce mineure + triton !
        ratios.forEach((r) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f0 * r, now);
          osc.frequency.exponentialRampToValueAtTime(f0 * r * 0.94, now + 0.13);
          gain.gain.setValueAtTime(0.052, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.135);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.14);
        });
        return;
      }
      case 'candy':
      case 'bonbons': {
        // Bulle kawaii / bonbon acidulé : rebond ascendant cristallin + harmonique octave
        const f0 = (this.theme === 'candy' ? 740 : 660) + step * 52;
        const osc = ctx.createOscillator();
        const sparkle = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * 0.78, now);
        osc.frequency.exponentialRampToValueAtTime(f0 * 1.45, now + 0.075);
        sparkle.type = 'triangle';
        sparkle.frequency.setValueAtTime(f0 * 2, now + 0.015);
        gain.gain.setValueAtTime(0.13, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);
        osc.connect(gain);
        sparkle.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        sparkle.start(now + 0.015);
        osc.stop(now + 0.12);
        sparkle.stop(now + 0.11);
        return;
      }
      case 'train': {
        // Soupape d'acier + piston vapeur : choc métallique grave + harmonique cuivrée
        const clank = ctx.createOscillator();
        const brass = ctx.createOscillator();
        const gain = ctx.createGain();
        clank.type = 'square';
        clank.frequency.setValueAtTime(280 + step * 24, now);
        clank.frequency.exponentialRampToValueAtTime(92, now + 0.085);
        brass.type = 'triangle';
        brass.frequency.setValueAtTime(840 + step * 40, now);
        brass.frequency.exponentialRampToValueAtTime(420, now + 0.07);
        gain.gain.setValueAtTime(0.13, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        clank.connect(gain);
        brass.connect(gain);
        gain.connect(ctx.destination);
        clank.start(now);
        brass.start(now);
        clank.stop(now + 0.105);
        brass.stop(now + 0.08);
        return;
      }
      case 'solaire':
      case 'crypte': {
        // Marimba d'or / cristal de givre : quinte résonnante pure
        const f0 = (this.theme === 'solaire' ? 587.33 : 523.25) + step * 40;
        const osc = ctx.createOscillator();
        const fifth = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0, now);
        fifth.type = 'triangle';
        fifth.frequency.setValueAtTime(f0 * (this.theme === 'crypte' ? 1.5 : 2.0), now);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        fifth.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        fifth.start(now);
        osc.stop(now + 0.16);
        fifth.stop(now + 0.11);
        return;
      }
      case 'space_odyssey': {
        // Impulsion sonar cosmique
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const gain = ctx.createGain();
        const f0 = 880 + step * 50;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0, now);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.48, now + 0.12);
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(220, now);
        sub.frequency.exponentialRampToValueAtTime(110, now + 0.09);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gain);
        sub.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        sub.start(now);
        osc.stop(now + 0.135);
        sub.stop(now + 0.1);
        return;
      }
      case 'aka_esp32':
      default: {
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const gain = ctx.createGain();
        const pitchShift = step * 35;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(680 + pitchShift, now);
        osc.frequency.exponentialRampToValueAtTime(290 + pitchShift * 0.5, now + 0.09);
        sub.type = 'square';
        sub.frequency.setValueAtTime(190, now);
        sub.frequency.exponentialRampToValueAtTime(75, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        sub.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        sub.start(now);
        osc.stop(now + 0.105);
        sub.stop(now + 0.07);
      }
    }
  }

  public playSlingshot() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = this.theme === 'candy' || this.theme === 'bonbons' ? 'triangle' : 'square';
    const startF = this.theme === 'star_galaxy' ? 620 : this.theme === 'prehistoire' ? 310 : 420;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.065);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playTargetHit(bankComplete: boolean = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const isMinor =
      this.theme === 'halloween' || this.theme === 'crypte' || this.theme === 'prehistoire';
    const notes = bankComplete
      ? isMinor
        ? [587.33, 698.46, 880, 1174.66]
        : [587.33, 783.99, 1046.5, 1318.5]
      : isMinor
        ? [587.33, 880]
        : [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = this.theme === 'aka_esp32' ? 'square' : 'triangle';
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(this.theme === 'aka_esp32' ? 0.08 : 0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.095);
    });
  }

  public playRampClimb(combo: number) {
    if (this.theme === 'star_galaxy') {
      this.playSaberSwing(combo);
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.theme === 'train') {
      // Double coup de sifflet à vapeur harmonisé (tierce + sixte ferroviaire) !
      const base = 440 * Math.pow(1.04, Math.min(combo, 8));
      for (const [offset, dur] of [
        [0, 0.14],
        [0.17, 0.24],
      ] as const) {
        for (const ratio of [1, 1.26, 1.68]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          const t = now + offset;
          osc.frequency.setValueAtTime(base * ratio * 0.97, t);
          osc.frequency.linearRampToValueAtTime(base * ratio, t + 0.03);
          gain.gain.setValueAtTime(0.065, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + dur + 0.01);
        }
      }
      return;
    }

    const base = 440 * Math.pow(1.06, Math.min(combo, 10));
    const ratios =
      this.theme === 'halloween' || this.theme === 'crypte'
        ? [1, 1.189, 1.5, 1.888]
        : this.theme === 'solaire' || this.theme === 'prehistoire'
          ? [1, 1.189, 1.335, 1.5, 2]
          : this.theme === 'candy' || this.theme === 'bonbons'
            ? [1, 1.25, 1.5, 1.875, 2.25]
            : [1, 1.25, 1.5, 2];
    const wave: OscillatorType =
      this.theme === 'aka_esp32'
        ? 'square'
        : this.theme === 'farwest'
          ? 'triangle'
          : 'sine';
    ratios.forEach((r, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      const t = now + idx * 0.048;
      osc.frequency.setValueAtTime(base * r, t);
      gain.gain.setValueAtTime(wave === 'square' ? 0.075 : 0.115, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  public playSpinnerTick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastSpinnerTime < 0.032) return;
    this.lastSpinnerTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.022);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.028);
  }

  public playRollover() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.04);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playNudge(isTilt: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (isTilt) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.45);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    }
  }

  public playJackpotOrMultiball() {
    musicEngine.duckBriefly(0.95);
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  public playDrain() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [330, 277.18, 220, 164.81];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }
}

export const soundEngine = new ArcadeSoundEngine();
