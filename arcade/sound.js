"use strict";

export function createSoundEngine({ muted = false, volume = 0.72, onChange = () => {} } = {}) {
  const engine = {
    context: null,
    masterGain: null,
    humGain: null,
    humOscillator: null,
    muted,
    volume,

    async unlock() {
      this.ensureContext();
      if (this.context?.state === "suspended") {
        await this.context.resume();
      }
      this.ensureAmbientHum();
    },

    ensureContext() {
      if (this.context) {
        return;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.context.destination);
    },

    ensureAmbientHum() {
      if (!this.context || this.humOscillator) {
        return;
      }

      const humFilter = this.context.createBiquadFilter();
      humFilter.type = "lowpass";
      humFilter.frequency.value = 380;

      this.humGain = this.context.createGain();
      this.humGain.gain.value = this.muted ? 0 : 0.024 * this.volume;

      const lowOscillator = this.context.createOscillator();
      lowOscillator.type = "sine";
      lowOscillator.frequency.value = 42;

      const shimmerOscillator = this.context.createOscillator();
      shimmerOscillator.type = "triangle";
      shimmerOscillator.frequency.value = 84;

      lowOscillator.connect(humFilter);
      shimmerOscillator.connect(humFilter);
      humFilter.connect(this.humGain);
      this.humGain.connect(this.masterGain);

      lowOscillator.start();
      shimmerOscillator.start();

      this.humOscillator = { lowOscillator, shimmerOscillator };
    },

    setMuted(nextMuted) {
      this.muted = nextMuted;
      this.syncGain();
      onChange(this.muted, this.volume);
    },

    setVolume(nextVolume) {
      this.volume = clamp(nextVolume, 0, 1);
      this.syncGain();
      onChange(this.muted, this.volume);
    },

    syncGain() {
      if (!this.masterGain) {
        return;
      }

      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      if (this.humGain) {
        this.humGain.gain.value = this.muted ? 0 : 0.024 * this.volume;
      }
    },

    pulse({ frequency, slideTo = frequency, duration = 0.08, type = "sine", gain = 0.04 }) {
      if (!this.context || this.muted) {
        return;
      }

      const oscillator = this.context.createOscillator();
      const nodeGain = this.context.createGain();
      const now = this.context.currentTime;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.linearRampToValueAtTime(slideTo, now + duration);

      nodeGain.gain.setValueAtTime(0.0001, now);
      nodeGain.gain.exponentialRampToValueAtTime(gain, now + 0.02);
      nodeGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(nodeGain);
      nodeGain.connect(this.masterGain);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    },

    noiseBurst({ duration = 0.04, gain = 0.03 }) {
      if (!this.context || this.muted) {
        return;
      }

      const buffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < channel.length; index += 1) {
        channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
      }

      const source = this.context.createBufferSource();
      const bandPass = this.context.createBiquadFilter();
      const nodeGain = this.context.createGain();
      source.buffer = buffer;
      bandPass.type = "bandpass";
      bandPass.frequency.value = 1800;
      nodeGain.gain.value = gain * this.volume;

      source.connect(bandPass);
      bandPass.connect(nodeGain);
      nodeGain.connect(this.masterGain);
      source.start();
    },

    playClick() {
      this.noiseBurst({ duration: 0.025, gain: 0.012 });
      this.pulse({ frequency: 820, slideTo: 540, duration: 0.04, type: "square", gain: 0.015 });
    },

    playPlace() {
      this.pulse({ frequency: 640, slideTo: 780, duration: 0.09, type: "triangle", gain: 0.05 });
    },

    playAiMove() {
      this.pulse({ frequency: 330, slideTo: 220, duration: 0.11, type: "sawtooth", gain: 0.045 });
    },

    playBootRise() {
      this.pulse({ frequency: 260, slideTo: 520, duration: 0.16, type: "triangle", gain: 0.05 });
    },

    playVictoryTone(isHumanVictory) {
      const base = isHumanVictory ? 760 : 180;
      this.pulse({ frequency: base, slideTo: base * 1.4, duration: 0.16, type: "triangle", gain: 0.05 });
      this.pulse({ frequency: base * 1.5, slideTo: base * 2.1, duration: 0.16, type: "sine", gain: 0.035 });
    },

    playDrawTone() {
      this.pulse({ frequency: 420, slideTo: 300, duration: 0.14, type: "sine", gain: 0.035 });
    }
  };

  engine.ensureContext();
  engine.syncGain();
  return engine;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
