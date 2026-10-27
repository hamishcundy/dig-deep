// Sound effects, synthesised with Web Audio: no sound files.
// Browsers only allow audio after a tap or key press, so the audio starts on the first one.

const MUTE_KEY = 'digdeep-muted';
const VOLUME = 0.6;
const ENGINE_GAIN = 0.08;

export interface LoopState {
  engine: number | null; // thrusting: 0..1 how fast the pod is rising, or null when off
  drill: number | null; // drilling: 0..1 how hard the ground is, or null when off
  lowFuel: boolean;
  cough: boolean; // the engine splutters now and then
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  to?: number; // slide to this frequency
  at?: number; // seconds from now
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  freq: number;
  to?: number; // sweep the filter to this frequency
  gain?: number;
  at?: number;
}

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engineOsc!: OscillatorNode;
  private engineGain!: GainNode;
  private drillOsc!: OscillatorNode;
  private drillGain!: GainNode;
  private engineOn = false;
  private drillOn = false;
  private nextBeep = 0;
  private nextCough = 0;
  private isMuted = readMuted();

  constructor() {
    const wake = () => this.wake();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(type, wake, true);
    // Silence when the tab or app is in the background.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  get muted(): boolean {
    return this.isMuted;
  }

  toggleMute(): void {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem(MUTE_KEY, this.isMuted ? '1' : '0');
    } catch {
      // not saved; still applies this session
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.isMuted ? 0 : VOLUME, this.ctx.currentTime, 0.02);
  }

  private wake(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return; // no Web Audio: play silently
      }
      this.build();
    }
    if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.isMuted ? 0 : VOLUME;
    this.master.connect(comp);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine: a low sawtooth plus filtered rumble.
    this.engineGain = this.gainNode(0, this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineOsc.connect(this.filterNode('lowpass', 380, this.engineGain));
    this.noiseLoop().connect(this.filterNode('bandpass', 180, this.engineGain));
    this.engineOsc.start();

    // Drill: a buzz plus grit, wobbled by a fast LFO so it grinds.
    this.drillGain = this.gainNode(0, this.master);
    const grind = this.gainNode(0.6, this.drillGain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    lfo.connect(this.gainNode(0.4, grind.gain));
    lfo.start();
    this.drillOsc = ctx.createOscillator();
    this.drillOsc.type = 'square';
    this.drillOsc.frequency.value = 110;
    this.drillOsc.connect(this.filterNode('lowpass', 900, grind));
    this.noiseLoop().connect(this.filterNode('bandpass', 1500, grind));
    this.drillOsc.start();
  }

  private get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  // Called every frame with what the pod is doing.
  loops(state: LoopState): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;

    const engineOn = state.engine !== null;
    if (engineOn !== this.engineOn) {
      this.engineGain.gain.cancelScheduledValues(t); // drops any cough still to come
      this.engineGain.gain.setTargetAtTime(engineOn ? ENGINE_GAIN : 0, t, 0.05);
    }
    if (engineOn) this.engineOsc.frequency.setTargetAtTime(48 + 30 * state.engine!, t, 0.1);
    this.engineOn = engineOn;

    const drillOn = state.drill !== null;
    if (drillOn !== this.drillOn) {
      this.drillGain.gain.setTargetAtTime(drillOn ? 0.07 : 0, t, 0.03);
      if (drillOn) this.drillOsc.frequency.setValueAtTime(120 - 60 * state.drill!, t); // harder ground, lower grind
    }
    this.drillOn = drillOn;

    if (!state.lowFuel) this.nextBeep = 0;
    else if (t >= this.nextBeep) {
      this.tone(880, 0.09, { type: 'sine', gain: 0.25 });
      this.nextBeep = t + 1.2;
    }

    if (!state.cough) this.nextCough = t + 0.3;
    else if (t >= this.nextCough) {
      this.cough(engineOn);
      this.nextCough = t + 0.6 + Math.random();
    }
  }

  // A pop or two from the exhaust; while thrusting the engine hum also cuts out briefly.
  private cough(thrusting: boolean): void {
    const t = this.ctx!.currentTime;
    const pops = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < pops; i++) {
      this.noise(0.08, { filter: 'lowpass', freq: 350, gain: 1, at: i * 0.14 });
      this.tone(70, 0.1, { type: 'sawtooth', gain: 0.3, to: 40, at: i * 0.14 });
    }
    if (thrusting) {
      const g = this.engineGain.gain;
      g.setTargetAtTime(0, t, 0.01);
      g.setTargetAtTime(ENGINE_GAIN, t + 0.1 + pops * 0.14, 0.03);
    }
  }

  // A tile breaks.
  dig(): void {
    if (!this.ready) return;
    this.noise(0.09, { filter: 'lowpass', freq: 1800, to: 400, gain: 0.7 });
    this.tone(140, 0.07, { type: 'triangle', gain: 0.35, to: 70 });
  }

  // Ore picked up; pricier ore (higher index) chimes higher.
  ore(index: number): void {
    if (!this.ready) return;
    const f = 784 * 2 ** ((index * 2) / 12);
    this.tone(f, 0.12, { type: 'triangle', gain: 0.25 });
    this.tone(f * 1.5, 0.2, { type: 'triangle', gain: 0.25, at: 0.06 });
    if (index >= 5) this.tone(f * 3, 0.3, { type: 'sine', gain: 0.1, at: 0.12 }); // gems sparkle
  }

  // Cargo full or ore lost.
  nope(at = 0): void {
    if (!this.ready) return;
    this.tone(196, 0.1, { type: 'triangle', gain: 0.3, at });
    this.tone(147, 0.18, { type: 'triangle', gain: 0.3, at: at + 0.11 });
  }

  // Landing, in tiles/s; soft touches make no sound.
  land(impact: number): void {
    if (!this.ready || impact < 3) return;
    const v = Math.min(1, (impact - 3) / 10);
    this.noise(0.15, { filter: 'lowpass', freq: 400, gain: 0.3 + 0.5 * v });
    this.tone(110, 0.15, { type: 'sine', gain: 0.4 + 0.4 * v, to: 45 });
  }

  // Hull damage.
  clank(): void {
    if (!this.ready) return;
    for (const f of [330, 495, 740]) this.tone(f, 0.25, { gain: 0.14, to: f * 0.94 });
    this.noise(0.05, { filter: 'highpass', freq: 3000, gain: 0.2 });
  }

  coin(): void {
    if (!this.ready) return;
    this.tone(988, 0.07, { gain: 0.1 });
    this.tone(1319, 0.3, { gain: 0.1, at: 0.07 });
  }

  upgrade(): void {
    if (!this.ready) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.35 : 0.14, { type: 'triangle', gain: 0.22, at: i * 0.07 }));
  }

  fill(): void {
    if (!this.ready) return;
    this.tone(220, 0.4, { type: 'sine', gain: 0.3, to: 880 });
    this.noise(0.4, { filter: 'bandpass', freq: 800, gain: 0.06 });
  }

  repair(): void {
    if (!this.ready) return;
    for (let i = 0; i < 4; i++) {
      this.noise(0.03, { filter: 'highpass', freq: 2500, gain: 0.3, at: i * 0.07 });
      this.tone(180, 0.03, { gain: 0.08, at: i * 0.07 });
    }
  }

  tick(): void {
    if (!this.ready) return;
    this.tone(1400, 0.03, { gain: 0.1 });
  }

  // The tank just ran dry.
  sputter(): void {
    if (!this.ready) return;
    for (const at of [0, 0.12, 0.3]) this.noise(0.07, { filter: 'lowpass', freq: 500, gain: 0.5, at });
    this.tone(90, 0.5, { type: 'sawtooth', gain: 0.15, to: 40 });
  }

  // The pod is lost.
  crash(): void {
    if (!this.ready) return;
    this.noise(0.9, { filter: 'lowpass', freq: 2500, to: 150, gain: 0.5 });
    this.tone(220, 0.9, { type: 'sawtooth', gain: 0.15, to: 35 });
    this.tone(60, 0.5, { type: 'sine', gain: 0.4 });
  }

  private tone(freq: number, dur: number, { type = 'square', gain = 0.2, to, at = 0 }: ToneOpts): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    osc.connect(this.envelope(t, dur, gain));
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, { filter = 'lowpass', freq, to, gain = 0.2, at = 0 }: NoiseOpts): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.filterNode(filter, freq, this.envelope(t, dur, gain));
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    src.connect(f);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // A gain that starts at `peak` and dies away over `dur`, into the master.
  private envelope(t: number, dur: number, peak: number): GainNode {
    const g = this.gainNode(0, this.master);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private noiseLoop(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  private gainNode(value: number, out: AudioNode | AudioParam): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = value;
    if (out instanceof AudioParam) g.connect(out);
    else g.connect(out);
    return g;
  }

  private filterNode(type: BiquadFilterType, freq: number, out: AudioNode): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.connect(out);
    return f;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sound = new Sound();
