/**
 * Quest Drop's music and little sounds: an original chiptune loop (written for this app, not taken
 * from any game), played with Web Audio. Nothing starts until a game starts (a tap), and with
 * sound off nothing is created at all, so music from another app keeps playing.
 */

// The tune: D minor, eighth notes (0 = rest). Lead, then one bass root per bar.
const LEAD = [
  74, 77, 81, 77, 79, 81, 84, 81,
  82, 81, 79, 77, 76, 77, 79, 0,
  77, 76, 74, 76, 77, 81, 79, 77,
  76, 72, 74, 76, 74, 0, 0, 0,
  81, 81, 84, 81, 79, 77, 79, 81,
  82, 86, 84, 82, 81, 79, 81, 0,
  79, 77, 76, 77, 79, 76, 72, 76,
  74, 76, 77, 76, 74, 0, 74, 0,
];
const BASS = [38, 34, 41, 33, 41, 34, 36, 38];

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

export class Chiptune {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;
  private noise: AudioBuffer | null = null;
  bpm = 132;
  musicOn = false;

  /** Call from a tap (iOS only lets sound start from one). */
  start(withMusic: boolean) {
    if (!this.ctx) {
      // Mix with other apps' audio on iPhone instead of stopping it.
      try {
        const nav = navigator as AudioSessionNav;
        if (nav.audioSession) nav.audioSession.type = "ambient";
      } catch {
        /* older Safari */
      }
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.08);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    this.setMusic(withMusic);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.08);
    if (on && !this.timer) {
      this.nextAt = t + 0.08;
      this.timer = setInterval(() => this.schedule(), 40);
    }
    if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  pause() {
    void this.ctx?.suspend();
  }
  resume() {
    void this.ctx?.resume();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const eighth = 30 / this.bpm;
    while (this.nextAt < ctx.currentTime + 0.15) {
      const i = this.step % LEAD.length;
      const n = LEAD[i];
      if (n) this.tone(n, this.nextAt, eighth * 0.85, "square", 0.32, this.musicGain);
      const bar = Math.floor(i / 8);
      const root = BASS[bar];
      this.tone(i % 2 ? root + 12 : root, this.nextAt, eighth * 0.9, "triangle", 0.55, this.musicGain);
      if (i % 2) this.hat(this.nextAt, this.musicGain);
      this.nextAt += eighth;
      this.step++;
    }
  }

  private tone(n: number, at: number, dur: number, type: OscillatorType, vol: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = hz(n);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private hat(at: number, out: AudioNode) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    s.connect(f).connect(g).connect(out);
    s.start(at);
  }

  /** The little sounds: a tick when moving, a thud and a chime when a quest lands. */
  sfx(kind: "move" | "land" | "later" | "clear" | "nope") {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + 0.01;
    const seq: Record<typeof kind, [number, number, OscillatorType][]> = {
      move: [[86, 0.04, "square"]],
      land: [[50, 0.12, "triangle"], [81, 0.08, "square"], [86, 0.12, "square"]],
      later: [[81, 0.07, "square"], [76, 0.07, "square"], [72, 0.1, "square"]],
      clear: [[74, 0.1, "square"], [78, 0.1, "square"], [81, 0.1, "square"], [86, 0.3, "square"]],
      nope: [[45, 0.14, "square"]],
    };
    let at = t;
    for (const [n, d, type] of seq[kind]) {
      this.tone(n, at, d, type, kind === "move" ? 0.12 : 0.3, this.master);
      if (kind !== "land" || n !== 50) at += d * 0.8;
    }
  }
}
