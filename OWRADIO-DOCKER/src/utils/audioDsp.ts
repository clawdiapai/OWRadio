/**
 * @file audioDsp.ts
 * @description In-process lightweight Audio DSP analyzer for raw 48kHz stereo s16le PCM streams.
 * Performs genuine BPM detection via novelty energy autocorrelation and Camelot Key detection
 * via 12-bin Chromagram / Pitch Class Profile (PCP) matched against Krumhansl-Schmuckler key vectors.
 * 
 * 100% keyless, zero native C++ bindings, zero hallucinations.
 */

export interface AudioAnalysisResult {
  bpm?: number;
  key?: string;       // e.g. "A minor", "C major"
  camelot?: string;   // e.g. "8A", "8B"
  bpmConfidence: number; // 0.0 to 1.0
  keyConfidence: number; // 0.0 to 1.0
  isReliable: boolean;
  outroCueSec?: number;
}

// 12 Semitone note names
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Camelot Wheel mappings
const MAJOR_CAMELOT: Record<number, string> = {
  0: '8B',  // C
  1: '3B',  // Db / C#
  2: '10B', // D
  3: '5B',  // Eb
  4: '12B', // E
  5: '7B',  // F
  6: '2B',  // F#
  7: '9B',  // G
  8: '4B',  // Ab
  9: '11B', // A
  10: '6B', // Bb
  11: '1B', // B
};

const MINOR_CAMELOT: Record<number, string> = {
  0: '5A',  // C minor
  1: '12A', // C# minor
  2: '7A',  // D minor
  3: '2A',  // Eb minor
  4: '9A',  // E minor
  5: '4A',  // F minor
  6: '11A', // F# minor
  7: '6A',  // G minor
  8: '1A',  // G# / Ab minor
  9: '8A',  // A minor
  10: '3A', // Bb minor
  11: '10A',// B minor
};

// Krumhansl-Schmuckler Key Profiles (Cognitive music theory weights)
const KS_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Calculates Pearson correlation coefficient between two equal-length numerical vectors.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return num / den;
}

/**
 * Single-frequency Goertzel algorithm to evaluate spectral power at a target frequency.
 */
function goertzelPower(samples: Float32Array, targetFreq: number, sampleRate: number): number {
  const n = samples.length;
  const k = Math.round((n * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(omega);

  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let i = 0; i < n; i++) {
    q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }

  return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
}

export class AudioDspAnalyzer {
  /**
   * Analyzes a 48kHz stereo 16-bit signed PCM buffer (e.g. initial 8-15 seconds of a track).
   * Returns genuine BPM and Camelot Key with confidence scores.
   */
  public analyzePcm(pcmBuffer: Buffer, totalDurationSec?: number): AudioAnalysisResult {
    const minBytesRequired = 48000 * 2 * 2 * 3; // At least 3 seconds of 48kHz stereo s16le
    if (!pcmBuffer || pcmBuffer.length < minBytesRequired) {
      return {
        bpmConfidence: 0,
        keyConfidence: 0,
        isReliable: false,
      };
    }

    // Step 1: Downsample to 12kHz Mono Float32Array to preserve CPU while retaining frequencies up to 6kHz
    const sampleRate = 12000;
    const decimationFactor = 4; // 48000 / 4 = 12000 Hz
    const maxSamples = 12000 * 12; // Cap analysis window to 12 seconds
    const totalStereoFrames = Math.floor(pcmBuffer.length / 4);
    const targetFrames = Math.min(totalStereoFrames, maxSamples * decimationFactor);
    const downsampledLength = Math.floor(targetFrames / decimationFactor);
    const monoSamples = new Float32Array(downsampledLength);

    let maxAmp = 0;
    for (let i = 0; i < downsampledLength; i++) {
      const srcIdx = i * decimationFactor * 4;
      // Read left and right 16-bit integers
      const left = pcmBuffer.readInt16LE(srcIdx);
      const right = pcmBuffer.readInt16LE(srcIdx + 2);
      const mono = ((left + right) / 2) / 32768.0;
      monoSamples[i] = mono;
      const absAmp = Math.abs(mono);
      if (absAmp > maxAmp) maxAmp = absAmp;
    }

    // If audio is practically silent, abort analysis
    if (maxAmp < 0.015) {
      return {
        bpmConfidence: 0,
        keyConfidence: 0,
        isReliable: false,
      };
    }

    // Step 2: BPM Detection via Energy Envelope Autocorrelation
    const bpmResult = this.detectBpm(monoSamples, sampleRate);

    // Step 3: Camelot Musical Key Detection via Chromagram & K-S Profiles
    const keyResult = this.detectKey(monoSamples, sampleRate);

    // Step 4: Outro breakdown estimate (if duration known)
    let outroCueSec: number | undefined;
    if (totalDurationSec && totalDurationSec > 20) {
      outroCueSec = Math.max(10, totalDurationSec - 8);
    }

    const isReliable = bpmResult.confidence >= 0.35 || keyResult.confidence >= 0.35;

    return {
      bpm: bpmResult.bpm,
      key: keyResult.keyName,
      camelot: keyResult.camelot,
      bpmConfidence: bpmResult.confidence,
      keyConfidence: keyResult.confidence,
      isReliable,
      outroCueSec,
    };
  }

  /**
   * Detects track tempo using energy envelope first-difference autocorrelation.
   */
  private detectBpm(samples: Float32Array, sampleRate: number): { bpm?: number; confidence: number } {
    const hopSize = Math.round(sampleRate * 0.01); // 10ms hop = 100 frames/sec
    const numFrames = Math.floor(samples.length / hopSize);
    if (numFrames < 200) return { confidence: 0 };

    // 1. Calculate energy envelope
    const envelope = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      let energy = 0;
      const start = f * hopSize;
      for (let s = 0; s < hopSize; s++) {
        const val = samples[start + s];
        energy += val * val;
      }
      envelope[f] = Math.sqrt(energy / hopSize);
    }

    // 2. Positive first-order difference (onset novelty flux)
    const novelty = new Float32Array(numFrames);
    for (let f = 1; f < numFrames; f++) {
      const diff = envelope[f] - envelope[f - 1];
      novelty[f] = diff > 0 ? diff : 0;
    }

    // 3. Autocorrelation across DJ tempo range: 60 BPM to 200 BPM
    const hopRate = sampleRate / hopSize; // 100 Hz
    const minLag = Math.floor((60 * hopRate) / 200); // 200 BPM -> lag 30
    const maxLag = Math.ceil((60 * hopRate) / 60);   // 60 BPM -> lag 100

    let bestLag = -1;
    let maxCorr = -1;
    const correlations: number[] = [];

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      const n = numFrames - lag;
      for (let i = 0; i < n; i++) {
        corr += novelty[i] * novelty[i + lag];
      }
      corr /= n;
      correlations.push(corr);

      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag <= 0 || maxCorr <= 0) return { confidence: 0 };

    // Calculate mean and variance of correlation values for confidence
    const meanCorr = correlations.reduce((a, b) => a + b, 0) / correlations.length;
    let variance = 0;
    for (const c of correlations) variance += (c - meanCorr) * (c - meanCorr);
    const stdDev = Math.sqrt(variance / correlations.length) || 1e-6;
    const zScore = (maxCorr - meanCorr) / stdDev;
    const confidence = Math.min(1.0, Math.max(0, (zScore - 1.2) / 3.0));

    if (confidence < 0.25) {
      return { confidence: Math.round(confidence * 100) / 100 };
    }

    let detectedBpm = (60 * hopRate) / bestLag;

    // Disambiguate half-time / double-time into common dance/pop music pocket (80 to 160 BPM)
    if (detectedBpm < 75) {
      detectedBpm *= 2;
    } else if (detectedBpm > 175) {
      detectedBpm /= 2;
    }

    return {
      bpm: Math.round(detectedBpm),
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Detects Camelot Musical Key via 12-bin Chromagram / Pitch Class Profile (PCP)
   * correlated against Krumhansl-Schmuckler cognitive key profiles.
   */
  private detectKey(samples: Float32Array, sampleRate: number): { keyName?: string; camelot?: string; confidence: number } {
    // 12 pitch classes: C (0) to B (11)
    const chroma = new Float32Array(12);

    // Evaluate spectral energy across octaves 3, 4, and 5 (130 Hz to 1000 Hz)
    // MIDI 48 (C3 = 130.81Hz) to MIDI 71 (B4 = 493.88Hz)
    for (let note = 0; note < 12; note++) {
      let pitchEnergy = 0;
      for (let octave = 3; octave <= 5; octave++) {
        const midi = (octave + 1) * 12 + note;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        if (freq < sampleRate / 2) {
          const power = goertzelPower(samples, freq, sampleRate);
          pitchEnergy += power;
        }
      }
      chroma[note] = pitchEnergy;
    }

    // Normalize Chroma vector L2 norm
    let sumSq = 0;
    for (let i = 0; i < 12; i++) sumSq += chroma[i] * chroma[i];
    const norm = Math.sqrt(sumSq) || 1e-12;
    const normChroma = Array.from(chroma).map((v) => v / norm);

    // Correlate with 24 candidate keys (12 Major, 12 Minor)
    let bestKeyName: string | undefined;
    let bestCamelot: string | undefined;
    let maxCorr = -1;

    for (let shift = 0; shift < 12; shift++) {
      // Rotate Major and Minor K-S profile by shift semitones
      const rotatedMajor = Array.from({ length: 12 }, (_, i) => KS_MAJOR_PROFILE[(i - shift + 12) % 12]);
      const rotatedMinor = Array.from({ length: 12 }, (_, i) => KS_MINOR_PROFILE[(i - shift + 12) % 12]);

      const corrMajor = pearsonCorrelation(normChroma, rotatedMajor);
      const corrMinor = pearsonCorrelation(normChroma, rotatedMinor);

      if (corrMajor > maxCorr) {
        maxCorr = corrMajor;
        bestKeyName = `${NOTE_NAMES[shift]} major`;
        bestCamelot = MAJOR_CAMELOT[shift];
      }

      if (corrMinor > maxCorr) {
        maxCorr = corrMinor;
        bestKeyName = `${NOTE_NAMES[shift]} minor`;
        bestCamelot = MINOR_CAMELOT[shift];
      }
    }

    const confidence = Math.min(1.0, Math.max(0, (maxCorr - 0.25) / 0.5));

    if (confidence < 0.35 || !bestCamelot) {
      return { confidence: Math.round(confidence * 100) / 100 };
    }

    return {
      keyName: bestKeyName,
      camelot: bestCamelot,
      confidence: Math.round(confidence * 100) / 100,
    };
  }
}

export const audioDsp = new AudioDspAnalyzer();
export default audioDsp;
