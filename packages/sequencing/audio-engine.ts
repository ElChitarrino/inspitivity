import { AudioQueue } from "./audio-queue.js";
import { bassHarmonics } from "./bass-timbre.js";
import {
  INSTRUMENT_CHARACTERS,
  instrumentEnvelope,
  isCharacterVoice,
} from "./instrument-voices.js";
import { samplePlaybackGain } from "./sample-levels.js";
import {
  loadDrumSamples,
  loadCrashSamples,
  loadMetalDrumSamples,
  drumSample,
  metalDrumSample,
  drumKitProfile,
  type AcousticDrumKit,
  type DrumKit,
} from "./drum-samples.js";
import { loadGuitarSamples, guitarSample } from "./guitar-samples.js";
import { loadElectricGuitarSamples, electricGuitarSample } from "./electric-guitar-samples.js";
import type { DrumInstrument } from "./index.js";
import type { SynthVoice } from "./voice-types.js";

type SharedAudioGraph = {
  context: AudioContext;
  input: GainNode;
  dryInput: GainNode;
  analyser: AnalyserNode;
};

let sharedAudioGraph: SharedAudioGraph | null = null;
let sharedNativeAudioUnlock: HTMLAudioElement | null = null;

function silentWavUrl() {
  const sampleRate = 8000;
  const sampleCount = 800;
  const buffer = new ArrayBuffer(44 + sampleCount);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, sampleCount, true);
  for (let index = 44; index < buffer.byteLength; index++) view.setUint8(index, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export function createAudioEngine() {
  const sources = new Set<AudioScheduledSourceNode>();
  const pendingAudio = new AudioQueue();
  let pendingTimer: ReturnType<typeof setInterval> | null = null;
  const noiseSamples = new Map<string, AudioBuffer>();
  const driveCurves = new Map<number, Float32Array<ArrayBuffer>>();
  let bassWave: PeriodicWave | null = null;
  const drumTakes = new Map<DrumInstrument, number>();
  const guitarTakes = new Map<number, number>();
  const openHats = new Set<{ source: AudioBufferSourceNode; gain: GainNode; when: number }>();
  const driveCurve = (amount: number) => {
    let curve = driveCurves.get(amount);
    if (!curve) {
      curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++)
        curve[i] = Math.tanh(amount * ((2 * i) / (curve.length - 1) - 1));
      driveCurves.set(amount, curve);
    }
    return curve;
  };
  const getGraph = (): SharedAudioGraph => {
    if (sharedAudioGraph && sharedAudioGraph.context.state !== "closed") return sharedAudioGraph;
    const AudioContextConstructor =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Web Audio is not supported on this device.");
    const context = new AudioContextConstructor({ latencyHint: "interactive" });
    const input = context.createGain();
    const dryInput = context.createGain();
    const dry = context.createGain();
    const reverb = context.createConvolver();
    const preDelay = context.createDelay(0.05);
    const reverbHighpass = context.createBiquadFilter();
    const reverbLowpass = context.createBiquadFilter();
    const wet = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const master = context.createGain();
    const analyser = context.createAnalyser();

    const impulseLength = Math.floor(context.sampleRate * 1.45);
    const impulse = context.createBuffer(2, impulseLength, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < impulseLength; index++) {
        const fade = Math.pow(1 - index / impulseLength, 2.7);
        data[index] = (Math.random() * 2 - 1) * fade;
      }
    }
    reverb.buffer = impulse;
    preDelay.delayTime.value = 0.019;
    reverbHighpass.type = "highpass";
    reverbHighpass.frequency.value = 280;
    reverbLowpass.type = "lowpass";
    reverbLowpass.frequency.value = 5800;
    dry.gain.value = 1;
    wet.gain.value = 0.095;
    // Preserve the attack of drums and picked notes instead of pushing every
    // layer through the old 4:1, fast-attack compressor.
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 2;
    compressor.attack.value = 0.018;
    compressor.release.value = 0.2;
    master.gain.value = 0.82;
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.2;

    input.connect(dry).connect(compressor);
    input
      .connect(preDelay)
      .connect(reverb)
      .connect(reverbHighpass)
      .connect(reverbLowpass)
      .connect(wet)
      .connect(compressor);
    dryInput.connect(compressor);
    compressor.connect(master).connect(analyser).connect(context.destination);
    const createdGraph = { context, input, dryInput, analyser };
    sharedAudioGraph = createdGraph;
    return createdGraph;
  };
  const get = () => {
    const { context } = getGraph();
    if (context.state === "suspended") void context.resume();
    return context;
  };
  const unlock = async (kit?: DrumKit | "all", guitar = false, electric = false) => {
    const { context, input } = getGraph();
    if (!sharedNativeAudioUnlock) {
      sharedNativeAudioUnlock = new Audio(silentWavUrl());
      sharedNativeAudioUnlock.loop = true;
      sharedNativeAudioUnlock.preload = "auto";
      sharedNativeAudioUnlock.setAttribute("playsinline", "");
    }
    // Start both unlock paths in the user gesture; native audio must not gate sample downloads.
    void sharedNativeAudioUnlock.play().catch(() => undefined);
    const contextUnlock = context.state === "running" ? Promise.resolve() : context.resume();
    const samples: Promise<void>[] = [];
    const recordedDrums = kit && kit !== "current";
    const metalDrums = kit === "rock" || kit === "prog metal" || kit === "all";
    if (recordedDrums) {
      samples.push(
        metalDrums && kit !== "all" ? loadCrashSamples(context) : loadDrumSamples(context, false),
      );
      if (metalDrums) samples.push(loadMetalDrumSamples(context, false));
    }
    if (guitar) samples.push(loadGuitarSamples(context));
    if (electric) samples.push(loadElectricGuitarSamples(context, false));
    try {
      await Promise.all([contextUnlock, ...samples]);
    } catch {
      return false;
    }
    // Alternate takes enrich repeated notes but must never hold up the first beat.
    if (recordedDrums || electric)
      setTimeout(() => {
        const alternates: Promise<void>[] = [];
        if (kit === "all") alternates.push(loadDrumSamples(context));
        if (recordedDrums)
          alternates.push(metalDrums ? loadMetalDrumSamples(context) : loadDrumSamples(context));
        if (electric) alternates.push(loadElectricGuitarSamples(context));
        void Promise.allSettled(alternates);
      }, 250);
    const silence = context.createBufferSource();
    silence.buffer = context.createBuffer(1, 1, context.sampleRate);
    silence.connect(input);
    silence.start();
    return context.state === "running";
  };
  const tone = (
    midi: number,
    start = 0,
    duration = 0.22,
    gain = 0.07,
    voice: SynthVoice | "click" = "pluck",
    palmMuted = false,
  ) => {
    if (
      ![midi, start, duration, gain].every(Number.isFinite) ||
      midi < 0 ||
      midi > 127 ||
      duration <= 0 ||
      gain <= 0
    )
      return;
    const ctx = get();
    const when = ctx.currentTime + Math.max(0, start);
    if (voice === "distorted guitar") {
      const take = guitarTakes.get(midi) ?? 0;
      const recorded = electricGuitarSample(ctx, midi, gain < 0.033, take);
      if (recorded) {
        guitarTakes.set(midi, take + 1);
        const source = ctx.createBufferSource(),
          volume = ctx.createGain(),
          palm = ctx.createBiquadFilter();
        source.buffer = recorded.buffer;
        source.playbackRate.value = recorded.rate;
        const muted = palmMuted || duration < 0.32;
        const release = muted ? 0.045 : 0.105;
        const end = Math.min(
          recorded.buffer.duration / recorded.rate,
          Math.max(0.09, muted ? Math.min(duration, 0.22) : duration) + release,
        );
        palm.type = "lowpass";
        palm.frequency.value = muted ? 2600 : 5600;
        volume.gain.setValueAtTime(0.0001, when);
        volume.gain.linearRampToValueAtTime(
          gain * 1.65 * samplePlaybackGain(recorded.buffer, "guitar"),
          when + 0.004,
        );
        volume.gain.setValueAtTime(
          gain * 1.65 * samplePlaybackGain(recorded.buffer, "guitar"),
          Math.max(when + 0.004, when + end - release),
        );
        volume.gain.exponentialRampToValueAtTime(0.0001, when + end);
        source.connect(palm).connect(volume).connect(getGraph().dryInput);
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          source.disconnect();
          palm.disconnect();
          volume.disconnect();
        };
        source.start(when);
        source.stop(when + end);
        return;
      }
      void loadElectricGuitarSamples(ctx).catch(() => undefined);
    }
    if (voice === "acoustic guitar") {
      const recorded = guitarSample(ctx, midi);
      if (recorded) {
        const source = ctx.createBufferSource(),
          volume = ctx.createGain();
        source.buffer = recorded.buffer;
        source.playbackRate.value = recorded.rate;
        const release = Math.max(0.1, Math.min(0.28, duration * 0.25));
        const end = Math.min(
          recorded.buffer.duration / recorded.rate,
          Math.max(0.16, duration) + release,
        );
        volume.gain.setValueAtTime(0.0001, when);
        volume.gain.linearRampToValueAtTime(
          gain * 1.9 * samplePlaybackGain(recorded.buffer, "guitar"),
          when + 0.008,
        );
        volume.gain.setValueAtTime(
          gain * 1.9 * samplePlaybackGain(recorded.buffer, "guitar"),
          Math.max(when + 0.008, when + end - release),
        );
        volume.gain.exponentialRampToValueAtTime(0.0001, when + end);
        source.connect(volume).connect(getGraph().dryInput);
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          source.disconnect();
          volume.disconnect();
        };
        source.start(when);
        source.stop(when + end);
        return;
      }
      void loadGuitarSamples(ctx).catch(() => undefined);
      // Keep an audible fallback for a sound selected during active playback.
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const period = Math.max(8, Math.round(ctx.sampleRate / frequency));
      const seconds = Math.min(3.2, Math.max(0.55, duration + 0.72));
      const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      const string = new Float32Array(period);
      let random = (midi * 2654435761) >>> 0;
      const noise = () => {
        random ^= random << 13;
        random ^= random >>> 17;
        random ^= random << 5;
        return (random >>> 0) / 2147483648 - 1;
      };
      for (let i = 0; i < period; i++) string[i] = (noise() + noise() * 0.35) * 0.6;
      let previous = 0;
      const damping = frequency < 220 ? 0.994 : 0.989;
      for (let i = 0; i < samples.length; i++) {
        const slot = i % period;
        const next = (string[slot] + string[(slot + 1) % period]) * 0.5 * damping;
        string[slot] = next;
        previous = previous * 0.32 + next * 0.68;
        const envelope =
          Math.min(1, i / (ctx.sampleRate * 0.003)) *
          Math.min(1, (samples.length - i) / (ctx.sampleRate * 0.045));
        samples[i] = previous * envelope;
      }
      const source = ctx.createBufferSource(),
        body = ctx.createBiquadFilter(),
        toneFilter = ctx.createBiquadFilter(),
        volume = ctx.createGain();
      source.buffer = buffer;
      body.type = "peaking";
      body.frequency.value = 215;
      body.Q.value = 0.85;
      body.gain.value = 3.5;
      toneFilter.type = "lowpass";
      toneFilter.frequency.value = Math.min(6500, 2600 + frequency * 4);
      volume.gain.value = gain * 0.8;
      source.connect(body).connect(toneFilter).connect(volume).connect(getGraph().dryInput);
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
        body.disconnect();
        toneFilter.disconnect();
        volume.disconnect();
      };
      source.start(when);
      return;
    }
    if (voice === "808 bass") {
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const oscillator = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const volume = ctx.createGain();
      const release = Math.max(0.38, Math.min(1.4, duration * 0.7));
      oscillator.type = "sine";
      overtone.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency * 1.85, when);
      oscillator.frequency.exponentialRampToValueAtTime(frequency, when + 0.055);
      overtone.frequency.setValueAtTime(frequency * 3.7, when);
      overtone.frequency.exponentialRampToValueAtTime(frequency * 2, when + 0.065);
      overtoneGain.gain.setValueAtTime(0.22, when);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1250, when);
      filter.frequency.exponentialRampToValueAtTime(190, when + 0.24);
      volume.gain.setValueAtTime(0.0001, when);
      volume.gain.exponentialRampToValueAtTime(gain * 2.15, when + 0.006);
      volume.gain.exponentialRampToValueAtTime(gain * 1.2, when + Math.max(0.12, duration * 0.55));
      volume.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);
      oscillator.connect(filter);
      overtone.connect(overtoneGain).connect(filter);
      filter.connect(volume).connect(getGraph().dryInput);
      sources.add(oscillator);
      sources.add(overtone);
      let remaining = 2;
      const ended = (source: OscillatorNode) => {
        sources.delete(source);
        source.disconnect();
        if (--remaining === 0) {
          overtoneGain.disconnect();
          filter.disconnect();
          volume.disconnect();
        }
      };
      oscillator.onended = () => ended(oscillator);
      overtone.onended = () => ended(overtone);
      oscillator.start(when);
      overtone.start(when);
      oscillator.stop(when + duration + release + 0.02);
      overtone.stop(when + duration + release + 0.02);
      return;
    }
    if (voice === "deep bass") {
      if (!bassWave) {
        const harmonics = bassHarmonics();
        bassWave = ctx.createPeriodicWave(new Float32Array(harmonics.length), harmonics, {
          disableNormalization: true,
        });
      }
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const voiceMix = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const cabinet = ctx.createBiquadFilter();
      const body = ctx.createBiquadFilter();
      const rumble = ctx.createBiquadFilter();
      const drive = ctx.createWaveShaper();
      const volume = ctx.createGain();
      const voiceNodes: AudioNode[] = [voiceMix, filter, cabinet, body, rumble, drive, volume];
      let remainingLayers = 2;
      drive.curve = driveCurve(1.2);
      drive.oversample = "2x";
      filter.type = "lowpass";
      filter.Q.value = 0.55;
      filter.frequency.setValueAtTime(950 + Math.min(1, gain / 0.07) * 1100, when);
      filter.frequency.exponentialRampToValueAtTime(420 + frequency * 2, when + 0.16);
      cabinet.type = "lowpass";
      cabinet.frequency.value = 2400;
      cabinet.Q.value = 0.55;
      body.type = "lowshelf";
      body.frequency.value = 105;
      body.gain.value = 2;
      rumble.type = "highpass";
      rumble.frequency.value = 22;
      rumble.Q.value = 0.7;
      const layers = [
        { type: "custom" as OscillatorType, level: 1, detune: 0 },
        { type: "sine" as OscillatorType, level: 0.25, detune: 0 },
      ].map((layer) => {
        const oscillator = ctx.createOscillator();
        const layerGain = ctx.createGain();
        voiceNodes.push(layerGain);
        if (layer.type === "custom") oscillator.setPeriodicWave(bassWave!);
        else oscillator.type = layer.type;
        oscillator.frequency.setValueAtTime(frequency * 1.002, when);
        oscillator.frequency.exponentialRampToValueAtTime(frequency, when + 0.035);
        oscillator.detune.value = layer.detune;
        layerGain.gain.value = layer.level;
        oscillator.connect(layerGain).connect(voiceMix);
        sources.add(oscillator);
        oscillator.onended = () => {
          sources.delete(oscillator);
          oscillator.disconnect();
          if (--remainingLayers === 0) voiceNodes.forEach((node) => node.disconnect());
        };
        return oscillator;
      });
      const pickup = ctx.createOscillator();
      const pickupFilter = ctx.createBiquadFilter();
      const pickupGain = ctx.createGain();
      pickup.type = "triangle";
      pickup.frequency.value = frequency * 3;
      pickupFilter.type = "bandpass";
      pickupFilter.frequency.value = 920;
      pickupFilter.Q.value = 0.75;
      pickupGain.gain.setValueAtTime(Math.max(0.0001, gain * 0.16), when);
      pickupGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      pickup.connect(pickupFilter).connect(pickupGain).connect(voiceMix);
      sources.add(pickup);
      pickup.onended = () => {
        sources.delete(pickup);
        pickup.disconnect();
        pickupFilter.disconnect();
        pickupGain.disconnect();
      };
      voiceMix
        .connect(filter)
        .connect(drive)
        .connect(cabinet)
        .connect(body)
        .connect(rumble)
        .connect(volume)
        .connect(getGraph().dryInput);
      const peak = gain * 1.8;
      volume.gain.setValueAtTime(0.0001, when);
      volume.gain.exponentialRampToValueAtTime(peak, when + 0.007);
      volume.gain.exponentialRampToValueAtTime(peak * 0.76, when + Math.min(0.09, duration * 0.35));
      volume.gain.exponentialRampToValueAtTime(peak * 0.48, when + Math.max(0.1, duration));
      volume.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.1, duration) + 0.08);
      layers.forEach((oscillator) => {
        oscillator.start(when);
        oscillator.stop(when + duration + 0.18);
      });
      pickup.start(when);
      pickup.stop(when + 0.055);
      return;
    }
    if (isCharacterVoice(voice)) {
      const character = INSTRUMENT_CHARACTERS[voice];
      const envelope = instrumentEnvelope(character, duration, 1);
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const filter = ctx.createBiquadFilter(),
        volume = ctx.createGain();
      const nodes: AudioNode[] = [filter, volume];
      filter.type = "lowpass";
      filter.Q.value = character.resonance;
      const brightness = 0.65 + Math.min(1, gain / 0.055) * 0.35;
      const peakCutoff = Math.min(ctx.sampleRate * 0.45, character.cutoff * brightness);
      filter.frequency.setValueAtTime(voice === "warm pad" ? peakCutoff * 0.45 : peakCutoff, when);
      filter.frequency.linearRampToValueAtTime(peakCutoff, when + envelope.attack);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(
          200,
          peakCutoff * (voice === "pluck" ? 0.18 : voice === "analog pulse" ? 0.28 : 0.8),
        ),
        when + envelope.hold,
      );
      const energy = Math.sqrt(character.partials.reduce((sum, p) => sum + p.level * p.level, 0));
      const peak = (gain * 0.95) / Math.max(0.7, energy);
      volume.gain.setValueAtTime(0.0001, when);
      volume.gain.linearRampToValueAtTime(peak, when + envelope.attack);
      volume.gain.linearRampToValueAtTime(
        Math.max(0.0001, peak * character.sustain),
        when + Math.max(envelope.attack, envelope.hold * 0.72),
      );
      volume.gain.setValueAtTime(Math.max(0.0001, peak * character.sustain), when + envelope.hold);
      volume.gain.exponentialRampToValueAtTime(0.0001, when + envelope.end);
      filter.connect(volume).connect(character.room ? getGraph().input : getGraph().dryInput);
      let remaining = character.partials.length;
      const oscillators = character.partials.map((partial, index) => {
        const oscillator = ctx.createOscillator(),
          level = ctx.createGain();
        nodes.push(level);
        oscillator.type = partial.waveform;
        oscillator.frequency.value = frequency * partial.ratio;
        oscillator.detune.value = partial.detune;
        level.gain.setValueAtTime(partial.level, when);
        if (partial.decay)
          level.gain.exponentialRampToValueAtTime(
            0.0001,
            when + Math.max(0.02, Math.min(envelope.end, partial.decay)),
          );
        oscillator.connect(level);
        if (voice === "warm pad" && index < 2) {
          const pan = ctx.createStereoPanner();
          pan.pan.value = index === 0 ? -0.32 : 0.32;
          nodes.push(pan);
          level.connect(pan).connect(filter);
        } else level.connect(filter);
        sources.add(oscillator);
        oscillator.onended = () => {
          sources.delete(oscillator);
          oscillator.disconnect();
          if (--remaining === 0) nodes.forEach((n) => n.disconnect());
        };
        oscillator.start(when);
        oscillator.stop(when + envelope.end + 0.01);
        return oscillator;
      });
      if (voice === "air flute" && duration > 0.18) {
        const vibrato = ctx.createOscillator(),
          depth = ctx.createGain();
        vibrato.frequency.value = 5.2;
        depth.gain.setValueAtTime(0, when);
        depth.gain.linearRampToValueAtTime(5, when + 0.18);
        vibrato.connect(depth);
        oscillators.forEach((o) => depth.connect(o.detune));
        sources.add(vibrato);
        vibrato.onended = () => {
          sources.delete(vibrato);
          vibrato.disconnect();
          depth.disconnect();
        };
        vibrato.start(when);
        vibrato.stop(when + envelope.end);
      }
      return;
    }
    // Lightweight fallback for the sample guitar, sub bass and click.
    const profile =
      voice === "distorted guitar"
        ? { type: "sawtooth" as OscillatorType, attack: 0.004, cutoff: 3800, release: 0.11 }
        : voice === "sub bass"
          ? { type: "sine" as OscillatorType, attack: 0.025, cutoff: 360, release: 0.2 }
          : { type: "sine" as OscillatorType, attack: 0.001, cutoff: 7000, release: 0.025 };
    const oscillator = ctx.createOscillator(),
      volume = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    const nodes: AudioNode[] = [volume, filter];
    const hold = Math.max(0.02, duration),
      attack = Math.min(profile.attack, hold * 0.65);
    oscillator.type = profile.type;
    oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    filter.type = "lowpass";
    filter.frequency.value = profile.cutoff;
    volume.gain.setValueAtTime(0.0001, when);
    volume.gain.linearRampToValueAtTime(gain * (voice === "sub bass" ? 1.6 : 1), when + attack);
    volume.gain.setValueAtTime(gain, when + hold);
    volume.gain.exponentialRampToValueAtTime(0.0001, when + hold + profile.release);
    oscillator.connect(filter);
    if (voice === "distorted guitar") {
      const drive = ctx.createWaveShaper(),
        cabinet = ctx.createBiquadFilter(),
        rumble = ctx.createBiquadFilter();
      nodes.push(drive, cabinet, rumble);
      drive.curve = driveCurve(5);
      drive.oversample = "2x";
      cabinet.type = "lowpass";
      cabinet.frequency.value = 4200;
      rumble.type = "highpass";
      rumble.frequency.value = 85;
      filter.connect(drive).connect(cabinet).connect(rumble).connect(volume);
    } else filter.connect(volume);
    volume.connect(getGraph().dryInput);
    sources.add(oscillator);
    oscillator.onended = () => {
      sources.delete(oscillator);
      oscillator.disconnect();
      nodes.forEach((n) => n.disconnect());
    };
    oscillator.start(when);
    oscillator.stop(when + hold + profile.release + 0.01);
  };
  const createNoiseSample = (ctx: AudioContext, duration: number, decay: number) => {
    const key = `${ctx.sampleRate}/${duration}/${decay}`;
    const cached = noiseSamples.get(key);
    if (cached) return cached;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++)
      data[index] = (Math.random() * 2 - 1) * Math.exp(-index / (ctx.sampleRate * decay));
    noiseSamples.set(key, buffer);
    return buffer;
  };
  const cymbalNoise = (
    start: number,
    duration: number,
    gain: number,
    cutoff: number,
    decay: number,
  ) => {
    const ctx = get();
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const volume = ctx.createGain();
    const when = ctx.currentTime + start;
    source.buffer = createNoiseSample(ctx, duration, decay);
    filter.type = "highpass";
    filter.frequency.setValueAtTime(cutoff, when);
    volume.gain.setValueAtTime(gain, when);
    volume.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(volume).connect(getGraph().input);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      filter.disconnect();
      volume.disconnect();
    };
    source.start(when);
    source.stop(when + duration);
  };
  const drum = (
    instrument: DrumInstrument,
    start = 0,
    velocity = 1,
    kit: DrumKit = "current",
    level = 1,
  ) => {
    if (![start, velocity, level].every(Number.isFinite) || velocity <= 0 || level <= 0) return;
    if (kit !== "current") {
      const ctx = get(),
        when = ctx.currentTime + start;
      const take = drumTakes.get(instrument) ?? 0;
      const metalBank = (kit === "rock" || kit === "prog metal") && instrument !== "crash";
      const buffer = metalBank
        ? metalDrumSample(ctx, instrument, velocity, take)
        : drumSample(ctx, instrument, velocity, take);
      if (!buffer) return; // Startup awaits samples; never substitute a synthetic kit silently.
      drumTakes.set(instrument, take + 1);
      const source = ctx.createBufferSource(),
        volume = ctx.createGain(),
        eq = ctx.createBiquadFilter();
      source.buffer = buffer;
      const profile = drumKitProfile(kit as AcousticDrumKit, instrument, buffer.duration);
      const gains: Record<DrumInstrument, number> = {
        kick: 0.64,
        snare: 0.45,
        hihat: 0.2,
        openhat: 0.22,
        crash: 0.27,
        ride: 0.22,
        tomhigh: 0.48,
        tomlow: 0.5,
      };
      const peak =
        gains[instrument] *
        Math.pow(Math.max(0, velocity), 1.15) *
        level *
        profile.level *
        samplePlaybackGain(buffer, "drum");
      const end = when + profile.tailSeconds;
      source.playbackRate.setValueAtTime(profile.playbackRate, when);
      eq.type = profile.filter;
      eq.frequency.value = profile.frequency;
      eq.Q.value = profile.q;
      eq.gain.value = profile.gain;
      const air = ctx.createBiquadFilter();
      air.type = "lowpass";
      air.frequency.value = Math.min(
        ctx.sampleRate * 0.45,
        ["hihat", "openhat", "ride", "crash"].includes(instrument)
          ? 6500 + velocity * 7500
          : 8500 + velocity * 6000,
      );
      source.disconnect();
      source.connect(air).connect(eq);
      volume.gain.setValueAtTime(peak, when);
      volume.gain.setValueAtTime(peak, Math.max(when, end - 0.06));
      volume.gain.linearRampToValueAtTime(0, end);
      const saturation = profile.drive ? ctx.createWaveShaper() : null;
      source.connect(eq);
      if (saturation) {
        saturation.curve = driveCurve(profile.drive);
        saturation.oversample = "2x";
        eq.connect(saturation).connect(volume);
      } else eq.connect(volume);
      volume.connect(profile.route === "room" ? getGraph().input : getGraph().dryInput);
      if (profile.click) cymbalNoise(start, 0.025, peak * profile.click, 1800, 0.006);
      if (profile.body) {
        const sub = ctx.createOscillator(),
          subGain = ctx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(105, when);
        sub.frequency.exponentialRampToValueAtTime(52, when + 0.08);
        subGain.gain.setValueAtTime(peak * profile.body, when);
        subGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
        sub.connect(subGain).connect(getGraph().dryInput);
        sources.add(sub);
        sub.onended = () => {
          sources.delete(sub);
          sub.disconnect();
          subGain.disconnect();
        };
        sub.start(when);
        sub.stop(when + 0.2);
      }
      if (instrument === "hihat")
        for (const hat of openHats)
          if (hat.when <= when) {
            hat.gain.gain.cancelScheduledValues(when);
            hat.gain.gain.setTargetAtTime(0, when, 0.008);
            try {
              hat.source.stop(when + 0.04);
            } catch {
              /* The open hat may have ended before this choke. */
            }
          }
      const hat = { source, gain: volume, when };
      if (instrument === "openhat") openHats.add(hat);
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        openHats.delete(hat);
        source.disconnect();
        air.disconnect();
        eq.disconnect();
        saturation?.disconnect();
        volume.disconnect();
      };
      source.start(when);
      source.stop(end);
      return;
    }
    velocity *= level;
    // Acoustic kits have returned above; this path is the electronic kit.
    const ctx = get();
    const when = ctx.currentTime + start;
    if (instrument === "kick") {
      const oscillator = ctx.createOscillator();
      const volume = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(150, when);
      oscillator.frequency.exponentialRampToValueAtTime(43, when + 0.13);
      volume.gain.setValueAtTime(0.26 * velocity, when);
      volume.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      oscillator.connect(volume).connect(getGraph().input);
      sources.add(oscillator);
      oscillator.onended = () => {
        sources.delete(oscillator);
        oscillator.disconnect();
        volume.disconnect();
      };
      oscillator.start(when);
      oscillator.stop(when + 0.19);
      return;
    }
    if (instrument === "snare") {
      cymbalNoise(start, 0.19, 0.12 * velocity, 1200, 0.055);
      tone(78, start, 0.07, 0.025 * velocity, "click");
      return;
    }
    if (instrument === "tomhigh" || instrument === "tomlow") {
      const oscillator = ctx.createOscillator(),
        volume = ctx.createGain();
      const pitch = instrument === "tomhigh" ? 180 : 105;
      oscillator.frequency.setValueAtTime(pitch * 1.5, when);
      oscillator.frequency.exponentialRampToValueAtTime(pitch, when + 0.09);
      volume.gain.setValueAtTime(0.18 * velocity, when);
      volume.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
      oscillator.connect(volume).connect(getGraph().input);
      sources.add(oscillator);
      oscillator.onended = () => {
        sources.delete(oscillator);
        oscillator.disconnect();
        volume.disconnect();
      };
      oscillator.start(when);
      oscillator.stop(when + 0.34);
      cymbalNoise(start, 0.035, 0.025 * velocity, 1400, 0.012);
      return;
    }
    if (instrument === "openhat") {
      cymbalNoise(start, 0.38, 0.085 * velocity, 6500, 0.12);
      return;
    }
    if (instrument === "hihat") {
      cymbalNoise(start, 0.13, 0.085 * velocity, 6800, 0.022);
      return;
    }
    if (instrument === "crash") {
      cymbalNoise(start, 0.95, 0.12 * velocity, 2500, 0.32);
      return;
    }
    cymbalNoise(start, 0.52, 0.075 * velocity, 4200, 0.16);
    tone(82, start, 0.17, 0.014 * velocity, "click");
  };
  const diagnostics = () => {
    const { context, analyser } = getGraph();
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    return {
      state: context.state,
      peak: samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample - 128)), 0),
      activeSources: sources.size,
    };
  };
  const stopAll = () => {
    pendingAudio.clear();
    if (pendingTimer !== null) clearInterval(pendingTimer);
    pendingTimer = null;
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    sources.clear();
  };
  const enqueue = (delay: number, emit: (remaining: number) => void) => {
    if (!Number.isFinite(delay)) return;
    if (delay <= 0.2) {
      emit(Math.max(0, delay));
      return;
    }
    pendingAudio.add(getGraph().context.currentTime + delay, emit);
    if (pendingTimer === null)
      pendingTimer = setInterval(() => {
        if (getGraph().context.state === "running")
          pendingAudio.flush(getGraph().context.currentTime);
        if (!pendingAudio.size && pendingTimer !== null) {
          clearInterval(pendingTimer);
          pendingTimer = null;
        }
      }, 25);
  };
  const queuedTone: typeof tone = (pitch, start = 0, ...rest) =>
    enqueue(start, (delay) => tone(pitch, delay, ...rest));
  const queuedDrum: typeof drum = (instrument, start = 0, ...rest) =>
    enqueue(start, (delay) => drum(instrument, delay, ...rest));
  return { tone: queuedTone, drum: queuedDrum, get, unlock, diagnostics, stopAll };
}

export type AudioEngine = ReturnType<typeof createAudioEngine>;
